import React, { useState, useEffect, useRef, useCallback, memo } from 'react';
import { YtMiniPlayer } from './YtMiniPlayer';
import { View, Text, Pressable, StyleSheet, Image, Dimensions, Platform, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as GestureHandler from 'react-native-gesture-handler';
import SynchronizedLyrics from './SynchronizedLyrics';
import InstrumentalWaveform, { isInstrumentalLyric } from './InstrumentalWaveform';
import TimelineScrubber from './TimelineScrubber';
const { Gesture, GestureDetector } = GestureHandler;
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  withSequence,
  withSpring,
  interpolate,
  Extrapolation,
  runOnJS,
  useDerivedValue,
  useAnimatedReaction
} from 'react-native-reanimated';
import { positionSV, durationSV, isSeeking } from '../playback/positionBus';

import { usePlayer } from '../contexts/PlayerContext';
import { usePlayerStore, playerControls, beginAudioLoad, endAudioLoad, prepareNextInQueue } from '../store/playerStore';
import { useSettingsStore } from '../store/settingsStore';
import { useSongsStore } from '../store/songsStore';
import { useIsSongLiked } from '../hooks/useIsSongLiked';
import { useIsDark } from '../contexts/ThemeContext';
import { getGradientColors } from '../constants/gradients';
import { TAB_BAR_HEIGHT, CLASSIC_MINI_PLAYER_HEIGHT } from '../constants/layout';
import { RotatingVinyl } from './VinylRecord';
import ArtworkFlowBackground from './ArtworkFlowBackground';
import { getCurrentLineIndex } from '../utils/timestampParser';
import { Fonts } from '../constants/fonts';

const { width } = Dimensions.get('window');

// Transport / song row height inside the classic shell (scrubber sits on its top edge).
const CLASSIC_TRANSPORT_H = CLASSIC_MINI_PLAYER_HEIGHT;

// Touch height of the classic scrubber wrapper. The wrapper is bottom-anchored at
// (CLASSIC_TRANSPORT_H - this), so its TOP edge lands at exactly CLASSIC_TRANSPORT_H
// above the shell bottom — i.e. on the shell's top edge when collapsed, and on the
// transport row's top seam at every other stage. Keep the two in this relationship;
// the extra height below the track exists only because Android clips touch dispatch
// to the parent's bounds, which would otherwise throw away the scrubber's hitSlop.
const CLASSIC_SCRUBBER_HIT_H = 32;

// Classic shell height at the two open stages, as a fraction of screen height.
// Shared by the animated shell height and the lyrics container so the two can
// never drift apart.
const CLASSIC_HALF_RATIO = 0.54;
const CLASSIC_FULL_RATIO = 0.915;

const ISLAND_COVER_BLUR = Platform.OS === 'android' ? 30 : 36;
const COVER_BLEED = 20; // px the blurred image overshoots the clip on each side

// Create Animated Pressable
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// ΓöÇΓöÇΓöÇ Memoized sub-panels ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
// Defined outside MiniPlayer so React never creates a new component type on re-render.

interface TrackInfoProps {
  title: string;
  artist: string;
  coverImageUri?: string;
  isIsland: boolean;
  onPress: () => void;
  onBodyPress: () => void;
}
const TrackInfo = memo(({ title, artist, coverImageUri, isIsland, onPress, onBodyPress }: TrackInfoProps) => (
  <>
    <Pressable onPress={(e) => { e.stopPropagation(); onPress(); }}>
      {coverImageUri ? (
        <Animated.Image
          source={{ uri: coverImageUri }}
          style={[styles.coverThumbnail, isIsland && styles.islandCover]}
        />
      ) : (
        <View style={[styles.placeholderThumbnail, isIsland && styles.islandCover]}>
          <Ionicons name="musical-notes" size={20} color="#666" />
        </View>
      )}
    </Pressable>
    <Pressable onPress={(e) => { e.stopPropagation(); onBodyPress(); }} style={styles.info}>
      <Text style={styles.title} numberOfLines={1}>{title}</Text>
      <Text style={[styles.artist, isIsland && { display: 'none' }]} numberOfLines={1}>
        {artist || 'Unknown Artist'}
      </Text>
    </Pressable>
  </>
));
TrackInfo.displayName = 'TrackInfo';

interface PlaybackControlsProps {
  playing: boolean;
  onToggle: (e?: any) => void;
  onSkipBack: (e?: any) => void;
  onSkipForward: (e?: any) => void;
  animatedButtonStyle: any;
  variant: 'bar' | 'island-collapsed' | 'island-expanded';
  showSkipButtons?: boolean;
}
// Width the skip buttons occupy once fully grown (24px icon + 4px padding each side).
const SKIP_BUTTON_WIDTH = 32;

const PlaybackControls = memo(({
  playing, onToggle, onSkipBack, onSkipForward, animatedButtonStyle, variant, showSkipButtons = true,
}: PlaybackControlsProps) => {
  const isBar = variant === 'bar';

  // Skip buttons unfurl from behind the play button as the classic bar expands.
  // Width is animated alongside opacity so the row re-centres instead of the
  // buttons snapping into reserved space. Hooks stay above every early return.
  const skipProgress = useSharedValue(showSkipButtons ? 1 : 0);
  useEffect(() => {
    skipProgress.value = withSpring(showSkipButtons ? 1 : 0, {
      damping: 18,
      stiffness: 190,
      mass: 0.6,
    });
  }, [showSkipButtons, skipProgress]);

  const skipBackStyle = useAnimatedStyle(() => ({
    width: skipProgress.value * SKIP_BUTTON_WIDTH,
    opacity: skipProgress.value,
    transform: [
      { scale: 0.55 + skipProgress.value * 0.45 },
      { translateX: (1 - skipProgress.value) * 14 },
    ],
  } as ViewStyle));

  const skipForwardStyle = useAnimatedStyle(() => ({
    width: skipProgress.value * SKIP_BUTTON_WIDTH,
    opacity: skipProgress.value,
    transform: [
      { scale: 0.55 + skipProgress.value * 0.45 },
      { translateX: (1 - skipProgress.value) * -14 },
    ],
  } as ViewStyle));

  if (variant === 'island-collapsed') {
    return (
      <View style={[styles.islandControls, { zIndex: 10 }]}>
        <Pressable onPress={onToggle} hitSlop={20}>
          <Animated.View style={animatedButtonStyle}>
            <Ionicons name={playing ? 'pause' : 'play'} size={24} color="#fff" />
          </Animated.View>
        </Pressable>
      </View>
    );
  }

  // Island expanded: skip buttons are always present, no growth animation needed.
  if (!isBar) {
    return (
      <View style={styles.expandedControls}>
        {showSkipButtons && (
          <Pressable onPress={() => onSkipBack()} hitSlop={10}>
            <Ionicons name="play-skip-back" size={24} color="#fff" />
          </Pressable>
        )}
        <Pressable onPress={() => onToggle()} hitSlop={20}>
          <Animated.View style={animatedButtonStyle}>
            <Ionicons name={playing ? 'pause' : 'play'} size={32} color="#fff" />
          </Animated.View>
        </Pressable>
        {showSkipButtons && (
          <Pressable onPress={() => onSkipForward()} hitSlop={10}>
            <Ionicons name="play-skip-forward" size={24} color="#fff" />
          </Pressable>
        )}
      </View>
    );
  }

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <Animated.View style={[styles.skipWrap, skipBackStyle]}>
        <Pressable
          onPress={(e) => { e.stopPropagation(); onSkipBack(e); }}
          style={styles.controlButton}
        >
          <Ionicons name="play-skip-back" size={24} color="#fff" />
        </Pressable>
      </Animated.View>
      <Pressable
        onPress={(e) => { e.stopPropagation(); onToggle(e); }}
        hitSlop={20}
        style={[styles.playButton, { marginHorizontal: showSkipButtons ? 2 : 0 }]}
      >
        <Animated.View style={animatedButtonStyle}>
          <Ionicons name={playing ? 'pause' : 'play'} size={32} color="#fff" />
        </Animated.View>
      </Pressable>
      <Animated.View style={[styles.skipWrap, skipForwardStyle]}>
        <Pressable
          onPress={(e) => { e.stopPropagation(); onSkipForward(e); }}
          style={styles.controlButton}
        >
          <Ionicons name="play-skip-forward" size={24} color="#fff" />
        </Pressable>
      </Animated.View>
    </View>
  );
});
PlaybackControls.displayName = 'PlaybackControls';

// UIManager.setLayoutAnimationEnabledExperimental removed to avoid New Architecture warning

export const MiniPlayer: React.FC<{ isHomeTab?: boolean }> = ({ isHomeTab = true }) => {
  const player = usePlayer();
  const currentSong = usePlayerStore(state => state.currentSong);
  const showTransliteration = usePlayerStore(state => state.showTransliteration);
  const loadedAudioId = usePlayerStore(state => state.loadedAudioId);
  const setLoadedAudioId = usePlayerStore(state => state.setLoadedAudioId);
  const requestPlayback = usePlayerStore(state => state.requestPlayback);
  const storePlaying = usePlayerStore(state => state.isPlaying);
  const miniPlayerStyle = useSettingsStore(state => state.miniPlayerStyle);
  const libraryFocusMode = useSettingsStore(state => state.libraryFocusMode);
  const islandBgMode = useSettingsStore(state => state.islandBgMode);
  const classicBarBgMode = useSettingsStore(state => state.classicBarBgMode);
  const animateBackground = useSettingsStore(state => state.animateBackground);
  const insets = useSafeAreaInsets();
  const isDark = useIsDark();
  const toggleLike = useSongsStore(state => state.toggleLike);
  const isLiked = useIsSongLiked(currentSong?.id);

  // Animation for Play/Pause Button
  const playButtonScale = useSharedValue(1);

  const animatedButtonStyle = useAnimatedStyle(() => ({
    transform: [{ scale: playButtonScale.value }]
  }));

  // togglePlay reads live store state so the callback stays stable across renders.
  // A stable callback means PlaybackControls (memo'd) never re-renders just because
  // the play/pause state changed ΓÇö only when the icon prop itself changes.
  // requestPlayback routes through playerControls (setTimeout-wrapped) to avoid
  // "accessed on wrong thread" on Android, and arms the status echo guard.
  const togglePlay = useCallback((e?: any) => {
      e?.stopPropagation();
      if (!currentSong) return;

      playButtonScale.value = withSequence(
          withTiming(0.82, { duration: 55 }),
          withSpring(1, { damping: 18, stiffness: 380 })
      );

      requestPlayback(!usePlayerStore.getState().isPlaying);
  }, [currentSong, requestPlayback, playButtonScale]);

  
  const [expanded, setExpanded] = useState(false);
  const [lyricExpanded, setLyricExpanded] = useState(false);
  const [fullLyricExpanded, setFullLyricExpanded] = useState(false);
  const [classicFullExpanded, setClassicFullExpanded] = useState(false);
  const [lyricExpandedAt, setLyricExpandedAt] = useState(0);
  const [showYtButton, setShowYtButton] = useState(false);
  const [showYtMini, setShowYtMini] = useState(false);
  const ytButtonOpacity = useSharedValue(0);
  const ytButtonScale = useSharedValue(0.6);
  const ytButtonTimer = useRef<NodeJS.Timeout | null>(null);
  const wasPlayingBeforeYt = useRef(false);
  const ytVideoPreview = useSettingsStore(state => state.ytVideoPreview);
  
  // Animation values
  const expansionProgress = useSharedValue(0); // 0 = collapsed, 1 = half-opened (classic) or tray (island)
  const lyricExpansionProgress = useSharedValue(0); // 0 = tray, 1 = half screen (island)
  const fullExpansionProgress = useSharedValue(0); // 0 = half screen, 1 = full screen (island)
  const classicFullProgress = useSharedValue(0); // 0 = half-opened, 1 = 95% full (classic only)
  
  const isIsland = miniPlayerStyle === 'island' && isHomeTab;
  
  const screenHeight = Dimensions.get('window').height;

  const gradientColors = currentSong?.gradientId 
    ? getGradientColors(currentSong.gradientId) 
    : ['#222', '#111'];
    
  // Local state for persistent lyrics (Cross-fade support)
  const [displayedSong, setDisplayedSong] = useState(currentSong);
  const transitionOpacity = useSharedValue(1);

  // Update displayed song with cross-fade when expanded in Classic Mode
  // Update displayed song with cross-fade when expanded in Classic Mode
  useEffect(() => {
    // 1. Song Changed (ID mismatch)
    if (currentSong?.id !== displayedSong?.id) {
        if (!isIsland && expanded) {
            // Fade Out -> Update Data -> Fade In
            transitionOpacity.value = withTiming(0, { duration: 300 }, (finished) => {
                if (finished) {
                    runOnJS(setDisplayedSong)(currentSong);
                    transitionOpacity.value = withTiming(1, { duration: 300 });
                }
            });
        } else {
            // Instant update if not expanded or in Island mode
            setDisplayedSong(currentSong);
            transitionOpacity.value = 1;
        }
    } 
    // 2. Same Song, Updated Data (e.g. Lyrics found)
    else if (currentSong !== displayedSong) {
         setDisplayedSong(currentSong);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSong, expanded, isIsland]);
    
  // Per-style background mode (island vs classic bar each have their own setting)
  const activeBgMode = isIsland ? islandBgMode : classicBarBgMode;
  const useThemeBg = activeBgMode !== 'album-art';

  const themePlayerColors: [string, string, string] = (() => {
    switch (activeBgMode) {
      case 'song-gradient': return [gradientColors[0] || '#111', gradientColors[1] || '#333', gradientColors[2] || gradientColors[0] || '#111'] as [string, string, string];
      case 'purest-black': return ['#000000', '#000000', '#000000'];
      case 'grey':         return ['#121212', '#212121', '#121212'];
      case 'theme-blue':   return ['#0A1628', '#1A3A6B', '#2F8CFF'];
      case 'theme-subtle': return ['#0A0A0A', '#1F1F1F', '#0A0A0A'];
      case 'aurora':       return ['#000000', '#EA7980', '#1D728F'];
      default:             return ['#080808', '#0A0A0A', '#080808'];
    }
  })();

  // Seek lock timeout (isSeeking shared value lives in positionBus)
  const seekLockTimeout = useRef<NodeJS.Timeout | null>(null);
  



  // Cleanup seekLock
  useEffect(() => {
    return () => {
      if (seekLockTimeout.current) clearTimeout(seekLockTimeout.current);
    };
  }, []);

  // Track if this is the first song loore)
  const isInitialLoad = useRef(true);

  // Audio Sync Logic: Auto-load song if it changes in the store
  useEffect(() => {
    const syncAudio = async () => {
      if (!currentSong || !player) return;
      
      // If the player doesn't have this audio loaded, load it.
      // beginAudioLoad keeps this single player surface as the only owner of
      // replace() calls for a track.
      if (loadedAudioId !== currentSong.id && currentSong.audioUri) {
        const songId = currentSong.id;
        if (!beginAudioLoad(songId)) return;
        try {
          if (__DEV__) console.log('[MiniPlayer] Syncing audio for:', currentSong.title);
          await player.replace(currentSong.audioUri);
          setLoadedAudioId(songId);
          // Stage the following queue item in Media3 (Android) for gapless advance.
          prepareNextInQueue();

          // On app startup (first load), don't auto-play
          // On user-initiated song change, auto-play
          if (isInitialLoad.current) {
            isInitialLoad.current = false;
            if (__DEV__) console.log('[MiniPlayer] Initial load - staying paused');
          } else {
            requestPlayback(true);
            if (__DEV__) console.log('[MiniPlayer] User selected song - auto-playing');
          }
        } catch (error) {
          if (__DEV__) console.error('[MiniPlayer] Failed to sync audio:', error);
        } finally {
          endAudioLoad(songId);
        }
      }
    };

    syncAudio();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSong?.id, player, loadedAudioId, setLoadedAudioId, requestPlayback]);

  // Auto-close removed: Lyrics persist across songs
  // useEffect(() => { ... }, [currentSong?.id, isIsland]);

  // Capture timestamp when any lyric view opens so SynchronizedLyrics can reset its scroll
  useEffect(() => {
    if (expanded || lyricExpanded || fullLyricExpanded || classicFullExpanded) {
      setLyricExpandedAt(Date.now());
    }
  }, [expanded, lyricExpanded, fullLyricExpanded, classicFullExpanded]);

  // Show YouTube button for 5s when classic bar expands (beta feature)
  useEffect(() => {
    if (!isIsland && expanded && ytVideoPreview && currentSong?.youtubeVideoId) {
      setShowYtButton(true);
      ytButtonOpacity.value = withSpring(1, { damping: 14, stiffness: 120 });
      ytButtonScale.value = withSpring(1, { damping: 12, stiffness: 140 });
      if (ytButtonTimer.current) clearTimeout(ytButtonTimer.current);
      ytButtonTimer.current = setTimeout(() => {
        ytButtonOpacity.value = withTiming(0, { duration: 400 });
        ytButtonScale.value = withTiming(0.6, { duration: 400 });
        setTimeout(() => setShowYtButton(false), 420);
      }, 5000);
    } else {
      if (ytButtonTimer.current) clearTimeout(ytButtonTimer.current);
      ytButtonOpacity.value = withTiming(0, { duration: 200 });
      ytButtonScale.value = withTiming(0.6, { duration: 200 });
      setShowYtButton(false);
    }
    return () => { if (ytButtonTimer.current) clearTimeout(ytButtonTimer.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded, isIsland, ytVideoPreview, currentSong?.youtubeVideoId]);

  // Classic Height Animation
  const animatedIslandStyle = useAnimatedStyle(() => {
    if (!isIsland) return {};

    const currentWidth = interpolate(
      expansionProgress.value,
      [0, 1],
      [width * 0.52, width - 24], // Expand to full width minus margin * 2 (12 + 12)
      Extrapolation.CLAMP
    );

    const trayHeight = interpolate(expansionProgress.value, [0, 1], [50, 190], Extrapolation.CLAMP);
    const halfHeight = screenHeight * 0.5;
    const fullHeight = screenHeight * 0.9; // Final stage (90% height)

    const currentHeight = interpolate(
      fullExpansionProgress.value,
      [0, 1],
      [
        interpolate(lyricExpansionProgress.value, [0, 1], [trayHeight, halfHeight], Extrapolation.CLAMP),
        fullHeight
      ],
      Extrapolation.CLAMP
    );
    
    const currentRadius = interpolate(
      fullExpansionProgress.value,
      [0, 1],
      [
        interpolate(lyricExpansionProgress.value, [0, 1], 
          [interpolate(expansionProgress.value, [0, 1], [30, 44], Extrapolation.CLAMP), 24], 
          Extrapolation.CLAMP
        ),
        28 // Slightly more rounded again at full screen for aesthetics
      ],
      Extrapolation.CLAMP
    );

    return {
      width: currentWidth,
      height: currentHeight,
      borderRadius: currentRadius,
    };
  });

  // Classic Height Animation — three stages: collapsed → half → full (95%).
  // Height lives on the SHELL (not only content) so overflow clips cleanly and
  // the box never spills into the tab-bar strip when collapsed.
  const classicHeightForProgress = () => {
    'worklet';
    const halfHeight = screenHeight * CLASSIC_HALF_RATIO;
    const fullHeight = screenHeight * CLASSIC_FULL_RATIO;
    const baseHeight = interpolate(
      expansionProgress.value,
      [0, 1],
      [CLASSIC_TRANSPORT_H, halfHeight],
      Extrapolation.CLAMP,
    );
    const fullExtension = interpolate(
      classicFullProgress.value,
      [0, 1],
      [0, fullHeight - halfHeight],
      Extrapolation.CLAMP,
    );
    return baseHeight + fullExtension;
  };

  // Content fills the shell (styles.classicContent has flex:1); shell owns the
  // animated height. Rounded top corners on half/full; always clip to it.
  const animatedClassicShellStyle = useAnimatedStyle(() => {
    if (isIsland) return {};
    const halfR = interpolate(expansionProgress.value, [0, 0.35, 1], [0, 16, 28], Extrapolation.CLAMP);
    const fullR = interpolate(classicFullProgress.value, [0, 1], [0, 6], Extrapolation.CLAMP);
    // Whole pixels only: a rounded corner + overflow:hidden makes Android rebuild
    // the clip path whenever the radius changes. Reanimated diffs the style object
    // per prop, so quantising means most frames don't touch it at all. Sub-pixel
    // radius is not visible either way.
    const r = Math.round(halfR + fullR);
    return {
      height: classicHeightForProgress(),
      borderTopLeftRadius: r,
      borderTopRightRadius: r,
      overflow: 'hidden' as const,
    };
  });
  
  // Classic lyrics height + opacity.
  //
  // The height follows ONLY classicFullProgress — never expansionProgress. That
  // split is the whole point:
  //   · collapse (expansionProgress 1→0, classicFullProgress stays 0): height is
  //     CONSTANT, so the ~60-row lyric subtree is never re-measured while the bar
  //     closes. Yoga keeps its cached layout, the ScrollView's onLayout never
  //     fires into JS, and the shell simply clips the block. This is the jank fix.
  //   · half↔full (classicFullProgress 0→1): height grows in lockstep with the
  //     shell, so the lyric area always fills the bar. Pinning this to the settled
  //     React state instead was wrong — setClassicFullExpanded only fires at
  //     gesture end, so the whole drag ran with the half height and left a dead
  //     band above the lyrics that popped shut on release.
  const animatedClassicLyricsStyle = useAnimatedStyle(() => {
    const halfLyricsH = screenHeight * CLASSIC_HALF_RATIO - CLASSIC_TRANSPORT_H;
    const fullExtension = interpolate(
      classicFullProgress.value,
      [0, 1],
      [0, screenHeight * (CLASSIC_FULL_RATIO - CLASSIC_HALF_RATIO)],
      Extrapolation.CLAMP,
    );
    const expandOp = interpolate(expansionProgress.value, [0.25, 0.75], [0, 1], Extrapolation.CLAMP);
    return {
      height: halfLyricsH + fullExtension,
      opacity: expandOp * transitionOpacity.value,
    };
  });
  
  // Get Current Lyric (Use displayedSong for persistent view)
  // Use displayedSong if expanded/classic to prevent instant jump, else currentSong
  const songForLyrics = (!isIsland && expanded) ? displayedSong : currentSong;
  
  const lyricsToUse = (showTransliteration && songForLyrics?.transliteratedLyrics && songForLyrics.transliteratedLyrics.length > 0)
    ? songForLyrics.transliteratedLyrics
    : songForLyrics?.lyrics;

  const lyricsDelay = useSettingsStore(state => state.lyricsDelay);

  // Lyric index computed on UI thread ΓÇö re-renders only when the active line changes.
  // Island-only: the classic bar renders SynchronizedLyrics, which derives its own
  // active index on the UI thread. Computing it here too cost a scan per position
  // frame plus a setState that re-rendered the whole MiniPlayer every lyric line ΓÇö
  // including mid-collapse, right when frames are scarce.
  const currentLyricIndexDV = useDerivedValue(() => {
    if (!isIsland || !lyricsToUse || lyricsToUse.length === 0) return -1;
    return getCurrentLineIndex(lyricsToUse, positionSV.value + lyricsDelay);
  });

  const [currentLyricIndex, setCurrentLyricIndex] = useState(-1);
  useAnimatedReaction(
    () => currentLyricIndexDV.value,
    (next, prev) => {
      if (next !== prev) {
        runOnJS(setCurrentLyricIndex)(next);
      }
    }
  );

  const currentLyricText = (currentLyricIndex !== -1 && lyricsToUse?.[currentLyricIndex])
    ? lyricsToUse[currentLyricIndex].text
    : '';

  /* 
     VISUAL HIGHLIGHT LAG 
     User wants text to "come up" before highlighting.
     - currentLyricIndex: Logic source (time based).
  */






  
  const skipForward = useCallback(async (e?: any) => {
    e?.stopPropagation();
    await usePlayerStore.getState().nextInPlaylist();
  }, []);

  const skipBackward = useCallback((e?: any) => {
    e?.stopPropagation();
    if (positionSV.value > 3 && player) {
        isSeeking.value = true;
        positionSV.value = 0;
        // seekTo pauses on iOS — restart-track must not silently stop playback.
        const wasPlaying = usePlayerStore.getState().isPlaying;
        player.seekTo(0);
        if (wasPlaying) playerControls.play();

        if (seekLockTimeout.current) clearTimeout(seekLockTimeout.current);
        seekLockTimeout.current = setTimeout(() => {
            isSeeking.value = false;
        }, 1000);
    } else {
        usePlayerStore.getState().previousInPlaylist();
    }
  }, [player]);

  // -------------------------------------------------------------------------
  // Capture the JS-state flags we need inside the worklet as shared values.
  // Reading React state inside a worklet closure is unsafe ΓÇö the closure
  // captures a stale value. Shared values are always fresh on the UI thread.
  // -------------------------------------------------------------------------
  const expandedSV = useSharedValue(false);
  const lyricExpandedSV = useSharedValue(false);
  const fullLyricExpandedSV = useSharedValue(false);
  const classicFullExpandedSV = useSharedValue(false);
  const isIslandSV = useSharedValue(isIsland);
  const hasLyricsSV = useSharedValue(false);

  // Keep shared flags in sync with React state (cheap writes, no re-render).
  useEffect(() => { expandedSV.value = expanded; }, [expanded, expandedSV]);
  useEffect(() => { lyricExpandedSV.value = lyricExpanded; }, [lyricExpanded, lyricExpandedSV]);
  useEffect(() => { fullLyricExpandedSV.value = fullLyricExpanded; }, [fullLyricExpanded, fullLyricExpandedSV]);
  useEffect(() => { classicFullExpandedSV.value = classicFullExpanded; }, [classicFullExpanded, classicFullExpandedSV]);
  useEffect(() => { isIslandSV.value = isIsland; }, [isIsland, isIslandSV]);
  useEffect(() => {
    hasLyricsSV.value = !!(currentSong?.lyrics && currentSong.lyrics.length > 0);
  }, [currentSong?.lyrics, hasLyricsSV]);

  // Built by a factory, not shared: one Gesture instance cannot be attached to
  // more than one GestureDetector (each carries its own handler tag). The classic
  // bar needs the same stage-drag behaviour at three mount points — the transport
  // row and the two edge rails — so each gets its own instance.
  const buildStageGesture = () => Gesture.Pan()
    .activeOffsetY([-5, 5])
    .activeOffsetX([-80, 80])
    .simultaneousWithExternalGesture()
    .onUpdate((event) => {
      'worklet';
      // Horizontal swipe detection (classic full mode)
      const isHoriz =
        Math.abs(event.translationX) > Math.abs(event.translationY);
      if (
        !isIslandSV.value &&
        expandedSV.value &&
        classicFullExpandedSV.value &&
        isHoriz
      ) {
        return; // Skip vertical updates during horizontal swipe
      }

      if (!isIslandSV.value && expandedSV.value) {
        // Classic Mode: two-stage expansion (half ΓåÆ full)
        if (!classicFullExpandedSV.value) {
          if (event.translationY < 0) {
            // Drag up to expand to full
            classicFullProgress.value = Math.min(
              Math.abs(event.translationY) / 200,
              1,
            );
          } else if (event.translationY > 0) {
            // Drag down to collapse from half
            expansionProgress.value = Math.max(
              1 - event.translationY / 200,
              0,
            );
          }
        } else {
          if (event.translationY > 0) {
            // Drag down from full to half
            classicFullProgress.value =
              1 - Math.min(event.translationY / 200, 1);
          }
        }
      } else if (expandedSV.value) {
        if (!lyricExpandedSV.value && !fullLyricExpandedSV.value) {
          if (event.translationY > 0) {
            lyricExpansionProgress.value = Math.min(
              event.translationY / 200,
              1,
            );
          }
        } else if (lyricExpandedSV.value && !fullLyricExpandedSV.value) {
          if (event.translationY > 0) {
            if (hasLyricsSV.value) {
              fullExpansionProgress.value = Math.min(
                event.translationY / 200,
                1,
              );
            }
          } else {
            lyricExpansionProgress.value =
              1 - Math.min(Math.abs(event.translationY) / 200, 1);
          }
        } else if (fullLyricExpandedSV.value) {
          if (event.translationY < 0) {
            fullExpansionProgress.value =
              1 - Math.min(Math.abs(event.translationY) / 200, 1);
          }
        }
      }
    })
    .onEnd((event) => {
      'worklet';
      const isHoriz =
        Math.abs(event.translationX) > Math.abs(event.translationY);

      // Collapsed (both styles) ΓÇö swipe left/right to skip
      if (!expandedSV.value && isHoriz) {
        if (event.translationX < -60 || event.velocityX < -600) {
          runOnJS(skipForward)();
        } else if (event.translationX > 60 || event.velocityX > 600) {
          runOnJS(skipBackward)();
        }
        return;
      }

      if (
        !isIslandSV.value &&
        expandedSV.value &&
        classicFullExpandedSV.value &&
        isHoriz
      ) {
        if (event.translationX < -60 || event.velocityX < -600) {
          runOnJS(skipForward)();
          return;
        } else if (event.translationX > 60 || event.velocityX > 600) {
          runOnJS(skipBackward)();
          return;
        }
      }

      if (!isIslandSV.value && expandedSV.value) {
        const vel = event.velocityY;
        const trans = event.translationY;

        // The shell height is the SUM of both progress values, and onUpdate moves
        // whichever one the drag direction implicates — so a drag that dips down
        // before pushing up leaves expansionProgress below 1. Every settle branch
        // must therefore pin BOTH values to that stage's canonical pair, not just
        // the one it was moving; otherwise the bar lands short of the stage by
        // (1 - expansionProgress) * (halfHeight - CLASSIC_TRANSPORT_H).
        // collapsed = (0, 0) · half = (1, 0) · full = (1, 1).
        if (!classicFullExpandedSV.value) {
          if (trans < -50 || vel < -500) {
            expansionProgress.value = withSpring(1);
            classicFullProgress.value = withSpring(1);
            runOnJS(setClassicFullExpanded)(true);
          } else if (trans > 50 || vel > 500) {
            expansionProgress.value = withSpring(0);
            classicFullProgress.value = withSpring(0);
            runOnJS(setExpanded)(false);
            runOnJS(setClassicFullExpanded)(false);
          } else {
            expansionProgress.value = withSpring(1);
            classicFullProgress.value = withSpring(0);
          }
        } else {
          if (trans > 50 || vel > 500) {
            expansionProgress.value = withSpring(1);
            classicFullProgress.value = withSpring(0);
            runOnJS(setClassicFullExpanded)(false);
          } else {
            expansionProgress.value = withSpring(1);
            classicFullProgress.value = withSpring(1);
          }
        }
      } else if (expandedSV.value) {
        const vel = event.velocityY;
        const trans = event.translationY;

        if (!lyricExpandedSV.value && !fullLyricExpandedSV.value) {
          if (trans > 50 || vel > 500) {
            lyricExpansionProgress.value = withSpring(1);
            runOnJS(setLyricExpanded)(true);
          } else {
            lyricExpansionProgress.value = withSpring(0);
          }
        } else if (lyricExpandedSV.value && !fullLyricExpandedSV.value) {
          if ((trans > 50 || vel > 500) && hasLyricsSV.value) {
            fullExpansionProgress.value = withSpring(1);
            runOnJS(setFullLyricExpanded)(true);
          } else if (trans < -50 || vel < -500) {
            lyricExpansionProgress.value = withSpring(0);
            runOnJS(setLyricExpanded)(false);
            runOnJS(setFullLyricExpanded)(false);
          } else {
            lyricExpansionProgress.value = withSpring(1);
            fullExpansionProgress.value = withSpring(0);
          }
        } else if (fullLyricExpandedSV.value) {
          if (trans < -50 || vel < -500) {
            fullExpansionProgress.value = withSpring(0);
            runOnJS(setFullLyricExpanded)(false);
          } else {
            fullExpansionProgress.value = withSpring(1);
          }
        }
      }
    });

  // Transport row (and the whole island tree, which still shares this instance).
  const panGesture = buildStageGesture();
  // Classic only: narrow rails down the left/right screen edges over the lyrics,
  // so the middle of the bar belongs to the lyric ScrollView and can scroll.
  const stageRailLeftGesture = buildStageGesture();
  const stageRailRightGesture = buildStageGesture();

  const toggleExpand = useCallback(() => {
    if (expanded) {
      expansionProgress.value = withSpring(0);
      lyricExpansionProgress.value = withSpring(0);
      fullExpansionProgress.value = withSpring(0);
      classicFullProgress.value = withSpring(0);
      setExpanded(false);
      setLyricExpanded(false);
      setFullLyricExpanded(false);
      setClassicFullExpanded(false);
      return;
    }
    
    // Canonical HALF pair — pin both, never assume classicFullProgress is already 0.
    expansionProgress.value = withSpring(1);
    classicFullProgress.value = withSpring(0);
    setExpanded(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded]);

  const handleLyricPress = useCallback((timestamp: number) => {
      if (!fullLyricExpanded) {
          // In Half-Screen mode, tapping lyrics expands to Full Screen
          runOnJS(setFullLyricExpanded)(true);
          fullExpansionProgress.value = withSpring(1);
          return; // Do NOT seek in half mode
      } 
      // Only seek in Full Screen mode.
      // seekTo pauses on iOS, so resume if the user was playing.
      const wasPlaying = usePlayerStore.getState().isPlaying;
      playerControls.seekTo(timestamp);
      if (wasPlaying) playerControls.play();
  }, [fullLyricExpanded, fullExpansionProgress]);

  // Classic bar: tapping a lyric seeks straight to it. Stable identity matters —
  // an inline arrow here invalidated SynchronizedLyrics' renderItem callback, so
  // every MiniPlayer re-render re-rendered all ~60 memoized lyric rows.
  // Tapping a lyric line jumps the song to it. The optimistic position write is
  // load-bearing, not polish: without it the position bus keeps reporting the
  // OLD time until the native player catches up, so the lyric list follows the
  // stale position and scrolls back down to where it was playing — which reads
  // as "tapping the line did nothing".
  const handleClassicLyricSeek = useCallback(async (time: number) => {
    if (!player) return;
    isSeeking.value = true;
    positionSV.value = time;

    const wasPlaying = usePlayerStore.getState().isPlaying;
    try {
      await player.seekTo(time);
      if (wasPlaying) player.play();
    } finally {
      if (seekLockTimeout.current) clearTimeout(seekLockTimeout.current);
      seekLockTimeout.current = setTimeout(() => {
        isSeeking.value = false;
      }, 280);
    }
  }, [player]);

  // Optimistic position first so the fill/labels feel instant; shorter settle
  // so playback ticks resume quickly after a scrub.
  const handleIslandSeek = useCallback(async (time: number) => {
    if (!player) return;
    isSeeking.value = true;
    positionSV.value = time;

    const wasPlaying = usePlayerStore.getState().isPlaying;
    try {
      await player.seekTo(time);
      if (wasPlaying) player.play();
    } finally {
      if (seekLockTimeout.current) clearTimeout(seekLockTimeout.current);
      seekLockTimeout.current = setTimeout(() => {
        isSeeking.value = false;
      }, 280);
    }
  }, [player]);




  
  // Placeholder check to avoid early null return (safer for Reanimated hooks)
  const isActuallyVisible = currentSong;
  
  if (!isActuallyVisible) return <View style={{ height: 0, opacity: 0 }} />;
  
  // Classic bar is a root-level sibling of the stack (after it in tree), so it
  // can paint over the tab bar if its frame intersects. Anchor with `bottom`
  // equal to the full tab chrome — never bottom:0 + margin that can collapse.
  const tabChromeH = TAB_BAR_HEIGHT + insets.bottom;

  const classicShellStyle = [
    styles.container,
    isIsland ? styles.islandContainer : styles.barContainer,
    !isIsland && {
      bottom: tabChromeH,
      // No elevation — Android elevates above the in-navigator tab bar otherwise.
      elevation: 0,
      zIndex: 10,
    },
    isIsland && expanded && { alignItems: 'center' as const, marginHorizontal: 12, marginRight: 12 },
  ];

  return (
    <Animated.View style={[classicShellStyle, !isIsland && animatedClassicShellStyle]}>
      {/* Classic background — clipped to the player shell only (no bleed into nav). */}
      {!isIsland && (
        <View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            { overflow: 'hidden' },
          ]}
        >
          {useThemeBg ? (
            <LinearGradient
              colors={themePlayerColors}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
          ) : currentSong.coverImageUri ? (
            <ArtworkFlowBackground
              coverImageUri={currentSong.coverImageUri}
              fallbackColors={gradientColors}
              animated={animateBackground && expanded}
            />
          ) : (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: '#111' }]} />
          )}
        </View>
      )}

      {/* Scrubber on the top edge of the transport row — same collapsed/half/full. */}
      {!isIsland && (
         <View pointerEvents="box-none" style={styles.classicScrubberOverride}>
           <TimelineScrubber
              currentTime={positionSV}
              duration={durationSV}
              onSeek={handleIslandSeek}
              variant="classic"
              showTimeLabels={false}
           />
         </View>
      )}
      
      <AnimatedPressable 
        onPress={!expanded ? toggleExpand : undefined} 
        pointerEvents={(!isIsland && expanded) ? 'box-none' : 'auto'}
        style={[
          styles.content, 
          isIsland && styles.islandContent,
          isIsland && animatedIslandStyle,
          isIsland && expanded && { alignItems: 'flex-start', justifyContent: 'flex-start' },
          !isIsland && styles.classicContent,
        ]}
      >
        {/* Dynamic Background for Classic Mode */}
        {isIsland && (
           <View style={[StyleSheet.absoluteFill, { borderRadius: expanded ? 40 : 30, overflow: 'hidden' }]}>
              {/* Frosted glass base — blurs app content behind the island pill */}
              <BlurView intensity={70} tint="dark" style={StyleSheet.absoluteFill} />

              {useThemeBg ? (
                 /* Semi-transparent theme gradient over the blur */
                 <View style={[StyleSheet.absoluteFill, { opacity: 0.65 }]}>
                   <LinearGradient
                     colors={themePlayerColors}
                     start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                     style={StyleSheet.absoluteFill}
                   />
                 </View>
               ) : !libraryFocusMode && currentSong.coverImageUri ? (
                  /* Oversized + stronger blur so half-open lyric stage doesn't
                     show a hard album-art rectangle through the glass. */
                  <Image
                    source={{ uri: currentSong.coverImageUri }}
                    style={{
                      position: 'absolute',
                      top: -COVER_BLEED,
                      left: -COVER_BLEED,
                      right: -COVER_BLEED,
                      bottom: -COVER_BLEED,
                      opacity: 0.5,
                      transform: [{ scale: 1.2 }],
                    }}
                    resizeMode="cover"
                    blurRadius={ISLAND_COVER_BLUR}
                  />
               ) : (
                  /* Solid fallback when no cover art — prevents transparent look */
                  <View style={[StyleSheet.absoluteFill, { backgroundColor: isDark ? '#111111' : '#e8e8f0' }]} />
               )}

              {/* Vignette — stronger top/bottom so half & full lyric expand don't
                  leave a sharp cover-art edge at the pill rim. */}
              <LinearGradient
                colors={['rgba(0,0,0,0.55)', 'rgba(0,0,0,0.12)', 'rgba(0,0,0,0.2)', 'rgba(0,0,0,0.72)']}
                locations={[0, 0.25, 0.65, 1]}
                start={{x: 0, y: 0}}
                end={{x: 0, y: 1}}
                style={StyleSheet.absoluteFill}
              />
           </View>
        )}
        
        {/* Expanded View Content */}
        {/* Expanded View Content */}
        {isIsland && expanded ? (
            <View style={styles.expandedContent}>
                {/* Top Row: Vinyl + Info + Controls */}
                <GestureDetector gesture={panGesture}>
                    <View style={styles.expandedTopRow}>
                        {/* Rotating Vinyl */}
                        <Pressable onPress={toggleExpand} style={styles.vinylMargin}>
                             <RotatingVinyl 
                                imageUri={currentSong.coverImageUri} 
                                size={64} 
                                isPlaying={storePlaying} 
                             />
                        </Pressable>

                        {/* Info */}
                        <View style={styles.expandedInfo}>
                            <Text style={styles.expandedTitle} numberOfLines={1}>
                                {currentSong.title}
                            </Text>
                            <Text style={styles.artist} numberOfLines={1}>
                                {currentSong.artist}
                            </Text>
                        </View>

                        {/* Controls Grouped */}
                        <PlaybackControls
                            variant="island-expanded"
                            playing={storePlaying}
                            onToggle={togglePlay}
                            onSkipBack={skipBackward}
                            onSkipForward={skipForward}
                            animatedButtonStyle={animatedButtonStyle}
                        />

                        
                        {/* Drag Handle Overlay for Stage 1/2 */}
                        {(!fullLyricExpanded) && (
                            <View style={styles.dragHandle} />
                        )}
                    </View>
                </GestureDetector>
                
                {/* Unified Lyrics Block with GestureDetector */}
                <GestureDetector gesture={panGesture}>
                    <Pressable 
                        onPress={(e) => {
                            e.stopPropagation();
                            // If in Half Mode (and not Full), tap to expand
                            if ((lyricExpanded || fullLyricExpanded) && !fullLyricExpanded) {
                                runOnJS(setFullLyricExpanded)(true);
                                fullExpansionProgress.value = withSpring(1);
                            }
                        }}
                        style={[
                            styles.unifiedLyricsPressable,
                            (lyricExpanded || fullLyricExpanded) && styles.unifiedLyricsMargin
                        ]}
                    >
                        <View style={styles.flexFullWidth}>
                        {(!lyricExpanded && !fullLyricExpanded) ? (
                            /* 1. TRAY MODE (Collapsed) — EQ for instrumental, else single line */
                            <View style={[styles.flexFullWidth, { alignItems: 'center' }]}>
                                {isInstrumentalLyric(currentLyricText) ? (
                                    <InstrumentalWaveform active={storePlaying} size="md" />
                                ) : (
                                  <Text
                                      style={styles.trayLyricText}
                                      numberOfLines={2}
                                  >
                                      {currentLyricText || ''}
                                  </Text>
                                )}
                            </View>
                        ) : (
                            /* 2. EXPANDED MODE (Half & Full) - Unified FlatList */
                            <View style={styles.expandedLyricsContainer}>
                                <SynchronizedLyrics
                                    lyrics={lyricsToUse || []}
                                    currentTime={positionSV}
                                    onLyricPress={handleLyricPress}
                                    isUserScrolling={false}
                                    scrollEnabled={fullLyricExpanded}
                                    expandedAt={lyricExpandedAt}
                                    textStyle={styles.expandedLyricText}
                                    activeLinePosition={0.3} 
                                    songTitle={currentSong?.title}
                                    topSpacerHeight={fullLyricExpanded ? 300 : 150} 
                                    bottomSpacerHeight={fullLyricExpanded ? 300 : 150}
                                />
                            </View>
                        )}
                        </View>

                        {/* Smooth Time Scrubber - Bottom of Island */}
                        {isIsland && expanded && (
                             <View style={styles.scrubberContainer}>
                                <TimelineScrubber
                                    currentTime={positionSV}
                                    duration={durationSV}
                                    onSeek={handleIslandSeek}
                                    variant="island"
                                />
                             </View>
                        )}
                    </Pressable>
                </GestureDetector>
            </View>
        ) : isIsland ? (
            // ISLAND COLLAPSED
            <GestureDetector gesture={panGesture}>
              <View style={{ width: '100%', height: '100%', flexDirection: 'row' }}>
                <View style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    height: '100%',
                    paddingHorizontal: 16,
                    width: '100%'
                }}>
                    <TrackInfo
                        title={currentSong.title}
                        artist={currentSong.artist || ''}
                        coverImageUri={currentSong.coverImageUri}
                        isIsland={isIsland}
                        onPress={toggleExpand}
                        onBodyPress={toggleExpand}
                    />
                    <PlaybackControls
                        variant="island-collapsed"
                        playing={storePlaying}
                        onToggle={togglePlay}
                        onSkipBack={skipBackward}
                        onSkipForward={skipForward}
                        animatedButtonStyle={animatedButtonStyle}
                    />
                </View>
              </View>
            </GestureDetector>
        ) : (
            // CLASSIC UNIFIED ΓÇö always column layout; height + opacity animation controls visibility
            /* No detector around the whole column: that stole every vertical drag
               over the lyrics for the stage change, so the lyric list could never
               scroll. The stage drag now lives on the transport row (which is the
               entire bar when collapsed, so swipe-to-skip still works anywhere on
               it) plus the two edge rails below. */
            (
                /* column-reverse keeps the track info + transport row pinned to the
                    bottom next to the nav bar at every expansion stage; the lyrics
                    grow upward above it instead of pushing it to the top. */
                <View style={{ width: '100%', height: '100%', flexDirection: 'column-reverse' }}>
                  <GestureDetector gesture={panGesture}>
                    <View style={styles.classicTransportRow}>
                        <TrackInfo
                            title={currentSong.title}
                            artist={currentSong.artist || ''}
                            coverImageUri={currentSong.coverImageUri}
                            isIsland={isIsland}
                            onPress={toggleExpand}
                            onBodyPress={toggleExpand}
                        />
                        {/* Like the currently playing song without leaving the bar. */}
                        <Pressable
                            onPress={(e) => {
                                e.stopPropagation();
                                if (currentSong) toggleLike(currentSong.id);
                            }}
                            hitSlop={12}
                            style={{ paddingHorizontal: 8 }}
                        >
                            <Ionicons
                                name={isLiked ? 'checkmark-circle' : 'add-circle-outline'}
                                size={24}
                                color={isLiked ? '#1DB954' : '#fff'}
                            />
                        </Pressable>
                        <PlaybackControls
                            variant="bar"
                            playing={storePlaying}
                            onToggle={togglePlay}
                            onSkipBack={skipBackward}
                            onSkipForward={skipForward}
                            animatedButtonStyle={animatedButtonStyle}
                            showSkipButtons={expanded}
                        />
                    </View>
                  </GestureDetector>

                    <Animated.View style={[styles.classicLyricsContainer, animatedClassicLyricsStyle]}>
                        {/* edgeFade uses native ScrollView fadingEdgeLength (no
                            MaskedView rebuild) so lyric text soft-dissolves at
                            the top/bottom instead of a black scrim. */}
                        <SynchronizedLyrics
                            lyrics={lyricsToUse || []}
                            currentTime={positionSV}
                            onLyricPress={handleClassicLyricSeek}
                            isUserScrolling={false}
                            scrollEnabled={expanded}
                            textStyle={styles.expandedLyricText}
                            activeLinePosition={0.4}
                            songTitle={currentSong?.title}
                            topSpacerHeight={50}
                            bottomSpacerHeight={50}
                            expandedAt={lyricExpandedAt}
                            edgeFade={48}
                        />

                        {/* Stage-drag rails. Transparent strips down the far left and
                            right of the lyric area — collapsed/half/full drags start
                            here, so the lyric list owns everything between them and
                            scrolls normally. Clipped away with the rest of the block
                            when the bar is collapsed, so they cost nothing there. */}
                        <GestureDetector gesture={stageRailLeftGesture}>
                            <View style={[styles.classicStageRail, styles.classicStageRailLeft]} />
                        </GestureDetector>
                        <GestureDetector gesture={stageRailRightGesture}>
                            <View style={[styles.classicStageRail, styles.classicStageRailRight]} />
                        </GestureDetector>

                        <View style={styles.dragHandle} />
                    </Animated.View>

                        {/* Beta: YouTube video preview button — floats above play/pause row */}
                        {showYtButton && (
                          <Animated.View
                            style={[
                              styles.ytPreviewBtn,
                              {
                                opacity: ytButtonOpacity,
                                transform: [{ scale: ytButtonScale }],
                              },
                            ]}
                          >
                            <Pressable
                              onPress={() => {
                                if (ytButtonTimer.current) clearTimeout(ytButtonTimer.current);
                                setShowYtButton(false);
                                setShowYtMini(true);
                              }}
                              hitSlop={8}
                            >
                              <LinearGradient
                                colors={['#FF0000', '#CC0000']}
                                style={styles.ytPreviewBtnInner}
                              >
                                <Ionicons name="logo-youtube" size={18} color="#fff" />
                              </LinearGradient>
                            </Pressable>
                          </Animated.View>
                        )}
                </View>
            )
        )}
      </AnimatedPressable>
      {showYtMini && currentSong?.youtubeVideoId && (
        <YtMiniPlayer
          videoId={currentSong.youtubeVideoId}
          songTitle={currentSong.title}
          onOpen={() => {
            wasPlayingBeforeYt.current = usePlayerStore.getState().isPlaying;
            if (wasPlayingBeforeYt.current) player?.pause();
          }}
          onDismiss={() => {
            if (wasPlayingBeforeYt.current) player?.play();
          }}
          onClose={() => setShowYtMini(false)}
        />
      )}
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 10,
    elevation: 0,
  },
  barContainer: {
    // `bottom` set inline to tabChromeH — never sit on y=0 over the nav.
    borderTopWidth: 0,
  },
  classicContent: {
    flexDirection: 'column',
    alignItems: 'stretch',
    paddingHorizontal: 0,
    overflow: 'hidden',
    // Fill shell height from animatedClassicShellStyle
    flex: 1,
  },
  classicTransportRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: CLASSIC_TRANSPORT_H,
    paddingHorizontal: 16,
    // Room for the top-edge scrubber track
    paddingTop: 12,
    width: '100%',
  },
  islandContainer: {
    top: Platform.OS === 'ios' ? 58 : 40, // 58 = iOS Dynamic Island clearance, 40 = Android status bar height
    marginLeft: 12,
    marginRight: 8,
    alignItems: 'flex-end', // Right-aligned
  },
  islandContent: {
    backgroundColor: 'transparent', 
    borderRadius: 30,
    height: 50, 
    width: '100%',
    paddingHorizontal: 4, // Reduced from 8 to move content left
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: "#000", // Deep black shadow
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 15,
    elevation: 12,
  },
  islandExpanded: {
    height: 190, 
    marginTop: 10,
    paddingVertical: 0,
    borderRadius: 40,
    maxWidth: width - 24, // Expand to almost full width
    shadowOpacity: 0.5,
    shadowRadius: 15,
  },
  // Top seam of the transport row (= top of shell when collapsed). `bottom + height`
  // must equal CLASSIC_TRANSPORT_H so the wrapper's top edge is flush with the seam;
  // the track paints from the wrapper's y=0 downward. left/right 0 makes it span the
  // real screen width at runtime — the scrubber measures itself via onLayout, so no
  // width is hardcoded anywhere.
  classicScrubberOverride: {
    position: 'absolute',
    bottom: CLASSIC_TRANSPORT_H - CLASSIC_SCRUBBER_HIT_H,
    left: 0,
    right: 0,
    width: 'auto',
    height: CLASSIC_SCRUBBER_HIT_H,
    zIndex: 20,
    elevation: 0,
  },
  progressBarTrackBase: {
    width: '100%',
    height: 20,
    justifyContent: 'center',
  },
  progressBarTrackAnimated: {
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.3)',
    overflow: 'hidden',
    // Height controlled by animation (2 -> 6)
  },
  progressFillAnimated: {
      height: '100%',
      backgroundColor: '#fff',
  },
  scrubberDot: {
      position: 'absolute',
      width: 12,
      height: 12,
      borderRadius: 6,
      backgroundColor: '#fff',
      marginLeft: -6, // Center on end of line
      top: 4, // Center vertically (20/2 - 12/2 = 4)
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.5,
      shadowRadius: 2,
      elevation: 3,
  },
  trayLyricText: {
    fontFamily: Fonts.lyricsTray,
    fontWeight: Fonts.lyricsTrayWeight,
    color: '#fff',
    fontSize: 18,
    textAlign: 'center',
  },
  expandedLyricsContainer: {
    flex: 1, 
    width: '100%', 
    paddingBottom: 20
  },
  expandedLyricText: {
    // fontFamily intentionally omitted — SynchronizedLyrics owns the
    // SF Pro / Inter face + bold-active weight swap.
    color: '#fff',
    fontSize: 23,
    textAlign: 'center',
  },
  expandedContent: {
    flex: 1, 
    width: '100%', 
    paddingHorizontal: 10, 
    paddingVertical: 10
  },
  expandedTopRow: {
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'space-between', 
    marginBottom: 15, 
    paddingBottom: 5, 
    backgroundColor: 'transparent'
  },
  vinylMargin: {
    marginRight: 12
  },
  expandedInfo: {
    flex: 1, 
    marginRight: 8
  },
  expandedTitle: {
    color: '#fff',
    fontSize: 16, 
    marginBottom: 2,
    fontWeight: '600'
  },
  expandedControls: {
    flexDirection: 'row', 
    alignItems: 'center', 
    gap: 12
  },
  dragHandle: {
    position: 'absolute',
    bottom: -10,
    left: '50%',
    marginLeft: -20,
    width: 40,
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 2
  },
  unifiedLyricsPressable: {
    flex: 1, 
    width: '100%',
    justifyContent: 'center', 
    alignItems: 'center',
    minHeight: 40,
    paddingHorizontal: 8,
  },
  unifiedLyricsMargin: {
    marginTop: 10
  },
  flexFullWidth: {
    flex: 1, 
    width: '100%'
  },
  scrubberContainer: {
    width: '100%', 
    paddingHorizontal: 24, 
    paddingBottom: 12
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#fff',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    overflow: 'hidden',
  },
  // Wide enough to hit reliably with a thumb, narrow enough that the lyric text
  // (which carries 32px of its own horizontal padding) stays fully scrollable.
  classicStageRail: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 36,
    zIndex: 5,
  },
  classicStageRailLeft: {
    left: 0,
  },
  classicStageRailRight: {
    right: 0,
  },
  classicLyricsContainer: {
    // Height comes from `classicLyricsHeight` (stage-pinned, not shell-driven).
    // flexShrink must stay 0 so the shell clipping the block never resizes it.
    flexShrink: 0,
    width: '100%',
    backgroundColor: 'transparent', // Transparent to show blurred background
    paddingTop: 10,
  },
  ytPreviewBtn: {
    position: 'absolute',
    bottom: 78,
    right: 16,
    zIndex: 50,
  },
  ytPreviewBtnInner: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#FF0000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 6,
    elevation: 6,
  },

  coverThumbnail: {
    width: 48,
    height: 48,
    borderRadius: 6,
    marginRight: 12,
  },
  islandCover: {
    width: 34,
    height: 34,
    borderRadius: 17, // Circle in collapsed
    marginRight: 6, // Reduced from 10 to move closer to edge
  },
  placeholderThumbnail: {
    width: 48,
    height: 48,
    borderRadius: 6,
    backgroundColor: '#222',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  info: {
    flex: 1,
    marginRight: 12,
    justifyContent: 'center',
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  artist: {
    fontSize: 12,
    color: '#888',
    marginTop: 2,
  },
  time: {
    fontSize: 11,
    color: '#666',
    marginRight: 8,
  },
  controlButton: {
    padding: 4,
  },
  // Clips the skip button while its width animates to zero on collapse.
  skipWrap: {
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playButton: {
    padding: 4,
    marginHorizontal: 2,
  },
  islandControls: {
    flexDirection: 'row',
    alignItems: 'center',
  }
});

export default MiniPlayer;
