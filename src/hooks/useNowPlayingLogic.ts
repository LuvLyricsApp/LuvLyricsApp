import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Alert, Dimensions } from 'react-native';
// Navigation handled by screen component
import { useSharedValue, useAnimatedStyle, withTiming, runOnJS, useAnimatedReaction, withRepeat, Easing, withSequence } from 'react-native-reanimated';
import * as GestureHandler from 'react-native-gesture-handler';
import { usePlayer } from '../contexts/PlayerContext';
import { usePlayerStore } from '../store/playerStore';
import { positionSV, durationSV, isSeeking } from '../playback/positionBus';
import { useSongsStore } from '../store/songsStore';
import { useArtHistoryStore } from '../store/artHistoryStore';
import { useSettingsStore } from '../store/settingsStore';
import * as queries from '../database/queries';
import { getGradientColors } from '../constants/gradients';
import { extractAlbumColors } from '../services/NativePalette';
import { SynchronizedLyricsRef } from '../components/SynchronizedLyrics';
import { useThemeColors, useIsDark } from '../contexts/ThemeContext';
import { useIsSongLiked } from '../hooks/useIsSongLiked';

const { Gesture } = GestureHandler;
const { width } = Dimensions.get('window');

export function useNowPlayingLogic(songId: string) {
  const colors = useThemeColors();
  const isDark = useIsDark();
  const player = usePlayer();
  const currentSong = usePlayerStore(state => state.currentSong);
  const isCurrentSongLiked = useIsSongLiked(currentSong?.id);
  const showTransliteration = usePlayerStore(state => state.showTransliteration);
  const updateCurrentSong = usePlayerStore(state => state.updateCurrentSong);
  const loadedAudioId = usePlayerStore(state => state.loadedAudioId);
  const setLoadedAudioId = usePlayerStore(state => state.setLoadedAudioId);
  const storePlaying = usePlayerStore(state => state.isPlaying);
  const setStorePlaying = usePlayerStore(state => state.setIsPlaying);

  const toggleLike = useSongsStore(state => state.toggleLike);
  const addRecentArt = useArtHistoryStore(state => state.addRecentArt);
  const autoHideControls = useSettingsStore(state => state.autoHideControls);
  const setAutoHideControls = useSettingsStore(state => state.setAutoHideControls);
  const animateBackground = useSettingsStore(state => state.animateBackground);
  const setAnimateBackground = useSettingsStore(state => state.setAnimateBackground);

  const flatListRef = useRef<SynchronizedLyricsRef>(null);
  const activeLoadSongIdRef = useRef<string | null>(null);
  const [menuVisible, setMenuVisible] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState<{ x: number; y: number } | undefined>(undefined);
  const [showCoverSearch, setShowCoverSearch] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [showLyrics, setShowLyrics] = useState(true);

  // Auto-hide controls
  const controlsOpacity = useSharedValue(1);
  const hideTimerRef = useRef<NodeJS.Timeout | null>(null);

  const resetHideTimer = useCallback(() => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    controlsOpacity.value = withTiming(1, { duration: 200 });
    setControlsVisible(true);

    if (autoHideControls && storePlaying) {
      hideTimerRef.current = setTimeout(() => {
        controlsOpacity.value = withTiming(0, { duration: 500 });
      }, 3500);
    }
  }, [autoHideControls, storePlaying, controlsOpacity]);

  const panGesture = Gesture.Pan()
    .activeOffsetY(20)
    .failOffsetY(-20)
    .simultaneousWithExternalGesture()
    .onUpdate((e) => {
      if (e.translationY > 50 && controlsOpacity.value < 0.5) {
        runOnJS(resetHideTimer)();
      }
    });

  useEffect(() => {
    resetHideTimer();
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, [storePlaying, autoHideControls, resetHideTimer]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: controlsOpacity.value,
  }));

  const handleMenuPress = (event: any) => {
    const { nativeEvent } = event;
    const anchor = { x: nativeEvent.pageX, y: nativeEvent.pageY };
    setMenuAnchor(anchor);
    setMenuVisible(true);
  };

  // Background blob animations
  const blob1TranslateX = useSharedValue(0);
  const blob1TranslateY = useSharedValue(0);
  const blob1Scale = useSharedValue(1);
  const blob2TranslateX = useSharedValue(0);
  const blob2TranslateY = useSharedValue(0);
  const blob2Scale = useSharedValue(1);
  const blob3TranslateX = useSharedValue(0);
  const blob3TranslateY = useSharedValue(0);
  const blob3Scale = useSharedValue(1);

  useEffect(() => {
    if (animateBackground) {
      blob1TranslateX.value = withRepeat(withTiming(width * 0.5, { duration: 45000, easing: Easing.inOut(Easing.ease) }), -1, true);
      blob1TranslateY.value = withRepeat(withTiming(width * 0.3, { duration: 55000, easing: Easing.inOut(Easing.ease) }), -1, true);
      blob1Scale.value = withRepeat(withTiming(1.2, { duration: 60000, easing: Easing.inOut(Easing.ease) }), -1, true);

      blob2TranslateX.value = withRepeat(withTiming(-width * 0.5, { duration: 50000, easing: Easing.inOut(Easing.ease) }), -1, true);
      blob2TranslateY.value = withRepeat(withTiming(-width * 0.4, { duration: 62000, easing: Easing.inOut(Easing.ease) }), -1, true);
      blob2Scale.value = withRepeat(withTiming(1.3, { duration: 58000, easing: Easing.inOut(Easing.ease) }), -1, true);

      blob3TranslateX.value = withRepeat(withTiming(-width * 0.2, { duration: 38000, easing: Easing.inOut(Easing.ease) }), -1, true);
      blob3TranslateY.value = withRepeat(withTiming(width * 0.2, { duration: 42000, easing: Easing.inOut(Easing.ease) }), -1, true);
      blob3Scale.value = withRepeat(withTiming(1.4, { duration: 48000, easing: Easing.inOut(Easing.ease) }), -1, true);
    } else {
      blob1TranslateX.value = withTiming(0);
      blob1TranslateY.value = withTiming(0);
      blob1Scale.value = withTiming(1);
      blob2TranslateX.value = withTiming(0);
      blob2TranslateY.value = withTiming(0);
      blob2Scale.value = withTiming(1);
      blob3TranslateX.value = withTiming(0);
      blob3TranslateY.value = withTiming(0);
      blob3Scale.value = withTiming(1);
    }
  }, [animateBackground, blob1Scale, blob1TranslateX, blob1TranslateY, blob2Scale, blob2TranslateX, blob2TranslateY, blob3Scale, blob3TranslateX, blob3TranslateY]);

  const blob1Style = useAnimatedStyle(() => ({
    transform: [
      { translateX: blob1TranslateX.value } as any,
      { translateY: blob1TranslateY.value } as any,
      { scale: blob1Scale.value } as any,
    ],
  }));

  const blob2Style = useAnimatedStyle(() => ({
    transform: [
      { translateX: blob2TranslateX.value } as any,
      { translateY: blob2TranslateY.value } as any,
      { scale: blob2Scale.value } as any,
    ],
  }));

  const blob3Style = useAnimatedStyle(() => ({
    transform: [
      { translateX: blob3TranslateX.value } as any,
      { translateY: blob3TranslateY.value } as any,
      { scale: blob3Scale.value } as any,
    ],
  }));

  // Song loading
  useEffect(() => {
    let cancelled = false;
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
          Alert.alert('No Audio', 'This song has no audio file attached');
          return;
        }

        if (loadedAudioId === targetSongId) {
          if (__DEV__) console.log('[NowPlaying] Audio already loaded');
          if (!storePlaying) player?.play();
        } else {
          if (activeLoadSongIdRef.current === targetSongId) return;
          activeLoadSongIdRef.current = targetSongId;
          if (__DEV__) console.log('[NowPlaying] Loading audio:', songToPlay.title);
          await player?.replace(songToPlay.audioUri);
          if (cancelled) { activeLoadSongIdRef.current = null; return; }
          setLoadedAudioId(targetSongId);
          player?.play();
          activeLoadSongIdRef.current = null;
        }

        if (!songToPlay.lyrics || songToPlay.lyrics.length === 0) {
          if (__DEV__) console.log('[NowPlaying] Hydrating lyrics in background...');
          const fullSong = await queries.getSongById(targetSongId);
          if (fullSong && fullSong.lyrics.length > 0) {
            updateCurrentSong({ lyrics: fullSong.lyrics, lyricSource: (fullSong.lyricSource || 'plain') as any });
          }
        }
      } catch (error) {
        activeLoadSongIdRef.current = null;
        if (__DEV__) console.error('Failed to load song:', error);
        Alert.alert('Error', 'Could not load audio file.');
      }
    };
    load();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [songId, currentSong?.id, currentSong?.audioUri, currentSong?.lyrics?.length, loadedAudioId, player, setLoadedAudioId, storePlaying, updateCurrentSong]);

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

  const { lyricsDelay } = useSettingsStore();

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

  // Playback controls
  const playButtonScale = useSharedValue(1);

  const togglePlay = () => {
    resetHideTimer();
    if (!player) return;
    playButtonScale.value = withSequence(
      withTiming(0.8, { duration: 100 }),
      withTiming(1, { duration: 100 })
    );
    if (storePlaying) {
      setStorePlaying(false);
      player?.pause();
    } else {
      setStorePlaying(true);
      player?.play();
    }
  };

  const playButtonStyle = useAnimatedStyle(() => ({
    transform: [{ scale: playButtonScale.value }],
  }));

  const skipForward = async () => {
    resetHideTimer();
    await usePlayerStore.getState().nextInPlaylist();
  };

  const skipBackward = async () => {
    resetHideTimer();
    if (!player) return;
    if (positionSV.value > 3) {
      isSeeking.value = true;
      positionSV.value = 0;
      await player.seekTo(0);
      isSeeking.value = false;
    } else {
      usePlayerStore.getState().previousInPlaylist();
    }
  };

  const handleScrub = useCallback(async (seconds: number) => {
    if (player) {
      const wasPlaying = usePlayerStore.getState().isPlaying;
      await player.seekTo(seconds);
      if (wasPlaying) player.play();
    }
  }, [player]);

  const handleLyricTap = async (timestamp: number) => {
    resetHideTimer();
    if (!player) return;
    isSeeking.value = true;
    positionSV.value = timestamp;
    await player.seekTo(timestamp);
    player.play();
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
    }).catch(error => {
      if (__DEV__) console.error('[useNowPlayingLogic] extractAlbumColors failed', error);
    });
  }, [currentSong?.coverImageUri, isDynamicTheme]);

  const gradientColors = !isDynamicTheme || !currentSong?.coverImageUri
    ? getGradientColors(effectiveGradientId)
    : (extractedColors ?? ['#111', '#333', '#000']);

  return {
    colors,
    isDark,
    currentSong,
    isCurrentSongLiked,
    menuVisible,
    setMenuVisible,
    menuAnchor,
    handleMenuPress,
    showCoverSearch,
    setShowCoverSearch,
    controlsOpacity,
    controlsVisible,
    animatedStyle,
    showLyrics,
    setShowLyrics,
    panGesture,
    blob1Style,
    blob2Style,
    blob3Style,
    processedLyrics,
    isLinear,
    flatListRef,
    getActiveLyricIndex,
    playButtonStyle,
    togglePlay,
    skipForward,
    skipBackward,
    handleScrub,
    handleLyricTap,
    gradientColors,
    isDynamicTheme,
    updateCurrentSong,
    addRecentArt,
    autoHideControls,
    setAutoHideControls,
    animateBackground,
    setAnimateBackground,
    loadedAudioId,
    storePlaying,
    resetHideTimer,
    toggleLike,
    isUserScrolling,
    scrollTimeoutRef,
  };
}
