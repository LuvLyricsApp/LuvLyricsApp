package com.lyricflow.app.youtube

import org.json.JSONObject
import org.schabi.newpipe.extractor.NewPipe
import org.schabi.newpipe.extractor.ServiceList
import org.schabi.newpipe.extractor.localization.Localization
import org.schabi.newpipe.extractor.stream.StreamInfo

/**
 * Turns a YouTube video ID into direct stream URLs.
 *
 * This is the whole reason for pulling in NewPipeExtractor: the previous player
 * embedded YouTube's iframe in a WebView, which breaks whenever the embed page
 * changes and cannot be driven reliably from JS. Resolving a real URL lets
 * Media3 — already a dependency for the main player — do the playback.
 *
 * Resolution is a blocking network+parse operation and must never run on the
 * main thread. Every caller here is an `AsyncFunction`, which Expo dispatches
 * off-main already.
 */
object YoutubeStreamResolver {

    @Volatile
    private var initialised = false

    private fun ensureInit() {
        if (initialised) return
        synchronized(this) {
            if (initialised) return
            NewPipe.init(NewPipeDownloader(), Localization("en", "US"))
            initialised = true
        }
    }

    /**
     * @return JSON with `videoUrl` (muxed or best video), `audioUrl` (best
     *   audio-only), `title`, `durationSeconds`, `thumbnail`. Either URL may be
     *   null; callers should fall back to whichever is present.
     */
    fun resolve(videoId: String): JSONObject {
        ensureInit()
        require(videoId.isNotBlank()) { "Missing YouTube video id" }

        val info = StreamInfo.getInfo(
            ServiceList.YouTube,
            "https://www.youtube.com/watch?v=$videoId",
        )

        // Prefer a progressive muxed stream: one URL, no manual A/V sync, and
        // Media3 handles it without a DASH manifest. Adaptive video-only is the
        // fallback, paired with the audio track below.
        val muxed = info.videoStreams
            .filter { !it.isVideoOnly && !it.url.isNullOrBlank() }
            .maxByOrNull { heightOf(it.resolution) }

        val videoOnly = info.videoOnlyStreams
            .filter { !it.url.isNullOrBlank() }
            .maxByOrNull { heightOf(it.resolution) }

        val audio = info.audioStreams
            .filter { !it.url.isNullOrBlank() }
            .maxByOrNull { it.averageBitrate }

        return JSONObject()
            .put("videoId", videoId)
            .put("title", info.name ?: "")
            .put("durationSeconds", info.duration)
            .put("thumbnail", info.thumbnails.lastOrNull()?.url ?: JSONObject.NULL)
            .put("videoUrl", (muxed?.url ?: videoOnly?.url) ?: JSONObject.NULL)
            // Signals whether videoUrl carries sound. When false the caller must
            // play audioUrl alongside it, or the video plays silent.
            .put("videoHasAudio", muxed != null)
            .put("audioUrl", audio?.url ?: JSONObject.NULL)
    }

    /** "1080p60" -> 1080. Unparseable resolutions sort last. */
    private fun heightOf(resolution: String?): Int =
        resolution?.substringBefore('p')?.toIntOrNull() ?: 0
}
