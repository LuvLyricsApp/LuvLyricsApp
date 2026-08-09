package com.lyricflow.app.spotify

import android.content.Context
import org.json.JSONObject

/**
 * BYOK credentials. Kept apart from the token store so signing out never
 * discards the Client ID the user pasted in.
 */
class SpotifyCredentialsStore(context: Context) {
    private val prefs = context.getSharedPreferences("spotify_credentials", Context.MODE_PRIVATE)

    var clientId: String
        get() = prefs.getString(KEY_CLIENT_ID, "").orEmpty()
        set(value) { prefs.edit().putString(KEY_CLIENT_ID, value.trim()).apply() }

    var clientSecret: String
        get() = prefs.getString(KEY_CLIENT_SECRET, "").orEmpty()
        set(value) { prefs.edit().putString(KEY_CLIENT_SECRET, value.trim()).apply() }

    fun hasClientId(): Boolean = clientId.isNotBlank()

    private companion object {
        const val KEY_CLIENT_ID = "client_id"
        const val KEY_CLIENT_SECRET = "client_secret"
    }
}

/**
 * OAuth tokens plus the in-flight PKCE values.
 *
 * Tokens deliberately never cross the JS bridge — everything that needs them
 * runs in [SpotifyApiClient], so the JS side only ever sees playlist data.
 */
class SpotifyTokenStore(context: Context) {
    private val prefs = context.getSharedPreferences("spotify_tokens", Context.MODE_PRIVATE)

    var accessToken: String?
        get() = prefs.getString(KEY_ACCESS, null)
        set(value) { prefs.edit().putString(KEY_ACCESS, value).apply() }

    var refreshToken: String?
        get() = prefs.getString(KEY_REFRESH, null)
        set(value) { prefs.edit().putString(KEY_REFRESH, value).apply() }

    var expiresAtMs: Long
        get() = prefs.getLong(KEY_EXPIRES_AT, 0L)
        set(value) { prefs.edit().putLong(KEY_EXPIRES_AT, value).apply() }

    var displayName: String?
        get() = prefs.getString(KEY_DISPLAY_NAME, null)
        set(value) { prefs.edit().putString(KEY_DISPLAY_NAME, value).apply() }

    var pendingCodeVerifier: String?
        get() = prefs.getString(KEY_VERIFIER, null)
        set(value) { prefs.edit().putString(KEY_VERIFIER, value).apply() }

    var pendingState: String?
        get() = prefs.getString(KEY_STATE, null)
        set(value) { prefs.edit().putString(KEY_STATE, value).apply() }

    fun isLoggedIn(): Boolean = !accessToken.isNullOrBlank() || !refreshToken.isNullOrBlank()

    fun saveTokens(access: String, refresh: String?, expiresInSec: Int) {
        prefs.edit().apply {
            putString(KEY_ACCESS, access)
            if (!refresh.isNullOrBlank()) putString(KEY_REFRESH, refresh)
            // 30s of slack so a request never starts against a token that expires mid-flight.
            putLong(KEY_EXPIRES_AT, System.currentTimeMillis() + (expiresInSec - 30).coerceAtLeast(0) * 1000L)
        }.apply()
    }

    fun clear() {
        prefs.edit().clear().apply()
    }

    private companion object {
        const val KEY_ACCESS = "access_token"
        const val KEY_REFRESH = "refresh_token"
        const val KEY_EXPIRES_AT = "expires_at"
        const val KEY_DISPLAY_NAME = "display_name"
        const val KEY_VERIFIER = "pending_verifier"
        const val KEY_STATE = "pending_state"
    }
}

/**
 * Maps Spotify playlists/tracks to their local counterparts.
 *
 * This is what makes re-sync incremental rather than a re-download: the track
 * map remembers which Spotify track URI already became which local song, so a
 * later sync only resolves the entries it has never seen.
 */
class SpotifyLinkStore(context: Context) {
    private val prefs = context.getSharedPreferences("spotify_links", Context.MODE_PRIVATE)

    fun getLocalPlaylistId(spotifyPlaylistId: String): String? =
        prefs.getString(playlistKey(spotifyPlaylistId), null)

    fun setLocalPlaylistId(spotifyPlaylistId: String, localPlaylistId: String) {
        prefs.edit().putString(playlistKey(spotifyPlaylistId), localPlaylistId).apply()
    }

    /**
     * Reverse lookup, derived from the forward mapping rather than stored
     * separately — that way playlists imported before the in-playlist Sync
     * button existed still resolve, with no migration.
     */
    fun getSpotifyPlaylistId(localPlaylistId: String): String? =
        prefs.all.entries.firstOrNull { (key, value) ->
            key.startsWith(PLAYLIST_KEY_PREFIX) && value == localPlaylistId
        }?.key?.removePrefix(PLAYLIST_KEY_PREFIX)

    fun getSnapshot(spotifyPlaylistId: String): String? =
        prefs.getString(snapshotKey(spotifyPlaylistId), null)

    fun setSnapshot(spotifyPlaylistId: String, snapshot: String?) {
        prefs.edit().putString(snapshotKey(spotifyPlaylistId), snapshot).apply()
    }

    fun getTrackMap(spotifyPlaylistId: String): Map<String, String> {
        val raw = prefs.getString(tracksKey(spotifyPlaylistId), null) ?: return emptyMap()
        return try {
            val obj = JSONObject(raw)
            buildMap {
                obj.keys().forEach { key -> put(key, obj.getString(key)) }
            }
        } catch (_: Exception) {
            emptyMap()
        }
    }

    fun setTrackMap(spotifyPlaylistId: String, map: Map<String, String>) {
        val obj = JSONObject()
        map.forEach { (key, value) -> obj.put(key, value) }
        prefs.edit().putString(tracksKey(spotifyPlaylistId), obj.toString()).apply()
    }

    fun forget(spotifyPlaylistId: String) {
        prefs.edit()
            .remove(playlistKey(spotifyPlaylistId))
            .remove(snapshotKey(spotifyPlaylistId))
            .remove(tracksKey(spotifyPlaylistId))
            .apply()
    }

    private fun playlistKey(id: String) = "$PLAYLIST_KEY_PREFIX$id"
    private fun snapshotKey(id: String) = "snap_$id"
    private fun tracksKey(id: String) = "tr_$id"

    private companion object {
        const val PLAYLIST_KEY_PREFIX = "pl_"
    }
}
