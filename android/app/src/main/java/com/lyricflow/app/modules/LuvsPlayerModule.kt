package com.lyricflow.app.modules

import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.content.Context
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.*

class LuvsPlayerModule : Module() {
    private val scope = CoroutineScope(Dispatchers.Main + SupervisorJob())
    private val players = mutableMapOf<Int, ExoPlayer>()
    private var activeIndex = -1
    // The taste map (lanes × depth) addresses songs by URL: an index means
    // nothing once there is more than one list.
    private val byUrl = mutableMapOf<String, ExoPlayer>()
    private var activeUrl: String? = null

    /** Whichever player is live, however it was chosen. */
    private fun activePlayer(): ExoPlayer? = activeUrl?.let { byUrl[it] } ?: players[activeIndex]
    private var audioManager: AudioManager? = null
    private var audioFocusRequest: AudioFocusRequest? = null

    private var statusJob: Job? = null

    override fun definition() = ModuleDefinition {
        Name("LuvsPlayer")

        Events("onLuvsStatus")

        Function("enterLuvsMode") {
            val context = appContext.reactContext ?: return@Function null
            audioManager = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager

            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
                val playbackAttributes = AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_MEDIA)
                    .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                    .build()
                
                audioFocusRequest = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK)
                    .setAudioAttributes(playbackAttributes)
                    .setAcceptsDelayedFocusGain(true)
                    .setOnAudioFocusChangeListener { }
                    .build()

                audioFocusRequest?.let { audioManager?.requestAudioFocus(it) }
            } else {
                @Suppress("DEPRECATION")
                audioManager?.requestAudioFocus(
                    { },
                    AudioManager.STREAM_MUSIC,
                    AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK
                )
            }
        }

        Function("exitLuvsMode") {
            scope.launch {
                stopStatusPoller()
                // Clear audio focus
                if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
                    audioFocusRequest?.let { audioManager?.abandonAudioFocusRequest(it) }
                } else {
                    @Suppress("DEPRECATION")
                    audioManager?.abandonAudioFocus(null)
                }

                // Release all players
                players.values.forEach { it.release() }
                players.clear()
                activeIndex = -1
                byUrl.values.forEach { it.release() }
                byUrl.clear()
                activeUrl = null
            }
        }

        AsyncFunction("updateActiveIndex") { newIndex: Int, urls: List<String>, shouldPlay: Boolean ->
            val oldIndex = activeIndex
            if (newIndex == oldIndex) return@AsyncFunction
            activeIndex = newIndex
            if (activeUrl != null) {
                activeUrl = null
                byUrl.values.forEach { it.release() }
                byUrl.clear()
            }

            scope.launch {
                // 1. Pause and detach listener from previous active player
                if (oldIndex != -1) {
                    players[oldIndex]?.run {
                        pause()
                    }
                }

                stopStatusPoller()

                // 2. Play new active player
                val currentUrl = urls.getOrNull(newIndex)
                if (currentUrl != null) {
                    var player = players[newIndex]
                    if (player == null) {
                        player = createPlayerForUrl(currentUrl)
                        players[newIndex] = player
                    }

                    if (shouldPlay) {
                        player.seekTo(0)
                        player.play()
                        startStatusPoller(player)
                    }
                }

                // 3. Manage background preload window: 1 behind, 4 ahead
                manageSlidingWindow(newIndex, urls)
            }
        }

        /**
         * Plays `url` (from the start) and keeps `warm` prepared — the songs a
         * swipe can reach next. Everything else is released. Players already
         * warm start instantly.
         */
        AsyncFunction("activateUrl") { url: String, warm: List<String>, shouldPlay: Boolean ->
            scope.launch {
                activePlayer()?.pause()
                stopStatusPoller()
                if (activeIndex != -1) {
                    players.values.forEach { it.release() }
                    players.clear()
                    activeIndex = -1
                }
                activeUrl = url
                val player = byUrl[url] ?: try {
                    createPlayerForUrl(url).also { byUrl[url] = it }
                } catch (_: Exception) {
                    return@launch
                }
                if (shouldPlay) {
                    player.seekTo(0)
                    player.play()
                    startStatusPoller(player)
                }

                val keep = (warm + url).toSet()
                byUrl.keys.filter { it !in keep }.forEach { key -> byUrl.remove(key)?.release() }
                // Warm the rest just after, so the song you landed on loads first.
                delay(300)
                if (activeUrl != url) return@launch
                for (next in warm) {
                    if (next.isBlank() || byUrl.containsKey(next)) continue
                    try {
                        byUrl[next] = createPlayerForUrl(next)
                    } catch (_: Exception) {}
                }
            }
        }

        Function("pause") {
            scope.launch {
                activePlayer()?.pause()
                stopStatusPoller()
            }
        }

        Function("resume") {
            scope.launch {
                val player = activePlayer()
                player?.play()
                player?.let { startStatusPoller(it) }
            }
        }

        Function("seekTo") { millis: Double ->
            scope.launch {
                activePlayer()?.seekTo(millis.toLong())
            }
        }
    }

    private fun createPlayerForUrl(url: String): ExoPlayer {
        val context = appContext.reactContext ?: throw Exception("React context not available")
        val player = ExoPlayer.Builder(context).build()
        player.repeatMode = Player.REPEAT_MODE_OFF
        
        val mediaItem = MediaItem.fromUri(url)
        player.setMediaItem(mediaItem)
        player.prepare()
        
        return player
    }

    private fun manageSlidingWindow(currentIndex: Int, urls: List<String>) {
        val minIndex = currentIndex - 1
        val maxIndex = currentIndex + 4

        // Unload out-of-window players
        val toRemove = players.keys.filter { it < minIndex || it > maxIndex }
        toRemove.forEach { idx ->
            players[idx]?.release()
            players.remove(idx)
        }

        // Preload in-window players
        for (i in minIndex..maxIndex) {
            if (i == currentIndex || i < 0 || i >= urls.size) continue
            if (!players.containsKey(i)) {
                val url = urls[i]
                scope.launch(Dispatchers.Default) {
                    delay(400) // Delay neighbor load slightly to give priority to active reel swiping
                    if (activeIndex != currentIndex) return@launch // Abort if user swiped again

                    withContext(Dispatchers.Main) {
                        try {
                            val player = createPlayerForUrl(url)
                            players[i] = player
                        } catch (_: Exception) {}
                    }
                }
            }
        }
    }

    private fun startStatusPoller(player: ExoPlayer) {
        statusJob?.cancel()
        statusJob = scope.launch {
            while (isActive) {
                val isPlaying = player.isPlaying
                val isBuffering = player.playbackState == Player.STATE_BUFFERING
                val didJustFinish = player.playbackState == Player.STATE_ENDED

                val position = player.currentPosition
                val duration = player.duration

                sendEvent("onLuvsStatus", mapOf(
                    "position" to position,
                    "duration" to if (duration < 0) 0 else duration,
                    "isPlaying" to isPlaying,
                    "isBuffering" to isBuffering,
                    "didJustFinish" to didJustFinish
                ))

                delay(200)
            }
        }
    }

    private fun stopStatusPoller() {
        statusJob?.cancel()
        statusJob = null
    }
}
