package com.lyricflow.app.modules

import android.content.BroadcastReceiver
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.media.AudioManager
import android.media.MediaRouter2
import android.media.RingtoneManager
import android.media.audiofx.AudioEffect
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import android.provider.Settings
import android.os.Handler
import android.os.Looper
import android.util.Log
import androidx.media3.common.MediaItem
import androidx.media3.common.C
import androidx.media3.common.MediaMetadata
import androidx.media3.common.PlaybackParameters
import androidx.media3.common.Player
import com.lyricflow.app.services.PlaybackService
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger

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

        Events("onPlaybackStatus", "onRemoteCommand", "onTrackAdvanced", "onVolumeChanged", "onPlaybackError")

        OnCreate {
            Log.d(TAG, "MainPlayerModule.OnCreate — registering callbacks")
            PlayerBridge.onStatusUpdate = { position, duration, isPlaying, playWhenReady, isBuffering, didJustFinish, suppressed ->
                sendEvent("onPlaybackStatus", mapOf(
                    "position" to position,
                    "duration" to duration,
                    "isPlaying" to isPlaying,
                    "playWhenReady" to playWhenReady,
                    "isBuffering" to isBuffering,
                    "didJustFinish" to didJustFinish,
                    "suppressed" to suppressed
                ))
            }
            PlayerBridge.onRemoteCommand = { command ->
                sendEvent("onRemoteCommand", mapOf("command" to command))
            }
            PlayerBridge.onTrackAdvanced = { mediaId ->
                sendEvent("onTrackAdvanced", mapOf("mediaId" to mediaId))
            }
            PlayerBridge.onPlaybackError = { reason, position ->
                sendEvent("onPlaybackError", mapOf("reason" to reason, "position" to position))
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

        /** Player menu → Advanced: tempo and pitch (Echo's tempo & pitch dialog). */
        Function("setPlaybackParameters") { speed: Double, pitch: Double ->
            val player = PlayerBridge.getPlayer() ?: return@Function false
            val params = PlaybackParameters(
                speed.toFloat().coerceIn(0.25f, 3f),
                pitch.toFloat().coerceIn(0.25f, 3f)
            )
            mainHandler.post { player.playbackParameters = params }
            true
        }

        /** Player menu → Repeat: loop the current song. Media3 then never ends
         *  the item, so the staged "next" is not advanced into. */
        Function("setRepeatOne") { on: Boolean ->
            val player = PlayerBridge.getPlayer() ?: return@Function false
            mainHandler.post { player.repeatMode = if (on) Player.REPEAT_MODE_ONE else Player.REPEAT_MODE_OFF }
            true
        }

        /** Player menu → Equalizer: the phone's own audio-effect panel, bound to our session. */
        Function("openEqualizer") {
            val context = appContext.reactContext ?: return@Function false
            val player = PlayerBridge.getPlayer()
            val session = AtomicInteger(C.AUDIO_SESSION_ID_UNSET)
            if (player != null) {
                // ExoPlayer is single-threaded: read it on its own looper.
                val latch = CountDownLatch(1)
                mainHandler.post {
                    session.set(player.audioSessionId)
                    latch.countDown()
                }
                latch.await(1, TimeUnit.SECONDS)
            }
            val extras = { i: Intent ->
                i.putExtra(AudioEffect.EXTRA_AUDIO_SESSION, session.get())
                    .putExtra(AudioEffect.EXTRA_PACKAGE_NAME, context.packageName)
                    .putExtra(AudioEffect.EXTRA_CONTENT_TYPE, AudioEffect.CONTENT_TYPE_MUSIC)
            }
            runCatching { context.sendBroadcast(extras(Intent(AudioEffect.ACTION_OPEN_AUDIO_EFFECT_CONTROL_SESSION))) }
            runCatching {
                context.startActivity(
                    extras(Intent(AudioEffect.ACTION_DISPLAY_AUDIO_EFFECT_CONTROL_PANEL))
                        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                )
            }.isSuccess
        }

        /**
         * Player menu → Set as ringtone, for a song saved on the phone.
         * Returns "ok", "permission" (the system's "modify settings" page was
         * opened — try again after allowing), "unsupported", "missing" or "error".
         */
        AsyncFunction("setRingtone") { path: String, title: String ->
            val context = appContext.reactContext ?: return@AsyncFunction "error"
            if (!Settings.System.canWrite(context)) {
                runCatching {
                    context.startActivity(
                        Intent(Settings.ACTION_MANAGE_WRITE_SETTINGS, Uri.parse("package:${context.packageName}"))
                            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    )
                }
                return@AsyncFunction "permission"
            }
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return@AsyncFunction "unsupported"
            val src = File(Uri.parse(path).path ?: path)
            if (!src.isFile) return@AsyncFunction "missing"
            val ext = src.extension.lowercase().ifEmpty { "mp3" }
            val mime = when (ext) {
                "m4a", "mp4", "aac" -> "audio/mp4"
                "ogg", "opus" -> "audio/ogg"
                "flac" -> "audio/flac"
                "wav" -> "audio/wav"
                else -> "audio/mpeg"
            }
            val safeTitle = title.replace(Regex("[\\\\/:*?\"<>|]"), " ").trim().take(60).ifEmpty { "LuvLyrics" }
            val resolver = context.contentResolver
            val values = ContentValues().apply {
                put(MediaStore.MediaColumns.DISPLAY_NAME, "$safeTitle.$ext")
                put(MediaStore.MediaColumns.MIME_TYPE, mime)
                put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_RINGTONES)
                put(MediaStore.Audio.Media.IS_RINGTONE, true)
                put(MediaStore.MediaColumns.IS_PENDING, 1)
            }
            val uri = resolver.insert(MediaStore.Audio.Media.EXTERNAL_CONTENT_URI, values)
                ?: return@AsyncFunction "error"
            try {
                resolver.openOutputStream(uri)?.use { out -> src.inputStream().use { it.copyTo(out) } }
                    ?: throw IllegalStateException("no output stream")
                resolver.update(uri, ContentValues().apply { put(MediaStore.MediaColumns.IS_PENDING, 0) }, null, null)
                RingtoneManager.setActualDefaultRingtoneUri(context, RingtoneManager.TYPE_RINGTONE, uri)
                "ok"
            } catch (e: Exception) {
                Log.w(TAG, "setRingtone failed: ${e.message}")
                runCatching { resolver.delete(uri, null, null) }
                "error"
            }
        }

        OnDestroy {
            volumeReceiver?.let { r -> runCatching { appContext.reactContext?.unregisterReceiver(r) } }
            volumeReceiver = null
            PlayerBridge.onStatusUpdate = null
            PlayerBridge.onRemoteCommand = null
            PlayerBridge.onTrackAdvanced = null
            PlayerBridge.onPlaybackError = null
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

        /** False when there is no player (the service is gone): JS reloads the song. */
        Function("play") {
            val player = PlayerBridge.getPlayer() ?: return@Function false
            mainHandler.post {
                // After a stream error the player sits idle; play() alone
                // would do nothing, so re-prepare at the same position.
                if (player.playbackState == Player.STATE_IDLE && player.mediaItemCount > 0) player.prepare()
                // Suppressed by another app's audio focus: playWhenReady is
                // already true, so play() would be a no-op. Toggle it so
                // ExoPlayer asks for focus again and actually resumes.
                if (player.playWhenReady && player.playbackSuppressionReason != Player.PLAYBACK_SUPPRESSION_REASON_NONE) {
                    player.pause()
                }
                player.play()
            }
            true
        }

        /** Re-sends the current status (the app came back to the foreground). */
        Function("refreshStatus") {
            mainHandler.post { PlayerBridge.emitStatus() }
            null
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
