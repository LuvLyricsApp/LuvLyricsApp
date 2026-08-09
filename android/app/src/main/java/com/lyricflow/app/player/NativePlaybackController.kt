package com.lyricflow.app.player

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Handler
import android.os.Looper
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import com.lyricflow.app.data.SongEntity
import com.lyricflow.app.modules.PlayerBridge
import com.lyricflow.app.services.PlaybackService
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

data class PlaybackStatus(
    val songId: String? = null,
    val title: String = "",
    val artist: String = "",
    val artworkUri: String? = null,
    val positionSec: Double = 0.0,
    val durationSec: Double = 0.0,
    val isPlaying: Boolean = false,
    val playWhenReady: Boolean = false,
    val isBuffering: Boolean = false,
    val hasNext: Boolean = false,
    val hasPrevious: Boolean = false,
) {
    /** Nothing has been loaded yet — the docked player stays hidden. */
    val isIdle: Boolean get() = songId.isNullOrBlank() && title.isBlank()
}

/**
 * Compose-facing playback API over the existing PlaybackService / PlayerBridge.
 *
 * **Who owns `isPlaying`** (see CLAUDE.md — this was broken once, don't regress
 * it): on Android, Media3 owns it. Commands here only *send*; they never write
 * an optimistic value into the status. `PlayerBridge` emits `playWhenReady`,
 * which flips the instant a command is applied — unlike `isPlaying`, which
 * stays false while buffering — and the UI adopts that verbatim. Because there
 * is no optimistic update, there is nothing for a status tick to contradict and
 * no echo guard is needed. This is why `playbackIntent.ts` has no counterpart
 * here.
 *
 * Seeking needs no play/pause dance either: Media3's `seekTo` preserves
 * `playWhenReady`. The RN "resume if it was playing" pattern exists to work
 * around expo-audio pausing on seek, and porting it would double-trigger play.
 */
object NativePlaybackController {

    private val mainHandler = Handler(Looper.getMainLooper())

    private val _status = MutableStateFlow(PlaybackStatus())
    val status: StateFlow<PlaybackStatus> = _status.asStateFlow()

    /**
     * The queue as the UI knows it. Kept alongside Media3's own timeline so the
     * queue sheet can render titles without reaching back into Room per item.
     */
    private val _queue = MutableStateFlow<List<SongEntity>>(emptyList())
    val queue: StateFlow<List<SongEntity>> = _queue.asStateFlow()

    /** Full row for the loaded track — the lyric stage reads its payload columns. */
    private val _currentSong = MutableStateFlow<SongEntity?>(null)
    val currentSong: StateFlow<SongEntity?> = _currentSong.asStateFlow()

    @Volatile
    private var bridgeAttached = false

    fun ensureBridge() {
        if (bridgeAttached) return
        synchronized(this) {
            if (bridgeAttached) return
            PlayerBridge.onStatusUpdate = { position, duration, isPlaying, playWhenReady, isBuffering, _ ->
                val player = PlayerBridge.getPlayer()
                val item = player?.currentMediaItem
                val mediaId = item?.mediaId
                _status.value = PlaybackStatus(
                    songId = mediaId,
                    title = item?.mediaMetadata?.title?.toString() ?: "",
                    artist = item?.mediaMetadata?.artist?.toString() ?: "",
                    artworkUri = item?.mediaMetadata?.artworkUri?.toString(),
                    positionSec = position,
                    durationSec = duration,
                    isPlaying = isPlaying,
                    playWhenReady = playWhenReady,
                    isBuffering = isBuffering,
                    hasNext = player?.hasNextMediaItem() ?: false,
                    hasPrevious = player?.hasPreviousMediaItem() ?: false,
                )
                // Keep the current row in step with Media3's own auto-advance.
                if (mediaId != null && mediaId != _currentSong.value?.id) {
                    _queue.value.firstOrNull { it.id == mediaId }?.let { _currentSong.value = it }
                }
            }
            bridgeAttached = true
        }
    }

    /** Plays one song with no surrounding queue. */
    fun playSong(context: Context, song: SongEntity) = playQueue(context, listOf(song), 0)

    /**
     * Plays [song] in the context of the list it was tapped in, so next/previous
     * follow what the user is actually looking at.
     */
    fun playFromLibrary(context: Context, songs: List<SongEntity>, song: SongEntity) {
        val index = songs.indexOfFirst { it.id == song.id }
        if (index < 0) playQueue(context, listOf(song), 0) else playQueue(context, songs, index)
    }

    /**
     * Loads [songs] and starts at [startIndex]. Songs without a playable audio
     * URI are dropped rather than left in the queue as dead entries, and the
     * start index is corrected to still land on the requested track.
     */
    fun playQueue(context: Context, songs: List<SongEntity>, startIndex: Int) {
        val requested = songs.getOrNull(startIndex)
        val playable = songs.filter { isPlayable(it.audioUri) }
        if (playable.isEmpty()) return

        val index = requested
            ?.let { target -> playable.indexOfFirst { it.id == target.id }.takeIf { it >= 0 } }
            ?: 0

        ensureBridge()
        context.startService(Intent(context, PlaybackService::class.java))
        _queue.value = playable
        _currentSong.value = playable[index]

        withPlayer { player ->
            player.setMediaItems(playable.map(::toMediaItem), index, 0L)
            player.prepare()
            player.play()
        }
    }

    fun togglePlayPause(context: Context) {
        ensureBridge()
        context.startService(Intent(context, PlaybackService::class.java))
        withPlayer { player ->
            if (player.playWhenReady) player.pause() else player.play()
        }
    }

    fun seekTo(seconds: Double) = withPlayer { player ->
        player.seekTo((seconds * 1000).toLong().coerceAtLeast(0L))
    }

    fun skipNext() = withPlayer { player ->
        if (player.hasNextMediaItem()) player.seekToNextMediaItem()
    }

    /**
     * Mirrors the RN transport: a press part-way into a track restarts it, and
     * only a press near the start goes to the previous track.
     */
    fun skipPrevious() = withPlayer { player ->
        if (player.currentPosition > RESTART_THRESHOLD_MS || !player.hasPreviousMediaItem()) {
            player.seekTo(0)
        } else {
            player.seekToPreviousMediaItem()
        }
    }

    fun playQueueIndex(index: Int) = withPlayer { player ->
        if (index in 0 until player.mediaItemCount) {
            player.seekTo(index, 0L)
            player.play()
            _queue.value.getOrNull(index)?.let { _currentSong.value = it }
        }
    }

    private fun toMediaItem(song: SongEntity): MediaItem = MediaItem.Builder()
        .setUri(song.audioUri)
        .setMediaId(song.id)
        .setMediaMetadata(
            MediaMetadata.Builder()
                .setTitle(song.title)
                .setArtist(song.artist ?: "")
                .setAlbumTitle(song.album ?: "")
                .apply {
                    song.coverImageUri?.takeIf { isPlayable(it) }?.let { setArtworkUri(Uri.parse(it)) }
                }
                .build()
        )
        .build()

    /**
     * Runs [block] on the main thread once the service has published its player.
     *
     * The service is started asynchronously, so the first command after a cold
     * start can arrive before `PlayerBridge` has a player. Rather than blocking
     * a background thread on a latch, this re-posts itself a bounded number of
     * times — the UI thread is never held and a service that never starts fails
     * quietly instead of hanging.
     */
    private fun withPlayer(attempt: Int = 0, block: (androidx.media3.exoplayer.ExoPlayer) -> Unit) {
        mainHandler.post {
            val player = PlayerBridge.getPlayer()
            if (player != null) {
                block(player)
                PlayerBridge.emitStatus()
            } else if (attempt < PLAYER_WAIT_ATTEMPTS) {
                mainHandler.postDelayed({ withPlayer(attempt + 1, block) }, PLAYER_WAIT_STEP_MS)
            }
        }
    }

    private fun withPlayer(block: (androidx.media3.exoplayer.ExoPlayer) -> Unit) = withPlayer(0, block)

    private fun isPlayable(uri: String?): Boolean {
        if (uri.isNullOrBlank() || uri.length > 4096) return false
        return when (Uri.parse(uri).scheme?.lowercase()) {
            "file", "content", "https" -> true
            else -> false
        }
    }

    private const val RESTART_THRESHOLD_MS = 3_000L
    private const val PLAYER_WAIT_ATTEMPTS = 100
    private const val PLAYER_WAIT_STEP_MS = 20L
}
