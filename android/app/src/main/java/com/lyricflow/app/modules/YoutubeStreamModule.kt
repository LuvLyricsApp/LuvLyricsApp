package com.lyricflow.app.modules

import com.lyricflow.app.views.YoutubePlayerView
import com.lyricflow.app.youtube.YoutubeStreamResolver
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * YouTube playback without a WebView.
 *
 * `resolve` hands JS the direct stream URLs from NewPipeExtractor; `<YoutubeStreamView>`
 * plays them through Media3. The two are split so the lyrics overlay can keep
 * living in React while the actual decoding stays native.
 */
class YoutubeStreamModule : Module() {
    override fun definition() = ModuleDefinition {
        Name("YoutubeStream")

        /** Blocking network + parse; Expo runs AsyncFunction off the main thread. */
        AsyncFunction("resolve") { videoId: String ->
            YoutubeStreamResolver.resolve(videoId).toString()
        }

        View(YoutubePlayerView::class) {
            Events("onReady", "onPlaybackError", "onEnded")

            Prop("videoUrl") { view: YoutubePlayerView, url: String? ->
                view.pendingVideoUrl = url
            }

            Prop("audioUrl") { view: YoutubePlayerView, url: String? ->
                view.pendingAudioUrl = url
            }

            Prop("videoHasAudio") { view: YoutubePlayerView, hasAudio: Boolean? ->
                view.pendingVideoHasAudio = hasAudio ?: true
            }

            Prop("paused") { view: YoutubePlayerView, paused: Boolean? ->
                view.setShouldPlay(!(paused ?: false))
            }

            AsyncFunction("seekTo") { view: YoutubePlayerView, seconds: Double ->
                view.seekTo(seconds)
            }
        }
    }
}
