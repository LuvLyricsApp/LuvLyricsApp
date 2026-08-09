package com.lyricflow.app.data

import androidx.room.ColumnInfo
import androidx.room.Embedded
import androidx.room.Entity
import androidx.room.ForeignKey
import androidx.room.Index
import androidx.room.PrimaryKey
import androidx.room.Relation

/**
 * Room mirror of the live expo-sqlite schema (lyricflow.db). Column names and
 * types match the legacy tables exactly so Phase 1 migration is a straight
 * row copy and parity checks can compare column-for-column.
 *
 * Legacy source of truth: src/database/db.ts (initializeTables + ALTER
 * migrations) — do not rename columns here without touching the migrator.
 */

@Entity(
    tableName = "songs",
    indices = [Index("title"), Index("artist")],
)
data class SongEntity(
    @PrimaryKey val id: String,
    val title: String,
    val artist: String?,
    val album: String?,
    @ColumnInfo(name = "gradient_id") val gradientId: String,
    val duration: Int = 0,
    @ColumnInfo(name = "date_created") val dateCreated: String,
    @ColumnInfo(name = "date_modified") val dateModified: String,
    @ColumnInfo(name = "play_count") val playCount: Int = 0,
    @ColumnInfo(name = "last_played") val lastPlayed: String?,
    @ColumnInfo(name = "scroll_speed") val scrollSpeed: Int = 50,
    @ColumnInfo(name = "cover_image_uri") val coverImageUri: String?,
    /** Provider name (Unison / Better Lyrics / LRCLIB / Manual …). */
    @ColumnInfo(name = "lyric_source") val lyricSource: String? = null,
    /** Original provider body (TTML / LRC / plain). Word render reads this offline. */
    @ColumnInfo(name = "lyrics_raw") val lyricsRaw: String? = null,
    @ColumnInfo(name = "lyrics_format") val lyricsFormat: String? = null,
    @ColumnInfo(name = "lyrics_sync_type") val lyricsSyncType: String? = null,
    @ColumnInfo(name = "lyrics_precision") val lyricsPrecision: String? = null,
    @ColumnInfo(name = "lyrics_align") val lyricsAlign: String = "left",
    @ColumnInfo(name = "text_case") val textCase: String = "normal",
    @ColumnInfo(name = "audio_uri") val audioUri: String?,
    @ColumnInfo(name = "is_liked") val isLiked: Boolean = false,
    @ColumnInfo(name = "is_hidden") val isHidden: Boolean = false,
    @ColumnInfo(name = "vocal_stem_uri") val vocalStemUri: String?,
    @ColumnInfo(name = "instrumental_stem_uri") val instrumentalStemUri: String?,
    @ColumnInfo(name = "separation_status") val separationStatus: String = "none",
    @ColumnInfo(name = "separation_progress") val separationProgress: Int = 0,
    @ColumnInfo(name = "youtube_video_id") val youtubeVideoId: String?,
    @ColumnInfo(name = "lyrics_offset") val lyricsOffset: Double = 0.0,
)

@Entity(
    tableName = "lyrics",
    foreignKeys = [
        ForeignKey(
            entity = SongEntity::class,
            parentColumns = ["id"],
            childColumns = ["song_id"],
            onDelete = ForeignKey.CASCADE,
        )
    ],
    indices = [Index("song_id"), Index("timestamp")],
)
data class LyricLineEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    @ColumnInfo(name = "song_id") val songId: String,
    val timestamp: Int,
    val text: String,
    @ColumnInfo(name = "line_order") val lineOrder: Int,
)

@Entity(tableName = "playlists")
data class PlaylistEntity(
    @PrimaryKey val id: String,
    val name: String,
    val description: String?,
    @ColumnInfo(name = "cover_image_uri") val coverImageUri: String?,
    @ColumnInfo(name = "is_default") val isDefault: Boolean = false,
    @ColumnInfo(name = "sort_order") val sortOrder: Int = 0,
    @ColumnInfo(name = "date_created") val dateCreated: String,
    @ColumnInfo(name = "date_modified") val dateModified: String,
)

@Entity(
    tableName = "playlist_songs",
    primaryKeys = ["playlist_id", "song_id"],
    foreignKeys = [
        ForeignKey(
            entity = PlaylistEntity::class,
            parentColumns = ["id"],
            childColumns = ["playlist_id"],
            onDelete = ForeignKey.CASCADE,
        ),
        ForeignKey(
            entity = SongEntity::class,
            parentColumns = ["id"],
            childColumns = ["song_id"],
            onDelete = ForeignKey.CASCADE,
        ),
    ],
    indices = [Index("playlist_id", "sort_order")],
)
data class PlaylistSongEntity(
    @ColumnInfo(name = "playlist_id") val playlistId: String,
    @ColumnInfo(name = "song_id") val songId: String,
    @ColumnInfo(name = "added_at") val addedAt: String,
    @ColumnInfo(name = "sort_order") val sortOrder: Int = 0,
)

/**
 * Small audit table used by the one-shot migration: completion flag, source
 * counts and the backup path. Kept in Room so a reinstall never re-runs a
 * destructive-looking migration over a fresh (or half-migrated) DB.
 */
@Entity(tableName = "migration_meta")
data class MigrationMetaEntity(
    @PrimaryKey val key: String,
    val value: String,
)

data class SongWithLyrics(
    @Embedded val song: SongEntity,
    @Relation(parentColumn = "id", entityColumn = "song_id")
    val lyrics: List<LyricLineEntity>,
)

data class PlaylistWithSongCount(
    @Embedded val playlist: PlaylistEntity,
    val songCount: Int,
)
