package com.lyricflow.app.data

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Transaction
import androidx.room.Update
import kotlinx.coroutines.flow.Flow

@Dao
interface SongDao {

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertAll(songs: List<SongEntity>)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertLyrics(lyrics: List<LyricLineEntity>)

    @Update
    suspend fun update(song: SongEntity)

    @Query("UPDATE songs SET is_liked = :liked WHERE id = :id")
    suspend fun setLiked(id: String, liked: Boolean)

    @Query("SELECT * FROM songs WHERE is_hidden = 0 ORDER BY date_created DESC")
    fun observeRecent(): Flow<List<SongEntity>>

    @Query("SELECT * FROM songs WHERE is_hidden = 0 ORDER BY title COLLATE NOCASE ASC")
    fun observeByTitle(): Flow<List<SongEntity>>

    @Query(
        "SELECT * FROM songs WHERE is_hidden = 0 " +
            "ORDER BY CASE WHEN artist IS NULL THEN 1 ELSE 0 END, artist COLLATE NOCASE ASC"
    )
    fun observeByArtist(): Flow<List<SongEntity>>

    @Query("SELECT * FROM songs WHERE is_liked = 1 AND is_hidden = 0 ORDER BY date_created DESC")
    fun observeLiked(): Flow<List<SongEntity>>

    @Query(
        "SELECT * FROM songs WHERE is_hidden = 0 " +
            "AND (title LIKE '%' || :query || '%' COLLATE NOCASE " +
            "OR artist LIKE '%' || :query || '%' COLLATE NOCASE) " +
            "ORDER BY date_created DESC LIMIT 100"
    )
    fun search(query: String): Flow<List<SongEntity>>

    @Query("SELECT COUNT(*) FROM songs WHERE is_hidden = 0")
    fun observeVisibleCount(): Flow<Int>

    @Query("SELECT COUNT(*) FROM songs WHERE is_liked = 1 AND is_hidden = 0")
    fun observeLikedCount(): Flow<Int>

    @Query("SELECT COUNT(*) FROM songs WHERE is_hidden = 0 AND lyrics_offset != 0")
    fun observeOffsetCount(): Flow<Int>

    @Query(
        "SELECT COUNT(*) FROM songs WHERE is_hidden = 0 " +
            "AND lyrics_raw IS NOT NULL AND length(lyrics_raw) > 0"
    )
    fun observeRawPayloadCount(): Flow<Int>

    @Query(
        "SELECT COUNT(*) FROM songs WHERE is_hidden = 0 " +
            "AND (lyrics_precision = 'word' OR lyrics_sync_type = 'richsync' " +
            "OR lower(ifnull(lyrics_format, '')) = 'ttml')"
    )
    fun observeWordTimedCount(): Flow<Int>

    @Query("SELECT COUNT(*) FROM songs")
    suspend fun countAll(): Int

    @Query("SELECT id FROM songs")
    suspend fun allIds(): List<String>

    /**
     * The columns Compose is allowed to write. A `fullCopy` re-migration must
     * carry these forward instead of taking legacy's values, or every like and
     * play count made natively is silently reverted on the next payload bump.
     */
    @Query("SELECT id, is_liked, play_count, last_played FROM songs")
    suspend fun localState(): List<SongLocalState>

    /**
     * Chunked by the caller. Deliberately `IN` and not `NOT IN`: the library is
     * over 1000 rows and `NOT IN` with that many bound variables exceeds
     * SQLite's per-statement variable limit, while chunking a `NOT IN` would be
     * outright wrong — each chunk would delete everything outside itself.
     */
    @Query("DELETE FROM songs WHERE id IN (:ids)")
    suspend fun deleteSongs(ids: List<String>)

    @Query("SELECT COUNT(*) FROM lyrics")
    suspend fun countLyrics(): Int

    @Transaction
    @Query("SELECT * FROM songs WHERE id = :id")
    suspend fun getSongWithLyrics(id: String): SongWithLyrics?

    @Transaction
    @Query("SELECT * FROM songs WHERE is_hidden = 0 ORDER BY date_created DESC")
    suspend fun getAllWithLyrics(): List<SongWithLyrics>
}

@Dao
interface PlaylistDao {

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertAll(playlists: List<PlaylistEntity>)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertAllLinks(links: List<PlaylistSongEntity>)

    @Transaction
    @Query(
        "SELECT p.*, (SELECT COUNT(*) FROM playlist_songs ps WHERE ps.playlist_id = p.id) AS songCount " +
            "FROM playlists p ORDER BY p.sort_order ASC"
    )
    fun observePlaylistsWithCount(): Flow<List<PlaylistWithSongCount>>

    @Transaction
    @Query(
        "SELECT s.* FROM playlist_songs ps JOIN songs s ON s.id = ps.song_id " +
            "WHERE ps.playlist_id = :playlistId AND s.is_hidden = 0 ORDER BY ps.sort_order ASC"
    )
    fun observePlaylistSongs(playlistId: String): Flow<List<SongEntity>>

    @Query("SELECT COUNT(*) FROM playlists")
    suspend fun countAll(): Int

    @Query("SELECT id FROM playlists")
    suspend fun allIds(): List<String>

    @Query("SELECT playlist_id, song_id FROM playlist_songs")
    suspend fun allLinkKeys(): List<PlaylistLinkKey>

    @Query("DELETE FROM playlists WHERE id IN (:ids)")
    suspend fun deletePlaylists(ids: List<String>)

    /** Composite key, so a link is addressed by both halves — see the migrator. */
    @Query("DELETE FROM playlist_songs WHERE playlist_id = :playlistId AND song_id IN (:songIds)")
    suspend fun deleteLinks(playlistId: String, songIds: List<String>)
}

@Dao
interface MigrationDao {

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun putAll(pairs: List<MigrationMetaEntity>)

    @Query("SELECT * FROM migration_meta")
    suspend fun all(): List<MigrationMetaEntity>
}
