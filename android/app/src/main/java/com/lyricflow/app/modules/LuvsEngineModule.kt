package com.lyricflow.app.modules

import com.lyricflow.app.luvs.LocalSong
import com.lyricflow.app.luvs.LuvInteraction
import com.lyricflow.app.luvs.LuvsEngine
import com.lyricflow.app.luvs.LuvsPrefs
import com.lyricflow.app.luvs.SaavnClient
import expo.modules.kotlin.Promise
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
        val context = requireNotNull(appContext.reactContext) { "No React context for LuvsPrefs" }
        SaavnClient.initCache(context.cacheDir)
        LuvsPrefs(context)
    }
    private val engine: LuvsEngine by lazy { LuvsEngine(prefs) }

    /** Launch a suspend feed call and resolve/reject the Expo promise. */
    private fun <T> resolveSuspend(promise: Promise, code: String, block: suspend () -> T) {
        scope.launch {
            try {
                promise.resolve(block())
            } catch (e: Throwable) {
                promise.reject(code, e.message, e)
            }
        }
    }

    override fun definition() = ModuleDefinition {
        Name("LuvsEngine")

        OnDestroy { scope.cancel() }

        // ── Library handoff ──────────────────────────────────────────────────
        // The song library lives in expo-sqlite on the JS side; pushing a snapshot
        // avoids coupling this module to that database's on-disk layout.
        Function("setLibrary") { songs: List<Map<String, Any?>> ->
            engine.setLibrary(songs.map { it.toLocalSong() })
        }

        // ── Feed ─────────────────────────────────────────────────────────────
        // Zero-arg Expo Coroutine { } is overload-ambiguous on Kotlin 2.x, so
        // we resolve suspend engine calls via Promise + scope.launch instead.
        AsyncFunction("refresh") { promise: Promise ->
            resolveSuspend(promise, "E_LUVS_REFRESH") {
                engine.refresh().map { it.toMap() }
            }
        }

        AsyncFunction("loadMore") { promise: Promise ->
            resolveSuspend(promise, "E_LUVS_LOAD_MORE") {
                engine.loadMore().map { it.toMap() }
            }
        }

        AsyncFunction("prefetch") { promise: Promise ->
            resolveSuspend(promise, "E_LUVS_PREFETCH") {
                engine.prefetch().map { it.toMap() }
            }
        }

        AsyncFunction("discoverSimilar") { songId: String, promise: Promise ->
            resolveSuspend(promise, "E_LUVS_DISCOVER") {
                engine.discoverSimilar(songId).map { it.toMap() }
            }
        }

        Function("setCurrentIndex") { index: Int ->
            engine.setCurrentIndex(index)
        }

        // ── Preferences ──────────────────────────────────────────────────────
        Function("setLanguages") { languages: List<String> ->
            prefs.setLanguages(languages)
        }

        Function("recordInteraction") { payload: Map<String, Any?> ->
            // Scoring runs off the JS thread — a swipe should never wait on it.
            scope.launch { prefs.recordInteraction(payload.toInteraction()) }
        }

        Function("markSeen") { songId: String ->
            prefs.markSeen(songId)
        }

        // Swipes defer ranking and persistence; this forces them out so nothing is
        // lost when the user leaves Luvs or the process is killed.
        Function("flush") {
            prefs.flush()
        }

        // Backgrounding is the last reliable moment before the process can be killed.
        OnActivityEntersBackground { prefs.flush() }
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
