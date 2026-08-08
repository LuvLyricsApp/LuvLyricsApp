import { useCallback } from 'react';
import { usePlayerStore } from '../store/playerStore';
import { Song } from '../types/song';

interface UsePlaybackQueueOptions {
  playlistId?: string;
}

/**
 * Stable playSong callback that starts a visible mini-player queue.
 * Extracted from LibraryScreen / PlaylistDetailScreen to remove duplication.
 */
export function usePlaybackQueue(options: UsePlaybackQueueOptions) {
  const { playlistId } = options;

  const playSong = useCallback((song: Song, visibleSongs: Song[], allSongs: Song[]) => {
    const index = visibleSongs.findIndex(s => s.id === song.id);

    if (index !== -1) {
      usePlayerStore.getState().setPlaylistQueue(playlistId || 'library', visibleSongs, index);
      return;
    }

    const fallbackIndex = allSongs.findIndex(s => s.id === song.id);
    if (fallbackIndex !== -1) {
      usePlayerStore.getState().setPlaylistQueue(playlistId || 'library', allSongs, fallbackIndex);
    } else {
      usePlayerStore.getState().setInitialSong(song);
      usePlayerStore.getState().loadSong(song.id);
    }
  }, [playlistId]);

  return playSong;
}
