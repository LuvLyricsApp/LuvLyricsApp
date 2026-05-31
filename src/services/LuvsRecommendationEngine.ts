/**
 * Luvs Recommendation Engine
 * Uses ONLY Saavn + Gaana APIs
 * Seeds from user's existing song library for instant personalization
 * Generates personalized search queries based on user's artists & genres
 */

import { UnifiedSong, Song } from '../types/song';
import { useLuvsPreferencesStore, LanguagePreference } from '../store/luvsPreferencesStore';
import { useSongsStore } from '../store/songsStore';
import { MultiSourceSearchService } from './MultiSourceSearchService';
import { handleAsyncError } from '../utils/errorHandler';

interface GeneratedQuery {
  query: string;
  language: string;
}

// Trending/discovery queries - Removed as we now generate on the fly

class LuvsRecommendationEngine {
  private seededFromLibrary = false;

  /**
   * Seed preferences from user's existing song library
   * This is the KEY to instant personalization!
   */
  seedFromLibrary() {
    const songsStore = useSongsStore.getState();
    const prefsStore = useLuvsPreferencesStore.getState();
    const songs = songsStore.songs;

    if (songs.length === 0) {
      if (__DEV__) console.log('[LuvsRecoEngine] No songs in library, skipping seed');
      this.seededFromLibrary = true;
      return;
    }

    // Check if we need to re-seed: library has more songs than seeded interactions
    // This handles the case where old vault data was seeded but library wasn't
    // const librarySongCount = songs.filter(s => s.artist && s.artist !== 'Unknown Artist').length;
    
    // Check if we have analyzed preferences yet
    const topArtists = prefsStore.getTopArtistNames(5);
    if (this.seededFromLibrary && topArtists.length > 0) {
        return;
    }

    if (__DEV__) console.log(`[LuvsRecoEngine] 🌱 Seeding from ${songs.length} library songs...`);

    // Record each song as a "liked" interaction to build artist preferences
    // We do this efficiently by batch updating if possible, or just strict loop
    songs.forEach(song => {
      if (song.artist && song.artist !== 'Unknown Artist' && !song.artist.includes('Unknown')) {
        // Only record if not already recorded? 
        // Actually, store doesn't prevent dupes, so we should be careful.
        // For now, let's assume if it's in library, it's a strong signal.
        prefsStore.recordInteraction({
          songId: song.id,
          title: song.title,
          artist: song.artist,
          timestamp: Date.now(),
          watchDuration: 30,
          totalDuration: song.duration || 180,
          liked: true, // User downloaded = they liked it
          skipped: false,
        });
      }
    });
    
    // Force immediate analysis to populate topArtists
    prefsStore.analyzePreferences();

    this.seededFromLibrary = true;
    if (__DEV__) console.log('[LuvsRecoEngine] ✅ Seeded preferences from library!');
    if (__DEV__) console.log('[LuvsRecoEngine] Top artists derived:', prefsStore.getTopArtistNames(10));
  }

  /**
   * Select a language based on user weights
   */
  private selectLanguageByWeight(weights: LanguagePreference[]): string {
    const active = weights.filter(w => w.weight > 0);
    if (active.length === 0) return 'English';

    const totalWeight = active.reduce((sum, curr) => sum + curr.weight, 0);
    const roll = Math.random() * totalWeight;

    let cumulative = 0;
    for (const item of active) {
      cumulative += item.weight;
      if (roll <= cumulative) return item.language;
    }

    return active[0].language;
  }

  /**
   * Generate personalized search queries based on "Artist Cluster" strategy
   * User Request: "Pick any 6 artists and each artist 5 songs"
   */
  generateQueries(targetArtistCount: number = 6): GeneratedQuery[] {
    // Seed from library first!
    this.seedFromLibrary();

    const songsStore = useSongsStore.getState();
    const prefsStore = useLuvsPreferencesStore.getState();
    const languageWeights = prefsStore.getLanguageWeights();
    if (__DEV__) console.log('[LuvsReco] 📊 Current Language Weights:', languageWeights.filter(w => w.weight > 0).map(w => `${w.language}: ${w.weight}%`));
    
    // 1. Get Top Artists (Explicitly Liked / Watched)
    const topArtists = prefsStore.getTopArtistNames(20);
    
    // 2. Get Dictionary of Library Artists (Implicit Interest)
    const libraryArtists = Array.from(new Set(
        songsStore.songs
            .map(s => s.artist)
            .filter(a => a && a !== 'Unknown Artist' && !a.includes('Unknown'))
            .map(a => a!.trim())
    ));

    // 3. Create Candidate Pool
    const skippedArtists = new Set(prefsStore.getSkippedArtistNames().map(a => a.toLowerCase()));
    const cleanPool = [...topArtists, ...libraryArtists].filter(a => !skippedArtists.has(a.toLowerCase()));
    const uniquePool = Array.from(new Set(cleanPool));
    
    if (__DEV__) console.log(`[LuvsRecoEngine] 🎱 Candidate Artist Pool Size: ${uniquePool.length}`);

    if (uniquePool.length === 0) {
        // Fallback to trending if no library/history data
        if (__DEV__) console.log('[LuvsRecoEngine] ⚠️ No personalized artists found. Using Language Trending fallback.');
        const fallbackQueries: GeneratedQuery[] = [];
        // const activeLanguages = languageWeights.filter(w => w.weight > 0);
        
        const modifiers = ['Trending', 'Hit Songs', 'Melody', 'Love Songs', 'Party Songs'];
        
        while(fallbackQueries.length < targetArtistCount) {
            const selectedLang = this.selectLanguageByWeight(languageWeights);
            const mod = modifiers[Math.floor(Math.random() * modifiers.length)];
            fallbackQueries.push({ 
                query: `${selectedLang} ${mod}`,
                language: selectedLang
            });
        }
        return fallbackQueries;
    }

    // 4. Shuffle and Pick Artists
    const shuffledArtists = uniquePool.sort(() => Math.random() - 0.5);
    const selectedArtists = shuffledArtists.slice(0, targetArtistCount); 
    
    const generatedQueries: GeneratedQuery[] = [];

    selectedArtists.forEach(artist => {
        const selectedLang = this.selectLanguageByWeight(languageWeights);
        const modifiers = ['songs', 'hit songs', 'melody songs', 'best songs'];
        const mod = modifiers[Math.floor(Math.random() * modifiers.length)];
        
        // CRITICAL: Include the language in the query to force the API to respect it
        const query = `${artist} ${selectedLang} ${mod}`;

        generatedQueries.push({ 
            query, 
            language: selectedLang 
        });
    });

     while(generatedQueries.length < targetArtistCount) {
          const selectedLang = this.selectLanguageByWeight(languageWeights);
          const mod = ['Trending', 'Viral', 'New'].sort(() => Math.random() - 0.5)[0];
          generatedQueries.push({
              query: `${selectedLang} ${mod}`,
              language: selectedLang
          });
     }

    if (__DEV__) console.log(`[LuvsReco] 🎨 Generated ${generatedQueries.length} Personalized Queries:`, generatedQueries.map(q => `${q.query} (${q.language})`));
    return generatedQueries;
  }

  /**
   * Search using ONLY Saavn (Gaana is disabled)
   */
  private async searchSaavnOnly(query: string, _language?: string): Promise<UnifiedSong[]> {
    const results: UnifiedSong[] = [];

    try {
      // Search Saavn
      const saavnResults = await MultiSourceSearchService.searchSaavn(query).catch(e => {
        handleAsyncError('LuvsRecommendationEngine.searchSaavn', e);
        return [] as UnifiedSong[];
      });
      results.push(...saavnResults);
    } catch (error) {
      handleAsyncError('LuvsRecommendationEngine.searchSaavnOnly', error);
    }

    return results;
  }

  /**
   * Strictly groups songs by artist and interleaves them.
   * Prevents seeing same artist twice in a row.
   */
  private interleaveResults(songs: UnifiedSong[]): UnifiedSong[] {
    const artistGroups: Record<string, UnifiedSong[]> = {};
    const artistCount: Record<string, number> = {};
    
    songs.forEach(s => {
      const a = (s.artist || 'Unknown').split(/[&,]/)[0].trim().toLowerCase();
      if ((artistCount[a] || 0) >= 5) return; // Respect "each artist 5 songs" rule
      
      if (!artistGroups[a]) artistGroups[a] = [];
      artistGroups[a].push(s);
      artistCount[a] = (artistCount[a] || 0) + 1;
    });

    const interleaved: UnifiedSong[] = [];
    const artists = Object.keys(artistGroups).sort(() => Math.random() - 0.5);
    let hasMore = true;
    let depth = 0;

    while (hasMore) {
      hasMore = false;
      artists.forEach(a => {
        if (artistGroups[a][depth]) {
          interleaved.push(artistGroups[a][depth]);
          hasMore = true;
        }
      });
      depth++;
    }
    return interleaved;
  }

  /**
   * Fetch personalized feed - THE MIXTAPE GENERATOR
   */
  async fetchPersonalizedFeed(_totalLimit: number = 30): Promise<UnifiedSong[]> {
    // 1. Get 6 weighted queries
    const weightedQueries = this.generateQueries(6);
    const mixtape: UnifiedSong[] = [];

    // 2. Fetch songs for EACH query
    // We run these in parallel for speed, effectively fetching 6 "mini-feeds"
    const resultsPromises = weightedQueries.map(async (item) => {
        const rawSongs = await this.searchSaavnOnly(item.query, item.language);
        const filtered = this.filterSongs(rawSongs);
        const deduped = this.deduplicate(filtered);
        
        // "each artist 5 songs" rule
        // We take the top 5 most relevant (or just first 5 nicely shuffled)
        return deduped.slice(0, 5);
    });

    const itemsPerArtist = await Promise.all(resultsPromises);
    
    // 3. Flatten into one list
    itemsPerArtist.forEach(songs => mixtape.push(...songs));

    if (__DEV__) console.log(`[LuvsRecoEngine] 💿 Mixtape Generated: ${mixtape.length} songs from ${weightedQueries.length} artists`);

    // 4. Interleave and Shuffle segments for maximum variety
    const finalFeed = this.interleaveResults(mixtape);

    // Mark as seen
    const prefsStore = useLuvsPreferencesStore.getState();
    finalFeed.forEach(s => prefsStore.markSeen(s.id));

    return finalFeed;
  }

  /**
   * Load more songs for infinite scroll
   * Just does the same thing again - grabs another cluster of 6 artists
   */
  async loadMoreSongs(count: number = 20): Promise<UnifiedSong[]> {
    return this.fetchPersonalizedFeed(count);
  }

  /**
   * Identical to fetchPersonalizedFeed but named for compatibility
   */
  async refreshRecommendation(): Promise<UnifiedSong[]> {
      const { setFeedSongs, setCurrentIndex } = (await import('../store/luvsFeedStore')).useLuvsFeedStore.getState();
      setCurrentIndex(0);
      const songs = await this.fetchPersonalizedFeed(30);
      setFeedSongs(songs);
      return songs;
  }

  /**
   * Prefetch initial songs for instant playback
   */
  async prefetch() {
      const { setFeedSongs, feedSongs } = (await import('../store/luvsFeedStore')).useLuvsFeedStore.getState();
      if (feedSongs.length >= 5) return;
      const songs = await this.fetchPersonalizedFeed(10);
      setFeedSongs(songs);
  }

  /**
   * discoverSimilar (Magic Button)
   * Ported and hardened from old RecommendationService
   */
  async discoverSimilar(songId: string) {
    const { feedSongs, setFeedSongs, currentIndex } = (await import('../store/luvsFeedStore')).useLuvsFeedStore.getState();
    const { addMagicLike, getLanguageWeights } = (await import('../store/luvsPreferencesStore')).useLuvsPreferencesStore.getState();
    const librarySongs = (await import('../store/songsStore')).useSongsStore.getState().songs;
    const currentSong = feedSongs[currentIndex];

    try {
      addMagicLike(songId);
      
      let recs = await MultiSourceSearchService.getRecommendations(songId);
      
      if (currentSong && (recs.length < 5)) {
        const langPref = getLanguageWeights().find(w => w.weight > 0)?.language || '';
        const searchResults = await MultiSourceSearchService.searchSaavn(`${currentSong.artist} ${langPref} hits 2024`);
        recs = [...recs, ...searchResults.slice(0, 10)];
      }

      const filtered = this.filterSongs(recs);
      const existingKeys = new Set(feedSongs.map(s => `${s.title}|${s.artist}`.toLowerCase().replace(/\s+/g, '')));
      const libraryKeys = new Set(librarySongs.map(s => `${s.title}|${s.artist}`.toLowerCase().replace(/\s+/g, '')));
      
      const finalRecs = filtered.filter(s => {
        const key = `${s.title}|${s.artist}`.toLowerCase().replace(/\s+/g, '');
        return !existingKeys.has(key) && !libraryKeys.has(key);
      });

      if (finalRecs.length === 0) return;

      const toInject = finalRecs.slice(0, 8);
      const newFeed = [...feedSongs];
      newFeed.splice(currentIndex + 1, 0, ...toInject);
      setFeedSongs(newFeed);
      if (__DEV__) console.log(`[LuvsReco] 🪄 Injected ${toInject.length} similar songs.`);
    } catch (error) {
      handleAsyncError('LuvsRecommendationEngine.discoverSimilar', error);
    }
  }

  /**
   * Filter and Enrich songs
   * 1. Swaps in LOCAL songs if they exist (Prioritize Offline)
   * 2. Filters out seen/skipped songs
   */
  private filterSongs(songs: UnifiedSong[]): UnifiedSong[] {
    const prefsStore = useLuvsPreferencesStore.getState();
    const songsStore = useSongsStore.getState();

    // Map for fast lookups: "title_artist" -> Local Song
    const localSongMap = new Map<string, Song>();
    songsStore.songs.forEach(s => {
        const key = `${s.title?.toLowerCase().trim()}_${s.artist?.toLowerCase().trim()}`;
        localSongMap.set(key, s);
    });

    const skippedArtists = new Set(
      prefsStore.getSkippedArtistNames().map(a => a.toLowerCase())
    );

    const devotionalKeywords = [
        'devotional', 'bhakti', 'bhajan', 'aarti', 'mantra', 'chant', 
        'gospel', 'spirit', 'prayer', 'krishna', 'ram', 'hanuman', 
        'ganesh', 'shiva', 'durga', 'amritwani', 'chalisa', 'kirtan', 
        'stotram', 'sahib', 'waheguru', 'jesus', 'allah', 'katha', 'satsang'
    ];

    return songs.map(song => {
      // 1. Check if we have a local version
      const key = `${song.title?.toLowerCase().trim()}_${song.artist?.toLowerCase().trim()}`;
      const localMatch = localSongMap.get(key);

      if (localMatch) {
          if (__DEV__) console.log(`[Luvs] 🏠 Found local match for ${song.title}, swapping!`);
          // Convert Local Song to UnifiedSong
          return {
              id: localMatch.id,
              title: localMatch.title,
              artist: localMatch.artist || 'Unknown Artist',
              highResArt: localMatch.coverImageUri || song.highResArt || '', // Use local art or fallback
              downloadUrl: localMatch.audioUri || '',
              source: 'Local',
              duration: localMatch.duration,
              hasLyrics: localMatch.lyrics?.length > 0,
              isLocal: true,
              isAuthentic: true
          } as UnifiedSong;
      }
      return song;
    }).filter(song => {
      // 2. Filter invalid or unwanted songs
      if (!song.downloadUrl) return false;

      // Filter seen songs (Enable this if you want to hide seen, but maybe not for local songs?)
      // User might want to re-watch local reels? Let's keep filter for now to keep feed fresh.
      if (prefsStore.isSeen(song.id)) return false;

      // Filter skipped artists
      const artistLower = song.artist?.toLowerCase()?.trim();
      if (artistLower && skippedArtists.has(artistLower)) return false;

      // 3. Filter Devotional Content
      const titleLower = song.title?.toLowerCase() || '';
      // const albumLower = song.album?.toLowerCase() || ''; // UnifiedSong might not have album
      const isDevotional = devotionalKeywords.some(keyword => 
          titleLower.includes(keyword) || artistLower?.includes(keyword)
      );
      
      if (isDevotional) {
          if (__DEV__) console.log(`[Luvs] 🕊️ Filtered devotional content: ${song.title}`);
          return false;
      }

      // 4. Filter Unwanted Edits (Hardstyle, Sped Up, etc.)
      // User Request: "HARDSTYLE, SPED UP and all coming"
      const unwantedKeywords = [
          'hardstyle', 'sped up', 'slowed', 'reverb', 'bass boosted', 
          'mashup', '8d audio', 'nightcore', 'daycore', 'lofi flip'
      ];
      
      const isUnwanted = unwantedKeywords.some(keyword => 
          titleLower.includes(keyword) || artistLower?.includes(keyword)
      );

      if (isUnwanted) {
          if (__DEV__) console.log(`[Luvs] 🚫 Filtered unwanted edit: ${song.title}`);
          return false;
      }

      // 5. Filter by Language Weight (Hyper-Strict Enforcement)
      const languageWeights = prefsStore.getLanguageWeights();
      // A set is restricted if any language has 0% weight
      const isLanguageRestricted = languageWeights.some(w => w.weight === 0);
      const songLang = (song.language || '').toLowerCase().trim();
      
      // If song has NO language property, and we have restrictions, we MUST be cautious.
      if (!songLang) {
          if (isLanguageRestricted) {
              console.log(`[Luvs] 🚫 Filtered song with MISSING language (Restriction Active): ${song.title}`);
              return false;
          }
          return true;
      }

      // Find the weight for this song's language
      const langPref = languageWeights.find(w => w.language.toLowerCase() === songLang);
      
      // BLOCK if weight is explicitly 0 or language not found in a restricted set
      if (isLanguageRestricted) {
          if (!langPref || langPref.weight === 0) {
              console.log(`[Luvs] 🌍 Filtered forbidden/unknown language (${song.language || 'none'}): ${song.title}`);
              return false;
          }
      }

      if (__DEV__) console.log(`[Luvs] ✅ PASSED Filter: ${song.title} (${song.language || 'no-lang'}) | Weight: ${langPref?.weight}%`);
      return true;
    });
  }

  /**
   * Score songs by how well they match user preferences
   */
  private scoreAndRank(songs: UnifiedSong[]): UnifiedSong[] {
    const prefsStore = useLuvsPreferencesStore.getState();
    const topArtists = prefsStore.getTopArtistNames(10);
    const topArtistSet = new Set(topArtists.map(a => a.toLowerCase()));
    const languageWeights = prefsStore.getLanguageWeights();

    // Build language weight map for fast lookup
    const langWeightMap = new Map<string, number>();
    languageWeights.forEach(lw => {
      if (lw.weight > 0) langWeightMap.set(lw.language.toLowerCase(), lw.weight);
    });

    const scored = songs.map(song => {
      let score = 0;
      const artistLower = song.artist?.toLowerCase()?.trim();

      // Artist match = BIG bonus
      if (artistLower && topArtistSet.has(artistLower)) {
        score += 50;
      }

      // Language match = bonus proportional to user's weight preference
      if (song.language) {
        const langWeight = langWeightMap.get(song.language.toLowerCase());
        if (langWeight) {
          score += (langWeight / 100) * 25; // Up to 25 pts for 100% weight
        }
      }

      // Has cover art
      if (song.highResArt) score += 10;

      // Has duration
      if (song.duration && song.duration > 30) score += 5;

      return { song, score };
    });

    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return Math.random() - 0.5;
    });

    return scored.map(s => s.song);
  }

  /**
   * Deduplicate by title+artist
   */
  private deduplicate(songs: UnifiedSong[]): UnifiedSong[] {
    const seen = new Set<string>();
    return songs.filter(song => {
      const key = `${song.title?.toLowerCase().trim()}_${song.artist?.toLowerCase().trim()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
}

export const luvsRecommendationEngine = new LuvsRecommendationEngine();
