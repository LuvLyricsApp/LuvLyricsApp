/**
 * LyricFlow - Songs Store (Zustand)
 * Manages the song library state and CRUD operations
 */

import { create } from 'zustand';
import { Song, SortOption } from '../types/song';
import * as queries from '../database/queries';
import { useDailyStatsStore } from './dailyStatsStore';
import { registerSongsGetter } from './playerStore';
import { nativeSearch } from '../services/NativeSearch';

interface SongsState {
  // State
  songs: Song[];
  hiddenSongs: Song[];
  isLoading: boolean;
  error: string | null;
  sortBy: SortOption;

  // Actions
  fetchSongs: () => Promise<void>;
  fetchHiddenSongs: () => Promise<void>;
  getSong: (id: string) => Promise<Song | null>;
  addSong: (song: Song) => Promise<void>;
  updateSong: (song: Song) => Promise<void>;
  deleteSong: (id: string) => Promise<void>;
  hideSong: (id: string, hide: boolean) => Promise<void>;
  setCurrentSong: (song: Song | null) => void;
  setSortBy: (sort: SortOption) => void;
  searchSongs: (query: string) => Promise<Song[]>;
  toggleLike: (songId: string) => Promise<void>;
  setLyricsOffset: (songId: string, offset: number) => Promise<void>;
  clearError: () => void;
}

export const useSongsStore = create<SongsState>()((set, get) => ({
      // Initial state
      songs: [],
      hiddenSongs: [],
      isLoading: false,
      error: null,
      sortBy: 'recent',

      // Fetch all songs
      fetchSongs: async () => {
        // Don't set isLoading=true if we already have data (Background Sync)
        const isBackgroundSync = get().songs.length > 0;
        if (!isBackgroundSync) set({ isLoading: true, error: null });
        
        try {
          const songs = await queries.getAllSongs();
          if (__DEV__) console.log('[STORE] Fetched songs:', songs.length);
          set({ songs, isLoading: false });
        } catch (error) {
          console.error('[STORE] Fetch error:', error);
          set({ 
            error: error instanceof Error ? error.message : 'Failed to fetch songs', 
            isLoading: false 
          });
        }
      },

      // Fetch hidden songs
      fetchHiddenSongs: async () => {
        set({ isLoading: true, error: null });
        try {
          const hiddenSongs = await queries.getHiddenSongs();
          if (__DEV__) console.log('[STORE] Fetched hidden songs:', hiddenSongs.length);
          set({ hiddenSongs, isLoading: false });
        } catch (error) {
          console.error('[STORE] Fetch hidden error:', error);
          set({ 
            error: error instanceof Error ? error.message : 'Failed to fetch hidden songs', 
            isLoading: false 
          });
        }
      },
      
      // Get single song with lyrics
      getSong: async (id: string) => {
        try {
          return await queries.getSongById(id);
        } catch (error) {
          set({ error: error instanceof Error ? error.message : 'Failed to get song' });
          return null;
        }
      },
      
      // Add new song — patch the list in place (same pattern as updateSong).
      // Full fetchSongs() after every download was a multi-hundred-row SQLite round-trip.
      addSong: async (song: Song) => {
        try {
          if (__DEV__) console.log('[STORE] Adding song:', song.title);
          await queries.insertSong(song);
          set(state => {
            if (state.songs.some(s => s.id === song.id)) {
              return { songs: state.songs.map(s => (s.id === song.id ? song : s)), error: null };
            }
            return { songs: [song, ...state.songs], error: null };
          });
        } catch (error) {
          console.error('[STORE] Add error:', error);
          set({
            error: error instanceof Error ? error.message : 'Failed to add song',
          });
        }
      },
      
      // Update existing song
      updateSong: async (song: Song) => {
        set({ isLoading: true, error: null });
        try {
          await queries.updateSong(song);
          
          set(state => ({
              songs: state.songs.map(s => s.id === song.id ? song : s),
              isLoading: false
          }));

          // Sync with playerStore
          const { usePlayerStore } = await import('./playerStore');
          const playerState = usePlayerStore.getState();
          if (playerState.currentSong?.id === song.id) {
              playerState.updateCurrentSong(song);
          }
        } catch (error) {
           set({ 
             error: error instanceof Error ? error.message : 'Failed to update song', 
             isLoading: false 
           });
        }
      },

      // Delete song
      deleteSong: async (id: string) => {
        set({ isLoading: true, error: null });
        try {
          await queries.deleteSong(id);
          
          set(state => ({
             songs: state.songs.filter(s => s.id !== id),
             isLoading: false
          }));

          // Sync with playerStore
          const { usePlayerStore } = await import('./playerStore');
          const playerState = usePlayerStore.getState();
          if (playerState.currentSong?.id === id) {
              playerState.reset();
          }
        } catch (error) {
          set({ 
            error: error instanceof Error ? error.message : 'Failed to delete song', 
            isLoading: false 
          });
        }
      },

      // Hide/Unhide song
      hideSong: async (id: string, hide: boolean) => {
        set({ isLoading: true, error: null });
        try {
          await queries.hideSong(id, hide);
          
          if (hide) {
            const { usePlayerStore } = await import('./playerStore');
            const playerState = usePlayerStore.getState();
            if (playerState.currentSong?.id === id) {
              playerState.reset();
            }
          }

          await get().fetchSongs(); 
          await get().fetchHiddenSongs();
          set({ isLoading: false });
        } catch (error) {
          set({ 
            error: error instanceof Error ? error.message : 'Failed to hide song', 
            isLoading: false 
          });
        }
      },

      // Track play stats — no longer stores currentSong state (use playerStore for that)
      setCurrentSong: (song: Song | null) => {
        if (!song) return;
        const now = new Date().toISOString();
        setTimeout(() => {
          set(state => ({
            songs: state.songs.map(s => s.id === song.id ? { ...s, lastPlayed: now } : s),
          }));
          queries.updatePlayStats(song.id).catch(console.error);
          useDailyStatsStore.getState().incrementDailyPlay(song.id);
        }, 5000);
      },

      // Set sort option
      setSortBy: (sortBy: SortOption) => {
        set({ sortBy });
      },

      // Search songs — native FTS5 on Android, JS fallback on iOS
      searchSongs: async (query: string) => {
        if (!query.trim()) {
          return get().songs;
        }
        try {
          const native = await nativeSearch(query);
          if (native !== null) return native;
          return await queries.searchSongs(query);
        } catch (error) {
          console.error('Search failed:', error);
          return [];
        }
      },

      // Toggle Like — delegates to playlistStore (single source of truth).
      // We still patch songsStore and playerStore in-memory so legacy
      // consumers that read song.isLiked directly (RecentlyPlayedGrid,
      // SongCard) stay reactive without a full refetch.
      toggleLike: async (songId: string) => {
         try {
             const { usePlaylistStore } = await import('./playlistStore');
             await usePlaylistStore.getState().toggleLiked(songId);

             // Optimistic patch for in-memory consumers
             set((state) => {
                const song = state.songs.find(s => s.id === songId);
                if (!song) return state;
                 const updatedSong = { ...song, isLiked: !song.isLiked };
                 return { songs: state.songs.map(s => s.id === songId ? updatedSong : s) };
              });

             const { usePlayerStore } = await import('./playerStore');
             const playerState = usePlayerStore.getState();
             if (playerState.currentSong?.id === songId) {
                playerState.updateCurrentSong({ isLiked: !playerState.currentSong.isLiked });
             }
         } catch (error) {
             set({ error: error instanceof Error ? error.message : 'Failed to toggle like' });
         }
      },
      
      /**
       * Persist the per-song lyric sync correction and push it into every live
       * consumer. Patching playerStore matters most: the sync screen calibrates
       * against the song that is currently playing, so the highlight has to move
       * the instant the offset changes rather than on the next load.
       */
      setLyricsOffset: async (songId: string, offset: number) => {
         try {
             await queries.patchLyricsOffset(songId, offset);

             set((state) => ({
                songs: state.songs.map(s => s.id === songId ? { ...s, lyricsOffset: offset } : s),
             }));

             const { usePlayerStore } = await import('./playerStore');
             const playerState = usePlayerStore.getState();
             if (playerState.currentSong?.id === songId) {
                playerState.updateCurrentSong({ lyricsOffset: offset });
             }
         } catch (error) {
             set({ error: error instanceof Error ? error.message : 'Failed to save lyric offset' });
         }
      },

      clearError: () => set({ error: null }),
}));

// Give playerStore a sync path to songs — breaks the circular require in nextInPlaylist
registerSongsGetter(() => useSongsStore.getState().songs);
