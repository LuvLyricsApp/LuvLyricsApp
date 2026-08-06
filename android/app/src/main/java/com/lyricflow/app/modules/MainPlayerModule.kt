package com.lyricflow.app.modules

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.util.Log
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import com.lyricflow.app.services.PlaybackService
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

private const val TAG = "LyrFlow"

class MainPlayerModule : Module() {
    private val mainHandler = Handler(Looper.getMainLooper())

    override fun definition() = ModuleDefinition {
        Name("MainPlayer")

        Events("onPlaybackStatus", "onRemoteCommand")

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
        }

        OnDestroy {
            PlayerBridge.onStatusUpdate = null
            PlayerBridge.onRemoteCommand = null
        }

        AsyncFunction("load") { uri: String, metadata: Map<String, String> ->
            Log.d(TAG, "load() called uri=$uri")
            val context = appContext.reactContext ?: throw Exception("React context not available")

            // startService, not startForegroundService: MediaSessionService posts
            // the media notification and promotes itself to foreground when playback
            // begins. Starting it as a foreground service here would demand a
            // startForeground() call within ~5s that never comes while the user is
            // merely loading a track, which Android kills the process for.
            // load() is always driven by a user action, so the app is in the
            // foreground and a plain startService is permitted.
            val intent = Intent(context, PlaybackService::class.java)
            context.startService(intent)
            Log.d(TAG, "load() startService sent")

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
            Log.d(TAG, "load() player ready after ${retries * 20}ms, setting media item")

            val mediaMetadata = MediaMetadata.Builder()
                .setTitle(metadata["title"])
                .setArtist(metadata["artist"])
                .setAlbumTitle(metadata["album"])
                .apply {
                    metadata["artworkUri"]?.let {
                        if (it.isNotEmpty()) setArtworkUri(Uri.parse(it))
                    }
                }
                .build()

            val mediaItem = MediaItem.Builder()
                .setUri(uri)
                .setMediaMetadata(mediaMetadata)
                .build()

            val latch = CountDownLatch(1)
            mainHandler.post {
                player.setMediaItem(mediaItem)
                player.prepare()
                Log.d(TAG, "load() setMediaItem+prepare done on main thread")
                latch.countDown()
            }
            val latched = latch.await(5, TimeUnit.SECONDS)
            Log.d(TAG, "load() latch released=$latched, returning to JS")
        }

        Function("play") {
            val player = PlayerBridge.getPlayer()
            Log.d(TAG, "play() called, player=$player")
            player?.let { mainHandler.post { it.play() } }
        }

        Function("pause") {
            val player = PlayerBridge.getPlayer()
            Log.d(TAG, "pause() called, player=$player")
            player?.let { mainHandler.post { it.pause() } }
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
                    val updatedMetadata = MediaMetadata.Builder()
                        .setTitle(metadata["title"])
                        .setArtist(metadata["artist"])
                        .setAlbumTitle(metadata["album"])
                        .apply {
                            metadata["artworkUri"]?.let {
                                if (it.isNotEmpty()) setArtworkUri(Uri.parse(it))
                            }
                        }
                        .build()
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
}
