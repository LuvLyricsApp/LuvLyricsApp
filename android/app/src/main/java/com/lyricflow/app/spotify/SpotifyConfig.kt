package com.lyricflow.app.spotify

/**
 * Fixed Spotify OAuth endpoints / redirect.
 *
 * BYOK: the Client ID is supplied by the user from
 * https://developer.spotify.com/dashboard, so no secret ships in the APK and no
 * Spotify quota is shared between installs. PKCE means the secret is optional.
 *
 * Every user must add this exact Redirect URI to their Spotify app:
 *   com.lyricflow.app://spotify-callback
 */
object SpotifyConfig {
    const val SCHEME = "com.lyricflow.app"
    const val CALLBACK_HOST = "spotify-callback"
    const val REDIRECT_URI = "$SCHEME://$CALLBACK_HOST"

    const val AUTH_URL = "https://accounts.spotify.com/authorize"
    const val TOKEN_URL = "https://accounts.spotify.com/api/token"
    const val API_BASE = "https://api.spotify.com/v1"

    /** Library read is what makes Liked Songs listable/importable. */
    const val SCOPES =
        "playlist-read-private playlist-read-collaborative user-read-private user-library-read"

    const val DASHBOARD_URL = "https://developer.spotify.com/dashboard"

    /** Synthetic id — Liked Songs is not a normal playlist in the Spotify API. */
    const val LIKED_SONGS_ID = "liked_songs"
    const val LIKED_SONGS_NAME = "Liked Songs"
}

/**
 * Parking spot for the OAuth redirect.
 *
 * The browser hands the callback to MainActivity, which may run before the
 * React context (and therefore the module) exists at all — a cold start from
 * the redirect is the normal case when the browser evicted the app. A process
 * singleton is the only place both sides can reliably meet.
 */
object SpotifyRedirectHolder {
    @Volatile
    private var pending: android.net.Uri? = null

    fun offer(uri: android.net.Uri): Boolean {
        if (uri.scheme == SpotifyConfig.SCHEME && uri.host == SpotifyConfig.CALLBACK_HOST) {
            pending = uri
            return true
        }
        return false
    }

    fun consume(): android.net.Uri? {
        val uri = pending
        pending = null
        return uri
    }
}
