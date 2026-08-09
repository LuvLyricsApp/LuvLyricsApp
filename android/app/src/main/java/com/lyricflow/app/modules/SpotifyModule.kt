package com.lyricflow.app.modules

import android.net.Uri
import com.lyricflow.app.spotify.SpotifyApiClient
import com.lyricflow.app.spotify.SpotifyAuthManager
import com.lyricflow.app.spotify.SpotifyConfig
import com.lyricflow.app.spotify.SpotifyCredentialsStore
import com.lyricflow.app.spotify.SpotifyLinkStore
import com.lyricflow.app.spotify.SpotifyTokenStore
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.concurrent.TimeUnit
import okhttp3.OkHttpClient

/**
 * Native half of the Spotify import/sync feature.
 *
 * Owns everything that genuinely has to be native: the OAuth redirect (an
 * intent-filter, unreachable from JS), the tokens (which never cross the
 * bridge), the Web API paging, and the link store that makes re-sync
 * incremental.
 *
 * It deliberately does *not* touch the song/playlist database. That lives in
 * JS-owned SQLite, and giving a second runtime write access to it would mean
 * duplicating the schema in Kotlin. `SpotifySyncService.ts` drives the sync loop
 * and reuses the existing JioSaavn search plus the download queue instead.
 */
class SpotifyModule : Module() {

    private val http by lazy {
        OkHttpClient.Builder()
            .connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .build()
    }

    private val context get() = appContext.reactContext ?: throw Exception("React context not available")

    private val credentials by lazy { SpotifyCredentialsStore(context) }
    private val tokens by lazy { SpotifyTokenStore(context) }
    private val links by lazy { SpotifyLinkStore(context) }
    private val auth by lazy { SpotifyAuthManager(context, tokens, credentials, http) }
    private val api by lazy { SpotifyApiClient(auth, http) }

    override fun definition() = ModuleDefinition {
        Name("Spotify")

        Events("onAuthChanged")

        Constants(
            "redirectUri" to SpotifyConfig.REDIRECT_URI,
            "dashboardUrl" to SpotifyConfig.DASHBOARD_URL,
            "likedSongsId" to SpotifyConfig.LIKED_SONGS_ID,
        )

        // ── Credentials (BYOK) ───────────────────────────────────────────
        Function("getClientId") { credentials.clientId }

        Function("setCredentials") { clientId: String, clientSecret: String? ->
            auth.saveCredentials(clientId, clientSecret.orEmpty())
        }

        // ── Auth ─────────────────────────────────────────────────────────
        Function("isSignedIn") { auth.isLoggedIn() }

        Function("getDisplayName") { auth.displayName() }

        Function("signIn") { auth.startLogin() }

        Function("signOut") {
            auth.logout()
            sendEvent("onAuthChanged", mapOf("signedIn" to false))
        }

        /**
         * Completes a pending redirect. JS polls this after returning from the
         * browser — MainActivity captures the intent, but only JS knows when the
         * import screen is back in the foreground and ready to react.
         * Returns false when there was nothing waiting.
         */
        AsyncFunction("completePendingAuth") {
            val uri: Uri = auth.consumeRedirectUri() ?: return@AsyncFunction false
            auth.handleRedirect(uri)
            sendEvent("onAuthChanged", mapOf("signedIn" to true))
            true
        }

        // ── Read API ─────────────────────────────────────────────────────
        AsyncFunction("listPlaylists") { api.listPlaylists().toString() }

        AsyncFunction("getPlaylistSummary") { playlistId: String ->
            api.getPlaylistSummary(playlistId).toString()
        }

        AsyncFunction("getPlaylistTracks") { playlistId: String ->
            api.getPlaylistTracks(playlistId).toString()
        }

        // ── Link store, so re-sync only resolves what it has not seen ─────
        Function("getLocalPlaylistId") { spotifyPlaylistId: String ->
            links.getLocalPlaylistId(spotifyPlaylistId)
        }

        Function("setLocalPlaylistId") { spotifyPlaylistId: String, localPlaylistId: String ->
            links.setLocalPlaylistId(spotifyPlaylistId, localPlaylistId)
        }

        Function("getSpotifyPlaylistId") { localPlaylistId: String ->
            links.getSpotifyPlaylistId(localPlaylistId)
        }

        Function("getSnapshot") { spotifyPlaylistId: String -> links.getSnapshot(spotifyPlaylistId) }

        Function("setSnapshot") { spotifyPlaylistId: String, snapshot: String? ->
            links.setSnapshot(spotifyPlaylistId, snapshot)
        }

        Function("getTrackMap") { spotifyPlaylistId: String ->
            links.getTrackMap(spotifyPlaylistId)
        }

        Function("setTrackMap") { spotifyPlaylistId: String, map: Map<String, String> ->
            links.setTrackMap(spotifyPlaylistId, map)
        }

        Function("unlink") { spotifyPlaylistId: String -> links.forget(spotifyPlaylistId) }
    }
}
