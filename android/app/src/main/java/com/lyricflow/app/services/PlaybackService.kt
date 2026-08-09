package com.lyricflow.app.services

import android.app.PendingIntent
import android.content.Intent
import android.util.Log
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.session.MediaSession
import androidx.media3.session.MediaSessionService
import com.lyricflow.app.modules.PlayerBridge

private const val TAG = "LyrFlow"

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
            .build()
        exoPlayer.repeatMode = Player.REPEAT_MODE_OFF

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

    @androidx.annotation.OptIn(markerClass = [UnstableApi::class])
    override fun onGetSession(controllerInfo: MediaSession.ControllerInfo): MediaSession? {
        if (!controllerInfo.isTrusted) {
            Log.w(TAG, "Rejected untrusted media controller: ${controllerInfo.packageName}")
            return null
        }
        return mediaSession
    }

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
        PlayerBridge.clearPlayer()
        mediaSession?.run {
            player.release()
            release()
        }
        mediaSession = null
        super.onDestroy()
    }
}
