package com.lyricflow.app.luvs

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.withContext

/**
 * Kotlin port of LuvsRecommendationEngine plus luvsFeedStore.
 *
 * The feed list lives here rather than in JS so prefetching keeps running while the
 * JS thread is busy rendering. JS receives the list through the module and treats it
 * as read-only.
 */
class LuvsEngine(private val prefs: LuvsPrefs) {

    /** Library snapshot pushed from JS; used for local-file swapping and seeding. */
    private var library: List<LocalSong> = emptyList()
    private var libraryByKey: Map<String, LocalSong> = emptyMap()

    private val feed = mutableListOf<LuvSong>()
    private var currentIndex = 0

    @Synchronized
    fun setLibrary(songs: List<LocalSong>) {
        library = songs
        libraryByKey = songs.associateBy { it.matchKey }
        prefs.seedFromLibrary(songs)
    }

    @Synchronized
    fun feedSnapshot(): List<LuvSong> = feed.toList()

    @Synchronized
    fun currentIndexValue(): Int = currentIndex

    @Synchronized
    fun setCurrentIndex(index: Int) {
        currentIndex = index.coerceIn(0, maxOf(0, feed.size - 1))
    }

    // ── Query generation ─────────────────────────────────────────────────────

    /** Weighted random pick across languages the user still has switched on. */
    private fun selectLanguageByWeight(): String {
        val active = prefs.languageWeights().filter { it.weight > 0 }
        if (active.isEmpty()) return "English"
        val total = active.sumOf { it.weight }
        var roll = Math.random() * total
        for (item in active) {
            roll -= item.weight
            if (roll <= 0) return item.language
        }
        return active.first().language
    }

    private fun generateQueries(targetArtistCount: Int = 6): List<Pair<String, String>> {
        val skipped = prefs.skippedArtistNames().map { it.lowercase() }.toSet()

        val pool = (prefs.topArtistNames(20) + library.map { it.artist })
            .asSequence()
            .map { it.trim() }
            .filter { it.isNotEmpty() && !it.contains("Unknown", true) }
            .filter { !skipped.contains(it.lowercase()) }
            .distinct()
            .toList()

        if (pool.isEmpty()) {
            val modifiers = listOf("Trending", "Hit Songs", "Melody", "Love Songs", "Party Songs")
            return (0 until targetArtistCount).map {
                val lang = selectLanguageByWeight()
                "$lang ${modifiers.random()}" to lang
            }
        }

        val selected = pool.shuffled().take(targetArtistCount)
        val artistModifiers = listOf("songs", "hit songs", "melody songs", "best songs")
        val queries = selected.map { artist ->
            val lang = selectLanguageByWeight()
            // Language goes in the query text — the provider honours it far more
            // reliably than any filter parameter.
            "$artist $lang ${artistModifiers.random()}" to lang
        }.toMutableList()

        val filler = listOf("Trending", "Viral", "New")
        while (queries.size < targetArtistCount) {
            val lang = selectLanguageByWeight()
            queries.add("$lang ${filler.random()}" to lang)
        }
        return queries
    }

    // ── Feed building ────────────────────────────────────────────────────────

    /**
     * Runs the 6 artist-cluster queries concurrently, filters each, then interleaves
     * so the same artist never appears twice in a row.
     */
    suspend fun fetchPersonalizedFeed(): List<LuvSong> = withContext(Dispatchers.IO) {
        val queries = generateQueries(6)

        val perQuery = coroutineScope {
            queries.map { (query, _) ->
                async { deduplicate(filterSongs(SaavnClient.searchSongs(query))).take(5) }
            }.map { it.await() }
        }

        val mixtape = perQuery.flatten()
        val finalFeed = interleave(mixtape)
        finalFeed.forEach { prefs.markSeen(it.id) }
        finalFeed
    }

    suspend fun refresh(): List<LuvSong> {
        val songs = fetchPersonalizedFeed()
        synchronized(this) {
            feed.clear()
            feed.addAll(songs)
            currentIndex = 0
        }
        return songs
    }

    suspend fun loadMore(): List<LuvSong> {
        val songs = fetchPersonalizedFeed()
        synchronized(this) {
            val existing = feed.map { it.matchKey }.toHashSet()
            feed.addAll(songs.filter { existing.add(it.matchKey) })
        }
        return feedSnapshot()
    }

    /** Prefetch used on app start so the first swipe is instant. */
    suspend fun prefetch(): List<LuvSong> {
        if (synchronized(this) { feed.size } >= 5) return feedSnapshot()
        return refresh()
    }

    /**
     * Magic button: pull provider suggestions for a song and splice them in right
     * after the current card.
     */
    suspend fun discoverSimilar(songId: String): List<LuvSong> = withContext(Dispatchers.IO) {
        prefs.addMagicLike(songId)

        var recs = SaavnClient.suggestions(songId)
        val current = synchronized(this@LuvsEngine) { feed.getOrNull(currentIndex) }
        if (recs.size < 5 && current != null) {
            val lang = prefs.activeLanguages().firstOrNull().orEmpty()
            recs = recs + SaavnClient.searchSongs("${current.artist} $lang hits 2024").take(10)
        }

        val filtered = filterSongs(recs)
        val existing = synchronized(this@LuvsEngine) { feed.map { it.matchKey }.toHashSet() }
        val libraryKeys = libraryByKey.keys
        val fresh = filtered.filter { !existing.contains(it.matchKey) && !libraryKeys.contains(it.matchKey) }

        if (fresh.isEmpty()) return@withContext feedSnapshot()

        synchronized(this@LuvsEngine) {
            feed.addAll((currentIndex + 1).coerceAtMost(feed.size), fresh.take(8))
        }
        feedSnapshot()
    }

    // ── Filtering ────────────────────────────────────────────────────────────

    private val devotionalKeywords = listOf(
        "devotional", "bhakti", "bhajan", "aarti", "mantra", "chant",
        "gospel", "spirit", "prayer", "krishna", "ram", "hanuman",
        "ganesh", "shiva", "durga", "amritwani", "chalisa", "kirtan",
        "stotram", "sahib", "waheguru", "jesus", "allah", "katha", "satsang",
    )

    private val unwantedKeywords = listOf(
        "hardstyle", "sped up", "slowed", "reverb", "bass boosted",
        "mashup", "8d audio", "nightcore", "daycore", "lofi flip",
    )

    /**
     * Swaps in the local copy when the user already owns the track, then drops
     * anything seen, skipped, devotional, remixed, or outside the language selection.
     */
    private fun filterSongs(songs: List<LuvSong>): List<LuvSong> {
        val skippedArtists = prefs.skippedArtistNames().map { it.lowercase() }.toSet()
        val restricted = prefs.isLanguageRestricted()
        val weights = prefs.languageWeights().associateBy { it.language.lowercase() }

        return songs.map { song ->
            libraryByKey[song.matchKey]?.let { local ->
                LuvSong(
                    id = local.id,
                    title = local.title,
                    artist = local.artist.ifEmpty { "Unknown Artist" },
                    highResArt = local.coverImageUri ?: song.highResArt,
                    downloadUrl = local.audioUri.orEmpty(),
                    hasLyrics = local.hasLyrics,
                    source = "Local",
                    duration = local.duration,
                    language = song.language,
                    isLocal = true,
                    isAuthentic = true,
                )
            } ?: song
        }.filter { song ->
            if (song.downloadUrl.isEmpty()) return@filter false
            if (prefs.isSeen(song.id)) return@filter false

            val artist = song.artist.lowercase().trim()
            if (artist.isNotEmpty() && skippedArtists.contains(artist)) return@filter false

            val title = song.title.lowercase()
            if (devotionalKeywords.any { title.contains(it) || artist.contains(it) }) return@filter false
            if (unwantedKeywords.any { title.contains(it) || artist.contains(it) }) return@filter false

            val lang = song.language?.lowercase()?.trim().orEmpty()
            if (lang.isEmpty()) return@filter !restricted
            if (restricted) {
                val pref = weights[lang]
                if (pref == null || pref.weight == 0) return@filter false
            }
            true
        }
    }

    private fun deduplicate(songs: List<LuvSong>): List<LuvSong> {
        val seen = HashSet<String>()
        return songs.filter { seen.add(it.matchKey) }
    }

    /** Round-robins artists so consecutive cards are never the same artist. */
    private fun interleave(songs: List<LuvSong>): List<LuvSong> {
        val groups = LinkedHashMap<String, MutableList<LuvSong>>()
        songs.forEach { song ->
            val artist = song.artist.split('&', ',').first().trim().lowercase()
            val bucket = groups.getOrPut(artist) { mutableListOf() }
            if (bucket.size >= 5) return@forEach // "each artist 5 songs"
            bucket.add(song)
        }

        val order = groups.keys.shuffled()
        val out = mutableListOf<LuvSong>()
        var depth = 0
        while (true) {
            var added = false
            order.forEach { artist ->
                groups[artist]?.getOrNull(depth)?.let { out.add(it); added = true }
            }
            if (!added) break
            depth++
        }
        return out
    }
}
