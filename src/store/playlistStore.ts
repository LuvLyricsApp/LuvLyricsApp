/**
 * LyricFlow - Playlist Store (Zustand)
 * Single Source of Truth for Playlists and "Liked" status
 */

import { create } from 'zustand';
import { Playlist } from '../types/song';
import * as playlistQueries from '../database/playlistQueries';
import * as songQueries from '../database/queries';
import { usePlayerStore } from './playerStore';

interface PlaylistState {
  // State
  playlists: Playlist[];
  defaultPlaylistId: string | null;
  likedSongIds: Set<string>; // O(1) lookup for heart icons
  isLoading: boolean;
  error: string | null;
  lastUpdate: number; // Trigger for re-fetching details

  // Actions
  fetchPlaylists: () => Promise<void>;
  createPlaylist: (name: string, description?: string, coverUri?: string) => Promise<string>;
  updatePlaylist: (id: string, updates: { name?: string; description?: string; coverImageUri?: string }) => Promise<void>;
  deletePlaylist: (id: string) => Promise<void>;
  
  // Song Management
  addSongToPlaylist: (playlistId: string, songId: string) => Promise<void>;
  addSongsToPlaylist: (playlistId: string, songIds: string[]) => Promise<void>;
  removeSongFromPlaylist: (playlistId: string, songId: string) => Promise<void>;
  
  // Liked Songs Logic (Single Source of Truth)
  toggleLiked: (songId: string) => Promise<void>;
  isSongLiked: (songId: string) => boolean;
  
  clearError: () => void;
}

export const usePlaylistStore = create<PlaylistState>((set, get) => ({
  // Initial State
  playlists: [],
  defaultPlaylistId: null,
  likedSongIds: new Set(),
  isLoading: false,
  error: null,
  lastUpdate: 0,

  // Fetch all playlists and initialize liked songs cache
  fetchPlaylists: async () => {
    set({ isLoading: true, error: null });
    try {
      const playlists = await playlistQueries.getAllPlaylists();
      const defaultId = await playlistQueries.getDefaultPlaylistId();
      
      // Initialize Liked Song Cache (O(1) lookup)
      let likedIds = new Set<string>();
      if (defaultId) {
        const likedSongs = await playlistQueries.getPlaylistSongs(defaultId);
        likedIds = new Set(likedSongs.map(s => s.id));
      }

      set({ 
        playlists, 
        defaultPlaylistId: defaultId,
        likedSongIds: likedIds,
        isLoading: false 
      });
      
      if (__DEV__) console.log(`[PLAYLIST_STORE] Loaded ${playlists.length} playlists, ${likedIds.size} liked songs`);
    } catch (error) {
      console.error('[PLAYLIST_STORE] Fetch error:', error);
      set({ 
        error: error instanceof Error ? error.message : 'Failed to fetch playlists', 
        isLoading: false 
      });
    }
  },

  // Create Playlist
  createPlaylist: async (name, description, coverUri) => {
    set({ isLoading: true, error: null });
    try {
      const id = await playlistQueries.createPlaylist(name, description, coverUri);
      await get().fetchPlaylists(); // Refresh list to get sort order correct
      return id;
    } catch (error) {
      console.error('[PLAYLIST_STORE] Create error:', error);
      set({ error: error instanceof Error ? error.message : 'Failed to create playlist', isLoading: false });
      throw error;
    }
  },

  // Update Playlist
  updatePlaylist: async (id, updates) => {
    set({ isLoading: true, error: null });
    try {
      await playlistQueries.updatePlaylist(id, updates);
      await get().fetchPlaylists();
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Failed to update playlist', isLoading: false });
      throw error;
    }
  },

  // Delete Playlist
  deletePlaylist: async (id) => {
    set({ isLoading: true, error: null });
    try {
      await playlistQueries.deletePlaylist(id);
      await get().fetchPlaylists();
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Failed to delete playlist', isLoading: false });
      throw error;
    }
  },

  // Add Song to Playlist
  addSongToPlaylist: async (playlistId, songId) => {
    try {
      // Optimistic update if it's the Liked Songs playlist
      if (playlistId === get().defaultPlaylistId) {
        set(state => {
          const newSet = new Set(state.likedSongIds);
          newSet.add(songId);
          return { likedSongIds: newSet };
        });
      }

      await playlistQueries.addSongToPlaylist(playlistId, songId);
      
      // OPTIMIZATION: Update local count instead of re-fetching
      // await get().fetchPlaylists();
      set(state => ({
        playlists: state.playlists.map(p => 
           p.id === playlistId ? { ...p, songCount: (p.songCount || 0) + 1 } : p
        ),
        lastUpdate: Date.now()
      }));

    } catch (error) {
      console.error('[PLAYLIST_STORE] Add song error:', error);
      // Revert optimistic update if needed
      if (playlistId === get().defaultPlaylistId) {
         set(state => {
          const newSet = new Set(state.likedSongIds);
          newSet.delete(songId);
          return { likedSongIds: newSet };
        });
      }
      throw error;
    }
  },

  // Batch Add Songs
  addSongsToPlaylist: async (playlistId, songIds) => {
    try {
        await playlistQueries.addSongsToPlaylist(playlistId, songIds);
        
        // Optimistic update for count
        set(state => ({
            playlists: state.playlists.map(p => 
               p.id === playlistId ? { ...p, songCount: (p.songCount || 0) + songIds.length } : p
            ),
            lastUpdate: Date.now()
        }));
    } catch (error) {
        console.error('[PLAYLIST_STORE] Batch add error:', error);
        throw error;
    }
  },

  // Remove Song from Playlist
  removeSongFromPlaylist: async (playlistId, songId) => {
    try {
      // Optimistic update if it's the Liked Songs playlist
      if (playlistId === get().defaultPlaylistId) {
        set(state => {
          const newSet = new Set(state.likedSongIds);
          newSet.delete(songId);
          return { likedSongIds: newSet };
        });
      }

      await playlistQueries.removeSongFromPlaylist(playlistId, songId);
      
      // CRITICAL: Queue sync to prevent ghost songs
      const playerState = usePlayerStore.getState();
      if (playerState.currentPlaylistId === playlistId) {
        playerState.removeFromQueue(songId);
        if (__DEV__) console.log(`[PLAYLIST_STORE] Removed ${songId} from active playlist queue`);
      }
      
      // OPTIMIZATION: Update local count instead of re-fetching
      // await get().fetchPlaylists();
      set(state => ({
        playlists: state.playlists.map(p => 
           p.id === playlistId ? { ...p, songCount: Math.max(0, (p.songCount || 0) - 1) } : p
        ),
        lastUpdate: Date.now()
      }));

    } catch (error) {
      console.error('[PLAYLIST_STORE] Remove song error:', error);
      // Revert optimistic update if needed
      if (playlistId === get().defaultPlaylistId) {
         set(state => {
          const newSet = new Set(state.likedSongIds);
          newSet.add(songId);
          return { likedSongIds: newSet };
        });
      }
      throw error;
    }
  },

  // Toggle Liked Status (The Heart Icon Action)
  toggleLiked: async (songId) => {
    const { defaultPlaylistId, likedSongIds } = get();
    
    if (!defaultPlaylistId) {
      console.error('[PLAYLIST_STORE] No default playlist found!');
      return;
    }

    const { addSongToPlaylist, removeSongFromPlaylist } = get();
    const isLiked = likedSongIds.has(songId);

    try {
      if (__DEV__) console.log(`[PLAYLIST_STORE] Toggling like for ${songId}. Currently liked: ${isLiked}`);
      
      // 1. Update DB (both playlist_songs AND legacy is_liked column for safety)
      const song = await songQueries.getSongById(songId);
      if (song) {
        await songQueries.updateSong({ ...song, isLiked: !isLiked });
      }

      // 2. Add/Remove from Default Playlist
      if (isLiked) {
        await removeSongFromPlaylist(defaultPlaylistId, songId);
      } else {
        await addSongToPlaylist(defaultPlaylistId, songId);
      }

    } catch (error) {
      console.error('[PLAYLIST_STORE] Toggle like failed:', error);
      set({ error: 'Failed to update like status' });
    }
  },

  // Check if song is liked (O(1))
  isSongLiked: (songId) => {
    return get().likedSongIds.has(songId);
  },

  clearError: () => set({ error: null }),
}));
