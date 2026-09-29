import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Alert } from 'react-native';
import { runOnJS, useAnimatedReaction } from 'react-native-reanimated';
import { usePlayer } from '../contexts/PlayerContext';
import { diag } from '../utils/diag';
import { usePlayerStore, beginAudioLoad, endAudioLoad, playerControls, prepareNextInQueue, takeResumePosition } from '../store/playerStore';
import { positionSV, durationSV, isSeeking } from '../playback/positionBus';
import { useSongsStore } from '../store/songsStore';
import { useArtHistoryStore } from '../store/artHistoryStore';
import { useSettingsStore } from '../store/settingsStore';
import * as queries from '../database/queries';
import { getGradientColors } from '../constants/gradients';
import { extractAlbumColors } from '../services/NativePalette';
import { SynchronizedLyricsRef } from '../components/SynchronizedLyrics';
import { useSongLikeState } from '../hooks/useIsSongLiked';

export function useNowPlayingLogic(songId: string, initialLyrics = false) {
  const player = usePlayer();
  const currentSong = usePlayerStore(state => state.currentSong);
  const { liked: isCurrentSongLiked, saving: isCurrentSongSaving } = useSongLikeState(currentSong);
  const showTransliteration = usePlayerStore(state => state.showTransliteration);
  const updateCurrentSong = usePlayerStore(state => state.updateCurrentSong);
  const loadedAudioId = usePlayerStore(state => state.loadedAudioId);
  const setLoadedAudioId = usePlayerStore(state => state.setLoadedAudioId);
  const storePlaying = usePlayerStore(state => state.isPlaying);
  const requestPlayback = usePlayerStore(state => state.requestPlayback);

  const toggleLike = useSongsStore(state => state.toggleLike);
  const addRecentArt = useArtHistoryStore(state => state.addRecentArt);

  const flatListRef = useRef<SynchronizedLyricsRef>(null);
  const didAutoPlayRef = useRef(false);
  const [showCoverSearch, setShowCoverSearch] = useState(false);
  // Apple Music (and Echo) open on the cover — where the canvas plays —
  // and lyrics are one tap away. Opening on lyrics hid the canvas entirely.
  const [showLyrics, setShowLyrics] = useState(initialLyrics);

  // The transport never hides itself. It used to fade out 3.5s into playback
  // and only came back on a downward drag, which read as the player vanishing.
  const controlsVisible = true;
  const animatedStyle = { opacity: 1 } as const;

  // Song loading
  useEffect(() => {
    const load = async () => {
      try {
        const targetSongId = songId;
        if (currentSong?.id && currentSong.id !== targetSongId) return;

        let songToPlay = currentSong?.id === targetSongId ? currentSong : null;
        if (!songToPlay || !songToPlay.audioUri) {
          if (__DEV__) console.log('[NowPlaying] Fetching song from DB...');
          songToPlay = await queries.getSongById(targetSongId);
        }

        if (!songToPlay?.audioUri) {
          Alert.alert('No audio', 'This song has no audio file attached.');
          return;
        }

        if (loadedAudioId === targetSongId) {
          if (__DEV__) console.log('[NowPlaying] Audio already loaded');
          // Resume only the first time the screen opens on an already-loaded
          // track. This effect re-runs on every store change, so resuming
          // unconditionally here fought the user's own pause.
          if (!didAutoPlayRef.current) {
            didAutoPlayRef.current = true;
            if (!usePlayerStore.getState().isPlaying) requestPlayback(true);
          }
        } else {
          if (!beginAudioLoad(targetSongId)) return;
          if (__DEV__) console.log('[NowPlaying] Loading audio:', songToPlay.title);
          await player?.replace(songToPlay.audioUri);
          // Give up only if another song took over while this one loaded. A
          // dependency change (the lyrics landing mid-load) re-runs this effect,
          // and bailing on `cancelled` here left the song loaded but never
          // started: the re-run couldn't claim the load that was still held.
          if (usePlayerStore.getState().currentSongId !== targetSongId) { endAudioLoad(targetSongId); return; }
          setLoadedAudioId(targetSongId);
          prepareNextInQueue();
          const resumeAt = takeResumePosition(targetSongId);
          if (resumeAt !== null) playerControls.seekTo(resumeAt);
          didAutoPlayRef.current = true;
          requestPlayback(true);
          diag('audio', `player loaded "${songToPlay.title}", play requested`);
          endAudioLoad(targetSongId);
        }

        if (!songToPlay.lyrics || songToPlay.lyrics.length === 0) {
          if (__DEV__) console.log('[NowPlaying] Hydrating lyrics in background...');
          const fullSong = await queries.getSongById(targetSongId);
          if (fullSong && fullSong.lyrics.length > 0) {
            updateCurrentSong({ lyrics: fullSong.lyrics, lyricSource: (fullSong.lyricSource || 'plain') as any });
          }
        }
      } catch (error) {
        endAudioLoad(songId);
        if (__DEV__) console.error('Failed to load song:', error);
        Alert.alert('Error', 'Could not load audio file.');
      }
    };
    load();
    // storePlaying is deliberately not a dep — this effect loads audio, it must
    // never react to play/pause state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [songId, currentSong?.id, currentSong?.audioUri, currentSong?.lyrics?.length, loadedAudioId, player, setLoadedAudioId, updateCurrentSong]);

  // Lyrics processing
  const processedLyrics = React.useMemo(() => {
    const rawLyrics = (showTransliteration && currentSong?.transliteratedLyrics)
      ? currentSong.transliteratedLyrics
      : (currentSong?.lyrics || []);

    if (rawLyrics.length > 0) {
      const lastTimestamp = rawLyrics[rawLyrics.length - 1].timestamp;
      const isCollapsed = lastTimestamp === 0 && rawLyrics.length > 1;

      if (isCollapsed) {
        const duration = (durationSV.value > 0)
          ? durationSV.value
          : (currentSong?.duration || 180);

        if (__DEV__) console.log(`[NowPlaying] ⚠️ Detected collapsed lyrics. Auto-generating timestamps for ${duration}s`);

        const newLyrics = rawLyrics.map((line, index) => ({
          ...line,
          timestamp: (index / rawLyrics.length) * duration,
        }));
        return newLyrics;
      }

      const firstTimestamp = rawLyrics[0].timestamp;
      if (firstTimestamp > 2) {
        return [{ timestamp: 0, text: '' }, ...rawLyrics];
      }
    }
    return rawLyrics;
  }, [currentSong?.lyrics, currentSong?.transliteratedLyrics, showTransliteration, currentSong?.duration]);

  const isLinear = React.useMemo(() => {
    if (!processedLyrics || processedLyrics.length <= 10) return false;
    const firstGap = processedLyrics[1].timestamp - processedLyrics[0].timestamp;
    let isConstant = true;
    for (let i = 1; i < 9; i++) {
      const gap = processedLyrics[i + 1].timestamp - processedLyrics[i].timestamp;
      if (Math.abs(gap - firstGap) > 0.05) {
        isConstant = false;
        break;
      }
    }
    return isConstant;
  }, [processedLyrics]);

  const isUserScrolling = useRef(false);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Selector only — this hook re-renders on position ticks during playback.
  const lyricsDelay = useSettingsStore(s => s.lyricsDelay);

  const linearScrollDataRef = useRef({ isLinear, processedLyrics, lyricsDelay });
  linearScrollDataRef.current = { isLinear, processedLyrics, lyricsDelay };

  const doLinearScroll = useCallback((pos: number) => {
    const { isLinear: lin, processedLyrics: lyrics } = linearScrollDataRef.current;
    if (!lin || !flatListRef.current || isUserScrolling.current || !lyrics.length) return;
    const progress = Math.min(1, Math.max(0, pos / (durationSV.value || 180)));
    const estimatedIndex = Math.floor(progress * (lyrics.length - 1));
    flatListRef.current.scrollToIndex({ index: estimatedIndex, animated: true, viewPosition: 0.4 });
  }, []);

  useAnimatedReaction(
    () => positionSV.value,
    (pos) => {
      if (linearScrollDataRef.current.isLinear) {
        runOnJS(doLinearScroll)(pos);
      }
    }
  );

  const getActiveLyricIndex = useCallback(() => {
    if (!processedLyrics || processedLyrics.length === 0) return -1;
    const effectiveTime = positionSV.value + lyricsDelay;
    return processedLyrics.findIndex((line, i) => {
      const nextLine = processedLyrics[i + 1];
      return effectiveTime >= line.timestamp && (!nextLine || effectiveTime < nextLine.timestamp);
    });
  }, [processedLyrics, lyricsDelay]);

  // Playback controls (the button's own press animation lives in NowPlayingControls)
  const togglePlay = () => {
    if (!player) return;
    requestPlayback(!usePlayerStore.getState().isPlaying);
  };

  const skipForward = async () => {
    await usePlayerStore.getState().nextInPlaylist();
  };

  const skipBackward = async () => {
    if (!player) return;
    if (positionSV.value > 3) {
      isSeeking.value = true;
      positionSV.value = 0;
      // seekTo pauses on iOS — restart-track must not silently stop playback.
      const wasPlaying = usePlayerStore.getState().isPlaying;
      await player.seekTo(0);
      if (wasPlaying) requestPlayback(true);
      isSeeking.value = false;
    } else {
      usePlayerStore.getState().previousInPlaylist();
    }
  };

  const handleScrub = useCallback(async (seconds: number) => {
    if (player) {
      const wasPlaying = usePlayerStore.getState().isPlaying;
      await player.seekTo(seconds);
      // requestPlayback (not player.play) so the store stays in sync and the
      // post-seek status blip is recognised as stale.
      if (wasPlaying) requestPlayback(true);
    }
  }, [player, requestPlayback]);

  const handleLyricTap = async (timestamp: number) => {
    if (!player) return;
    isSeeking.value = true;
    positionSV.value = timestamp;
    await player.seekTo(timestamp);
    // Tapping a lyric always starts playback (existing behaviour), but it must go
    // through the store or the button shows "play" while audio is running.
    requestPlayback(true);
    isSeeking.value = false;
  };

  // Dynamic theme
  const isDynamicTheme = currentSong?.gradientId === 'dynamic';
  const effectiveGradientId = (isDynamicTheme && !currentSong?.coverImageUri)
    ? 'aurora'
    : (currentSong?.gradientId || 'aurora');

  // Palette colors extracted natively from album art (Android only; null on iOS/no cover)
  const [extractedColors, setExtractedColors] = useState<string[] | null>(null);

  useEffect(() => {
    if (!isDynamicTheme || !currentSong?.coverImageUri) {
      setExtractedColors(null);
      return;
    }
    extractAlbumColors(currentSong.coverImageUri).then(swatches => {
      if (!swatches) return;
      setExtractedColors([
        swatches.darkVibrant?.color ?? swatches.dominant?.color ?? '#111',
        swatches.vibrant?.color ?? swatches.dominant?.color ?? '#333',
        swatches.darkMuted?.color ?? '#000',
      ]);
    }).catch(() => {});
  }, [currentSong?.coverImageUri, isDynamicTheme]);

  const gradientColors = !isDynamicTheme || !currentSong?.coverImageUri
    ? getGradientColors(effectiveGradientId)
    : (extractedColors ?? ['#111', '#333', '#000']);

  return {
    currentSong,
    isCurrentSongLiked,
    isCurrentSongSaving,
    showCoverSearch,
    setShowCoverSearch,
    controlsVisible,
    animatedStyle,
    showLyrics,
    setShowLyrics,
    processedLyrics,
    isLinear,
    flatListRef,
    getActiveLyricIndex,
    togglePlay,
    skipForward,
    skipBackward,
    handleScrub,
    handleLyricTap,
    gradientColors,
    isDynamicTheme,
    updateCurrentSong,
    addRecentArt,
    loadedAudioId,
    storePlaying,
    toggleLike,
    isUserScrolling,
    scrollTimeoutRef,
  };
}
