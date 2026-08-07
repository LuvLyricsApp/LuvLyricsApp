package com.lyricflow.app.luvs

import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONArray
import org.json.JSONObject
import java.net.URLEncoder
import java.util.concurrent.TimeUnit

/**
 * Kotlin port of the Saavn half of MultiSourceSearchService. Same endpoints,
 * headers and field mapping — the JS implementation stays authoritative for iOS.
 */
object SaavnClient {
    private const val API = "https://jiosaavn-api-byprats.vercel.app/api"

    private val client = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(25, TimeUnit.SECONDS)
        .build()

    private val browserHeaders = mapOf(
        "Accept" to "application/json, text/plain, */*",
        "Accept-Language" to "en-US,en;q=0.9",
        "User-Agent" to "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) " +
            "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1",
    )

    fun searchSongs(query: String, limit: Int = 20): List<LuvSong> {
        val url = "$API/search/songs?query=${URLEncoder.encode(query, "UTF-8")}&limit=$limit"
        return runCatching { get(url) }
            .getOrNull()
            ?.let { parseResults(it) }
            .orEmpty()
    }

    fun suggestions(songId: String, limit: Int = 15): List<LuvSong> {
        val url = "$API/songs/$songId/suggestions?limit=$limit"
        return runCatching { get(url) }
            .getOrNull()
            ?.let { parseResults(it) }
            .orEmpty()
    }

    private fun get(url: String): JSONObject? {
        val builder = Request.Builder().url(url)
        browserHeaders.forEach { (k, v) -> builder.addHeader(k, v) }
        client.newCall(builder.build()).execute().use { response ->
            if (!response.isSuccessful) return null
            val body = response.body?.string() ?: return null
            return runCatching { JSONObject(body) }.getOrNull()
        }
    }

    /**
     * The suggestions endpoint returns `data` as an array while search nests it under
     * `data.results`; both shapes are accepted so one parser covers each call site.
     */
    private fun parseResults(json: JSONObject): List<LuvSong> {
        if (json.has("success") && !json.optBoolean("success", true)) return emptyList()

        val array: JSONArray = json.optJSONObject("data")?.optJSONArray("results")
            ?: json.optJSONArray("data")
            ?: return emptyList()

        return array.objects()
            .map { mapSong(it) }
            .filter { it.downloadUrl.isNotEmpty() }
    }

    private fun mapSong(o: JSONObject): LuvSong = LuvSong(
        id = o.optString("id"),
        title = decodeHtml(o.optString("name").ifEmpty { o.optString("title") }),
        artist = decodeHtml(artistName(o)),
        highResArt = bestUrl(o.optJSONArray("image")),
        downloadUrl = bestUrl(o.optJSONArray("downloadUrl")),
        hasLyrics = o.optBoolean("hasLyrics", false),
        source = "Saavn",
        duration = o.optInt("duration").takeIf { it > 0 },
        playCount = parsePlays(o.opt("playCount") ?: o.opt("play_count")),
        language = o.optString("language").takeIf { it.isNotEmpty() },
    )

    /** Provider returns quality tiers ascending, so the last entry is the best. */
    private fun bestUrl(arr: JSONArray?): String {
        val items = arr?.objects().orEmpty()
        if (items.isEmpty()) return ""
        val last = items.last()
        return last.optString("url").ifEmpty { last.optString("link") }
    }

    private fun artistName(o: JSONObject): String {
        o.optJSONObject("artists")?.optJSONArray("primary")?.objects()?.firstOrNull()
            ?.optString("name")?.takeIf { it.isNotEmpty() }?.let { return it }

        o.optJSONArray("primaryArtists")?.objects()?.firstOrNull()
            ?.optString("name")?.takeIf { it.isNotEmpty() }?.let { return it }

        o.optString("primaryArtists").takeIf { it.isNotEmpty() }?.let { return it }
        o.optString("subtitle").takeIf { it.isNotEmpty() }?.let { return it }
        return "Unknown Artist"
    }

    private fun parsePlays(raw: Any?): Long = when (raw) {
        is Number -> raw.toLong()
        is String -> raw.filter { it.isDigit() }.toLongOrNull() ?: 0L
        else -> 0L
    }

    private fun decodeHtml(s: String): String = s
        .replace("&quot;", "\"")
        .replace("&amp;", "&")
        .replace("&#039;", "'")
        .replace("&apos;", "'")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .trim()
}
