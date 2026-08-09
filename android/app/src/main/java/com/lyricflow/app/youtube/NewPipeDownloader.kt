package com.lyricflow.app.youtube

import java.util.concurrent.TimeUnit
import okhttp3.OkHttpClient
import okhttp3.RequestBody.Companion.toRequestBody
import org.schabi.newpipe.extractor.downloader.Downloader
import org.schabi.newpipe.extractor.downloader.Request
import org.schabi.newpipe.extractor.downloader.Response
import org.schabi.newpipe.extractor.exceptions.ReCaptchaException

/**
 * OkHttp transport for NewPipeExtractor.
 *
 * The extractor ships no networking of its own — every caller must supply one of
 * these. This is the minimum faithful implementation: forward the method, URL,
 * headers and body, and hand back the final URL after redirects (the extractor
 * relies on that to resolve relative links).
 *
 * A 429 must surface as [ReCaptchaException] specifically, not a generic
 * failure: that is how the extractor signals "YouTube wants a captcha" rather
 * than "this video is unavailable", and the two need different messages.
 */
class NewPipeDownloader(
    private val client: OkHttpClient = defaultClient(),
) : Downloader() {

    override fun execute(request: Request): Response {
        val body = request.dataToSend()?.toRequestBody()

        val builder = okhttp3.Request.Builder()
            .method(request.httpMethod(), body)
            .url(request.url())
            .addHeader("User-Agent", USER_AGENT)

        request.headers().forEach { (name, values) ->
            builder.removeHeader(name)
            values.forEach { value -> builder.addHeader(name, value) }
        }

        client.newCall(builder.build()).execute().use { response ->
            if (response.code == 429) {
                throw ReCaptchaException("reCaptcha challenge requested", request.url())
            }
            val text = response.body?.string()
            return Response(
                response.code,
                response.message,
                response.headers.toMultimap(),
                text,
                response.request.url.toString(),
            )
        }
    }

    companion object {
        /**
         * A current desktop UA. YouTube serves a materially different (and more
         * parseable) payload to anything it reads as a modern browser.
         */
        private const val USER_AGENT =
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
                "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"

        private fun defaultClient(): OkHttpClient = OkHttpClient.Builder()
            .connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .followRedirects(true)
            .build()
    }
}
