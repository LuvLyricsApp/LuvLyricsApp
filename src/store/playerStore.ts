import { create } from 'zustand';
import * as queries from '../database/queries';
import { Song } from '../types/song';
import { useSongsStore } from './songsStore';
import { useSettingsStore } from './settingsStore';

// Module-level controls ref — written by PlayerContext at mount, read everywhere else.
// Keeps imperative player commands out of Zustand state so they don't trigger re-renders.
type QueuedPlayerControl =
  | { type: 'play' }
  | { type: 'pause' }
  | { type: 'seekTo'; position: number };

let queuedPlayerControl: QueuedPlayerControl | null = null;

const queuePlayerControl = (control: QueuedPlayerControl) => {
  queuedPlayerControl = control;
  if (__DEV__) {
    console.warn(`[playerControls] Player not initialized; queued ${control.type}`);
  }
};

export const playerControls = {
  play: () => queuePlayerControl({ type: 'play' }),
  pause: () => queuePlayerControl({ type: 'pause' }),
  seekTo: (position: number) => queuePlayerControl({ type: 'seekTo', position }),
};

export const consumeQueuedPlayerControl = (): QueuedPlayerControl | null => {
  const control = queuedPlayerControl;
  queuedPlayerControl = null;
  return control;
};

// Injected by songsStore at init — breaks the circular require in nextInPlaylist
let _getSongs: (() => Song[]) | null = null;
export function registerSongsGetter(fn: () => Song[]): void {
  _getSongs = fn;
}

interface PlayerState {
  currentSongId: string | null;
  currentSong: Song | null;
  loadedAudioId: string | null; // Tracks what is actually loaded in the player
  showTransliteration: boolean;
  hideMiniPlayer: boolean;
  miniPlayerHiddenSources: Set<string>;
  
  // Playlist queue management
  playlistQueue: Song[] | null;
  currentPlaylistId: string | null;
  currentQueueIndex: number;
  
  // Playback State (for UI updates)
  isPlaying: boolean;
  setIsPlaying: (playing: boolean) => void;
  
  
  loadSong: (songId: string) => Promise<void>;
  setInitialSong: (song: Song) => void;
  setLoadedAudioId: (songId: string | null) => void;
  updateCurrentSong: (updates: Partial<Song>) => void;
  toggleShowTransliteration: () => void;
  setMiniPlayerHidden: (hidden: boolean) => void;
  setMiniPlayerHiddenSource: (source: string, hidden: boolean) => void;
  // Playlist queue actions
  setPlaylistQueue: (playlistId: string, songs: Song[], startIndex: number) => void;
  updateQueue: (songs: Song[]) => void;
  removeFromQueue: (songId: string) => void;
  nextInPlaylist: () => Promise<void>;
  previousInPlaylist: () => void;
  clearPlaylistQueue: () => void;
  
  reset: () => void;
}

export const usePlayerStore = create<PlayerState>((set, get) => ({
  currentSongId: null,
  currentSong: null,
  loadedAudioId: null,
  showTransliteration: false,
  hideMiniPlayer: false,
  miniPlayerHiddenSources: new Set(),
  
  // Playlist queue state
  playlistQueue: null,
  currentPlaylistId: null,
  currentQueueIndex: -1,
  
  isPlaying: false,
  
  setIsPlaying: (playing: boolean) => set({ isPlaying: playing }),
  
  loadSong: async (songId: string) => {
    // 1. Optimistic Update: Get metadata + audioUri from Memory (Instant)
    // Save history if in a playlist
    const state = get();
    if (state.currentPlaylistId && songId) {
        useSettingsStore.getState().updatePlaylistHistory(state.currentPlaylistId, songId);
    }
    
    const cachedSong = useSongsStore.getState().songs.find(s => s.id === songId);

    if (cachedSong) {
        // Update UI & Audio immediately with cached data
        // Reset loadedAudioId to null to force MiniPlayer to sync new audio
        set({ currentSongId: songId, currentSong: cachedSong, loadedAudioId: null });
        
        // Update history in songsStore (triggers lastPlayed update)
        useSongsStore.getState().setCurrentSong(cachedSong);
    }

    // 2. Background Fetch: Get full lyrics from DB
    // This can take time, but UI/Audio are already running!
    const fullSong = await queries.getSongById(songId);
    
    if (fullSong && get().currentSongId === songId) {
         // Merge full details (lyrics) into current state
         set({ currentSong: fullSong }); 
    }
  },

  setInitialSong: (song: Song) => {
      set({ currentSongId: song.id, currentSong: song });
  },
  
  setLoadedAudioId: (id) => set({ loadedAudioId: id }),

  // ✅ Allow updating the current song (e.g. lyrics changed) without reloading audio
  updateCurrentSong: (updates: Partial<Song>) => set((state) => ({
    currentSong: state.currentSong ? { ...state.currentSong, ...updates } : null
  })),

  toggleShowTransliteration: () => set((state) => ({ showTransliteration: !state.showTransliteration })),
  
  setMiniPlayerHidden: (hidden: boolean) => {
      // Legacy support: treats as 'global' or 'manual' override
      get().setMiniPlayerHiddenSource('manual', hidden);
  },

  setMiniPlayerHiddenSource: (source: string, hidden: boolean) => set((state) => {
      const newSources = new Set(state.miniPlayerHiddenSources);
      if (hidden) {
          newSources.add(source);
      } else {
          newSources.delete(source);
      }
      return { 
          miniPlayerHiddenSources: newSources,
          hideMiniPlayer: newSources.size > 0 
      };
  }),

  // Silent Queue Update (for sorting/reordering)
  updateQueue: (newQueue: Song[]) => set((state) => {
      // Try to find current song in new queue to keep index correct
      const currentId = state.currentSongId;
      let newIndex = state.currentQueueIndex;
      
      if (currentId) {
          const foundIndex = newQueue.findIndex(s => s.id === currentId);
          if (foundIndex !== -1) {
              newIndex = foundIndex;
          }
      }
      
      return {
          playlistQueue: newQueue,
          currentQueueIndex: newIndex
      };
  }),

  // Playlist queue management
  setPlaylistQueue: (playlistId: string, songs: Song[], startIndex: number) => {
    const startSongId = songs[startIndex]?.id;
    set({ 
      playlistQueue: songs,
      currentPlaylistId: playlistId,
      currentQueueIndex: startIndex,
      currentSong: songs[startIndex],
      currentSongId: startSongId || null,
      isPlaying: true // FORCE PLAY
    });
    if (__DEV__) {
      console.log(`[PLAYER] Set playlist queue: ${playlistId}, ${songs.length} songs, starting at ${startIndex}`);
    }
    
    // Fetch full song details (lyrics) for the starting song
    if (startSongId) {
        get().loadSong(startSongId);
        playerControls.play();
    }
  },
  


  removeFromQueue: (songId: string) => {
    // ... existing implementation ...
    const state = get();
    if (!state.playlistQueue) return;
    
    const newQueue = state.playlistQueue.filter(s => s.id !== songId);
    const currentIndex = state.currentQueueIndex;
    
    // If currently playing song was removed, stop playback
    if (state.currentSong?.id === songId) {
      if (__DEV__) {
        console.log('[PLAYER] Currently playing song removed from queue, clearing');
      }
      set({ 
        playlistQueue: newQueue.length > 0 ? newQueue : null,
        currentSong: null,
        currentSongId: null,
        currentQueueIndex: -1
      });
      return;
    }
    
    // Adjust index if song before current was removed
    const removedIndex = state.playlistQueue.findIndex(s => s.id === songId);
    const newIndex = removedIndex < currentIndex ? currentIndex - 1 : currentIndex;
    
    set({ 
      playlistQueue: newQueue.length > 0 ? newQueue : null,
      currentQueueIndex: newIndex,
      currentPlaylistId: newQueue.length > 0 ? state.currentPlaylistId : null
    });
    
    if (__DEV__) {
      console.log(`[PLAYER] Removed ${songId} from queue, ${newQueue.length} songs remaining`);
    }
  },
  
  nextInPlaylist: async () => {
    const state = get();

    // Safety net: queue was never set (e.g. song launched via fallback path or Recently Played)
    // Rebuild from DB so auto-next still works — no circular dep to songsStore
    if (!state.playlistQueue || state.playlistQueue.length === 0) {
      if (state.currentPlaylistId === 'library' && state.currentSongId) {
        const allSongs: Song[] = _getSongs ? _getSongs() : [];
        if (allSongs.length > 0) {
          const idx = allSongs.findIndex((s: Song) => s.id === state.currentSongId);
          set({ playlistQueue: allSongs, currentQueueIndex: idx !== -1 ? idx : 0 });
        } else {
          return;
        }
      } else {
        return;
      }
    }

    const freshState = get();
    if (!freshState.playlistQueue) return;
    const nextIndex = (freshState.currentQueueIndex + 1) % freshState.playlistQueue.length;
    const nextSong = freshState.playlistQueue[nextIndex];
    
    set({ 
      currentQueueIndex: nextIndex,
      currentSong: nextSong,
      currentSongId: nextSong.id,
      isPlaying: true // FORCE PLAY
    });
    
    // Trigger audio load
    await get().loadSong(nextSong.id);
    playerControls.play();
    if (__DEV__) {
      console.log(`[PLAYER] Next in playlist: ${nextSong.title}`);
    }
  },

  previousInPlaylist: () => {
    const state = get();
    if (!state.playlistQueue || state.playlistQueue.length === 0) return;

    const prevIndex = (state.currentQueueIndex - 1 + state.playlistQueue.length) % state.playlistQueue.length;
    const prevSong = state.playlistQueue[prevIndex];

    set({
      currentQueueIndex: prevIndex,
      currentSong: prevSong,
      currentSongId: prevSong.id,
      isPlaying: true // FORCE PLAY
    });

    // Trigger audio load
    get().loadSong(prevSong.id);
    playerControls.play();
    if (__DEV__) {
      console.log(`[PLAYER] Previous in playlist: ${prevSong.title}`);
    }
  },
  
  clearPlaylistQueue: () => {
    set({ 
      playlistQueue: null,
      currentPlaylistId: null,
      currentQueueIndex: -1
    });
    if (__DEV__) {
      console.log('[PLAYER] Cleared playlist queue');
    }
  },

  reset: () => set({ 
    currentSongId: null, 
    currentSong: null, 
    loadedAudioId: null,
    playlistQueue: null,
    currentPlaylistId: null,
    currentQueueIndex: -1
  }),
}));
