package com.lyricflow.app.player

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.util.Log
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import com.lyricflow.app.data.SongEntity
import com.lyricflow.app.modules.PlayerBridge
import com.lyricflow.app.services.PlaybackService
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

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
    val queueSize: Int = 0,
)

/**
 * Compose-facing playback API over the existing PlaybackService / PlayerBridge.
 * Mirrors MainPlayerModule behaviour without the JS bridge.
 */
object NativePlaybackController {
    private const val TAG = "NativePlayback"

    private val mainHandler = Handler(Looper.getMainLooper())
    private val _status = MutableStateFlow(PlaybackStatus())
    val status: StateFlow<PlaybackStatus> = _status.asStateFlow()

    private var queue: List<SongEntity> = emptyList()
    private var queueIndex: Int = 0

    @Volatile
    private var bridgeAttached = false

    fun ensureBridge() {
        if (bridgeAttached) return
        synchronized(this) {
            if (bridgeAttached) return
            PlayerBridge.onStatusUpdate = { position, duration, isPlaying, playWhenReady, isBuffering, _ ->
                syncFromPlayer(position, duration, isPlaying, playWhenReady, isBuffering)
            }
            bridgeAttached = true
        }
    }

    /** Play [startSong] with [visibleSongs] as the Media3 queue (next/prev). */
    fun playFromLibrary(context: Context, visibleSongs: List<SongEntity>, startSong: SongEntity) {
        val playable = visibleSongs.filter { song ->
            val uri = song.audioUri
            !uri.isNullOrBlank() && isAllowedUri(uri)
        }
        if (playable.isEmpty()) {
            Log.w(TAG, "playFromLibrary: no playable songs in list")
            return
        }
        val startIndex = playable.indexOfFirst { it.id == startSong.id }.let {
            if (it >= 0) it else 0
        }
        queue = playable
        queueIndex = startIndex
        loadQueueAt(context, startIndex)
    }

    fun playSong(context: Context, song: SongEntity) {
        playFromLibrary(context, listOf(song), song)
    }

    fun togglePlayPause(context: Context) {
        ensureBridge()
        context.startService(Intent(context, PlaybackService::class.java))
        val player = PlayerBridge.getPlayer() ?: return
        mainHandler.post {
            if (player.playWhenReady) player.pause() else player.play()
        }
    }

    fun skipNext(context: Context) {
        val player = PlayerBridge.getPlayer() ?: return
        if (!player.hasNextMediaItem()) return
        context.startService(Intent(context, PlaybackService::class.java))
        mainHandler.post { player.seekToNextMediaItem() }
    }

    fun skipPrevious(context: Context) {
        val player = PlayerBridge.getPlayer() ?: return
        context.startService(Intent(context, PlaybackService::class.java))
        mainHandler.post {
            if (player.currentPosition > 3000) {
                player.seekTo(0)
            } else if (player.hasPreviousMediaItem()) {
                player.seekToPreviousMediaItem()
            } else {
                player.seekTo(0)
            }
        }
    }

    private fun loadQueueAt(context: Context, index: Int) {
        val song = queue.getOrNull(index) ?: return
        queueIndex = index
        ensureBridge()
        publishOptimistic(song, index)

        context.startService(Intent(context, PlaybackService::class.java))
        val items = queue.mapNotNull { it.toMediaItemOrNull() }
        if (items.isEmpty()) return

        Thread {
            var retries = 0
            while (PlayerBridge.getPlayer() == null && retries < 100) {
                Thread.sleep(20)
                retries++
            }
            val player = PlayerBridge.getPlayer()
            if (player == null) {
                Log.e(TAG, "loadQueueAt: player null after wait")
                return@Thread
            }
            val safeIndex = index.coerceIn(0, items.lastIndex)
            val latch = CountDownLatch(1)
            mainHandler.post {
                player.setMediaItems(items, safeIndex, C.TIME_UNSET)
                player.prepare()
                player.play()
                latch.countDown()
            }
            latch.await(5, TimeUnit.SECONDS)
            Log.i(
                TAG,
                "playing id=${song.id} title=${song.title} queue=${items.size} index=$safeIndex"
            )
        }.start()
    }

    private fun publishOptimistic(song: SongEntity, index: Int) {
        _status.value = PlaybackStatus(
            songId = song.id,
            title = song.title,
            artist = song.artist ?: "",
            artworkUri = song.coverImageUri,
            isPlaying = false,
            playWhenReady = true,
            isBuffering = true,
            hasNext = index < queue.lastIndex,
            hasPrevious = index > 0,
            queueSize = queue.size,
        )
    }

    private fun syncFromPlayer(
        position: Double,
        duration: Double,
        isPlaying: Boolean,
        playWhenReady: Boolean,
        isBuffering: Boolean,
    ) {
        val player = PlayerBridge.getPlayer()
        val item = player?.currentMediaItem
        val currentId = item?.mediaId
        if (!currentId.isNullOrBlank()) {
            queueIndex = queue.indexOfFirst { it.id == currentId }.let { if (it >= 0) it else queueIndex }
        }
        val queuedSong = queue.getOrNull(queueIndex)
        _status.value = PlaybackStatus(
            songId = currentId ?: queuedSong?.id,
            title = item?.mediaMetadata?.title?.toString() ?: queuedSong?.title ?: "",
            artist = item?.mediaMetadata?.artist?.toString() ?: queuedSong?.artist ?: "",
            artworkUri = item?.mediaMetadata?.artworkUri?.toString() ?: queuedSong?.coverImageUri,
            positionSec = position,
            durationSec = duration,
            isPlaying = isPlaying,
            playWhenReady = playWhenReady,
            isBuffering = isBuffering,
            hasNext = player?.hasNextMediaItem() == true,
            hasPrevious = player?.hasPreviousMediaItem() == true || position > 3.0,
            queueSize = queue.size,
        )
    }

    private fun SongEntity.toMediaItemOrNull(): MediaItem? {
        val uri = audioUri ?: return null
        if (!isAllowedUri(uri)) return null
        return MediaItem.Builder()
            .setUri(uri)
            .setMediaId(id)
            .setMediaMetadata(
                MediaMetadata.Builder()
                    .setTitle(title)
                    .setArtist(artist ?: "")
                    .setAlbumTitle(album ?: "")
                    .apply {
                        coverImageUri?.takeIf { isAllowedUri(it) }?.let {
                            setArtworkUri(Uri.parse(it))
                        }
                    }
                    .build()
            )
            .build()
    }

    private fun isAllowedUri(uri: String): Boolean {
        if (uri.isBlank() || uri.length > 4096) return false
        return when (Uri.parse(uri).scheme?.lowercase()) {
            "file", "content", "https" -> true
            else -> false
        }
    }
}
