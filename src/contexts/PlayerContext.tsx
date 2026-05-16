import React, { createContext, useContext, useEffect, useRef } from 'react';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { usePlayerStore } from '../store/playerStore';
import { shouldPreservePlayingStateDuringSeek } from './playerStatusGuard';

const PlayerContext = createContext<any>(null);

export const PlayerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const player = useAudioPlayer();
  const setControls = usePlayerStore(state => state.setControls);
  const lastSeekAtRef = useRef(0);
  const endHandledForSongIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (player) {
        setControls({
            play: () => setTimeout(() => player.play(), 0),
            pause: () => setTimeout(() => player.pause(), 0),
            seekTo: (pos: number) => {
              lastSeekAtRef.current = Date.now();
              setTimeout(() => player.seekTo(pos), 0);
            }
        });
    }
  }, [player, setControls]);

  const currentSong = usePlayerStore(state => state.currentSong);
  const currentSongId = usePlayerStore(state => state.currentSongId);

  useEffect(() => {
    if (currentSongId && endHandledForSongIdRef.current !== currentSongId) {
      endHandledForSongIdRef.current = null;
    }
  }, [currentSongId]);

  useEffect(() => {
    if (player && currentSong) {
      // Set metadata and enable lock screen controls
      player.setActiveForLockScreen(true, {
        title: currentSong.title,
        artist: currentSong.artist || 'Unknown Artist',
        artworkUrl: currentSong.coverImageUri,
        albumTitle: currentSong.album || ''
      }, {
        showSeekBackward: true,
        showSeekForward: true
      });
    } else if (player && !currentSong) {
        // Stop playback if current song is cleared (e.g. deleted)
        // Wrap in setTimeout to avoid "accessed on wrong thread" issues during state transitions
        setTimeout(() => {
            player.pause();
        }, 0);
    }
  }, [player, currentSong]);

  // Remote Commands
  useEffect(() => {
    if (!player) return;
    
    // Listen for remote Next/Prev commands from native side
    const subscription = (player as any).addListener('remoteCommand', (event: { command: string }) => {
      if (__DEV__) console.log('[PlayerContext] Remote command received:', event.command);
      const store = usePlayerStore.getState();
      if (event.command === 'next') {
        store.nextInPlaylist();
      } else if (event.command === 'previous') {
        store.previousInPlaylist();
      }
    });

    return () => subscription.remove();
  }, [player]);

  const status = useAudioPlayerStatus(player);

  useEffect(() => {
    if (status) {
      const { currentTime, duration, playing, playbackState, isBuffering, isLoaded, didJustFinish } = status;

      const store = usePlayerStore.getState();

      // Batch updates if possible, or only update if changed significantly
      store.updateProgress(currentTime, duration);

      const justSought = Date.now() - lastSeekAtRef.current < 1500;
      const activeSongId = store.currentSongId;
      const isNearEndFallback =
        !didJustFinish &&
        store.isPlaying &&
        isLoaded &&
        !isBuffering &&
        !playing &&
        duration > 0 &&
        currentTime >= Math.max(0, duration - 0.35);
      const shouldAdvance =
        !justSought &&
        (didJustFinish || isNearEndFallback) &&
        !!activeSongId &&
        endHandledForSongIdRef.current !== activeSongId;

      if (shouldAdvance) {
        endHandledForSongIdRef.current = activeSongId;
        store.setIsPlaying(true);
        if (__DEV__) console.log(`[PlayerContext] Song finished (${didJustFinish ? 'didJustFinish' : 'nearEndFallback'}), playing next...`);
        store.nextInPlaylist();
        return;
      }

      if (store.isPlaying !== playing) {
        if (shouldPreservePlayingStateDuringSeek({
          playing,
          playbackState,
          isBuffering,
          isLoaded,
        })) {
            // Keep existing state (likely "playing") to avoid button flicker
        } else {
            store.setIsPlaying(playing);
        }
      }

      // Use didJustFinish — playbackState values vary by platform:
      // Android emits "ended", iOS emits via AVPlayerItemDidPlayToEndTime.
      // didJustFinish is the only reliable cross-platform signal.
      
    }
  }, [status]);

  return <PlayerContext.Provider value={player}>{children}</PlayerContext.Provider>;
};

export const usePlayer = () => useContext(PlayerContext);
