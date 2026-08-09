package com.lyricflow.app.data

import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.util.Log
import java.io.File
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking

/**
 * Phase 1 parity checks: compare legacy expo-sqlite counts/spot-checks against Room.
 * Logs a single structured block to logcat (tag LegacyMigrator) for adb verification.
 */
object MigrationVerifier {

    data class LegacySnapshot(
        val path: String,
        val songs: Int,
        val visibleSongs: Int,
        val lyricLines: Int,
        val playlists: Int,
        val playlistLinks: Int,
        val likedSongs: Int,
        val offsetSongs: Int,
        val rawPayloadSongs: Int,
        val wordTimedSongs: Int,
        val samplePlaylistId: String?,
        val samplePlaylistName: String?,
        val samplePlaylistOrder: List<String>,
        val sampleLikedId: String?,
        val sampleOffsetId: String?,
        val sampleOffsetValue: Double,
        val sampleWordTimedId: String?,
        val sampleWordTimedFormat: String?,
        val hasLyricsPayloadColumns: Boolean,
    )

    data class ParityResult(
        val legacy: LegacySnapshot?,
        val roomSongs: Int,
        val roomPlaylists: Int,
        val roomLiked: Int,
        val roomOffsets: Int,
        val roomRawPayloads: Int,
        val roomWordTimed: Int,
        val mismatches: List<String>,
    )

    fun verify(context: Context, roomDb: LibraryDatabase): ParityResult {
        val legacy = readLegacySnapshot(context)
        val repo = LibraryRepository(roomDb)
        val roomSongs = runBlocking { roomDb.songDao().countAll() }
        val roomPlaylists = runBlocking { roomDb.playlistDao().countAll() }
        val hasFormatCols = legacy?.hasLyricsPayloadColumns == true

        val mismatches = mutableListOf<String>()
        if (legacy == null) {
            mismatches += "legacy DB not found"
        } else {
            if (roomSongs != legacy.visibleSongs) {
                mismatches += "visible songs: legacy=${legacy.visibleSongs} room=$roomSongs"
            }
            if (roomPlaylists != legacy.playlists) {
                mismatches += "playlists: legacy=${legacy.playlists} room=$roomPlaylists"
            }
            val roomLiked = countBlocking { repo.observeLikedCount() }
            val roomOffsets = countBlocking { repo.observeOffsetCount() }
            if (roomLiked != legacy.likedSongs) {
                mismatches += "liked: legacy=${legacy.likedSongs} room=$roomLiked"
            }
            if (roomOffsets != legacy.offsetSongs) {
                mismatches += "offsets: legacy=${legacy.offsetSongs} room=$roomOffsets"
            }
            if (hasFormatCols) {
                val roomRaw = countBlocking { repo.observeRawPayloadCount() }
                val roomWord = countBlocking { repo.observeWordTimedCount() }
                if (roomRaw != legacy.rawPayloadSongs) {
                    mismatches += "raw payloads: legacy=${legacy.rawPayloadSongs} room=$roomRaw"
                }
                if (roomWord != legacy.wordTimedSongs) {
                    mismatches += "word-timed: legacy=${legacy.wordTimedSongs} room=$roomWord"
                }
            }
        }

        val result = ParityResult(
            legacy = legacy,
            roomSongs = roomSongs,
            roomPlaylists = roomPlaylists,
            roomLiked = countBlocking { repo.observeLikedCount() },
            roomOffsets = countBlocking { repo.observeOffsetCount() },
            roomRawPayloads = countBlocking { repo.observeRawPayloadCount() },
            roomWordTimed = countBlocking { repo.observeWordTimedCount() },
            mismatches = mismatches,
        )

        Log.i(
            LegacyLibraryMigrator.TAG,
            "PARITY legacyPath=${legacy?.path} " +
                "legacyVisible=${legacy?.visibleSongs} roomSongs=${result.roomSongs} " +
                "legacyPlaylists=${legacy?.playlists} roomPlaylists=${result.roomPlaylists} " +
                "legacyLiked=${legacy?.likedSongs} roomLiked=${result.roomLiked} " +
                "legacyOffsets=${legacy?.offsetSongs} roomOffsets=${result.roomOffsets} " +
                "legacyRaw=${legacy?.rawPayloadSongs} roomRaw=${result.roomRawPayloads} " +
                "legacyWord=${legacy?.wordTimedSongs} roomWord=${result.roomWordTimed} " +
                "samplePlaylist=${legacy?.samplePlaylistName} order=${legacy?.samplePlaylistOrder?.take(3)} " +
                "sampleLiked=${legacy?.sampleLikedId} sampleOffset=${legacy?.sampleOffsetId}@${legacy?.sampleOffsetValue} " +
                "sampleWord=${legacy?.sampleWordTimedId} format=${legacy?.sampleWordTimedFormat} " +
                "mismatches=${result.mismatches}"
        )
        return result
    }

    private fun countBlocking(flow: () -> Flow<Int>): Int = runBlocking { flow().first() }

    private fun readLegacySnapshot(context: Context): LegacySnapshot? {
        val file = resolveLegacyFile(context) ?: return null
        val staged = stageForRead(file)
        return try {
            SQLiteDatabase.openDatabase(
                staged.absolutePath,
                null,
                SQLiteDatabase.OPEN_READONLY,
            ).use { db ->
                val columns = tableColumns(db, "songs")
                val hasLyricsRaw = columns.contains("lyrics_raw")
                val hasLyricsFormat = columns.contains("lyrics_format")
                val hasLyricsSyncType = columns.contains("lyrics_sync_type")
                val hasLyricsPrecision = columns.contains("lyrics_precision")
                val hasPayloadCols = hasLyricsRaw || hasLyricsFormat || hasLyricsSyncType || hasLyricsPrecision

                val visible = scalar(db, "SELECT COUNT(*) FROM songs WHERE is_hidden = 0")
                val playlists = scalar(db, "SELECT COUNT(*) FROM playlists")
                val playlistId = stringScalar(db, "SELECT id FROM playlists ORDER BY sort_order LIMIT 1")
                val playlistName = playlistId?.let {
                    stringScalar(db, "SELECT name FROM playlists WHERE id = ?", arrayOf(it))
                }
                val order = playlistId?.let { pid ->
                    val ids = mutableListOf<String>()
                    db.rawQuery(
                        "SELECT song_id FROM playlist_songs WHERE playlist_id = ? ORDER BY sort_order LIMIT 5",
                        arrayOf(pid),
                    ).use { c ->
                        while (c.moveToNext()) ids += c.getString(0)
                    }
                    ids
                } ?: emptyList()

                val likedId = stringScalar(
                    db,
                    "SELECT id FROM songs WHERE is_liked = 1 AND is_hidden = 0 LIMIT 1",
                )
                val offsetRow = db.rawQuery(
                    "SELECT id, lyrics_offset FROM songs WHERE lyrics_offset != 0 AND is_hidden = 0 LIMIT 1",
                    null,
                ).use { c ->
                    if (c.moveToNext()) c.getString(0) to c.getDouble(1) else null
                }
                val wordTimedParts = buildList {
                    if (hasLyricsPrecision) add("lyrics_precision = 'word'")
                    if (hasLyricsSyncType) add("lyrics_sync_type = 'richsync'")
                    if (hasLyricsFormat) add("lower(ifnull(lyrics_format,'')) = 'ttml'")
                }
                val wordRow = if (wordTimedParts.isNotEmpty()) {
                    val selectFormat = if (hasLyricsFormat) "lyrics_format" else "NULL"
                    db.rawQuery(
                        "SELECT id, $selectFormat FROM songs WHERE is_hidden = 0 AND (${wordTimedParts.joinToString(" OR ")}) LIMIT 1",
                        null,
                    ).use { c ->
                        if (c.moveToNext()) c.getString(0) to c.getString(1) else null
                    }
                } else {
                    null
                }

                val rawCount = if (hasLyricsRaw) {
                    scalar(
                        db,
                        "SELECT COUNT(*) FROM songs WHERE is_hidden = 0 AND lyrics_raw IS NOT NULL AND length(lyrics_raw) > 0",
                    )
                } else {
                    0
                }
                val wordCount = if (wordTimedParts.isNotEmpty()) {
                    scalar(
                        db,
                        "SELECT COUNT(*) FROM songs WHERE is_hidden = 0 AND (${wordTimedParts.joinToString(" OR ")})",
                    )
                } else {
                    0
                }

                LegacySnapshot(
                    path = file.absolutePath,
                    songs = scalar(db, "SELECT COUNT(*) FROM songs"),
                    visibleSongs = visible,
                    lyricLines = scalar(db, "SELECT COUNT(*) FROM lyrics"),
                    playlists = playlists,
                    playlistLinks = scalar(db, "SELECT COUNT(*) FROM playlist_songs"),
                    likedSongs = scalar(db, "SELECT COUNT(*) FROM songs WHERE is_liked = 1 AND is_hidden = 0"),
                    offsetSongs = scalar(db, "SELECT COUNT(*) FROM songs WHERE lyrics_offset != 0 AND is_hidden = 0"),
                    rawPayloadSongs = rawCount,
                    wordTimedSongs = wordCount,
                    samplePlaylistId = playlistId,
                    samplePlaylistName = playlistName,
                    samplePlaylistOrder = order,
                    sampleLikedId = likedId,
                    sampleOffsetId = offsetRow?.first,
                    sampleOffsetValue = offsetRow?.second ?: 0.0,
                    sampleWordTimedId = wordRow?.first,
                    sampleWordTimedFormat = wordRow?.second,
                    hasLyricsPayloadColumns = hasPayloadCols,
                )
            }
        } finally {
            staged.parentFile?.deleteRecursively()
        }
    }

    private fun resolveLegacyFile(context: Context): File? {
        val candidates = listOf(
            File(context.filesDir, "SQLite/${LegacyLibraryMigrator.LEGACY_DB_NAME}"),
            context.getDatabasePath(LegacyLibraryMigrator.LEGACY_DB_NAME),
            File(context.filesDir, LegacyLibraryMigrator.LEGACY_DB_NAME),
        )
        return candidates.filter { it.exists() && it.length() > 0 }.maxByOrNull { it.length() }
    }

    private fun stageForRead(source: File): File {
        val dir = File(source.parentFile?.parentFile, "migration-verify")
        dir.deleteRecursively()
        dir.mkdirs()
        val staged = File(dir, source.name)
        source.copyTo(staged)
        File(source.absolutePath + "-wal").takeIf { it.exists() }?.copyTo(File(staged.absolutePath + "-wal"))
        File(source.absolutePath + "-shm").takeIf { it.exists() }?.copyTo(File(staged.absolutePath + "-shm"))
        return staged
    }

    private fun tableColumns(db: SQLiteDatabase, table: String): Set<String> {
        val cols = mutableSetOf<String>()
        db.rawQuery("PRAGMA table_info($table)", null).use { c ->
            val nameIdx = c.getColumnIndex("name")
            while (c.moveToNext()) {
                if (nameIdx >= 0) cols += c.getString(nameIdx)
            }
        }
        return cols
    }

    private fun scalar(db: SQLiteDatabase, sql: String, args: Array<String>? = null): Int =
        db.rawQuery(sql, args).use { c -> if (c.moveToFirst()) c.getInt(0) else 0 }

    private fun stringScalar(db: SQLiteDatabase, sql: String, args: Array<String>? = null): String? =
        db.rawQuery(sql, args).use { c -> if (c.moveToFirst() && !c.isNull(0)) c.getString(0) else null }
}
