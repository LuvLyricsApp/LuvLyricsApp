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
private const val WATCHDOG_MS = 4_000L
private const val STALL_TICKS = 4 // ~16s without progress while buffering
// Reloading in place can't fix a dead link; after this many stall reloads the
// player stops and tells JS, which fetches the song again.
private const val MAX_STALL_RELOADS = 2
private val RETRY_TOKEN = Any()

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

    // Stall watchdog: a connection that stops delivering bytes without erroring
    // leaves the player buffering forever. If it wants to play, is buffering and
    // the position hasn't moved for STALL_TICKS checks, reload from where it is.
    private var lastPosition = -1L
    private var stalledTicks = 0
    private var stallReloads = 0
    private val watchdog = object : Runnable {
        override fun run() {
            val p = exoPlayer
            val position = p.currentPosition
            if (p.playWhenReady && p.playbackState == Player.STATE_BUFFERING && position == lastPosition) {
                stalledTicks++
                if (stalledTicks >= STALL_TICKS) {
                    stalledTicks = 0
                    if (stallReloads < MAX_STALL_RELOADS) {
                        stallReloads++
                        Log.w(TAG, "stream stalled at ${position}ms; reloading ($stallReloads)")
                        p.seekTo(position)
                    } else {
                        // Re-seeking every 16s kept the read timeout from ever
                        // firing, so a dead stream buffered forever while the
                        // app said "playing". Stop and hand it to JS.
                        Log.w(TAG, "stream stalled at ${position}ms; giving up")
                        stallReloads = 0
                        p.playWhenReady = false
                        PlayerBridge.emitError("stall")
                    }
                }
            } else {
                stalledTicks = 0
                if (p.isPlaying) stallReloads = 0
            }
            lastPosition = position
            retryHandler.postDelayed(this, WATCHDOG_MS)
        }
    }

    /**
     * A dropped connection mid-stream used to leave the player in an error
     * state with playWhenReady still true: the app showed "playing" while the
     * position sat on one second. Network errors now re-prepare in place
     * (1s, 2s, 4s, 8s); if the stream is truly gone the player pauses, so the
     * transport tells the truth and a tap on play tries again.
     */
    private val recovery = object : Player.Listener {
        override fun onPlayerError(error: PlaybackException) {
            // The CDN refused the link (streamed links are signed and expire):
            // retrying the same URL can never work, JS has to fetch a new one.
            val refused = error.errorCode == PlaybackException.ERROR_CODE_IO_BAD_HTTP_STATUS ||
                error.errorCode == PlaybackException.ERROR_CODE_IO_FILE_NOT_FOUND ||
                error.errorCode == PlaybackException.ERROR_CODE_IO_NO_PERMISSION
            if (refused) {
                Log.w(TAG, "playback error ${error.errorCodeName}; link refused")
                exoPlayer.playWhenReady = false
                PlayerBridge.emitError("expired")
                return
            }
            val network = error.errorCode in 2000..2999 || error.errorCode == PlaybackException.ERROR_CODE_TIMEOUT
            if (network && retries < MAX_RETRIES) {
                val delayMs = 1000L shl retries
                retries++
                Log.w(TAG, "playback error ${error.errorCodeName}; retry $retries in ${delayMs}ms")
                retryHandler.postAtTime({
                    if (exoPlayer.playerError != null) exoPlayer.prepare()
                }, RETRY_TOKEN, android.os.SystemClock.uptimeMillis() + delayMs)
            } else {
                Log.w(TAG, "playback error ${error.errorCodeName}; giving up")
                exoPlayer.playWhenReady = false
                PlayerBridge.emitError(if (network) "network" else "error")
            }
        }

        override fun onPlaybackStateChanged(playbackState: Int) {
            if (playbackState == Player.STATE_READY) retries = 0
        }

        override fun onMediaItemTransition(mediaItem: MediaItem?, reason: Int) {
            retries = 0
            stallReloads = 0
            retryHandler.removeCallbacksAndMessages(RETRY_TOKEN)
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
        retryHandler.postDelayed(watchdog, WATCHDOG_MS)

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
        val session = MediaSession.Builder(this, sessionPlayer)
            .apply { sessionActivity?.let { setSessionActivity(it) } }
            .build()
        mediaSession = session
        // The app starts this service with startService and never binds a
        // MediaController, so onGetSession is never asked for the session and
        // Media3 never tracked it: no media notification, no foreground
        // promotion, and Android stopped the "background" service about a
        // minute after the app left the screen — the music died while the UI
        // still said playing. Adding it here lets Media3 post the notification
        // and hold the foreground while music plays.
        addSession(session)

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
        // Tell JS the player is gone, so the transport shows play and the next
        // tap reloads the song where it stopped instead of doing nothing.
        PlayerBridge.emitReleased()
        PlayerBridge.clearPlayer()
        mediaSession?.run {
            player.release()
            release()
        }
        mediaSession = null
        super.onDestroy()
    }
}
