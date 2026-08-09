package com.lyricflow.app.data

import kotlinx.coroutines.flow.Flow

enum class SongSort { RECENT, TITLE, ARTIST }

/**
 * App-facing read/write API over Room. Mirrors the query shapes the RN app
 * uses (src/database/queries.ts, StartupPreloader.kt) so behaviour parity is
 * auditable: visible songs only, liked filter, playlist order by sort_order.
 */
class LibraryRepository(private val db: LibraryDatabase) {

    fun observeSongs(sort: SongSort, likedOnly: Boolean = false): Flow<List<SongEntity>> = when {
        likedOnly -> db.songDao().observeLiked()
        sort == SongSort.TITLE -> db.songDao().observeByTitle()
        sort == SongSort.ARTIST -> db.songDao().observeByArtist()
        else -> db.songDao().observeRecent()
    }

    fun observeVisibleCount(): Flow<Int> = db.songDao().observeVisibleCount()

    fun observeLikedCount(): Flow<Int> = db.songDao().observeLikedCount()

    fun observeOffsetCount(): Flow<Int> = db.songDao().observeOffsetCount()

    fun observeRawPayloadCount(): Flow<Int> = db.songDao().observeRawPayloadCount()

    fun observeWordTimedCount(): Flow<Int> = db.songDao().observeWordTimedCount()

    fun observePlaylistsWithCount(): Flow<List<PlaylistWithSongCount>> =
        db.playlistDao().observePlaylistsWithCount()

    fun observePlaylistSongs(playlistId: String): Flow<List<SongEntity>> =
        db.playlistDao().observePlaylistSongs(playlistId)

    fun search(query: String): Flow<List<SongEntity>> = db.songDao().search(query)

    suspend fun getSongWithLyrics(id: String): SongWithLyrics? =
        db.songDao().getSongWithLyrics(id)

    suspend fun setLiked(id: String, liked: Boolean) = db.songDao().setLiked(id, liked)
}
