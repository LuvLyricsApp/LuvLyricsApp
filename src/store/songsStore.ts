/**
 * LyricFlow - Songs Store (Zustand)
 * Manages the song library state and CRUD operations
 */

import { create } from 'zustand';
import { Song, SortOption } from '../types/song';
import * as queries from '../database/queries';
import { useDailyStatsStore } from './dailyStatsStore';
import { nativeSearch } from '../services/NativeSearch';
import { libraryLookup, matchKey } from '../utils/downloadState';
import { useStreamLikesStore } from './streamLikesStore';
import { reconcileSongs } from './songsReconcile';

// Deliberately no static import of './playerStore' here: playerStore imports this
// module, and a back-edge evaluated at init left playerStore half-initialised
// (a TDZ throw on web; a silently reset getter on Hermes). Use dynamic imports.

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
  /** Fill in a missing cover (backfill). No-op if the song gained one meanwhile. */
  patchCover: (songId: string, coverImageUri: string) => Promise<void>;
  /** Several backfilled covers with one store update. */
  patchCovers: (items: { songId: string; coverImageUri: string }[]) => Promise<void>;
  deleteSong: (id: string) => Promise<void>;
  hideSong: (id: string, hide: boolean) => Promise<void>;
  setCurrentSong: (song: Song | null) => void;
  setSortBy: (sort: SortOption) => void;
  searchSongs: (query: string) => Promise<Song[]>;
  toggleLike: (songId: string) => Promise<LikeResult>;
  clearError: () => void;
}

/**
 * What a tap on a heart did: `saving` is a streamed song being downloaded into
 * the library, where the like will land when it arrives.
 */
export type LikeResult = 'liked' | 'unliked' | 'saving' | 'error';

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
          const fetched = await queries.getAllSongs();
          if (__DEV__) console.log('[STORE] Fetched songs:', fetched.length);
          // Same rows keep the same array (and row objects): a refetch on every
          // Library focus must not re-run the sorts and re-render every screen.
          set(state => ({ songs: reconcileSongs(state.songs, fetched), isLoading: false }));
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
      patchCover: (songId: string, coverImageUri: string) => get().patchCovers([{ songId, coverImageUri }]),

      // Several covers land with one store update, so a backfill of forty songs
      // re-renders the library a handful of times instead of forty.
      patchCovers: async (items: { songId: string; coverImageUri: string }[]) => {
        const bare = new Set(get().songs.filter(s => !s.coverImageUri).map(s => s.id));
        const wanted = new Map<string, string>();
        for (const item of items) if (bare.has(item.songId)) wanted.set(item.songId, item.coverImageUri);
        if (wanted.size === 0) return;

        const saved = new Map<string, string>();
        for (const [songId, coverImageUri] of wanted) {
          try {
            await queries.patchCoverImageUri(songId, coverImageUri);
            saved.set(songId, coverImageUri);
          } catch {
            // One row failing must not stop the rest; it is retried next session.
          }
        }
        if (saved.size === 0) return;

        set(state => ({
          songs: state.songs.map(s => {
            const uri = saved.get(s.id);
            return uri && !s.coverImageUri ? { ...s, coverImageUri: uri } : s;
          }),
        }));
        const { usePlayerStore } = await import('./playerStore');
        const player = usePlayerStore.getState();
        const current = player.currentSong;
        const currentUri = current && saved.get(current.id);
        if (current && currentUri && !current.coverImageUri) {
          player.updateCurrentSong({ coverImageUri: currentUri });
        }
        if (player.playlistQueue?.some(s => saved.has(s.id))) {
          player.updateQueue(
            player.playlistQueue.map(s => {
              const uri = saved.get(s.id);
              return uri && !s.coverImageUri ? { ...s, coverImageUri: uri } : s;
            }),
          );
        }
      },

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
      // consumers that read song.isLiked directly (list rows,
      // SongCard) stay reactive without a full refetch.
      toggleLike: async (songId: string): Promise<LikeResult> => {
         // A streamed song has no library row to like — saving it downloads it
         // into the library, and the like is applied to the row it gets (see
         // streamLikesStore). A copy already in the library is liked directly.
         if (songId.startsWith('stream:')) {
             const { StreamService } = await import('../services/stream/StreamService');
             const meta = StreamService.catalogFor(songId);
             if (!meta) return 'error';
             const key = matchKey(meta.title, meta.artist);
             const saved = libraryLookup(get().songs).get(key);
             if (saved) return get().toggleLike(saved.id);
             const likes = useStreamLikesStore.getState();
             if (likes.pending.includes(key)) {
                 likes.remove(key);
                 return 'unliked';
             }
             likes.add(key);
             if (!StreamService.save(meta)) {
                 likes.remove(key);
                 return 'error';
             }
             return 'saving';
         }
         try {
             const { usePlaylistStore } = await import('./playlistStore');
             const wasLiked = usePlaylistStore.getState().likedSongIds.has(songId);
             await usePlaylistStore.getState().toggleLiked(songId);
             if (usePlaylistStore.getState().likedSongIds.has(songId) === wasLiked) return 'error';

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
             return wasLiked ? 'unliked' : 'liked';
         } catch (error) {
             set({ error: error instanceof Error ? error.message : 'Failed to toggle like' });
             return 'error';
         }
      },
      
      clearError: () => set({ error: null }),
}));
