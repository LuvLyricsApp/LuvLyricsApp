import React, { createContext, useContext, useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { usePlayerStore, playerControls } from '../store/playerStore';
import { usePositionStore } from '../store/positionStore';
import { shouldPreservePlayingStateDuringSeek } from './playerStatusGuard';
import { positionSV, durationSV, isSeeking } from '../playback/positionBus';
import { NativeAudioPlayer } from '../services/NativeAudioPlayer';

/**
 * How close to the end of a track (in seconds) we consider "near the end" for
 * the purposes of the auto-next fallback.
 *
 * Auto-advance uses two signals:
 *   1. didJustFinish — the primary signal fired by the audio engine when a
 *      track completes naturally.
 *   2. isNearEndFallback — a safety net for platforms/states where
 *      didJustFinish is unreliable (e.g. iOS when the player stalls right at
 *      the last frame and never fires the finish event).
 *
 * The fallback fires when the player reports it is loaded and not buffering,
 * yet is no longer playing, and the playhead is within this many seconds of
 * the total duration. 0.35 s was chosen because it is large enough to catch
 * normal end-of-track stalls (which typically land in the last ~0.1–0.2 s)
 * while being small enough to avoid false-positives during a seek to near the
 * end of a track.
 */

const AUTO_ADVANCE_END_THRESHOLD_S = 0.35;

const PlayerContext = createContext<any>(null);

export const PlayerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const lastSeekAtRef = useRef(0);
  const lastZustandUpdateRef = useRef(0);
  const endHandledForSongIdRef = useRef<string | null>(null);

  // Call expo-audio hooks unconditionally to satisfy React Hook rules; ignored on Android in favor of NativeAudioPlayer
  const iosPlayer = useAudioPlayer();
  const iosStatus = useAudioPlayerStatus(iosPlayer);


  const androidPlayer = useRef({
    play: () => NativeAudioPlayer.play(),
    pause: () => NativeAudioPlayer.pause(),
    seekTo: (time: number) => {
      lastSeekAtRef.current = Date.now();
      NativeAudioPlayer.seekTo(time);
    },
    replace: (source: any) => {
      const uri = typeof source === 'string' ? source : source?.uri;
      if (!uri) return;
      const store = usePlayerStore.getState();
      const current = store.currentSong;
      const metadata = {
        title: current?.title || 'Unknown Title',
        artist: current?.artist || 'Unknown Artist',
        album: current?.album || '',
        artworkUri: current?.coverImageUri || ''
      };
      return NativeAudioPlayer.load(uri, metadata);
    },
    setActiveForLockScreen: (active: boolean, metadata?: any, _options?: any) => {
      if (active && metadata) {
        NativeAudioPlayer.updateMetadata({
          title: metadata.title || 'Unknown Title',
          artist: metadata.artist || 'Unknown Artist',
          album: metadata.albumTitle || '',
          artworkUri: metadata.artworkUrl || ''
        });
      }
    }
  }).current;

  const currentSong = usePlayerStore(state => state.currentSong);
  const currentSongId = usePlayerStore(state => state.currentSongId);

  useEffect(() => {
    if (currentSongId && endHandledForSongIdRef.current !== currentSongId) {
      endHandledForSongIdRef.current = null;
    }
  }, [currentSongId]);

 
  useEffect(() => {
    if (Platform.OS === 'android') {
     
      playerControls.pause = () => setTimeout(() => androidPlayer.pause(), 0);
      playerControls.seekTo = (pos: number) => {
        lastSeekAtRef.current = Date.now();
        setTimeout(() => androidPlayer.seekTo(pos), 0);
      };
    } else if (iosPlayer) {
      
      playerControls.play = () => setTimeout(() => iosPlayer.play(), 0);
      playerControls.pause = () => setTimeout(() => iosPlayer.pause(), 0);
      playerControls.seekTo = (pos: number) => {
        lastSeekAtRef.current = Date.now();
        setTimeout(() => iosPlayer.seekTo(pos), 0);
      };
    }
  }, [iosPlayer, androidPlayer]);


  useEffect(() => {
    if (Platform.OS === 'android') {
      if (currentSong) {
        androidPlayer.setActiveForLockScreen(true, {
          title: currentSong.title,
          artist: currentSong.artist || 'Unknown Artist',
          artworkUrl: currentSong.coverImageUri,
          albumTitle: currentSong.album || ''
        });
      } else {
        
        setTimeout(() => {
          androidPlayer.pause();
        }, 0);
      }
    } else if (iosPlayer) {
      if (currentSong) {
        iosPlayer.setActiveForLockScreen(true, {
          title: currentSong.title,
          artist: currentSong.artist || 'Unknown Artist',
          artworkUrl: currentSong.coverImageUri,
          albumTitle: currentSong.album || ''
        }, {
          showSeekBackward: true,
          showSeekForward: true
        });
      } else {
        // Defensive defer — useEffect already runs post-commit, but keeps the pattern
        // consistent with playerControls bindings above. Safe to remove if verified on device.
        setTimeout(() => {
          iosPlayer.pause();
        }, 0);
      }
    }
  }, [iosPlayer, currentSong, androidPlayer]);

  
  useEffect(() => {
    if (Platform.OS === 'android' || !iosPlayer) return;
    
    const subscription = (iosPlayer as any).addListener('remoteCommand', (event: { command: string }) => {
      if (__DEV__) console.log('[PlayerContext] Remote command received:', event.command);
      const store = usePlayerStore.getState();
      if (event.command === 'next') {
        store.nextInPlaylist().catch(() => {});
      } else if (event.command === 'previous') {
        store.previousInPlaylist();
      }
    });

    return () => subscription.remove();
  }, [iosPlayer]);

  useEffect(() => {
    if (Platform.OS === 'android' || !iosStatus) return;
    
    const { currentTime, duration, playing, playbackState, isBuffering, isLoaded, didJustFinish } = iosStatus;
    const store = usePlayerStore.getState();

    if (!isSeeking.value) {
      positionSV.value = currentTime;
    }
    durationSV.value = duration;

    const now = Date.now();
    if (now - lastZustandUpdateRef.current >= 500) {
      lastZustandUpdateRef.current = now;
      const posStore = usePositionStore.getState();
      if (posStore.position !== currentTime || posStore.duration !== duration) {
        posStore.updateProgress(currentTime, duration);
      }
    }

    const justSought = Date.now() - lastSeekAtRef.current < 1500;
    const activeSongId = store.currentSongId;

    // Two-signal auto-next system:
    // Primary: didJustFinish — fired by expo-audio when playback completes normally.
    // Fallback: isNearEndFallback — catches cases where didJustFinish never fires
    //   (seen on some Android versions and certain audio formats where the player
    //   stops without emitting the finish event).
    //
    // The fallback requires store.isPlaying === true so it does NOT trigger when
    // the user manually pauses near the end of a track — only genuine playback
    // completion advances the queue.
    //
    // 0.35s (AUTO_ADVANCE_END_THRESHOLD_S) was chosen as a window large enough
    // to catch late-arriving finish events but small enough to avoid premature
    // advances during normal playback.
    const isNearEndFallback =
      !didJustFinish &&
      store.isPlaying &&
      isLoaded &&
      !isBuffering &&
      !playing &&
      durationSV.value > 0 &&
      positionSV.value >= Math.max(0, durationSV.value - AUTO_ADVANCE_END_THRESHOLD_S);
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

    if (store.isPlaying !== playing) {
      if (shouldPreservePlayingStateDuringSeek({ playing, playbackState, isBuffering, isLoaded })) {
        
      } else {
        store.setIsPlaying(playing);
      }
    }
  }, [iosStatus]);

  
  useEffect(() => {
    if (Platform.OS !== 'android') return;

    const statusSub = NativeAudioPlayer.addListener('onPlaybackStatus', (event: any) => {
      const { position, duration, isPlaying, didJustFinish } = event;
      const store = usePlayerStore.getState();

      if (!isSeeking.value) {
        positionSV.value = position;
      }
      durationSV.value = duration;

      const now = Date.now();
      if (now - lastZustandUpdateRef.current >= 500) {
        lastZustandUpdateRef.current = now;
        const posStore = usePositionStore.getState();
        if (posStore.position !== position || posStore.duration !== duration) {
          posStore.updateProgress(position, duration);
        }
      }

      const activeSongId = store.currentSongId;
      const shouldAdvance = didJustFinish && !!activeSongId && endHandledForSongIdRef.current !== activeSongId;

      if (shouldAdvance) {
        endHandledForSongIdRef.current = activeSongId;
        store.setIsPlaying(true);
        store.nextInPlaylist().catch(() => {});
        return;
      }

      if (store.isPlaying !== isPlaying) {
        store.setIsPlaying(isPlaying);
      }
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

    return () => {
      statusSub.remove();
      commandSub.remove();
    };
  }, []);

  const playerValue = Platform.OS === 'android' ? androidPlayer : iosPlayer;

  return <PlayerContext.Provider value={playerValue}>{children}</PlayerContext.Provider>;
};

export const usePlayer = () => useContext(PlayerContext);