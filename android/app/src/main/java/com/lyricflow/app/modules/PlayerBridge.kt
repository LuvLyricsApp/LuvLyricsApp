package com.lyricflow.app.modules

import android.content.Context
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
        didJustFinish: Boolean
    ) -> Unit)? = null
    var onRemoteCommand: ((command: String) -> Unit)? = null

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
        val finished = didJustFinish || player.playbackState == Player.STATE_ENDED

        val position = player.currentPosition.toDouble() / 1000.0
        val duration = player.duration.toDouble() / 1000.0

        onStatusUpdate?.invoke(
            position,
            if (duration < 0) 0.0 else duration,
            isPlaying,
            player.playWhenReady,
            isBuffering,
            finished
        )
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
