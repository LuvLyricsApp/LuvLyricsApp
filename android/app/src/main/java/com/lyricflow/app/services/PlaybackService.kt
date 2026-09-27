package com.lyricflow.app.services

import android.app.PendingIntent
import android.content.Intent
import android.os.Handler
import android.os.Looper
import android.util.Log
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.datasource.DefaultDataSource
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.exoplayer.DefaultLoadControl
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.media3.session.MediaSession
import androidx.media3.session.MediaSessionService
import com.lyricflow.app.modules.PlayerBridge

private const val TAG = "LyrFlow"
private const val MAX_RETRIES = 4

/**
 * Media3 session-backed playback service.
 *
 * Extending MediaSessionService (rather than a bare Service with a hand-rolled
 * notification) is what gives the app the real system media experience: artwork
 * and transport controls on the lock screen and in the shade, Bluetooth headset
 * buttons, Android Auto, and Wear — all driven by the session rather than by us.
 * Media3 owns the notification and the foreground promotion; we must not call
 * startForeground() ourselves or the two will fight.
 */
class PlaybackService : MediaSessionService() {

    private var mediaSession: MediaSession? = null
    private lateinit var exoPlayer: ExoPlayer
    private val retryHandler = Handler(Looper.getMainLooper())
    private var retries = 0

    /**
     * A dropped connection mid-stream used to leave the player in an error
     * state with playWhenReady still true: the app showed "playing" while the
     * position sat on one second. Network errors now re-prepare in place
     * (1s, 2s, 4s, 8s); if the stream is truly gone the player pauses, so the
     * transport tells the truth and a tap on play tries again.
     */
    private val recovery = object : Player.Listener {
        override fun onPlayerError(error: PlaybackException) {
            val network = error.errorCode in 2000..2999 || error.errorCode == PlaybackException.ERROR_CODE_TIMEOUT
            if (network && retries < MAX_RETRIES) {
                val delayMs = 1000L shl retries
                retries++
                Log.w(TAG, "playback error ${error.errorCodeName}; retry $retries in ${delayMs}ms")
                retryHandler.postDelayed({
                    if (exoPlayer.playerError != null) exoPlayer.prepare()
                }, delayMs)
            } else {
                Log.w(TAG, "playback error ${error.errorCodeName}; giving up")
                exoPlayer.playWhenReady = false
            }
        }

        override fun onPlaybackStateChanged(playbackState: Int) {
            if (playbackState == Player.STATE_READY) retries = 0
        }

        override fun onMediaItemTransition(mediaItem: MediaItem?, reason: Int) {
            retries = 0
            retryHandler.removeCallbacksAndMessages(null)
        }
    }

    override fun onCreate() {
        super.onCreate()
        Log.d(TAG, "PlaybackService.onCreate() start")

        exoPlayer = ExoPlayer.Builder(this)
            .setAudioAttributes(
                AudioAttributes.Builder()
                    .setContentType(C.AUDIO_CONTENT_TYPE_MUSIC)
                    .setUsage(C.USAGE_MEDIA)
                    .build(),
                /* handleAudioFocus = */ true
            )
            // Pause when headphones are unplugged, as every native player does.
            .setHandleAudioBecomingNoisy(true)
            // Hold a CPU + Wi-Fi lock while playing. Without it the screen-off
            // device lets Wi-Fi doze, the stream stops filling, and playback
            // freezes a few minutes into backgrounding while still "playing".
            .setWakeMode(C.WAKE_MODE_NETWORK)
            // Buffer far ahead (up to 4 min — most of a song, ~10MB at 320kbps)
            // so a patchy connection in the background never drains it.
            .setLoadControl(
                DefaultLoadControl.Builder()
                    .setBufferDurationsMs(30_000, 240_000, 1_500, 3_000)
                    .setPrioritizeTimeOverSizeThresholds(true)
                    .build()
            )
            .setMediaSourceFactory(
                DefaultMediaSourceFactory(
                    DefaultDataSource.Factory(
                        this,
                        DefaultHttpDataSource.Factory()
                            .setAllowCrossProtocolRedirects(true)
                            .setConnectTimeoutMs(15_000)
                            .setReadTimeoutMs(20_000)
                    )
                )
            )
            .build()
        exoPlayer.repeatMode = Player.REPEAT_MODE_OFF
        exoPlayer.addListener(recovery)

        val sessionActivity = packageManager
            .getLaunchIntentForPackage(packageName)
            ?.let { launchIntent ->
                PendingIntent.getActivity(
                    this,
                    0,
                    launchIntent,
                    PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
                )
            }

        // The session drives the notification, so it gets the queue-aware wrapper.
        // PlayerBridge keeps the raw ExoPlayer for status polling and seeks.
        val sessionPlayer = QueueForwardingPlayer(exoPlayer)
        mediaSession = MediaSession.Builder(this, sessionPlayer)
            .apply { sessionActivity?.let { setSessionActivity(it) } }
            .build()

        PlayerBridge.setPlayer(exoPlayer, this)
        Log.d(TAG, "PlaybackService.onCreate() done — media session ready")
    }

    override fun onGetSession(controllerInfo: MediaSession.ControllerInfo): MediaSession? = mediaSession

    override fun onTaskRemoved(rootIntent: Intent?) {
        // Swiping the app away while paused should tear the service down rather
        // than leave a dead notification pinned.
        val player = mediaSession?.player
        if (player == null || !player.playWhenReady || player.mediaItemCount == 0) {
            stopSelf()
        }
        super.onTaskRemoved(rootIntent)
    }

    override fun onDestroy() {
        Log.d(TAG, "PlaybackService.onDestroy()")
        retryHandler.removeCallbacksAndMessages(null)
        exoPlayer.removeListener(recovery)
        PlayerBridge.clearPlayer()
        mediaSession?.run {
            player.release()
            release()
        }
        mediaSession = null
        super.onDestroy()
    }
}
