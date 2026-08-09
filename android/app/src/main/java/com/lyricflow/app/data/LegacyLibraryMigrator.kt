package com.lyricflow.app.data

import android.content.Context
import android.database.Cursor
import android.database.sqlite.SQLiteDatabase
import android.util.Log
import androidx.room.withTransaction
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * One-shot migration from the live expo-sqlite database (lyricflow.db) into
 * Room (lyricflow-room.db).
 *
 * Safety contract (ROADMAP Phase 1):
 * - The live file is NEVER opened for writing. A snapshot copy of the file
 *   trio (.db / -wal / -shm) is staged in cacheDir and opened READONLY there.
 * - A pre-migration backup of the original is written to filesDir/db-backups
 *   before any row is copied.
 * - Idempotent: once migration_meta says completed at the current payload
 *   version, subsequent runs restore the recorded report instead of re-copying.
 * - Payload v2 re-pulls song rows so lyric_source / lyrics_raw / format /
 *   sync_type / precision survive schema upgrades without wiping Room.
 */
class LegacyLibraryMigrator(private val appContext: Context) {

    data class Report(
        val completed: Boolean,
        val songs: Int = 0,
        val lyricLines: Int = 0,
        val playlists: Int = 0,
        val playlistLinks: Int = 0,
        val likedSongs: Int = 0,
        val offsetSongs: Int = 0,
        val rawPayloadSongs: Int = 0,
        val wordTimedSongs: Int = 0,
        val backupPath: String? = null,
        val migratedAt: Long = 0L,
        val payloadVersion: Int = PAYLOAD_VERSION,
        val error: String? = null,
    )

    suspend fun run(db: LibraryDatabase): Report = withContext(Dispatchers.IO) {
        try {
            val existing = db.migrationDao().all().associate { it.key to it.value }
            val completed = existing[KEY_COMPLETED] == "true"
            val payloadOk = (existing[KEY_PAYLOAD_VERSION]?.toIntOrNull() ?: 0) >= PAYLOAD_VERSION
            val roomSongs = db.songDao().countAll()
            val legacyFile = resolveLegacyDbFile()

            // Skip only when Room already has data and payload version is current.
            // Empty Room + existing legacy file means a prior path miss (expo-sqlite
            // lives under files/SQLite/, not databases/) — re-run fully.
            if (completed && payloadOk && (roomSongs > 0 || legacyFile == null)) {
                Log.i(TAG, "Migration already complete (roomSongs=$roomSongs)")
                return@withContext restore(existing)
            }

            if (legacyFile == null) {
                val empty = Report(completed = true, payloadVersion = PAYLOAD_VERSION)
                db.migrationDao().putAll(metaRows(empty))
                Log.i(TAG, "No legacy lyricflow.db under databases/ or files/SQLite/ — empty Room library")
                return@withContext empty
            }

            Log.i(TAG, "Reading legacy DB from ${legacyFile.absolutePath} (${legacyFile.length()} bytes)")
            val backup = writeBackup(legacyFile)
            val staged = stageCopy(legacyFile)
            // Full row copy whenever Room is empty *or* the stored payload is a
            // version behind. A payload bump can change the shape of non-song
            // rows too — v4 widened lyric timestamps to REAL — so a song-only
            // REPLACE would leave those stale. Inserts are REPLACE over stable
            // primary keys, so re-copying is idempotent.
            val fullCopy = !completed || roomSongs == 0 || !payloadOk

            val data: LegacyData = try {
                openReadonly(staged).use { source ->
                    LegacyData(
                        songs = readSongs(source),
                        lyrics = readLyrics(source),
                        playlists = readPlaylists(source),
                        links = readPlaylistLinks(source),
                    )
                }
            } finally {
                staged.parentFile?.deleteRecursively()
            }

            val report = Report(
                completed = true,
                songs = data.songs.size,
                lyricLines = data.lyrics.size,
                playlists = data.playlists.size,
                playlistLinks = data.links.size,
                likedSongs = data.songs.count { it.isLiked },
                offsetSongs = data.songs.count { it.lyricsOffset != 0.0 },
                rawPayloadSongs = data.songs.count { !it.lyricsRaw.isNullOrBlank() },
                wordTimedSongs = data.songs.count { isWordTimed(it) },
                backupPath = backup.absolutePath,
                migratedAt = System.currentTimeMillis(),
                payloadVersion = PAYLOAD_VERSION,
            )

            db.withTransaction {
                // Carry forward the three columns Compose owns. insertAll is
                // REPLACE, so without this a full re-copy silently reverts every
                // like and play count the native app has written.
                val localState = db.songDao().localState().associateBy { it.id }
                val merged = data.songs.map { song ->
                    val local = localState[song.id] ?: return@map song
                    song.copy(
                        isLiked = local.isLiked,
                        playCount = local.playCount,
                        lastPlayed = local.lastPlayed,
                    )
                }
                db.songDao().insertAll(merged)

                if (fullCopy) {
                    db.songDao().insertLyrics(data.lyrics)
                    db.playlistDao().insertAll(data.playlists)
                    db.playlistDao().insertAllLinks(data.links)
                    pruneRowsAbsentFromLegacy(db, data)
                }
                db.migrationDao().putAll(metaRows(report))
            }

            val songMatches = db.songDao().countAll() == report.songs
            val playlistMatches = !fullCopy || db.playlistDao().countAll() == report.playlists
            check(songMatches && playlistMatches) {
                "Migration count mismatch — songs=${db.songDao().countAll()}/${report.songs} " +
                    "playlists=${db.playlistDao().countAll()}/${report.playlists}"
            }

            Log.i(
                TAG,
                "Migration ok: songs=${report.songs} lyrics=${report.lyricLines} " +
                    "playlists=${report.playlists} rawPayload=${report.rawPayloadSongs} " +
                    "wordTimed=${report.wordTimedSongs} fullCopy=$fullCopy backup=${report.backupPath}"
            )
            report
        } catch (t: Throwable) {
            Log.e(TAG, "Migration failed", t)
            Report(completed = false, error = t.message ?: t::class.java.simpleName)
        }
    }

    /**
     * expo-sqlite stores databases under `files/SQLite/<name>`, while
     * [Context.getDatabasePath] points at `databases/<name>`. Check both, prefer
     * the larger file when both exist (WAL may leave a stale empty databases copy).
     */
    private fun resolveLegacyDbFile(): File? {
        val candidates = listOf(
            File(appContext.filesDir, "SQLite/$LEGACY_DB_NAME"),
            appContext.getDatabasePath(LEGACY_DB_NAME),
            File(appContext.filesDir, LEGACY_DB_NAME),
        )
        return candidates
            .filter { it.exists() && it.length() > 0 }
            .maxByOrNull { it.length() }
            .also { found ->
                if (found == null) {
                    Log.w(
                        TAG,
                        "Legacy DB not found. Checked: " +
                            candidates.joinToString { it.absolutePath }
                    )
                }
            }
    }

    private class LegacyData(
        val songs: List<SongEntity>,
        val lyrics: List<LyricLineEntity>,
        val playlists: List<PlaylistEntity>,
        val links: List<PlaylistSongEntity>,
    )

    private fun openReadonly(file: File): SQLiteDatabase =
        SQLiteDatabase.openDatabase(
            file.absolutePath,
            null,
            SQLiteDatabase.OPEN_READONLY or SQLiteDatabase.NO_LOCALIZED_COLLATORS
        )

    private fun writeBackup(legacyFile: File): File {
        val backupDir = File(appContext.filesDir, BACKUP_DIR).apply { mkdirs() }
        val stamp = SimpleDateFormat("yyyyMMdd-HHmmss", Locale.US).format(Date())
        val backup = File(backupDir, "lyricflow-pre-migration-$stamp.db")
        legacyFile.copyTo(backup, overwrite = false)
        File(legacyFile.absolutePath + "-wal").takeIf { it.exists() }?.let {
            it.copyTo(File(backup.absolutePath + "-wal"), overwrite = false)
        }
        File(legacyFile.absolutePath + "-shm").takeIf { it.exists() }?.let {
            it.copyTo(File(backup.absolutePath + "-shm"), overwrite = false)
        }
        return backup
    }

    private fun stageCopy(legacyFile: File): File {
        val stagingDir = File(appContext.cacheDir, STAGE_DIR)
        stagingDir.deleteRecursively()
        stagingDir.mkdirs()
        val staged = File(stagingDir, LEGACY_DB_NAME)
        legacyFile.copyTo(staged)
        File(legacyFile.absolutePath + "-wal").takeIf { it.exists() }?.let {
            it.copyTo(File(staged.absolutePath + "-wal"))
        }
        File(legacyFile.absolutePath + "-shm").takeIf { it.exists() }?.let {
            it.copyTo(File(staged.absolutePath + "-shm"))
        }
        return staged
    }

    private fun readSongs(db: SQLiteDatabase): List<SongEntity> {
        val out = ArrayList<SongEntity>()
        db.rawQuery("SELECT * FROM songs", null).use { c ->
            val id = c.col("id"); val title = c.col("title"); val artist = c.col("artist")
            val album = c.col("album"); val gradientId = c.col("gradient_id")
            val duration = c.col("duration"); val dateCreated = c.col("date_created")
            val dateModified = c.col("date_modified"); val playCount = c.col("play_count")
            val lastPlayed = c.col("last_played"); val scrollSpeed = c.col("scroll_speed")
            val coverUri = c.col("cover_image_uri")
            val lyricSource = c.col("lyric_source")
            val lyricsRaw = c.col("lyrics_raw")
            val lyricsFormat = c.col("lyrics_format")
            val lyricsSyncType = c.col("lyrics_sync_type")
            val lyricsPrecision = c.col("lyrics_precision")
            val lyricsAlign = c.col("lyrics_align")
            val textCase = c.col("text_case"); val audioUri = c.col("audio_uri")
            val isLiked = c.col("is_liked"); val isHidden = c.col("is_hidden")
            val vocalStem = c.col("vocal_stem_uri"); val instStem = c.col("instrumental_stem_uri")
            val separationStatus = c.col("separation_status")
            val separationProgress = c.col("separation_progress")
            val ytId = c.col("youtube_video_id"); val offset = c.col("lyrics_offset")

            while (c.moveToNext()) {
                out += SongEntity(
                    id = c.string(id) ?: continue,
                    title = c.string(title) ?: "",
                    artist = c.string(artist),
                    album = c.string(album),
                    gradientId = c.string(gradientId) ?: "blue",
                    duration = c.int(duration),
                    dateCreated = c.string(dateCreated) ?: "",
                    dateModified = c.string(dateModified) ?: "",
                    playCount = c.int(playCount),
                    lastPlayed = c.string(lastPlayed),
                    scrollSpeed = c.int(scrollSpeed, 50),
                    coverImageUri = c.string(coverUri),
                    lyricSource = c.string(lyricSource),
                    lyricsRaw = c.string(lyricsRaw),
                    lyricsFormat = c.string(lyricsFormat),
                    lyricsSyncType = c.string(lyricsSyncType),
                    lyricsPrecision = c.string(lyricsPrecision),
                    lyricsAlign = c.string(lyricsAlign) ?: "left",
                    textCase = c.string(textCase) ?: "normal",
                    audioUri = c.string(audioUri),
                    isLiked = c.bool(isLiked),
                    isHidden = c.bool(isHidden),
                    vocalStemUri = c.string(vocalStem),
                    instrumentalStemUri = c.string(instStem),
                    separationStatus = c.string(separationStatus) ?: "none",
                    separationProgress = c.int(separationProgress),
                    youtubeVideoId = c.string(ytId),
                    lyricsOffset = c.double(offset),
                )
            }
        }
        return out
    }

    /**
     * Removes Room rows that no longer exist in legacy.
     *
     * `fullCopy` only ever REPLACE-inserts, so without this a song, playlist or
     * playlist membership deleted in the RN app lingers in Room forever and
     * "legacy is the source of truth" stops being true.
     *
     * Deletes are by `IN` over a Kotlin-computed difference, chunked — not
     * `NOT IN`. The library is over 1000 rows, which exceeds SQLite's
     * per-statement variable limit, and a chunked `NOT IN` would be actively
     * wrong: each chunk would delete everything outside itself.
     *
     * Must run inside the caller's transaction — a partial prune drops library.
     */
    private suspend fun pruneRowsAbsentFromLegacy(db: LibraryDatabase, data: LegacyData) {
        val legacySongIds = data.songs.mapTo(HashSet()) { it.id }
        val staleSongs = db.songDao().allIds().filterNot { it in legacySongIds }
        staleSongs.chunked(CHUNK).forEach { db.songDao().deleteSongs(it) }

        val legacyPlaylistIds = data.playlists.mapTo(HashSet()) { it.id }
        val stalePlaylists = db.playlistDao().allIds().filterNot { it in legacyPlaylistIds }
        stalePlaylists.chunked(CHUNK).forEach { db.playlistDao().deletePlaylists(it) }

        // playlist_songs has no single id — its key is (playlist_id, song_id).
        // A membership can be removed while both parents still exist, so parent
        // cascades are not sufficient on their own.
        val legacyLinks = data.links.mapTo(HashSet()) { it.playlistId to it.songId }
        db.playlistDao().allLinkKeys()
            .filterNot { (it.playlistId to it.songId) in legacyLinks }
            .groupBy({ it.playlistId }, { it.songId })
            .forEach { (playlistId, songIds) ->
                songIds.chunked(CHUNK).forEach { chunk ->
                    db.playlistDao().deleteLinks(playlistId, chunk)
                }
            }

        if (staleSongs.isNotEmpty() || stalePlaylists.isNotEmpty()) {
            Log.i(TAG, "Pruned ${staleSongs.size} songs, ${stalePlaylists.size} playlists absent from legacy")
        }
    }

    private fun readLyrics(db: SQLiteDatabase): List<LyricLineEntity> {
        val out = ArrayList<LyricLineEntity>()
        db.rawQuery("SELECT * FROM lyrics ORDER BY song_id, line_order", null).use { c ->
            val songId = c.col("song_id"); val timestamp = c.col("timestamp")
            val text = c.col("text"); val lineOrder = c.col("line_order")
            while (c.moveToNext()) {
                out += LyricLineEntity(
                    songId = c.string(songId) ?: continue,
                    // Legacy stores fractional seconds under an INTEGER column
                    // declaration (SQLite affinity is loose). Read as a double —
                    // truncating here cost every synced lyric up to a second.
                    timestamp = c.secondsAsDouble(timestamp),
                    text = c.string(text) ?: "",
                    lineOrder = c.int(lineOrder),
                )
            }
        }
        return out
    }

    private fun readPlaylists(db: SQLiteDatabase): List<PlaylistEntity> {
        val out = ArrayList<PlaylistEntity>()
        db.rawQuery("SELECT * FROM playlists", null).use { c ->
            val id = c.col("id"); val name = c.col("name"); val description = c.col("description")
            val coverUri = c.col("cover_image_uri"); val isDefault = c.col("is_default")
            val sortOrder = c.col("sort_order"); val dateCreated = c.col("date_created")
            val dateModified = c.col("date_modified")
            while (c.moveToNext()) {
                out += PlaylistEntity(
                    id = c.string(id) ?: continue,
                    name = c.string(name) ?: "",
                    description = c.string(description),
                    coverImageUri = c.string(coverUri),
                    isDefault = c.bool(isDefault),
                    sortOrder = c.int(sortOrder),
                    dateCreated = c.string(dateCreated) ?: "",
                    dateModified = c.string(dateModified) ?: "",
                )
            }
        }
        return out
    }

    private fun readPlaylistLinks(db: SQLiteDatabase): List<PlaylistSongEntity> {
        val out = ArrayList<PlaylistSongEntity>()
        db.rawQuery("SELECT * FROM playlist_songs", null).use { c ->
            val playlistId = c.col("playlist_id"); val songId = c.col("song_id")
            val addedAt = c.col("added_at"); val sortOrder = c.col("sort_order")
            while (c.moveToNext()) {
                out += PlaylistSongEntity(
                    playlistId = c.string(playlistId) ?: continue,
                    songId = c.string(songId) ?: continue,
                    addedAt = c.string(addedAt) ?: "",
                    sortOrder = c.int(sortOrder),
                )
            }
        }
        return out
    }

    private fun metaRows(report: Report): List<MigrationMetaEntity> = listOf(
        MigrationMetaEntity(KEY_COMPLETED, "true"),
        MigrationMetaEntity(KEY_PAYLOAD_VERSION, report.payloadVersion.toString()),
        MigrationMetaEntity(KEY_REPORT, encodeReport(report)),
    )

    private fun encodeReport(report: Report): String = listOf(
        report.completed,
        report.songs,
        report.lyricLines,
        report.playlists,
        report.playlistLinks,
        report.likedSongs,
        report.offsetSongs,
        report.rawPayloadSongs,
        report.wordTimedSongs,
        report.backupPath.orEmpty(),
        report.migratedAt,
        report.payloadVersion,
    ).joinToString("|")

    private fun restore(meta: Map<String, String>): Report {
        val raw = meta[KEY_REPORT] ?: return Report(completed = true, payloadVersion = PAYLOAD_VERSION)
        val parts = raw.split("|")
        fun intAt(i: Int) = parts.getOrNull(i)?.toIntOrNull() ?: 0
        fun longAt(i: Int) = parts.getOrNull(i)?.toLongOrNull() ?: 0L
        // Support both v1 report layout (no raw/word fields) and v2.
        val hasV2Layout = parts.size >= 12
        return if (hasV2Layout) {
            Report(
                completed = parts.getOrNull(0) == "true",
                songs = intAt(1),
                lyricLines = intAt(2),
                playlists = intAt(3),
                playlistLinks = intAt(4),
                likedSongs = intAt(5),
                offsetSongs = intAt(6),
                rawPayloadSongs = intAt(7),
                wordTimedSongs = intAt(8),
                backupPath = parts.getOrNull(9)?.takeIf { it.isNotEmpty() },
                migratedAt = longAt(10),
                payloadVersion = intAt(11),
            )
        } else {
            Report(
                completed = parts.getOrNull(0) == "true",
                songs = intAt(1),
                lyricLines = intAt(2),
                playlists = intAt(3),
                playlistLinks = intAt(4),
                likedSongs = intAt(5),
                offsetSongs = intAt(6),
                backupPath = parts.getOrNull(7)?.takeIf { it.isNotEmpty() },
                migratedAt = longAt(8),
                payloadVersion = meta[KEY_PAYLOAD_VERSION]?.toIntOrNull() ?: 1,
            )
        }
    }

    private fun isWordTimed(song: SongEntity): Boolean {
        val precision = song.lyricsPrecision?.lowercase(Locale.US)
        val sync = song.lyricsSyncType?.lowercase(Locale.US)
        val format = song.lyricsFormat?.lowercase(Locale.US)
        return precision == "word" || sync == "richsync" || format == "ttml"
    }

    private fun Cursor.col(name: String): Int = getColumnIndex(name)

    private fun Cursor.string(col: Int): String? =
        if (col >= 0 && !isNull(col)) getString(col) else null

    private fun Cursor.int(col: Int, default: Int = 0): Int =
        if (col >= 0 && !isNull(col)) getInt(col) else default

    /** Legacy timestamps are REAL seconds under an INTEGER declaration. */
    private fun Cursor.secondsAsDouble(col: Int): Double =
        if (col >= 0 && !isNull(col)) getDouble(col) else 0.0

    private fun Cursor.double(col: Int): Double =
        if (col >= 0 && !isNull(col)) getDouble(col) else 0.0

    private fun Cursor.bool(col: Int): Boolean =
        if (col >= 0 && !isNull(col)) getInt(col) == 1 else false

    companion object {
        /** Kept well under SQLite's per-statement variable limit. */
        private const val CHUNK = 500

        const val TAG = "LegacyMigrator"
        const val LEGACY_DB_NAME = "lyricflow.db"
        const val KEY_COMPLETED = "migration.completed"
        const val KEY_PAYLOAD_VERSION = "migration.payloadVersion"
        const val KEY_REPORT = "report"
        /** Bump when song-row fields must be re-pulled from legacy. */
        /**
         * 4 — lyric timestamps widened to REAL seconds. Bumping this forces a
         * full re-copy so the truncated v3 rows are replaced.
         */
        const val PAYLOAD_VERSION = 4
        const val BACKUP_DIR = "db-backups"
        const val STAGE_DIR = "migration-src"
    }
}
