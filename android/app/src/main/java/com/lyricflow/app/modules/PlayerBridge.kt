package com.lyricflow.app.modules

import android.content.Context
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import java.lang.ref.WeakReference
import kotlinx.coroutines.*

object PlayerBridge {
    private var activePlayerRef = WeakReference<ExoPlayer>(null)
    private var activeServiceRef = WeakReference<Context>(null)

    var onStatusUpdate: ((
        position: Double,
        duration: Double,
        isPlaying: Boolean,
        playWhenReady: Boolean,
        isBuffering: Boolean,
        didJustFinish: Boolean,
        suppressed: Boolean
    ) -> Unit)? = null
    var onRemoteCommand: ((command: String) -> Unit)? = null
    /** Fires when Media3 lands on a new item (auto end-of-track or seekToNext). */
    var onTrackAdvanced: ((mediaId: String) -> Unit)? = null
    /**
     * Playback stopped for good and the player can't fix it in place:
     * "expired" (the link was refused), "network" (retries ran out), "stall"
     * (bytes stopped coming), "error", or "released" (the service is gone).
     */
    var onPlaybackError: ((reason: String, position: Double) -> Unit)? = null
    private var lastPositionSeconds = 0.0

    private val playerListener = object : Player.Listener {
        override fun onPlaybackStateChanged(playbackState: Int) {
            emitStatus(playbackState == Player.STATE_ENDED)
        }

        override fun onIsPlayingChanged(isPlaying: Boolean) {
            emitStatus()
        }

        // Fires the moment play()/pause() is applied, before buffering resolves.
        // This is what lets JS render the transport state without guessing.
        override fun onPlayWhenReadyChanged(playWhenReady: Boolean, reason: Int) {
            emitStatus()
        }

        // Another app took audio focus for a moment (a call, a voice note, a
        // video). playWhenReady stays true but nothing plays until it gives
        // focus back — tell JS so the button stops claiming "playing".
        override fun onPlaybackSuppressionReasonChanged(playbackSuppressionReason: Int) {
            emitStatus()
        }

        override fun onMediaItemTransition(mediaItem: MediaItem?, reason: Int) {
            if (
                reason == Player.MEDIA_ITEM_TRANSITION_REASON_AUTO ||
                reason == Player.MEDIA_ITEM_TRANSITION_REASON_SEEK
            ) {
                val id = mediaItem?.mediaId
                if (!id.isNullOrEmpty()) onTrackAdvanced?.invoke(id)
            }
            emitStatus()
        }
    }

    private val pollerScope = CoroutineScope(Dispatchers.Default + SupervisorJob())
    private var pollerJob: Job? = null

    fun setPlayer(player: ExoPlayer, context: Context) {
        activePlayerRef = WeakReference(player)
        activeServiceRef = WeakReference(context)
        player.addListener(playerListener)
        startProgressPoller()
    }

    fun clearPlayer() {
        stopProgressPoller()
        activePlayerRef.get()?.removeListener(playerListener)
        activePlayerRef.clear()
        activeServiceRef.clear()
    }

    fun getPlayer(): ExoPlayer? = activePlayerRef.get()

    fun emitStatus(didJustFinish: Boolean = false) {
        val player = activePlayerRef.get() ?: return
        val isPlaying = player.isPlaying
        val isBuffering = player.playbackState == Player.STATE_BUFFERING
        // Only treat ENDED as finish when there is no next item — otherwise Media3
        // will auto-advance and JS must not also call nextInPlaylist.
        val finished = didJustFinish && !player.hasNextMediaItem()

        val position = player.currentPosition.toDouble() / 1000.0
        val duration = player.duration.toDouble() / 1000.0
        lastPositionSeconds = position

        onStatusUpdate?.invoke(
            position,
            if (duration < 0) 0.0 else duration,
            isPlaying,
            player.playWhenReady,
            isBuffering,
            finished,
            player.playbackSuppressionReason != Player.PLAYBACK_SUPPRESSION_REASON_NONE
        )
    }

    fun emitError(reason: String) {
        val player = activePlayerRef.get()
        val position = player?.currentPosition?.let { it.toDouble() / 1000.0 } ?: lastPositionSeconds
        emitStatus()
        onPlaybackError?.invoke(reason, position)
    }

    /** The service is going away: a last "stopped" status, then the reason. */
    fun emitReleased() {
        val player = activePlayerRef.get()
        val position = player?.currentPosition?.let { it.toDouble() / 1000.0 } ?: lastPositionSeconds
        val duration = player?.duration?.takeIf { it > 0 }?.let { it.toDouble() / 1000.0 } ?: 0.0
        onStatusUpdate?.invoke(position, duration, false, false, false, false, false)
        onPlaybackError?.invoke("released", position)
    }

    private fun startProgressPoller() {
        pollerJob?.cancel()
        pollerJob = pollerScope.launch {
            while (isActive) {
                withContext(Dispatchers.Main) {
                    val player = activePlayerRef.get() ?: return@withContext
                    if (player.isPlaying) emitStatus()
                }
                delay(250)
            }
        }
    }

    private fun stopProgressPoller() {
        pollerJob?.cancel()
        pollerJob = null
    }
}
