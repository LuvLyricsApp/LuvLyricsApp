package com.lyricflow.app.modules

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.media.AudioManager
import android.media.MediaRouter2
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.os.Handler
import android.os.Looper
import android.util.Log
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.Player
import com.lyricflow.app.services.PlaybackService
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean

private const val TAG = "LyrFlow"
private const val META_MAX = 500

class MainPlayerModule : Module() {
    private val mainHandler = Handler(Looper.getMainLooper())
    private var volumeReceiver: BroadcastReceiver? = null

    private fun audioManager(): AudioManager? =
        appContext.reactContext?.getSystemService(Context.AUDIO_SERVICE) as? AudioManager

    /** Media volume as 0..1. */
    private fun mediaVolume(): Double {
        val am = audioManager() ?: return 0.0
        val max = am.getStreamMaxVolume(AudioManager.STREAM_MUSIC).coerceAtLeast(1)
        return am.getStreamVolume(AudioManager.STREAM_MUSIC).toDouble() / max
    }

    override fun definition() = ModuleDefinition {
        Name("MainPlayer")

        Events("onPlaybackStatus", "onRemoteCommand", "onTrackAdvanced", "onVolumeChanged")

        OnCreate {
            Log.d(TAG, "MainPlayerModule.OnCreate — registering callbacks")
            PlayerBridge.onStatusUpdate = { position, duration, isPlaying, playWhenReady, isBuffering, didJustFinish ->
                sendEvent("onPlaybackStatus", mapOf(
                    "position" to position,
                    "duration" to duration,
                    "isPlaying" to isPlaying,
                    "playWhenReady" to playWhenReady,
                    "isBuffering" to isBuffering,
                    "didJustFinish" to didJustFinish
                ))
            }
            PlayerBridge.onRemoteCommand = { command ->
                sendEvent("onRemoteCommand", mapOf("command" to command))
            }
            PlayerBridge.onTrackAdvanced = { mediaId ->
                sendEvent("onTrackAdvanced", mapOf("mediaId" to mediaId))
            }
        }

        // Hardware volume keys move the Now Playing volume slider too.
        OnStartObserving {
            val context = appContext.reactContext ?: return@OnStartObserving
            if (volumeReceiver != null) return@OnStartObserving
            val receiver = object : BroadcastReceiver() {
                override fun onReceive(c: Context?, intent: Intent?) {
                    if (intent?.getIntExtra("android.media.EXTRA_VOLUME_STREAM_TYPE", -1) != AudioManager.STREAM_MUSIC) return
                    sendEvent("onVolumeChanged", mapOf("volume" to mediaVolume()))
                }
            }
            val filter = IntentFilter("android.media.VOLUME_CHANGED_ACTION")
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                context.registerReceiver(receiver, filter, Context.RECEIVER_EXPORTED)
            } else {
                context.registerReceiver(receiver, filter)
            }
            volumeReceiver = receiver
        }

        OnStopObserving {
            volumeReceiver?.let { r -> runCatching { appContext.reactContext?.unregisterReceiver(r) } }
            volumeReceiver = null
        }

        Function("getVolume") { mediaVolume() }

        Function("setVolume") { level: Double ->
            val am = audioManager() ?: return@Function null
            val max = am.getStreamMaxVolume(AudioManager.STREAM_MUSIC)
            val index = (level.coerceIn(0.0, 1.0) * max).toInt()
            am.setStreamVolume(AudioManager.STREAM_MUSIC, index, 0)
            null
        }

        /**
         * The system's "play on" picker (speaker, Bluetooth, cast). Android 14+
         * has a public API; 11–13 open the Settings media-output panel; older
         * versions fall back to Bluetooth settings.
         */
        Function("openOutputSwitcher") {
            val context = appContext.reactContext ?: return@Function false
            try {
                if (Build.VERSION.SDK_INT >= 34) {
                    MediaRouter2.getInstance(context).showSystemOutputSwitcher()
                } else {
                    val intent = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                        Intent("com.android.settings.panel.action.MEDIA_OUTPUT")
                            .putExtra("com.android.settings.panel.extra.PACKAGE_NAME", context.packageName)
                    } else {
                        Intent(Settings.ACTION_BLUETOOTH_SETTINGS)
                    }
                    context.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                }
                true
            } catch (_: Exception) {
                runCatching {
                    context.startActivity(Intent(Settings.ACTION_BLUETOOTH_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                }.isSuccess
            }
        }

        OnDestroy {
            volumeReceiver?.let { r -> runCatching { appContext.reactContext?.unregisterReceiver(r) } }
            volumeReceiver = null
            PlayerBridge.onStatusUpdate = null
            PlayerBridge.onRemoteCommand = null
            PlayerBridge.onTrackAdvanced = null
        }

        AsyncFunction("load") { uri: String, metadata: Map<String, String> ->
            if (!isAllowedUri(uri)) {
                Log.w(TAG, "load() rejected uri scheme")
                return@AsyncFunction
            }
            Log.d(TAG, "load() called")
            val context = appContext.reactContext ?: throw Exception("React context not available")

            // startService, not startForegroundService: MediaSessionService posts
            // the media notification and promotes itself to foreground when playback
            // begins. Starting it as a foreground service here would demand a
            // startForeground() call within ~5s that never comes while the user is
            // merely loading a track, which Android kills the process for.
            val intent = Intent(context, PlaybackService::class.java)
            context.startService(intent)

            var retries = 0
            while (PlayerBridge.getPlayer() == null && retries < 100) {
                Thread.sleep(20)
                retries++
            }

            val player = PlayerBridge.getPlayer()
            if (player == null) {
                Log.e(TAG, "load() TIMEOUT — player still null after ${retries * 20}ms")
                return@AsyncFunction
            }

            val mediaItem = buildMediaItem(uri, metadata, metadata["mediaId"] ?: "")
            val latch = CountDownLatch(1)
            mainHandler.post {
                player.setMediaItem(mediaItem)
                player.prepare()
                latch.countDown()
            }
            latch.await(5, TimeUnit.SECONDS)
        }

        /**
         * Queue the following track so Media3 can auto-advance without a JS reload.
         * mediaId must be the app song id — used to sync the store on transition.
         */
        Function("prepareNext") { uri: String, metadata: Map<String, String>, mediaId: String ->
            if (!isAllowedUri(uri) || mediaId.isBlank()) return@Function null
            val player = PlayerBridge.getPlayer() ?: return@Function null
            val item = buildMediaItem(uri, metadata, mediaId)
            mainHandler.post {
                // Keep only current + this next (drop any stale prepared item).
                val current = player.currentMediaItemIndex
                while (player.mediaItemCount > current + 1) {
                    player.removeMediaItem(player.mediaItemCount - 1)
                }
                val existingNext = player.getMediaItemAtOrNull(current + 1)
                if (existingNext?.mediaId == mediaId) return@post
                player.addMediaItem(item)
            }
            null
        }

        /**
         * If the next MediaItem is already [mediaId], seek to it natively.
         * Returns true only when the seek was issued — JS must not call load().
         */
        AsyncFunction("seekToNextIfReady") { mediaId: String ->
            if (mediaId.isBlank()) return@AsyncFunction false
            val player = PlayerBridge.getPlayer() ?: return@AsyncFunction false
            val ok = AtomicBoolean(false)
            val latch = CountDownLatch(1)
            mainHandler.post {
                val nextIndex = player.currentMediaItemIndex + 1
                if (nextIndex < player.mediaItemCount &&
                    player.getMediaItemAt(nextIndex).mediaId == mediaId
                ) {
                    player.seekToNextMediaItem()
                    ok.set(true)
                }
                latch.countDown()
            }
            latch.await(2, TimeUnit.SECONDS)
            ok.get()
        }

        Function("play") {
            PlayerBridge.getPlayer()?.let { player ->
                mainHandler.post {
                    // After a stream error the player sits idle; play() alone
                    // would do nothing, so re-prepare at the same position.
                    if (player.playbackState == Player.STATE_IDLE && player.mediaItemCount > 0) player.prepare()
                    player.play()
                }
            }
        }

        Function("pause") {
            PlayerBridge.getPlayer()?.let { player -> mainHandler.post { player.pause() } }
        }

        Function("seekTo") { seconds: Double ->
            PlayerBridge.getPlayer()?.let { player ->
                val ms = (seconds * 1000.0).toLong()
                mainHandler.post { player.seekTo(ms) }
            }
        }

        Function("updateMetadata") { metadata: Map<String, String> ->
            PlayerBridge.getPlayer()?.let { player ->
                mainHandler.post {
                    val currentItem = player.currentMediaItem ?: return@post
                    val updatedMetadata = mediaMetadataOf(metadata)
                    val newItem = currentItem.buildUpon().setMediaMetadata(updatedMetadata).build()
                    player.replaceMediaItem(player.currentMediaItemIndex, newItem)
                }
            }
        }

        Function("destroy") {
            val context = appContext.reactContext ?: return@Function null
            val intent = Intent(context, PlaybackService::class.java)
            context.stopService(intent)
        }
    }

    private fun buildMediaItem(uri: String, metadata: Map<String, String>, mediaId: String): MediaItem =
        MediaItem.Builder()
            .setUri(uri)
            .setMediaId(mediaId)
            .setMediaMetadata(mediaMetadataOf(metadata))
            .build()

    private fun mediaMetadataOf(metadata: Map<String, String>): MediaMetadata =
        MediaMetadata.Builder()
            .setTitle(clip(metadata["title"]))
            .setArtist(clip(metadata["artist"]))
            .setAlbumTitle(clip(metadata["album"]))
            .apply {
                metadata["artworkUri"]?.let {
                    if (it.isNotEmpty() && isAllowedUri(it)) setArtworkUri(Uri.parse(it))
                }
            }
            .build()

    private fun clip(value: String?): String =
        (value ?: "").take(META_MAX)

    /**
     * Trust boundary for anything that becomes a MediaItem URI.
     * Local library + downloads use file/content; streaming covers use https.
     */
    private fun isAllowedUri(uri: String): Boolean {
        if (uri.isBlank() || uri.length > 4096) return false
        val scheme = Uri.parse(uri).scheme?.lowercase() ?: return false
        return scheme == "file" || scheme == "content" || scheme == "https"
    }

    private fun Player.getMediaItemAtOrNull(index: Int): MediaItem? =
        if (index in 0 until mediaItemCount) getMediaItemAt(index) else null
}
