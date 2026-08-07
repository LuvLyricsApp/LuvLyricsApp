package com.lyricflow.app.modules

import com.lyricflow.app.luvs.LocalSong
import com.lyricflow.app.luvs.LuvInteraction
import com.lyricflow.app.luvs.LuvsEngine
import com.lyricflow.app.luvs.LuvsPrefs
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch

/**
 * Bridge for the native Luvs backend. Everything heavy — network, ranking, filtering,
 * persistence — runs in Kotlin; JS only asks for the feed and reports interactions.
 *
 * Feed-returning calls are AsyncFunction so the JS thread is never blocked on IO.
 */
class LuvsEngineModule : Module() {

    private val scope = CoroutineScope(Dispatchers.Default + SupervisorJob())

    private val prefs: LuvsPrefs by lazy {
        LuvsPrefs(requireNotNull(appContext.reactContext) { "No React context for LuvsPrefs" })
    }
    private val engine: LuvsEngine by lazy { LuvsEngine(prefs) }

    override fun definition() = ModuleDefinition {
        Name("LuvsEngine")

        Events("onFeedUpdated")

        OnDestroy { scope.cancel() }

        // ── Library handoff ──────────────────────────────────────────────────
        // The song library lives in expo-sqlite on the JS side; pushing a snapshot
        // avoids coupling this module to that database's on-disk layout.
        Function("setLibrary") { songs: List<Map<String, Any?>> ->
            engine.setLibrary(songs.map { it.toLocalSong() })
        }

        // ── Feed ─────────────────────────────────────────────────────────────
        AsyncFunction("refresh") {
            engine.refresh().map { it.toMap() }
        }

        AsyncFunction("loadMore") {
            engine.loadMore().map { it.toMap() }
        }

        AsyncFunction("prefetch") {
            engine.prefetch().map { it.toMap() }
        }

        AsyncFunction("discoverSimilar") { songId: String ->
            engine.discoverSimilar(songId).map { it.toMap() }
        }

        Function("getFeed") {
            engine.feedSnapshot().map { it.toMap() }
        }

        Function("setCurrentIndex") { index: Int ->
            engine.setCurrentIndex(index)
        }

        Function("getCurrentIndex") {
            engine.currentIndexValue()
        }

        // ── Preferences ──────────────────────────────────────────────────────
        Function("getLanguages") {
            prefs.languageWeights().map { mapOf("language" to it.language, "weight" to it.weight) }
        }

        Function("setLanguages") { languages: List<String> ->
            prefs.setLanguages(languages)
        }

        Function("setLanguageWeight") { language: String, weight: Int ->
            prefs.setLanguageWeight(language, weight)
        }

        Function("recordInteraction") { payload: Map<String, Any?> ->
            // Scoring runs off the JS thread — a swipe should never wait on it.
            scope.launch { prefs.recordInteraction(payload.toInteraction()) }
        }

        Function("markSeen") { songId: String ->
            prefs.markSeen(songId)
        }

        Function("addMagicLike") { songId: String ->
            prefs.addMagicLike(songId)
        }

        Function("getTopArtists") { limit: Int ->
            prefs.topArtistNames(limit)
        }

        Function("clearPreferences") {
            prefs.clear()
        }
    }
}

private fun Map<String, Any?>.str(key: String): String = this[key]?.toString().orEmpty()

private fun Map<String, Any?>.int(key: String): Int? = when (val v = this[key]) {
    is Number -> v.toInt()
    is String -> v.toIntOrNull()
    else -> null
}

private fun Map<String, Any?>.dbl(key: String): Double = when (val v = this[key]) {
    is Number -> v.toDouble()
    is String -> v.toDoubleOrNull() ?: 0.0
    else -> 0.0
}

private fun Map<String, Any?>.bool(key: String): Boolean = when (val v = this[key]) {
    is Boolean -> v
    is Number -> v.toInt() != 0
    else -> false
}

private fun Map<String, Any?>.toLocalSong() = LocalSong(
    id = str("id"),
    title = str("title"),
    artist = str("artist"),
    coverImageUri = this["coverImageUri"]?.toString(),
    audioUri = this["audioUri"]?.toString(),
    duration = int("duration"),
    hasLyrics = bool("hasLyrics"),
)

private fun Map<String, Any?>.toInteraction() = LuvInteraction(
    songId = str("songId"),
    title = str("title"),
    artist = str("artist"),
    timestamp = (this["timestamp"] as? Number)?.toLong() ?: System.currentTimeMillis(),
    watchDuration = dbl("watchDuration"),
    totalDuration = dbl("totalDuration"),
    liked = bool("liked"),
    skipped = bool("skipped"),
)
