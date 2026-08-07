package com.lyricflow.app.luvs

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

/**
 * Kotlin port of luvsPreferencesStore. Owns interaction history, derived artist
 * scores and language weights, persisted to SharedPreferences.
 *
 * Deliberately not a Zustand mirror: JS reads these through the module so there is
 * a single writer. The settings UI still edits languages, but via setLanguages().
 */
class LuvsPrefs(context: Context) {

    private val store = context.getSharedPreferences("luvs_prefs", Context.MODE_PRIVATE)

    private val interactions = mutableListOf<LuvInteraction>()
    private val seenSongIds = LinkedHashSet<String>()
    private var skippedArtists = listOf<String>()
    private var topArtists = listOf<ArtistScore>()

    private var languages: MutableList<LanguagePreference> = DEFAULT_LANGUAGES.toMutableList()

    init {
        load()
    }

    // ── Reads ────────────────────────────────────────────────────────────────

    @Synchronized
    fun languageWeights(): List<LanguagePreference> = languages.toList()

    @Synchronized
    fun activeLanguages(): List<String> = languages.filter { it.weight > 0 }.map { it.language }

    /** True when any language is zeroed out, which turns on strict language filtering. */
    @Synchronized
    fun isLanguageRestricted(): Boolean = languages.any { it.weight == 0 }

    @Synchronized
    fun topArtistNames(limit: Int = 5): List<String> =
        topArtists.filter { it.score > 0 }.take(limit).map { it.artist }

    @Synchronized
    fun skippedArtistNames(): List<String> = skippedArtists.toList()

    @Synchronized
    fun isSeen(songId: String): Boolean = seenSongIds.contains(songId)

    // ── Writes ───────────────────────────────────────────────────────────────

    @Synchronized
    fun setLanguages(selected: List<String>) {
        val wanted = selected.map { it.lowercase() }.toSet()
        languages = languages
            .map { LanguagePreference(it.language, if (wanted.contains(it.language.lowercase())) 50 else 0) }
            .toMutableList()
        save()
    }

    @Synchronized
    fun recordInteraction(interaction: LuvInteraction) {
        interactions.add(interaction)
        // Same bound as the JS store: keep the window recent so scores stay responsive.
        while (interactions.size > MAX_INTERACTIONS) interactions.removeAt(0)
        analyze()
        save()
    }

    @Synchronized
    fun markSeen(songId: String) {
        if (songId.isEmpty()) return
        seenSongIds.add(songId)
        while (seenSongIds.size > MAX_SEEN) {
            seenSongIds.remove(seenSongIds.first())
        }
    }

    /**
     * Seeds artist preferences from the user's library. Downloading a song is treated
     * as a like, which is what makes the very first feed personalised.
     */
    @Synchronized
    fun seedFromLibrary(library: List<LocalSong>) {
        if (library.isEmpty() || topArtistNames(5).isNotEmpty()) return
        val now = System.currentTimeMillis()
        library.forEach { song ->
            if (song.artist.isBlank() || song.artist.contains("Unknown", true)) return@forEach
            interactions.add(
                LuvInteraction(
                    songId = song.id,
                    title = song.title,
                    artist = song.artist,
                    timestamp = now,
                    watchDuration = 30.0,
                    totalDuration = (song.duration ?: 180).toDouble(),
                    liked = true,
                    skipped = false,
                )
            )
        }
        while (interactions.size > MAX_INTERACTIONS) interactions.removeAt(0)
        analyze()
        save()
    }

    // ── Scoring ──────────────────────────────────────────────────────────────

    /**
     * Recency-weighted artist scoring, matching the JS implementation: likes add,
     * skips subtract, and partial plays contribute proportional engagement.
     */
    @Synchronized
    fun analyze() {
        if (interactions.isEmpty()) return

        data class Acc(var totalScore: Double = 0.0, var count: Int = 0, var skips: Int = 0)
        val byArtist = mutableMapOf<String, Acc>()

        interactions.forEachIndexed { index, it ->
            val artist = it.artist.lowercase().trim()
            if (artist.isEmpty() || artist == "unknown artist") return@forEachIndexed

            val recency = 1.0 + (index.toDouble() / interactions.size)
            var score = 0.0
            if (it.liked) score += 50 * recency
            if (it.skipped) {
                score -= 30 * recency
            } else {
                val engagement =
                    if (it.totalDuration > 0) (it.watchDuration / it.totalDuration) * 100 else 0.0
                score += (engagement / 100) * 30 * recency
            }

            val acc = byArtist.getOrPut(artist) { Acc() }
            acc.totalScore += score
            acc.count += 1
            if (it.skipped) acc.skips += 1
        }

        val scores = mutableListOf<ArtistScore>()
        val skipped = mutableListOf<String>()
        byArtist.forEach { (artist, acc) ->
            scores.add(ArtistScore(artist, acc.totalScore / acc.count, acc.count))
            if (acc.count >= 2 && acc.skips.toDouble() / acc.count > 0.6) skipped.add(artist)
        }

        topArtists = scores.sortedByDescending { it.score }.take(20)
        skippedArtists = skipped
    }

    // ── Persistence ──────────────────────────────────────────────────────────

    private fun save() {
        val payload = JSONObject().apply {
            put("interactions", JSONArray().also { arr -> interactions.forEach { arr.put(it.toJson()) } })
            put("seenSongIds", JSONArray().also { arr -> seenSongIds.forEach { arr.put(it) } })
            put("languages", JSONArray().also { arr ->
                languages.forEach { arr.put(JSONObject().put("language", it.language).put("weight", it.weight)) }
            })
        }
        store.edit().putString(KEY, payload.toString()).apply()
    }

    private fun load() {
        val raw = store.getString(KEY, null) ?: return
        val json = runCatching { JSONObject(raw) }.getOrNull() ?: return

        json.optJSONArray("interactions")?.objects()
            ?.forEach { interactions.add(LuvInteraction.fromJson(it)) }
        json.optJSONArray("seenSongIds")?.strings()?.let { seenSongIds.addAll(it) }

        json.optJSONArray("languages")?.objects()?.takeIf { it.isNotEmpty() }?.let { saved ->
            val restored = saved.map { LanguagePreference(it.optString("language"), it.optInt("weight")) }
            // Keep any language added to DEFAULT_LANGUAGES after this payload was written.
            val known = restored.map { it.language.lowercase() }.toSet()
            languages = (restored + DEFAULT_LANGUAGES.filter { !known.contains(it.language.lowercase()) })
                .toMutableList()
        }

        analyze()
    }

    companion object {
        private const val KEY = "luvs_prefs_v1"
        private const val MAX_INTERACTIONS = 500
        private const val MAX_SEEN = 2000

        val DEFAULT_LANGUAGES = listOf(
            LanguagePreference("English", 50),
            LanguagePreference("Hindi", 50),
            LanguagePreference("Tamil", 0),
            LanguagePreference("Telugu", 0),
            LanguagePreference("Punjabi", 0),
            LanguagePreference("Korean", 0),
            LanguagePreference("Kannada", 0),
            LanguagePreference("Malayalam", 0),
            LanguagePreference("Bengali", 0),
            LanguagePreference("Marathi", 0),
        )
    }
}
