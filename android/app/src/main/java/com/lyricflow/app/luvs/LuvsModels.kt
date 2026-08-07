package com.lyricflow.app.luvs

import org.json.JSONArray
import org.json.JSONObject

/**
 * Wire model for a feed entry. Mirrors UnifiedSong on the JS side so the bridge
 * payload can be handed straight to the existing React components.
 */
data class LuvSong(
    val id: String,
    val title: String,
    val artist: String,
    val highResArt: String,
    val downloadUrl: String,
    val hasLyrics: Boolean = false,
    val source: String = "Saavn",
    val duration: Int? = null,
    val playCount: Long = 0,
    val language: String? = null,
    val isLocal: Boolean = false,
    val isAuthentic: Boolean = false,
) {
    /** Dedup/local-swap key — title+artist, case and whitespace insensitive. */
    val matchKey: String
        get() = "${title.lowercase().trim()}_${artist.lowercase().trim()}"

    fun toMap(): Map<String, Any?> = mapOf(
        "id" to id,
        "title" to title,
        "artist" to artist,
        "highResArt" to highResArt,
        "downloadUrl" to downloadUrl,
        "hasLyrics" to hasLyrics,
        "source" to source,
        "duration" to duration,
        "playCount" to playCount,
        "language" to language,
        "isLocal" to isLocal,
        "isAuthentic" to isAuthentic,
    )

    fun toJson(): JSONObject = JSONObject().apply {
        put("id", id)
        put("title", title)
        put("artist", artist)
        put("highResArt", highResArt)
        put("downloadUrl", downloadUrl)
        put("hasLyrics", hasLyrics)
        put("source", source)
        put("duration", duration ?: JSONObject.NULL)
        put("playCount", playCount)
        put("language", language ?: JSONObject.NULL)
        put("isLocal", isLocal)
        put("isAuthentic", isAuthentic)
    }

    companion object {
        fun fromJson(o: JSONObject): LuvSong = LuvSong(
            id = o.optString("id"),
            title = o.optString("title"),
            artist = o.optString("artist"),
            highResArt = o.optString("highResArt"),
            downloadUrl = o.optString("downloadUrl"),
            hasLyrics = o.optBoolean("hasLyrics", false),
            source = o.optString("source", "Saavn"),
            duration = if (o.isNull("duration")) null else o.optInt("duration"),
            playCount = o.optLong("playCount", 0),
            language = if (o.isNull("language")) null else o.optString("language"),
            isLocal = o.optBoolean("isLocal", false),
            isAuthentic = o.optBoolean("isAuthentic", false),
        )
    }
}

/**
 * A song already in the user's library. Pushed over from JS once per Luvs session —
 * the library lives in expo-sqlite on the JS side, and reading that file from Kotlin
 * would couple this module to expo-sqlite's storage layout.
 */
data class LocalSong(
    val id: String,
    val title: String,
    val artist: String,
    val coverImageUri: String?,
    val audioUri: String?,
    val duration: Int?,
    val hasLyrics: Boolean,
) {
    val matchKey: String
        get() = "${title.lowercase().trim()}_${artist.lowercase().trim()}"
}

data class LuvInteraction(
    val songId: String,
    val title: String,
    val artist: String,
    val timestamp: Long,
    val watchDuration: Double,
    val totalDuration: Double,
    val liked: Boolean,
    val skipped: Boolean,
) {
    fun toJson(): JSONObject = JSONObject().apply {
        put("songId", songId)
        put("title", title)
        put("artist", artist)
        put("timestamp", timestamp)
        put("watchDuration", watchDuration)
        put("totalDuration", totalDuration)
        put("liked", liked)
        put("skipped", skipped)
    }

    companion object {
        fun fromJson(o: JSONObject): LuvInteraction = LuvInteraction(
            songId = o.optString("songId"),
            title = o.optString("title"),
            artist = o.optString("artist"),
            timestamp = o.optLong("timestamp"),
            watchDuration = o.optDouble("watchDuration", 0.0),
            totalDuration = o.optDouble("totalDuration", 0.0),
            liked = o.optBoolean("liked", false),
            skipped = o.optBoolean("skipped", false),
        )
    }
}

data class LanguagePreference(val language: String, val weight: Int)

data class ArtistScore(val artist: String, val score: Double, val interactions: Int)

internal fun JSONArray.objects(): List<JSONObject> =
    (0 until length()).mapNotNull { optJSONObject(it) }

internal fun JSONArray.strings(): List<String> =
    (0 until length()).mapNotNull { optString(it).takeIf { s -> s.isNotEmpty() } }
