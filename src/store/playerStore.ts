import { create } from 'zustand';
import * as queries from '../database/queries';
import { Song } from '../types/song';
import { useSongsStore } from './songsStore';
import { useSettingsStore } from './settingsStore';
import { setPlaybackIntent } from '../playback/playbackIntent';
import { NativeAudioPlayer } from '../services/NativeAudioPlayer';

function trackMeta(song: Song) {
  return {
    title: song.title || 'Unknown Title',
    artist: song.artist || 'Unknown Artist',
    album: song.album || '',
    artworkUri: song.coverImageUri || '',
    mediaId: song.id,
  };
}

/** Stage queue[index+1] in Media3 when Android can take it. No-op elsewhere. */
export function prepareNextInQueue(): void {
  if (!NativeAudioPlayer.isAvailable()) return;
  const { playlistQueue, currentQueueIndex, currentSongId } = usePlayerStore.getState();
  if (!playlistQueue || playlistQueue.length < 2) return;
  const next = playlistQueue[(currentQueueIndex + 1) % playlistQueue.length];
  if (!next?.audioUri || next.id === currentSongId) return;
  NativeAudioPlayer.prepareNext(next.audioUri, trackMeta(next), next.id);
}

// Module-level controls ref — written by PlayerContext at mount, read everywhere else.
// Keeps imperative player commands out of Zustand state so they don't trigger re-renders.
export const playerControls = {
  play: () => { if (__DEV__) console.warn('[playerControls] Player not initialized'); },
  pause: () => { if (__DEV__) console.warn('[playerControls] Player not initialized'); },
  seekTo: (_pos: number) => { if (__DEV__) console.warn('[playerControls] Player not initialized'); },
};

// When the native player owns playback state (Android, via Media3), it echoes
// playWhenReady back the instant a command lands, so JS must NOT optimistically
// set isPlaying — there would be nothing for a status tick to contradict, and no
// need for the echo guard. iOS still drives expo-audio from JS and keeps both.
// PlayerContext sets this at mount.
let nativeOwnsPlaybackState = false;
export function setNativeOwnsPlaybackState(owns: boolean): void {
  nativeOwnsPlaybackState = owns;
}
export function isNativeOwningPlaybackState(): boolean {
  return nativeOwnsPlaybackState;
}

// Single owner for replace() calls. MiniPlayer and NowPlayingScreen both watch
// loadedAudioId and would otherwise both load the same track at once.
let audioLoadInFlight: string | null = null;
export function beginAudioLoad(songId: string): boolean {
  if (audioLoadInFlight === songId) return false;
  audioLoadInFlight = songId;
  return true;
}
export function endAudioLoad(songId: string): void {
  if (audioLoadInFlight === songId) audioLoadInFlight = null;
}

// A reload that should carry on from where the song stopped (recovery after
// the player gave up, the menu's Refetch) rather than start from zero. The
// loader seeks before it plays, so there is no blip from the top.
let pendingResume: { songId: string; at: number } | null = null;
export function resumeNextLoadAt(songId: string, at: number): void {
  pendingResume = at > 0 ? { songId, at } : null;
}
/** Where the load of `songId` that just finished should start, once. */
export function takeResumePosition(songId: string): number | null {
  if (!pendingResume || pendingResume.songId !== songId) return null;
  const { at } = pendingResume;
  pendingResume = null;
  return at;
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
  requestPlayback: (playing: boolean) => void;

  
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
  /** Media3 already advanced — update queue cursor without reloading audio. */
  adoptPreparedTrack: (mediaId: string) => void;
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
  
  // setIsPlaying is the raw setter — reserved for PlayerContext syncing native
  // status. UI buttons must use requestPlayback so the intent guard is armed.
  setIsPlaying: (playing: boolean) => set({ isPlaying: playing }),

  requestPlayback: (playing: boolean) => {
    if (nativeOwnsPlaybackState) {
      // Fire and let the player report back. playWhenReady flips synchronously
      // inside ExoPlayer, so the round trip is a couple of frames.
      if (playing) playerControls.play(); else playerControls.pause();
      return;
    }
    setPlaybackIntent(playing);
    if (get().isPlaying !== playing) set({ isPlaying: playing });
    if (playing) playerControls.play(); else playerControls.pause();
  },

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
    try {
      const fullSong = await queries.getSongById(songId);
      if (fullSong && get().currentSongId === songId) {
        set({ currentSong: fullSong });
      }
    } catch (err) {
      if (__DEV__) console.warn('[playerStore] getSongById failed:', err);
    }
  },

  adoptPreparedTrack: (mediaId: string) => {
    const state = get();
    if (state.currentSongId === mediaId) {
      // nextInPlaylist already synced via seekToNextIfReady — still stage the one after.
      prepareNextInQueue();
      return;
    }
    const queue = state.playlistQueue;
    if (!queue) return;
    const idx = queue.findIndex(s => s.id === mediaId);
    if (idx < 0) return;
    const song = queue[idx];
    set({
      currentQueueIndex: idx,
      currentSong: song,
      currentSongId: song.id,
      loadedAudioId: song.id,
      isPlaying: true,
    });
    if (state.currentPlaylistId) {
      useSettingsStore.getState().updatePlaylistHistory(state.currentPlaylistId, song.id);
    }
    useSongsStore.getState().setCurrentSong(song);
    queries.getSongById(song.id).then(full => {
      if (full && get().currentSongId === song.id) set({ currentSong: full });
    }).catch(() => {});
    prepareNextInQueue();
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
        setPlaybackIntent(true);
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
    // Rebuild from memory so auto-next still works. Read at call time: songsStore
    // must not import this module back at init (see songsStore.ts).
    if (!state.playlistQueue || state.playlistQueue.length === 0) {
      if (state.currentPlaylistId === 'library' && state.currentSongId) {
        const allSongs: Song[] = useSongsStore.getState().songs;
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

    // Prefer the staged Media3 item — avoids pause → load → prepare gap on skip.
    const usedNative = await NativeAudioPlayer.seekToNextIfReady(nextSong.id);
    if (usedNative) {
      set({
        currentQueueIndex: nextIndex,
        currentSong: nextSong,
        currentSongId: nextSong.id,
        loadedAudioId: nextSong.id,
        isPlaying: true,
      });
      if (freshState.currentPlaylistId) {
        useSettingsStore.getState().updatePlaylistHistory(freshState.currentPlaylistId, nextSong.id);
      }
      useSongsStore.getState().setCurrentSong(nextSong);
      queries.getSongById(nextSong.id).then(full => {
        if (full && get().currentSongId === nextSong.id) set({ currentSong: full });
      }).catch(() => {});
      prepareNextInQueue();
      setPlaybackIntent(true);
      playerControls.play();
      return;
    }

    set({
      currentQueueIndex: nextIndex,
      currentSong: nextSong,
      currentSongId: nextSong.id,
      isPlaying: true,
    });

    await get().loadSong(nextSong.id);
    setPlaybackIntent(true);
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
    setPlaybackIntent(true);
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
