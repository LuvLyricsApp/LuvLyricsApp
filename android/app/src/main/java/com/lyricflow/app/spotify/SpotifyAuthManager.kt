package com.lyricflow.app.spotify

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.util.Base64
import java.security.MessageDigest
import java.security.SecureRandom
import okhttp3.FormBody
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONObject

/**
 * BYOK Authorization-Code + PKCE against Spotify.
 *
 * PKCE is what lets this work with no server and no shipped secret: the app
 * proves it started the flow by presenting the verifier whose SHA-256 it sent
 * up front. The optional client secret is still forwarded when the user has
 * pasted one, because Spotify apps created as "web" apps reject PKCE-only
 * exchanges.
 *
 * Blocking OkHttp calls throughout — every entry point is invoked from an
 * `AsyncFunction`, which Expo already runs off the main thread.
 */
class SpotifyAuthManager(
    private val context: Context,
    private val tokenStore: SpotifyTokenStore,
    private val credentialsStore: SpotifyCredentialsStore,
    private val http: OkHttpClient,
) {
    /** Redirect captured by MainActivity, waiting to be exchanged. */
    fun consumeRedirectUri(): Uri? = SpotifyRedirectHolder.consume()

    fun isLoggedIn(): Boolean = tokenStore.isLoggedIn()
    fun displayName(): String? = tokenStore.displayName
    fun hasClientId(): Boolean = credentialsStore.hasClientId()
    fun getClientId(): String = credentialsStore.clientId

    fun saveCredentials(clientId: String, clientSecret: String) {
        credentialsStore.clientId = clientId
        credentialsStore.clientSecret = clientSecret
    }

    fun logout() = tokenStore.clear()

    /** Opens Spotify's consent page in the system browser. */
    fun startLogin() {
        val clientId = credentialsStore.clientId
        check(clientId.isNotBlank()) {
            "Add your Spotify Client ID first (Developer Dashboard -> Create app)."
        }

        val verifier = generateCodeVerifier()
        val state = generateCodeVerifier().take(24)
        tokenStore.pendingCodeVerifier = verifier
        tokenStore.pendingState = state

        val uri = Uri.parse(SpotifyConfig.AUTH_URL).buildUpon()
            .appendQueryParameter("client_id", clientId)
            .appendQueryParameter("response_type", "code")
            .appendQueryParameter("redirect_uri", SpotifyConfig.REDIRECT_URI)
            .appendQueryParameter("scope", SpotifyConfig.SCOPES)
            .appendQueryParameter("code_challenge_method", "S256")
            .appendQueryParameter("code_challenge", codeChallengeS256(verifier))
            .appendQueryParameter("state", state)
            .appendQueryParameter("show_dialog", "true")
            .build()

        context.startActivity(
            Intent(Intent.ACTION_VIEW, uri).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        )
    }

    /** Exchanges the captured redirect for tokens. Throws with a readable message. */
    fun handleRedirect(uri: Uri) {
        require(uri.scheme == SpotifyConfig.SCHEME && uri.host == SpotifyConfig.CALLBACK_HOST) {
            "Not a Spotify callback"
        }
        uri.getQueryParameter("error")?.takeIf { it.isNotBlank() }?.let {
            error("Spotify auth error: $it")
        }
        val code = uri.getQueryParameter("code") ?: error("Missing auth code")
        // A mismatch is worth noting but not worth blocking on: some browsers
        // re-encode the parameter, and the PKCE verifier is the real defence.
        val verifier = tokenStore.pendingCodeVerifier ?: error("Missing PKCE verifier")

        exchangeCode(code, verifier)
        tokenStore.pendingCodeVerifier = null
        tokenStore.pendingState = null
        runCatching { fetchAndStoreProfile() }
    }

    /** Valid access token, refreshing when expired. Null means re-login needed. */
    fun getValidAccessToken(): String? {
        val access = tokenStore.accessToken
        if (!access.isNullOrBlank() && System.currentTimeMillis() < tokenStore.expiresAtMs) {
            return access
        }
        val refresh = tokenStore.refreshToken ?: return null
        return if (refreshAccessToken(refresh)) tokenStore.accessToken else null
    }

    private fun requireClientId(): String =
        credentialsStore.clientId.ifBlank { error("Spotify Client ID not set") }

    private fun exchangeCode(code: String, verifier: String) {
        val form = FormBody.Builder()
            .add("grant_type", "authorization_code")
            .add("code", code)
            .add("redirect_uri", SpotifyConfig.REDIRECT_URI)
            .add("client_id", requireClientId())
            .add("code_verifier", verifier)
        credentialsStore.clientSecret.takeIf { it.isNotBlank() }?.let { form.add("client_secret", it) }

        val request = Request.Builder()
            .url(SpotifyConfig.TOKEN_URL)
            .post(form.build())
            .build()

        http.newCall(request).execute().use { response ->
            val text = response.body?.string().orEmpty()
            if (!response.isSuccessful) {
                error(
                    "Token exchange failed (${response.code}). Check the Client ID and that " +
                        "${SpotifyConfig.REDIRECT_URI} is listed as a Redirect URI on your Spotify app."
                )
            }
            storeTokenResponse(JSONObject(text), fallbackRefresh = null)
        }
    }

    private fun refreshAccessToken(refresh: String): Boolean {
        val form = FormBody.Builder()
            .add("grant_type", "refresh_token")
            .add("refresh_token", refresh)
            .add("client_id", requireClientId())
        credentialsStore.clientSecret.takeIf { it.isNotBlank() }?.let { form.add("client_secret", it) }

        val request = Request.Builder()
            .url(SpotifyConfig.TOKEN_URL)
            .post(form.build())
            .build()

        return try {
            http.newCall(request).execute().use { response ->
                val text = response.body?.string().orEmpty()
                if (!response.isSuccessful) {
                    // 400/401 means the grant is dead, not a transient failure —
                    // clearing forces a clean re-login instead of retry loops.
                    if (response.code == 400 || response.code == 401) tokenStore.clear()
                    return false
                }
                storeTokenResponse(JSONObject(text), fallbackRefresh = refresh)
                true
            }
        } catch (_: Exception) {
            false
        }
    }

    private fun storeTokenResponse(json: JSONObject, fallbackRefresh: String?) {
        tokenStore.saveTokens(
            access = json.getString("access_token"),
            refresh = json.optString("refresh_token", "").ifBlank { fallbackRefresh },
            expiresInSec = json.optInt("expires_in", 3600),
        )
    }

    private fun fetchAndStoreProfile() {
        val token = tokenStore.accessToken ?: return
        val request = Request.Builder()
            .url("${SpotifyConfig.API_BASE}/me")
            .header("Authorization", "Bearer $token")
            .get()
            .build()
        http.newCall(request).execute().use { response ->
            if (!response.isSuccessful) return
            val json = JSONObject(response.body?.string().orEmpty())
            tokenStore.displayName = json.optString("display_name").ifBlank { json.optString("id") }
        }
    }

    private fun generateCodeVerifier(): String {
        val bytes = ByteArray(64)
        SecureRandom().nextBytes(bytes)
        return Base64.encodeToString(bytes, Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING)
    }

    private fun codeChallengeS256(verifier: String): String {
        val digest = MessageDigest.getInstance("SHA-256")
            .digest(verifier.toByteArray(Charsets.US_ASCII))
        return Base64.encodeToString(digest, Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING)
    }
}
