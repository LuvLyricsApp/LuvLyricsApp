package com.lyricflow.app.views

import android.content.Context
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.MergingMediaSource
import androidx.media3.exoplayer.source.ProgressiveMediaSource
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.ui.PlayerView
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView

/**
 * Media3 surface for a NewPipe-resolved YouTube stream.
 *
 * Replaces the `react-native-youtube-iframe` WebView. The video URL is a plain
 * progressive HTTP stream by the time it gets here, so ExoPlayer treats it like
 * any other media — which is exactly why this is more robust than driving an
 * embedded iframe from JS.
 *
 * When the best video track is adaptive it carries no audio, so video and audio
 * arrive as two URLs and are merged into one timeline here. Media3 keeps them
 * in sync; doing that in JS would not be possible.
 */
class YoutubePlayerView(context: Context, appContext: AppContext) :
    ExpoView(context, appContext) {

    private val onReady by EventDispatcher()
    private val onPlaybackError by EventDispatcher()
    private val onEnded by EventDispatcher()

    private var player: ExoPlayer? = null
    // No built-in controls: the transport lives in the React overlay alongside
    // the lyrics, so Media3's own UI would just fight with it.
    private val playerView = PlayerView(context).apply {
        useController = false
    }

    private var videoUrl: String? = null
    private var audioUrl: String? = null
    private var videoHasAudio: Boolean = true
    private var shouldPlay: Boolean = false
    private var rebuildScheduled = false

    /**
     * Props are delivered one at a time, so setting three of them would tear
     * down and rebuild ExoPlayer three times — and briefly build it with a
     * video URL but no matching audio URL. These stage the incoming values and
     * [scheduleRebuild] collapses the batch into one rebuild at the end of the
     * frame, once the whole prop set has landed.
     */
    var pendingVideoUrl: String?
        get() = videoUrl
        set(value) { if (value != videoUrl) { videoUrl = value; scheduleRebuild() } }

    var pendingAudioUrl: String?
        get() = audioUrl
        set(value) { if (value != audioUrl) { audioUrl = value; scheduleRebuild() } }

    var pendingVideoHasAudio: Boolean
        get() = videoHasAudio
        set(value) { if (value != videoHasAudio) { videoHasAudio = value; scheduleRebuild() } }

    init {
        addView(playerView)
    }

    private fun scheduleRebuild() {
        if (rebuildScheduled) return
        rebuildScheduled = true
        post {
            rebuildScheduled = false
            rebuild()
        }
    }

    fun setShouldPlay(play: Boolean) {
        shouldPlay = play
        player?.playWhenReady = play
    }

    fun seekTo(seconds: Double) {
        player?.seekTo((seconds * 1000).toLong())
    }

    fun release() {
        player?.release()
        player = null
        playerView.player = null
    }

    private fun rebuild() {
        release()
        val video = videoUrl ?: return

        val factory = DefaultHttpDataSource.Factory()
            // YouTube's CDN rejects requests without a browser-shaped UA, and the
            // resolved URLs are tied to the session that produced them.
            .setUserAgent(USER_AGENT)
            .setAllowCrossProtocolRedirects(true)

        val exo = ExoPlayer.Builder(context).build()

        val videoSource = ProgressiveMediaSource.Factory(factory)
            .createMediaSource(MediaItem.fromUri(video))

        val source = if (!videoHasAudio && !audioUrl.isNullOrBlank()) {
            val audioSource = ProgressiveMediaSource.Factory(factory)
                .createMediaSource(MediaItem.fromUri(audioUrl!!))
            MergingMediaSource(videoSource, audioSource)
        } else {
            videoSource
        }

        exo.setMediaSource(source)
        exo.prepare()
        exo.playWhenReady = shouldPlay

        exo.addListener(object : Player.Listener {
            override fun onPlaybackStateChanged(state: Int) {
                when (state) {
                    Player.STATE_READY -> onReady(mapOf("duration" to exo.duration / 1000.0))
                    Player.STATE_ENDED -> onEnded(mapOf())
                    else -> Unit
                }
            }

            override fun onPlayerError(error: PlaybackException) {
                onPlaybackError(mapOf("message" to (error.message ?: "Playback failed")))
            }
        })

        playerView.player = exo
        player = exo
    }

    override fun onDetachedFromWindow() {
        super.onDetachedFromWindow()
        release()
    }

    private companion object {
        const val USER_AGENT =
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
                "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
    }
}
