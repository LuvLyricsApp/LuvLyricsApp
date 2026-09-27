import React, { createContext, useContext, useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { usePlayerStore, playerControls, setNativeOwnsPlaybackState } from '../store/playerStore';
import { isStalePlayingEcho } from '../playback/playbackIntent';
import { usePositionStore } from '../store/positionStore';
import { shouldPreservePlayingStateDuringSeek, shouldAdoptNativePlayingState } from './playerStatusGuard';
import { positionSV, durationSV, isSeeking } from '../playback/positionBus';
import { NativeAudioPlayer } from '../services/NativeAudioPlayer';

const PlayerContext = createContext<any>(null);

// Shared by both providers: reset the "already advanced past the end" latch
// whenever the active track changes.
function useEndOfTrackLatch() {
  const endHandledForSongIdRef = useRef<string | null>(null);
  const currentSongId = usePlayerStore(state => state.currentSongId);

  useEffect(() => {
    if (currentSongId && endHandledForSongIdRef.current !== currentSongId) {
      endHandledForSongIdRef.current = null;
    }
  }, [currentSongId]);

  return endHandledForSongIdRef;
}

// ─── Android ──────────────────────────────────────────────────────────────────
// Media3 owns playback. Nothing here touches expo-audio, so its native module
// is never constructed on Android — no second audio stack, no competing
// MediaSessionService, no wasted init at startup.

const AndroidPlayerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const lastZustandUpdateRef = useRef(0);
  const endHandledForSongIdRef = useEndOfTrackLatch();
  const currentSong = usePlayerStore(state => state.currentSong);

  const player = useRef({
    play: () => NativeAudioPlayer.play(),
    pause: () => NativeAudioPlayer.pause(),
    seekTo: (time: number) => NativeAudioPlayer.seekTo(time),
    replace: (source: any) => {
      const uri = typeof source === 'string' ? source : source?.uri;
      if (!uri) return;
      const current = usePlayerStore.getState().currentSong;
      return NativeAudioPlayer.load(uri, {
        title: current?.title || 'Unknown Title',
        artist: current?.artist || 'Unknown Artist',
        album: current?.album || '',
        artworkUri: current?.coverImageUri || '',
        mediaId: current?.id || '',
      });
    },
    setActiveForLockScreen: (active: boolean, metadata?: any, _options?: any) => {
      if (active && metadata) {
        NativeAudioPlayer.updateMetadata({
          title: metadata.title || 'Unknown Title',
          artist: metadata.artist || 'Unknown Artist',
          album: metadata.albumTitle || '',
          artworkUri: metadata.artworkUrl || '',
        });
      }
    },
  }).current;

  useEffect(() => {
    playerControls.play = () => setTimeout(() => player.play(), 0);
    playerControls.pause = () => setTimeout(() => player.pause(), 0);
    playerControls.seekTo = (pos: number) => setTimeout(() => player.seekTo(pos), 0);
  }, [player]);

  // Media3 is the source of truth here — see requestPlayback.
  useEffect(() => {
    setNativeOwnsPlaybackState(true);
    return () => setNativeOwnsPlaybackState(false);
  }, []);

  useEffect(() => {
    if (currentSong) {
      player.setActiveForLockScreen(true, {
        title: currentSong.title,
        artist: currentSong.artist || 'Unknown Artist',
        artworkUrl: currentSong.coverImageUri,
        albumTitle: currentSong.album || '',
      });
    } else {
      setTimeout(() => player.pause(), 0);
    }
  }, [currentSong, player]);

  useEffect(() => {
    const statusSub = NativeAudioPlayer.addListener('onPlaybackStatus', (event: any) => {
      const { position, duration, isPlaying, playWhenReady, didJustFinish, suppressed } = event;
      const store = usePlayerStore.getState();

      if (!isSeeking.value) {
        positionSV.value = position;
      }
      durationSV.value = duration;

      // Scrubber/lyrics read positionSV. Zustand only needs ~1 Hz for modals / bridge.
      const now = Date.now();
      if (now - lastZustandUpdateRef.current >= 1000) {
        lastZustandUpdateRef.current = now;
        const posStore = usePositionStore.getState();
        if (posStore.position !== position || posStore.duration !== duration) {
          posStore.updateProgress(position, duration);
        }
      }

      const activeSongId = store.currentSongId;
      if (didJustFinish && !!activeSongId && endHandledForSongIdRef.current !== activeSongId) {
        endHandledForSongIdRef.current = activeSongId;
        store.setIsPlaying(true);
        store.nextInPlaylist().catch(() => {});
        return;
      }

      // Adopted verbatim — no guard. playWhenReady is the user-facing transport
      // state (flips the instant a command lands); isPlaying stays false while
      // buffering. The fallback keeps this working against an older native build.
      // Suppressed = another app holds audio focus: nothing is coming out, so
      // show play, and a tap re-requests focus (MainPlayer.play).
      const transportPlaying = (typeof playWhenReady === 'boolean' ? playWhenReady : isPlaying) && suppressed !== true;
      if (store.isPlaying !== transportPlaying) {
        store.setIsPlaying(transportPlaying);
      }
    });

    // Media3 auto-advanced into a prepared next item — sync the store without re-load.
    const advancedSub = NativeAudioPlayer.addListener('onTrackAdvanced', (event: { mediaId?: string }) => {
      const mediaId = event?.mediaId;
      if (!mediaId) return;
      usePlayerStore.getState().adoptPreparedTrack(mediaId);
    });

    const commandSub = NativeAudioPlayer.addListener('onRemoteCommand', (event: any) => {
      if (__DEV__) console.log('[PlayerContext] Android native remote command:', event.command);
      const store = usePlayerStore.getState();
      if (event.command === 'next') {
        store.nextInPlaylist().catch(() => {});
      } else if (event.command === 'previous') {
        store.previousInPlaylist();
      }
    });

    // Back from another app: get the real state at once instead of trusting
    // whatever the UI last showed.
    const appStateSub = AppState.addEventListener('change', state => {
      if (state === 'active') NativeAudioPlayer.refreshStatus();
    });

    return () => {
      statusSub.remove();
      advancedSub.remove();
      commandSub.remove();
      appStateSub.remove();
    };
  }, [endHandledForSongIdRef]);

  return <PlayerContext.Provider value={player}>{children}</PlayerContext.Provider>;
};

// ─── iOS ──────────────────────────────────────────────────────────────────────
// Still JS-driven via expo-audio, so it keeps the optimistic update in
// requestPlayback plus both status guards.

const IosPlayerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const lastSeekAtRef = useRef(0);
  const lastZustandUpdateRef = useRef(0);
  const endHandledForSongIdRef = useEndOfTrackLatch();
  const currentSong = usePlayerStore(state => state.currentSong);

  const player = useAudioPlayer();
  const status = useAudioPlayerStatus(player);

  useEffect(() => {
    if (!player) return;
    playerControls.play = () => setTimeout(() => player.play(), 0);
    playerControls.pause = () => setTimeout(() => player.pause(), 0);
    playerControls.seekTo = (pos: number) => {
      lastSeekAtRef.current = Date.now();
      setTimeout(() => player.seekTo(pos), 0);
    };
  }, [player]);

  useEffect(() => {
    if (!player) return;
    if (currentSong) {
      player.setActiveForLockScreen(
        true,
        {
          title: currentSong.title,
          artist: currentSong.artist || 'Unknown Artist',
          artworkUrl: currentSong.coverImageUri,
          albumTitle: currentSong.album || '',
        },
        { showSeekBackward: true, showSeekForward: true }
      );
    } else {
      setTimeout(() => player.pause(), 0);
    }
  }, [player, currentSong]);

  useEffect(() => {
    if (!player) return;
    const subscription = (player as any).addListener('remoteCommand', (event: { command: string }) => {
      if (__DEV__) console.log('[PlayerContext] Remote command received:', event.command);
      const store = usePlayerStore.getState();
      if (event.command === 'next') {
        store.nextInPlaylist().catch(() => {});
      } else if (event.command === 'previous') {
        store.previousInPlaylist();
      }
    });
    return () => subscription.remove();
  }, [player]);

  useEffect(() => {
    if (!status) return;

    const { currentTime, duration, playing, playbackState, isBuffering, isLoaded, didJustFinish } = status;
    const store = usePlayerStore.getState();

    if (!isSeeking.value) {
      positionSV.value = currentTime;
    }
    durationSV.value = duration;

    const now = Date.now();
    if (now - lastZustandUpdateRef.current >= 1000) {
      lastZustandUpdateRef.current = now;
      const posStore = usePositionStore.getState();
      if (posStore.position !== currentTime || posStore.duration !== duration) {
        posStore.updateProgress(currentTime, duration);
      }
    }

    const justSought = Date.now() - lastSeekAtRef.current < 1500;
    const activeSongId = store.currentSongId;
    const isNearEndFallback =
      !didJustFinish &&
      store.isPlaying &&
      isLoaded &&
      !isBuffering &&
      !playing &&
      durationSV.value > 0 &&
      positionSV.value >= Math.max(0, durationSV.value - 0.35);
    const shouldAdvance =
      !justSought &&
      (didJustFinish || isNearEndFallback) &&
      !!activeSongId &&
      endHandledForSongIdRef.current !== activeSongId;

    if (shouldAdvance) {
      endHandledForSongIdRef.current = activeSongId;
      store.setIsPlaying(true);
      store.nextInPlaylist().catch(() => {});
      return;
    }

    if (
      shouldAdoptNativePlayingState({
        storePlaying: store.isPlaying,
        nativePlaying: playing,
        preserveDuringSeek: shouldPreservePlayingStateDuringSeek({
          playing,
          playbackState,
          isBuffering,
          isLoaded,
        }),
        isStaleEcho: isStalePlayingEcho(playing),
      })
    ) {
      store.setIsPlaying(playing);
    }
  }, [status, endHandledForSongIdRef]);

  return <PlayerContext.Provider value={player}>{children}</PlayerContext.Provider>;
};

// Chosen at module scope: the unused provider is never rendered, so its hooks —
// and the native modules behind them — are never touched on the other platform.
export const PlayerProvider: React.FC<{ children: React.ReactNode }> =
  Platform.OS === 'android' ? AndroidPlayerProvider : IosPlayerProvider;

export const usePlayer = () => useContext(PlayerContext);
