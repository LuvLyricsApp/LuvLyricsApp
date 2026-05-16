/**
 * LyricFlow - Songs Store (Zustand)
 * Manages the song library state and CRUD operations
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Song, SortOption } from '../types/song';
import * as queries from '../database/queries';
import { useDailyStatsStore } from './dailyStatsStore';

interface SongsState {
  // State
  songs: Song[];
  hiddenSongs: Song[];
  currentSong: Song | null;
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
  clearError: () => void;
  hydrate: () => Promise<void>; // Manual rehydration if needed
}

export const useSongsStore = create<SongsState>()(
  persist(
    (set, get) => ({
      // Initial state
      songs: [],
      hiddenSongs: [],
      currentSong: null,
      isLoading: false,
      error: null,
      sortBy: 'recent',
      
      hydrate: async () => {
         // Optional: Trigger a background refresh after rehydration
         await get().fetchSongs();
      },

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
          const song = await queries.getSongById(id);
          if (song) {
            set({ currentSong: song });
          }
          return song;
        } catch (error) {
          set({ error: error instanceof Error ? error.message : 'Failed to get song' });
          return null;
        }
      },
      
      // Add new song
      addSong: async (song: Song) => {
        set({ isLoading: true, error: null });
        try {
          if (__DEV__) console.log('[STORE] Adding song:', song.title);
          await queries.insertSong(song);
          await get().fetchSongs();
          set({ isLoading: false });
        } catch (error) {
          console.error('[STORE] Add error:', error);
          set({ 
            error: error instanceof Error ? error.message : 'Failed to add song', 
            isLoading: false 
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
              currentSong: state.currentSong?.id === song.id ? song : state.currentSong,
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
             currentSong: state.currentSong?.id === id ? null : state.currentSong,
             isLoading: false
          }));

          // Sync with playerStore
          const { usePlayerStore } = await import('./playerStore');
          const playerState = usePlayerStore.getState();
          if (playerState.currentSong?.id === id) {
              playerState.reset();
          }

          await get().fetchSongs();
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

      // Set current playing song
      setCurrentSong: (song: Song | null) => {
        if (song) {
            const now = new Date().toISOString();
            set({ currentSong: song });

            // Deferred stats update
            setTimeout(() => {
                set(state => ({
                    songs: state.songs.map(s => s.id === song.id ? { ...s, lastPlayed: now } : s)
                }));
                queries.updatePlayStats(song.id).catch(console.error);
                useDailyStatsStore.getState().incrementDailyPlay(song.id);
            }, 5000); 
        } else {
            set({ currentSong: null });
        }
      },

      // Set sort option
      setSortBy: (sortBy: SortOption) => {
        set({ sortBy });
      },

      // Search songs
      searchSongs: async (query: string) => {
        if (!query.trim()) {
          return get().songs;
        }
        try {
          return await queries.searchSongs(query);
        } catch (error) {
          console.error('Search failed:', error);
          return [];
        }
      },

      // Toggle Like
      toggleLike: async (songId: string) => {
         try {
             const { usePlaylistStore } = await import('./playlistStore');
             await usePlaylistStore.getState().toggleLiked(songId);
             
             set((state) => {
                const song = state.songs.find(s => s.id === songId);
                if (!song) return state;
                
                const updatedSong = { ...song, isLiked: !song.isLiked };
                return {
                    songs: state.songs.map(s => s.id === songId ? updatedSong : s),
                    currentSong: state.currentSong?.id === songId ? updatedSong : state.currentSong
                };
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
      
      clearError: () => set({ error: null })
    }),
    {
      name: 'songs-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ 
        songs: state.songs, 
        hiddenSongs: state.hiddenSongs,
        sortBy: state.sortBy 
      }),
    }
  )
);
