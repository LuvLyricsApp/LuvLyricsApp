/**
 * Luvs Preferences Store
 * Tracks user behavior: likes, skips, watch time, genre/artist preferences
 * Persisted to AsyncStorage for cross-session learning
 */

import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

const PREFS_KEY = '@reels_preferences'; // Keep for data
const MAX_HISTORY = 100;
const MAX_SEEN = 200;

export interface LuvInteraction {
  songId: string;
  title: string;
  artist: string;
  timestamp: number;
  watchDuration: number; // seconds watched
  totalDuration: number; // total song length
  liked: boolean;
  skipped: boolean; // < 3 seconds = skip
}

interface ArtistScore {
  artist: string;
  score: number;
  interactions: number;
}

export type LuvLanguage = 'English' | 'Hindi' | 'Tamil' | 'Telugu' | 'Punjabi' | 'Korean' | 'Kannada' | 'Malayalam' | 'Bengali' | 'Marathi';

export interface LanguagePreference {
    language: LuvLanguage;
    weight: number; // 0-100 percentage
}

interface LuvsPreferencesState {
  // Tracking data
  interactions: LuvInteraction[];
  seenSongIds: string[];      // Songs already shown in feed
  skippedArtists: string[];   // Artists user skips often
  preferredLanguages: LanguagePreference[]; // User's preferred music languages with weights
  explicitLikes: string[];    // IDs of songs where user clicked "Magic"
  luvsLanguages: string[];   // Active languages (weight > 0)
  
  // Derived preferences
  topArtists: ArtistScore[];
  
  // Actions
  recordInteraction: (interaction: LuvInteraction) => void;
  markSeen: (songId: string) => void;
  isSeen: (songId: string) => boolean;
  addMagicLike: (songId: string) => void;
  analyzePreferences: () => void;
  getTopArtistNames: (limit?: number) => string[];
  getSkippedArtistNames: () => string[];
  
  // Language Actions
  updateLanguageWeight: (language: LuvLanguage, weight: number) => void;
  setPreferredLanguages: (languages: LuvLanguage[]) => void;
  getLanguageWeights: () => LanguagePreference[];
  
  clearPreferences: () => void;
  loadFromStorage: () => Promise<void>;
  saveToStorage: () => Promise<void>;
}

export const useLuvsPreferencesStore = create<LuvsPreferencesState>((set, get) => ({
  interactions: [],
  seenSongIds: [],
  skippedArtists: [],
  topArtists: [],
  explicitLikes: [],
  luvsLanguages: ['English', 'Hindi'],
  // Default: mix of English and Hindi
  preferredLanguages: [
      { language: 'English', weight: 50 },
      { language: 'Hindi', weight: 50 },
      { language: 'Tamil', weight: 0 },
      { language: 'Telugu', weight: 0 },
      { language: 'Punjabi', weight: 0 },
      { language: 'Korean', weight: 0 },
      { language: 'Kannada', weight: 0 },
      { language: 'Malayalam', weight: 0 },
      { language: 'Bengali', weight: 0 },
      { language: 'Marathi', weight: 0 }
  ],

  recordInteraction: (interaction: LuvInteraction) => {
    set((state) => {
      // Add to history, cap at MAX_HISTORY
      const newInteractions = [...state.interactions, interaction].slice(-MAX_HISTORY);
      
      return { interactions: newInteractions };
    });

    // Re-analyze after recording
    get().analyzePreferences();
    
    // Persist
    get().saveToStorage();
  },

  markSeen: (songId: string) => {
    set((state) => {
      if (state.seenSongIds.includes(songId)) return state;
      const newSeen = [...state.seenSongIds, songId].slice(-MAX_SEEN);
      return { seenSongIds: newSeen };
    });
  },

  isSeen: (songId: string) => {
    return get().seenSongIds.includes(songId);
  },

  addMagicLike: (songId: string) => {
    set(state => {
      if (state.explicitLikes.includes(songId)) return state;
      const newMagic = [...state.explicitLikes, songId].slice(-30);
      return { explicitLikes: newMagic };
    });
    get().saveToStorage();
  },
  
  analyzePreferences: () => {
    const { interactions } = get();
    if (interactions.length === 0) return;

    // --- Artist Score Analysis ---
    const artistMap = new Map<string, { totalScore: number; count: number; skips: number }>();

    interactions.forEach((interaction, index) => {
      const artist = interaction.artist?.toLowerCase()?.trim();
      if (!artist || artist === 'unknown artist') return;

      // Recency weight: newer interactions score higher
      const recencyWeight = 1 + (index / interactions.length);
      
      let score = 0;
      if (interaction.liked) {
        score += 50 * recencyWeight; // Big boost for likes
      }
      if (interaction.skipped) {
        score -= 30 * recencyWeight; // Penalty for skips
      } else {
        // Engagement score based on watch duration
        const engagement = interaction.totalDuration > 0
          ? (interaction.watchDuration / interaction.totalDuration) * 100
          : 0;
        score += (engagement / 100) * 30 * recencyWeight;
      }

      const existing = artistMap.get(artist) || { totalScore: 0, count: 0, skips: 0 };
      existing.totalScore += score;
      existing.count += 1;
      if (interaction.skipped) existing.skips += 1;
      artistMap.set(artist, existing);
    });

    // Build top artists
    const topArtists: ArtistScore[] = [];
    const skippedArtists: string[] = [];

    artistMap.forEach((data, artist) => {
      const avgScore = data.totalScore / data.count;
      topArtists.push({
        artist,
        score: avgScore,
        interactions: data.count,
      });

      // If >60% of interactions are skips, add to skip list
      if (data.count >= 2 && (data.skips / data.count) > 0.6) {
        skippedArtists.push(artist);
      }
    });

    // Sort by score descending
    topArtists.sort((a, b) => b.score - a.score);

    set({ topArtists: topArtists.slice(0, 20), skippedArtists });
  },

  getTopArtistNames: (limit = 5) => {
    const { topArtists } = get();
    return topArtists
      .filter(a => a.score > 0)
      .slice(0, limit)
      .map(a => a.artist);
  },

  getSkippedArtistNames: () => {
    return get().skippedArtists;
  },

  updateLanguageWeight: (language: LuvLanguage, weight: number) => {
      set(state => {
          const newPrefs = state.preferredLanguages.map(l => 
              l.language === language ? { ...l, weight } : l
          );
          const newActive = newPrefs.filter(l => l.weight > 0).map(l => l.language.toLowerCase());
          if (__DEV__) console.log(`[LuvsPrefs] 🔄 Weight Update: ${language} -> ${weight}% | Active:`, newActive);
          return { preferredLanguages: newPrefs, luvsLanguages: newActive };
      });
      get().saveToStorage();
  },

  getLanguageWeights: () => {
    return get().preferredLanguages;
  },

  setPreferredLanguages: (languages: LuvLanguage[]) => {
      set(state => {
          const newPrefs = state.preferredLanguages.map(l => ({
              ...l,
              weight: languages.includes(l.language) ? 50 : 0
          }));
          const newActive = languages.map(l => l.toLowerCase());
          return { preferredLanguages: newPrefs, luvsLanguages: newActive };
      });
      get().saveToStorage();
  },

  clearPreferences: () => {
    set({
      interactions: [],
      seenSongIds: [],
      skippedArtists: [],
      topArtists: [],
      preferredLanguages: [
          { language: 'English', weight: 50 },
          { language: 'Hindi', weight: 50 },
          { language: 'Tamil', weight: 0 },
          { language: 'Telugu', weight: 0 },
          { language: 'Punjabi', weight: 0 },
          { language: 'Korean', weight: 0 },
          { language: 'Kannada', weight: 0 },
          { language: 'Malayalam', weight: 0 },
          { language: 'Bengali', weight: 0 },
          { language: 'Marathi', weight: 0 }
      ],
      explicitLikes: [],
    });
    AsyncStorage.removeItem(PREFS_KEY).catch(console.error);
  },

  loadFromStorage: async () => {
    try {
      const data = await AsyncStorage.getItem(PREFS_KEY);
      if (data) {
        const parsed = JSON.parse(data);
        
        // Migrate old array of strings to new object structure if needed
        let loadedLangs = parsed.preferredLanguages || [];
        if (loadedLangs.length > 0 && typeof loadedLangs[0] === 'string') {
             // Migration: Give old languages 50% weight, others 0
             loadedLangs = [
                  { language: 'English', weight: loadedLangs.includes('English') ? 50 : 0 },
                  { language: 'Hindi', weight: loadedLangs.includes('Hindi') ? 50 : 0 },
                  { language: 'Tamil', weight: loadedLangs.includes('Tamil') ? 50 : 0 },
                  { language: 'Telugu', weight: loadedLangs.includes('Telugu') ? 50 : 0 },
                  { language: 'Punjabi', weight: loadedLangs.includes('Punjabi') ? 50 : 0 },
                  { language: 'Korean', weight: loadedLangs.includes('Korean') ? 50 : 0 },
                  { language: 'Kannada', weight: loadedLangs.includes('Kannada') ? 50 : 0 },
                  { language: 'Malayalam', weight: loadedLangs.includes('Malayalam') ? 50 : 0 },
                  { language: 'Bengali', weight: loadedLangs.includes('Bengali') ? 50 : 0 },
                  { language: 'Marathi', weight: loadedLangs.includes('Marathi') ? 50 : 0 }
             ];
        } else if (loadedLangs.length === 0) {
             // Defaults if completely empty
             loadedLangs = [
                { language: 'English', weight: 50 },
                { language: 'Hindi', weight: 50 },
                { language: 'Tamil', weight: 0 },
                { language: 'Telugu', weight: 0 },
                { language: 'Punjabi', weight: 0 },
                { language: 'Korean', weight: 0 },
                { language: 'Kannada', weight: 0 },
                { language: 'Malayalam', weight: 0 },
                { language: 'Bengali', weight: 0 },
                { language: 'Marathi', weight: 0 }
           ];
        }

        set({
          interactions: parsed.interactions || [],
          seenSongIds: parsed.seenSongIds || [],
          skippedArtists: parsed.skippedArtists || [],
          topArtists: parsed.topArtists || [],
          preferredLanguages: loadedLangs,
          luvsLanguages: loadedLangs.filter((l: any) => l.weight > 0).map((l: any) => l.language.toLowerCase()),
          explicitLikes: parsed.explicitLikes || [],
        });
        if (__DEV__) console.log('[LuvsPrefs] Loaded preferences from storage');
      }
    } catch (error) {
      console.error('[ReelsPrefs] Failed to load preferences:', error);
    }
  },

  saveToStorage: async () => {
    try {
      const { interactions, seenSongIds, skippedArtists, topArtists, preferredLanguages, explicitLikes } = get();
      await AsyncStorage.setItem(PREFS_KEY, JSON.stringify({
        interactions,
        seenSongIds,
        skippedArtists,
        topArtists,
        preferredLanguages,
        explicitLikes,
      }));
    } catch (error) {
      console.error('[ReelsPrefs] Failed to save preferences:', error);
    }
  },
}));
