import React, { useState, useEffect, useRef, useCallback, memo } from 'react';
import { View, Text, Pressable, StyleSheet, Image, Dimensions, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types/navigation';
import * as GestureHandler from 'react-native-gesture-handler';
import SynchronizedLyrics from './SynchronizedLyrics';
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
import { usePlayerStore, playerControls } from '../store/playerStore';
import { useSettingsStore } from '../store/settingsStore';
import { useIsDark } from '../contexts/ThemeContext';
import { getGradientColors } from '../constants/gradients';
import { RotatingVinyl } from './VinylRecord';
import { getCurrentLineIndex } from '../utils/timestampParser';

const { width } = Dimensions.get('window');

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
const PlaybackControls = memo(({
  playing, onToggle, onSkipBack, onSkipForward, animatedButtonStyle, variant, showSkipButtons = true,
}: PlaybackControlsProps) => {
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
  const isBar = variant === 'bar';
  return (
    <View style={isBar ? { flexDirection: 'row', alignItems: 'center' } : styles.expandedControls}>
      {showSkipButtons && (
        <Pressable
          onPress={(e) => { if (isBar) e.stopPropagation(); onSkipBack(isBar ? e : undefined); }}
          hitSlop={isBar ? undefined : 10}
          style={isBar ? styles.controlButton : undefined}
        >
          <Ionicons name="play-skip-back" size={24} color="#fff" />
        </Pressable>
      )}
      <Pressable
        onPress={(e) => { if (isBar) e.stopPropagation(); onToggle(isBar ? e : undefined); }}
        hitSlop={20}
        style={isBar ? [styles.playButton, { marginHorizontal: showSkipButtons ? 12 : 0 }] : undefined}
      >
        <Animated.View style={animatedButtonStyle}>
          <Ionicons name={playing ? 'pause' : 'play'} size={32} color="#fff" />
        </Animated.View>
      </Pressable>
      {showSkipButtons && (
        <Pressable
          onPress={(e) => { if (isBar) e.stopPropagation(); onSkipForward(isBar ? e : undefined); }}
          hitSlop={isBar ? undefined : 10}
          style={isBar ? styles.controlButton : undefined}
        >
          <Ionicons name="play-skip-forward" size={24} color="#fff" />
        </Pressable>
      )}
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
  const hideMiniPlayer = usePlayerStore(state => state.hideMiniPlayer);
  const setMiniPlayerHidden = usePlayerStore(state => state.setMiniPlayerHidden);
  const setStorePlaying = usePlayerStore(state => state.setIsPlaying);
  const storePlaying = usePlayerStore(state => state.isPlaying);
  const miniPlayerStyle = useSettingsStore(state => state.miniPlayerStyle);
  const libraryFocusMode = useSettingsStore(state => state.libraryFocusMode);
  const islandBgMode = useSettingsStore(state => state.islandBgMode);
  const classicBarBgMode = useSettingsStore(state => state.classicBarBgMode);
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const isDark = useIsDark();

  // Use store instead of navigation state to avoid root-level crashes
  const isNowPlaying = hideMiniPlayer;

  // Animation for Play/Pause Button
  const playButtonScale = useSharedValue(1);

  const animatedButtonStyle = useAnimatedStyle(() => ({
    transform: [{ scale: playButtonScale.value }]
  }));

  // togglePlay reads live store state so the callback stays stable across renders.
  // A stable callback means PlaybackControls (memo'd) never re-renders just because
  // the play/pause state changed ΓÇö only when the icon prop itself changes.
  // Uses playerControls (setTimeout-wrapped) to avoid "accessed on wrong thread" on Android.
  const togglePlay = useCallback((e?: any) => {
      e?.stopPropagation();
      if (!currentSong) return;

      const nextState = !usePlayerStore.getState().isPlaying;

      playButtonScale.value = withSequence(
          withTiming(0.82, { duration: 55 }),
          withSpring(1, { damping: 18, stiffness: 380 })
      );

      setStorePlaying(nextState);
      if (nextState) playerControls.play(); else playerControls.pause();
  }, [currentSong, setStorePlaying, playButtonScale]);

  
  const [expanded, setExpanded] = useState(false);
  const [lyricExpanded, setLyricExpanded] = useState(false);
  const [fullLyricExpanded, setFullLyricExpanded] = useState(false);
  const [classicFullExpanded, setClassicFullExpanded] = useState(false);
  const [lyricExpandedAt, setLyricExpandedAt] = useState(0);
  
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
    
  // Create a "vignette" theme for island: Black -> Color -> Black
  const mainColor = gradientColors[1] || gradientColors[0];

  // Per-style background mode (island vs classic bar each have their own setting)
  const activeBgMode = isIsland ? islandBgMode : classicBarBgMode;
  const useThemeBg = activeBgMode !== 'album-art';

  const themePlayerColors: [string, string, string] = (() => {
    switch (activeBgMode) {
      case 'song-gradient': return [gradientColors[0] || '#111', gradientColors[1] || '#333', gradientColors[2] || gradientColors[0] || '#111'] as [string, string, string];
      case 'purest-black': return ['#000000', '#000000', '#000000'];
      case 'grey':         return ['#121212', '#212121', '#121212'];
      case 'theme-blue':   return ['#0A1628', '#1A3A6B', '#2F8CFF'];
      case 'theme-subtle': return ['#0E1722', '#1E2A3A', '#0E1722'];
      case 'aurora':       return ['#020A16', '#EA7980', '#1D728F'];
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
      
      // If the player doesn't have this audio loaded, load it
      if (loadedAudioId !== currentSong.id && currentSong.audioUri) {
        try {
          if (__DEV__) console.log('[MiniPlayer] Syncing audio for:', currentSong.title);
          await player.replace(currentSong.audioUri);
          setLoadedAudioId(currentSong.id);

          // On app startup (first load), don't auto-play
          // On user-initiated song change, auto-play
          if (isInitialLoad.current) {
            isInitialLoad.current = false;
            if (__DEV__) console.log('[MiniPlayer] Initial load - staying paused');
          } else {
            setStorePlaying(true);
            player.play();
            if (__DEV__) console.log('[MiniPlayer] User selected song - auto-playing');
          }
        } catch (error) {
          if (__DEV__) console.error('[MiniPlayer] Failed to sync audio:', error);
        }
      }
    };
    
    syncAudio();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSong?.id, player, loadedAudioId, setLoadedAudioId, setMiniPlayerHidden, setStorePlaying]);

  // Auto-close removed: Lyrics persist across songs
  // useEffect(() => { ... }, [currentSong?.id, isIsland]);

  // Capture timestamp when any lyric view opens so SynchronizedLyrics can reset its scroll
  useEffect(() => {
    if (expanded || lyricExpanded || fullLyricExpanded || classicFullExpanded) {
      setLyricExpandedAt(Date.now());
    }
  }, [expanded, lyricExpanded, fullLyricExpanded, classicFullExpanded]);

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

  // Classic Height Animation ΓÇö three stages: collapsed ΓåÆ half ΓåÆ full (95%)
  const animatedClassicStyle = useAnimatedStyle(() => {
    if (isIsland) return {};
    const halfHeight = screenHeight * 0.54;   // slightly taller so it fully clears "All Songs"
    const fullHeight = screenHeight * 0.915;
    const baseHeight = interpolate(expansionProgress.value, [0, 1], [70, halfHeight], Extrapolation.CLAMP);
    const fullExtension = interpolate(classicFullProgress.value, [0, 1], [0, fullHeight - halfHeight], Extrapolation.CLAMP);
    return { height: baseHeight + fullExtension };
  });
  
  // Classic Lyrics Opacity ΓÇö fade in early so they appear smoothly as the bar grows
  const animatedClassicLyricsStyle = useAnimatedStyle(() => {
    const expandOp = interpolate(expansionProgress.value, [0.25, 0.75], [0, 1], Extrapolation.CLAMP);
    return {
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

  // Lyric index computed on UI thread ΓÇö re-renders only when the active line changes
  const currentLyricIndexDV = useDerivedValue(() => {
    if (!lyricsToUse || lyricsToUse.length === 0) return -1;
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
        player.seekTo(0);

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

  const panGesture = Gesture.Pan()
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

        if (!classicFullExpandedSV.value) {
          if (trans < -50 || vel < -500) {
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
            classicFullProgress.value = withSpring(0);
            runOnJS(setClassicFullExpanded)(false);
          } else {
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
    
    expansionProgress.value = withSpring(1);
    setExpanded(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded]);

  const openNowPlaying = useCallback(() => {
    if (currentSong) {
      setMiniPlayerHidden(true);
      navigation.navigate('NowPlaying', { songId: currentSong.id });
      expansionProgress.value = withSpring(0);
      lyricExpansionProgress.value = withSpring(0);
      fullExpansionProgress.value = withSpring(0);
      classicFullProgress.value = withSpring(0);
      setExpanded(false);
      setLyricExpanded(false);
      setFullLyricExpanded(false);
      setClassicFullExpanded(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSong, setMiniPlayerHidden, navigation]);

  const handleLyricPress = useCallback((timestamp: number) => {
      if (!fullLyricExpanded) {
          // In Half-Screen mode, tapping lyrics expands to Full Screen
          runOnJS(setFullLyricExpanded)(true);
          fullExpansionProgress.value = withSpring(1);
          return; // Do NOT seek in half mode
      } 
      // Only seek in Full Screen mode
      playerControls.seekTo(timestamp);
  }, [fullLyricExpanded, fullExpansionProgress]);

  const handleIslandSeek = useCallback(async (time: number) => {
    if (player) {
        isSeeking.value = true;
        positionSV.value = time; // Optimistic update

        const wasPlaying = usePlayerStore.getState().isPlaying;
        await player.seekTo(time);
        if (wasPlaying) player.play();

        if (seekLockTimeout.current) clearTimeout(seekLockTimeout.current);
        seekLockTimeout.current = setTimeout(() => {
            isSeeking.value = false;
        }, 1000);
    }
  }, [player]);




  
  // Placeholder check to avoid early null return (safer for Reanimated hooks)
  const isActuallyVisible = currentSong && !isNowPlaying;
  
  if (!isActuallyVisible) return <View style={{ height: 0, opacity: 0 }} />;
  
  return (
    <View style={[
      styles.container, 
      isIsland ? styles.islandContainer : styles.barContainer,
      isIsland && expanded && { alignItems: 'center', marginHorizontal: 12, marginRight: 12 } // Expanded: Force Center & Symmetry. Override container margins.
    ]}>
      {/* Classic Scrubber (Gapless & Animated) */}
      {!isIsland && (
         <TimelineScrubber
            currentTime={positionSV}
            duration={durationSV}
            onSeek={handleIslandSeek}
            variant="classic"
            showTimeLabels={false}
            style={styles.classicScrubberOverride}
         />
      )}
      
      <AnimatedPressable 
        onPress={!expanded ? toggleExpand : undefined} 
        pointerEvents={(!isIsland && expanded) ? 'box-none' : 'auto'}
        style={[
          styles.content, 
          isIsland && styles.islandContent,
          isIsland && animatedIslandStyle, // Apply Reanimated style
          !isIsland && animatedClassicStyle, // Apply Classic Height animation
          // Remove static conditional styles that conflict
          // isIsland && { maxWidth: expanded ? width - 20 : width * 0.5 },
          // isIsland && expanded && styles.islandExpanded,
          isIsland && expanded && { alignItems: 'flex-start', justifyContent: 'flex-start' }, // Pin content to top immediately
          !isIsland && { flexDirection: 'column', alignItems: 'stretch', paddingHorizontal: 0 } // Override row layout for Classic
        ]}
      >
        {/* Dynamic Background for Classic Mode */}
        {!isIsland && (
           <View style={StyleSheet.absoluteFill}>
               {useThemeBg ? (
                  /* Theme palette gradient */
                  <LinearGradient
                    colors={themePlayerColors}
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                    style={StyleSheet.absoluteFill}
                  />
               ) : currentSong.coverImageUri ? (
                  <Image
                    source={{ uri: currentSong.coverImageUri }}
                    style={StyleSheet.absoluteFill}
                    resizeMode="cover"
                    blurRadius={30}
                  />
               ) : (
                  <View style={[StyleSheet.absoluteFill, { backgroundColor: '#111' }]} />
               )}
                {/* No vignette overlay — clean background */}
           </View>
        )}

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
                  <Image
                    source={{ uri: currentSong.coverImageUri }}
                    style={[StyleSheet.absoluteFill, { opacity: 0.45 }]}
                    resizeMode="cover"
                    blurRadius={22}
                  />
               ) : (
                  /* Solid fallback when no cover art — prevents transparent look */
                  <View style={[StyleSheet.absoluteFill, { backgroundColor: isDark ? '#1a1a2e' : '#e8e8f0' }]} />
               )}

              {/* Vignette for text readability */}
              <LinearGradient
                colors={['rgba(0,0,0,0.35)', 'rgba(0,0,0,0.1)', 'rgba(0,0,0,0.65)']}
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
                        <Pressable onPress={openNowPlaying} style={styles.vinylMargin}>
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
                            /* 1. TRAY MODE (Collapsed) - Single Line */
                            <View style={styles.flexFullWidth}>
                                <Text 
                                    style={styles.trayLyricText}
                                    numberOfLines={2}
                                >
                                    {currentLyricText || ''}
                                </Text>
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
                                    highlightColor={mainColor}
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
                        onPress={openNowPlaying}
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
            <GestureDetector gesture={panGesture}>
                <View style={{ width: '100%', height: '100%', flexDirection: 'column' }}>
                    <View style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        height: 70,
                        paddingHorizontal: 16,
                        width: '100%'
                    }}>
                        <TrackInfo
                            title={currentSong.title}
                            artist={currentSong.artist || ''}
                            coverImageUri={currentSong.coverImageUri}
                            isIsland={isIsland}
                            onPress={openNowPlaying}
                            onBodyPress={toggleExpand}
                        />
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

                    <Animated.View style={[styles.classicLyricsContainer, animatedClassicLyricsStyle]}>
                        <SynchronizedLyrics
                            lyrics={lyricsToUse || []}
                            currentTime={positionSV}
                            onLyricPress={async (time) => {
                                if (player) {
                                    const wasPlaying = usePlayerStore.getState().isPlaying;
                                    await player.seekTo(time);
                                    if (wasPlaying) player.play();
                                }
                            }}
                            isUserScrolling={false}
                            scrollEnabled={false}
                            textStyle={styles.expandedLyricText}
                            activeLinePosition={0.4}
                            songTitle={currentSong?.title}
                            highlightColor={gradientColors[0]}
                            topSpacerHeight={50}
                            bottomSpacerHeight={50}
                            expandedAt={lyricExpandedAt}
                        />
                        <View style={styles.dragHandle} />
                    </Animated.View>
                </View>
            </GestureDetector>
        )}
      </AnimatedPressable>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 100,
  },
  barContainer: {
    bottom: 0, 
    marginBottom: 69, // Overlap by 1px to ensure NO GAP between player and translucent nav bar
    // backgroundColor: '#111', // REMOVED for transparency
    borderTopWidth: 0, 
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
  classicScrubberOverride: {
    position: 'absolute',
    top: -14,
    left: 20,
    right: 20,
    width: 'auto',
    zIndex: 200,
    paddingVertical: 0, 
    paddingHorizontal: 0,
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
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
  },
  expandedLyricsContainer: {
    flex: 1, 
    width: '100%', 
    paddingBottom: 20
  },
  expandedLyricText: {
    color: '#fff',
    fontSize: 23,
    fontWeight: '800',
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
    height: 70, // Base height
    overflow: 'hidden', // Clip expanded content
    // width: '100%', // ensure full width
  },
  classicLyricsContainer: {
    flex: 1,
    width: '100%',
    backgroundColor: 'transparent', // Transparent to show blurred background
    paddingTop: 10,
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
    padding: 8,
  },
  playButton: {
    padding: 8,
    marginHorizontal: 4,
  },
  islandControls: {
    flexDirection: 'row',
    alignItems: 'center',
  }
});

export default MiniPlayer;
