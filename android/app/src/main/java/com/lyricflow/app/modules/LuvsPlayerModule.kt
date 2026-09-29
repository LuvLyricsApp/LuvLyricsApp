package com.lyricflow.app.modules

import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.content.Context
import android.os.PowerManager
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.exoplayer.DefaultLoadControl
import androidx.media3.exoplayer.ExoPlayer
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.*

private const val HOOK_MIN_SECONDS = 90.0
private const val HOOK_FRACTION = 0.3
private const val HOOK_EARLIEST = 25.0
private const val HOOK_LATEST = 70.0

// Every warm player pre-buffers over the network whether or not the listener
// ever swipes to it, so each one is held to a short buffer instead of the
// default 50 seconds. A clip is short and a swipe is cheap to re-fetch.
private const val BUFFER_MIN_MS = 10_000
private const val BUFFER_MAX_MS = 20_000
private const val BUFFER_FOR_PLAYBACK_MS = 1_000
private const val BUFFER_AFTER_REBUFFER_MS = 2_000

// Players are built on the main thread; a beat between them keeps a swipe from
// stalling behind a burst of allocations.
private const val WARM_STAGGER_MS = 80L

class LuvsPlayerModule : Module() {
    private val scope = CoroutineScope(Dispatchers.Main + SupervisorJob())
    // The taste map (lanes × depth) addresses songs by URL: an index means
    // nothing once there is more than one list. This is the one pool.
    private val byUrl = mutableMapOf<String, ExoPlayer>()
    private var activeUrl: String? = null

    /** The player that is live. */
    private fun activePlayer(): ExoPlayer? = activeUrl?.let { byUrl[it] }
    private var audioManager: AudioManager? = null
    private var audioFocusRequest: AudioFocusRequest? = null

    private var statusJob: Job? = null

    /** Battery Saver: warm only the very next clip. */
    private fun powerSaveOn(): Boolean {
        val context = appContext.reactContext ?: return false
        return (context.getSystemService(Context.POWER_SERVICE) as? PowerManager)?.isPowerSaveMode ?: false
    }

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
                byUrl.values.forEach { it.release() }
                byUrl.clear()
                activeUrl = null
            }
        }

        /**
         * Plays `url` (from the start) and keeps `warm` prepared — the songs a
         * swipe can reach next. Everything else is released. Players already
         * warm start instantly.
         */
        AsyncFunction("activateUrl") { url: String, warm: List<String>, shouldPlay: Boolean, startAtHook: Boolean ->
            scope.launch {
                activePlayer()?.pause()
                stopStatusPoller()
                activeUrl = url
                val player = byUrl[url] ?: try {
                    createPlayerForUrl(url).also { byUrl[url] = it }
                } catch (_: Exception) {
                    return@launch
                }
                if (shouldPlay) {
                    player.seekTo(0)
                    // The clip opens on its hook. The player knows the real length
                    // once it is ready; the catalogue's duration is often missing,
                    // which used to leave every clip at 0:00.
                    if (startAtHook) seekToHookWhenKnown(player)
                    player.play()
                    startStatusPoller(player)
                }

                val warmUrls = if (powerSaveOn()) warm.take(1) else warm
                val keep = (warmUrls + url).toSet()
                byUrl.keys.filter { it !in keep }.forEach { key -> byUrl.remove(key)?.release() }
                // Warm the rest just after, so the song you landed on loads first.
                delay(300)
                if (activeUrl != url) return@launch
                for (next in warmUrls) {
                    if (next.isBlank() || byUrl.containsKey(next)) continue
                    try {
                        byUrl[next] = createPlayerForUrl(next)
                    } catch (_: Exception) {}
                    delay(WARM_STAGGER_MS)
                    if (activeUrl != url) return@launch
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

    /**
     * Moves a clip to its hook once its real length is known. Kept in step with
     * services/luvsHook.ts: songs under 90s start from the top, otherwise about
     * 30% in, clamped to 25–70 seconds so intros are skipped and the hook is
     * never overshot on a long track.
     */
    private fun seekToHookWhenKnown(player: ExoPlayer) {
        fun apply(): Boolean {
            val duration = player.duration
            if (duration == C.TIME_UNSET || duration <= 0) return false
            val seconds = duration / 1000.0
            if (seconds >= HOOK_MIN_SECONDS) {
                val target = Math.round((seconds * HOOK_FRACTION).coerceIn(HOOK_EARLIEST, HOOK_LATEST))
                player.seekTo(target * 1000L)
            }
            return true
        }
        if (apply()) return
        player.addListener(object : Player.Listener {
            override fun onPlaybackStateChanged(state: Int) {
                if (state == Player.STATE_READY && apply()) player.removeListener(this)
            }
        })
    }

    private fun createPlayerForUrl(url: String): ExoPlayer {
        val context = appContext.reactContext ?: throw Exception("React context not available")
        // A load control per player: each owns its allocator, so they cannot be shared.
        val loadControl = DefaultLoadControl.Builder()
            .setBufferDurationsMs(BUFFER_MIN_MS, BUFFER_MAX_MS, BUFFER_FOR_PLAYBACK_MS, BUFFER_AFTER_REBUFFER_MS)
            .build()
        val player = ExoPlayer.Builder(context).setLoadControl(loadControl).build()
        player.repeatMode = Player.REPEAT_MODE_OFF

        val mediaItem = MediaItem.fromUri(url)
        player.setMediaItem(mediaItem)
        player.prepare()

        return player
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
