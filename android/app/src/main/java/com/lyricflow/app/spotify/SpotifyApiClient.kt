package com.lyricflow.app.spotify

import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONArray
import org.json.JSONObject

/**
 * Read-only Spotify Web API access.
 *
 * Everything is returned as `JSONObject`/`JSONArray` so the module can hand it
 * straight to JS without a second modelling layer. Pagination order is the
 * playlist order — pages are appended, never sorted, because the whole point of
 * the import is that the local playlist ends up in the same order as Spotify.
 */
class SpotifyApiClient(
    private val auth: SpotifyAuthManager,
    private val http: OkHttpClient,
) {
    /** Guard against a malformed `next` cursor spinning forever. */
    private val maxPages = 100

    private fun token(): String =
        auth.getValidAccessToken() ?: error("Not signed in to Spotify")

    private fun get(url: String): JSONObject {
        val request = Request.Builder()
            .url(url)
            .header("Authorization", "Bearer ${token()}")
            .get()
            .build()
        http.newCall(request).execute().use { response ->
            val text = response.body?.string().orEmpty()
            if (!response.isSuccessful) {
                android.util.Log.w("SpotifyApi", "HTTP ${response.code} for $url -> ${text.take(400)}")
                val detail = runCatching {
                    JSONObject(text).getJSONObject("error").optString("message")
                }.getOrNull().orEmpty()
                error(
                    when (response.code) {
                        401 -> "Spotify session expired — sign in again"
                        403 -> "Spotify refused this request${if (detail.isBlank()) "" else ": $detail"}"
                        429 -> "Spotify rate limit hit — try again shortly"
                        else -> "Spotify request failed (${response.code})${if (detail.isBlank()) "" else ": $detail"}"
                    }
                )
            }
            return JSONObject(text)
        }
    }

    /** [get], but swallowing failures so a caller can fall back instead of aborting. */
    private fun getOrNull(url: String): JSONObject? = runCatching { get(url) }.getOrNull()

    /** The user's country, needed because `market=from_token` is no longer accepted. */
    private val userCountry: String? by lazy {
        runCatching { get("${SpotifyConfig.API_BASE}/me").optString("country").ifBlank { null } }
            .getOrNull()
    }

    /**
     * First page of a playlist's tracks, trying every route Spotify might allow.
     *
     * The plain sub-endpoint is correct and is tried first. A bare 403 on a
     * playlist the user owns is a Development Mode restriction rather than a
     * permissions problem, and in that state supplying an explicit market or
     * reading the copy embedded in the playlist resource can still succeed.
     * Each attempt is logged, because a silent fallback that returns nothing is
     * indistinguishable from an genuinely empty playlist.
     */
    private fun firstTracksPage(playlistId: String, plainUrl: String): JSONObject {
        getOrNull(plainUrl)?.let {
            android.util.Log.i("SpotifyApi", "tracks endpoint OK (plain)")
            return it
        }

        userCountry?.let { country ->
            getOrNull("$plainUrl&market=$country")?.let {
                android.util.Log.i("SpotifyApi", "tracks endpoint OK (market=$country)")
                return it
            }
        }

        val playlist = get("${SpotifyConfig.API_BASE}/playlists/$playlistId")
        android.util.Log.i(
            "SpotifyApi",
            "embedded fallback: keys=${playlist.keys().asSequence().joinToString(",")} " +
                "tracks=${playlist.opt("tracks")?.javaClass?.simpleName} " +
                "items=${playlist.opt("items")?.javaClass?.simpleName}"
        )

        playlist.optJSONObject("tracks")?.let { if (it.has("items")) return it }
        playlist.optJSONObject("items")?.let { if (it.has("items")) return it }
        playlist.optJSONArray("items")?.let { return JSONObject().put("items", it) }

        error(
            "Spotify refused this playlist's tracks (403) and did not embed them either. " +
                "Your Spotify app is most likely in Development Mode with restricted API access."
        )
    }

    /** All playlists the user owns or follows, plus a synthetic Liked Songs row. */
    fun listPlaylists(): JSONArray {
        val out = JSONArray()

        // Liked Songs first: it is the one most people actually want, and it is
        // not returned by the playlists endpoint at all.
        runCatching {
            val liked = get("${SpotifyConfig.API_BASE}/me/tracks?limit=1")
            out.put(
                JSONObject()
                    .put("id", SpotifyConfig.LIKED_SONGS_ID)
                    .put("name", SpotifyConfig.LIKED_SONGS_NAME)
                    .put("trackCount", liked.optInt("total", 0))
                    .put("imageUrl", JSONObject.NULL)
                    .put("ownerName", auth.displayName() ?: "You")
                    .put("snapshotId", JSONObject.NULL)
            )
        }

        var url: String? = "${SpotifyConfig.API_BASE}/me/playlists?limit=50"
        var pages = 0
        while (url != null && pages < maxPages) {
            val page = get(url)
            val items = page.optJSONArray("items") ?: JSONArray()
            for (i in 0 until items.length()) {
                val item = items.optJSONObject(i) ?: continue
                out.put(
                    JSONObject()
                        .put("id", item.optString("id"))
                        .put("name", item.optString("name"))
                        .put("trackCount", trackCountOf(item))
                        .put("imageUrl", firstImageUrl(item.optJSONArray("images")) ?: JSONObject.NULL)
                        .put("ownerName", item.optJSONObject("owner")?.optString("display_name") ?: "")
                        .put("snapshotId", item.optString("snapshot_id").ifBlank { null } ?: JSONObject.NULL)
                )
            }
            url = page.optString("next").takeIf { it.isNotBlank() && it != "null" }
            pages++
        }
        return out
    }

    /** Summary for one playlist, so a re-sync can refresh name/cover/snapshot. */
    fun getPlaylistSummary(playlistId: String): JSONObject {
        if (playlistId == SpotifyConfig.LIKED_SONGS_ID) {
            val liked = get("${SpotifyConfig.API_BASE}/me/tracks?limit=1")
            return JSONObject()
                .put("id", SpotifyConfig.LIKED_SONGS_ID)
                .put("name", SpotifyConfig.LIKED_SONGS_NAME)
                .put("trackCount", liked.optInt("total", 0))
                .put("imageUrl", JSONObject.NULL)
                .put("ownerName", auth.displayName() ?: "You")
                .put("snapshotId", JSONObject.NULL)
        }
        val item = get("${SpotifyConfig.API_BASE}/playlists/$playlistId")
        return JSONObject()
            .put("id", item.optString("id"))
            .put("name", item.optString("name"))
            .put("trackCount", item.optJSONObject("tracks")?.optInt("total", 0) ?: 0)
            .put("imageUrl", firstImageUrl(item.optJSONArray("images")) ?: JSONObject.NULL)
            .put("ownerName", item.optJSONObject("owner")?.optString("display_name") ?: "")
            .put("snapshotId", item.optString("snapshot_id").ifBlank { null } ?: JSONObject.NULL)
    }

    /** Every track, in playlist order. Local-only and podcast rows are dropped. */
    fun getPlaylistTracks(playlistId: String): JSONArray {
        val out = JSONArray()
        val liked = playlistId == SpotifyConfig.LIKED_SONGS_ID

        var url: String? = if (liked) {
            "${SpotifyConfig.API_BASE}/me/tracks?limit=50"
        } else {
            "${SpotifyConfig.API_BASE}/playlists/$playlistId/tracks?limit=100"
        }

        var pages = 0
        while (url != null && pages < maxPages) {
            // First page only: the tracks sub-endpoint has been seen returning a
            // bare 403 for playlists the user owns, so work through the
            // alternatives before giving up.
            val page = if (pages == 0 && !liked) {
                firstTracksPage(playlistId, url)
            } else {
                get(url)
            }
            val items = page.optJSONArray("items") ?: JSONArray()
            if (pages == 0 && !liked) {
                android.util.Log.i("SpotifyApi", "first page items=${items.length()} next=${page.optString("next").take(80)}")
            }
            for (i in 0 until items.length()) {
                val row = items.optJSONObject(i) ?: continue
                if (row.optBoolean("is_local", false)) continue
                if (i == 0 && pages == 0) {
                    android.util.Log.i(
                        "SpotifyApi",
                        "row0 keys=${row.keys().asSequence().joinToString(",")}"
                    )
                }
                // The /tracks endpoint wraps each entry as { track, added_at };
                // the copy embedded in the playlist object names the same field
                // `item` instead. Reading only `track` silently discarded every
                // row of an embedded page. Falling through to the row itself
                // covers a bare track object too.
                val track = row.optJSONObject("track")
                    ?: row.optJSONObject("item")
                    ?: row
                // Episodes come through this endpoint too and have no artists.
                val uri = track.optString("uri")
                if (!uri.startsWith("spotify:track:")) continue

                out.put(
                    JSONObject()
                        .put("uri", uri)
                        .put("spotifyId", track.optString("id").ifBlank { null } ?: JSONObject.NULL)
                        .put("name", track.optString("name"))
                        .put("artists", joinArtists(track.optJSONArray("artists")))
                        .put("durationMs", track.optLong("duration_ms", 0L))
                        .put("album", track.optJSONObject("album")?.optString("name") ?: "")
                        .put(
                            "coverUrl",
                            firstImageUrl(track.optJSONObject("album")?.optJSONArray("images"))
                                ?: JSONObject.NULL
                        )
                        .put(
                            "isrc",
                            track.optJSONObject("external_ids")?.optString("isrc")?.ifBlank { null }
                                ?: JSONObject.NULL
                        )
                )
            }
            url = page.optString("next").takeIf { it.isNotBlank() && it != "null" }
            pages++
        }
        return out
    }

    /**
     * Track count off a playlist object.
     *
     * The documented shape is `tracks: { href, total }`, but real responses have
     * been observed returning the same reference under `items` instead — reading
     * only `tracks` reported every playlist as empty. Both spellings are
     * accepted, as an object with `total` or as a plain array.
     */
    private fun trackCountOf(item: JSONObject): Int {
        item.optJSONObject("tracks")?.let { return it.optInt("total", 0) }
        item.optJSONObject("items")?.let { return it.optInt("total", 0) }
        item.optJSONArray("items")?.let { return it.length() }
        return 0
    }

    private fun joinArtists(artists: JSONArray?): String {
        if (artists == null) return ""
        return (0 until artists.length())
            .mapNotNull { artists.optJSONObject(it)?.optString("name")?.ifBlank { null } }
            .joinToString(", ")
    }

    /** Spotify returns images widest-first, which is the one worth caching. */
    private fun firstImageUrl(images: JSONArray?): String? {
        if (images == null || images.length() == 0) return null
        return images.optJSONObject(0)?.optString("url")?.ifBlank { null }
    }
}
