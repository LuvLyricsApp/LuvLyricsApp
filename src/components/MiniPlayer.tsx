import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, Pressable, StyleSheet, Image, Dimensions, Platform, UIManager, FlatList } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
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
  Easing, 
  cancelAnimation,
  interpolate,
  Extrapolation,
  runOnJS,
  useDerivedValue
} from 'react-native-reanimated';

import { usePlayer } from '../contexts/PlayerContext';
import { usePlayerStore } from '../store/playerStore';
import { useSettingsStore } from '../store/settingsStore';
import { getGradientColors } from '../constants/gradients';
import { RotatingVinyl } from './VinylRecord';
import { getCurrentLineIndex } from '../utils/timestampParser';

const { width } = Dimensions.get('window');

// Create Animated Pressable
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// UIManager.setLayoutAnimationEnabledExperimental removed to avoid New Architecture warning

export const MiniPlayer: React.FC = () => {
  const player = usePlayer();
  const currentSong = usePlayerStore(state => state.currentSong);
  const showTransliteration = usePlayerStore(state => state.showTransliteration);
  const loadedAudioId = usePlayerStore(state => state.loadedAudioId);
  const setLoadedAudioId = usePlayerStore(state => state.setLoadedAudioId);
  const hideMiniPlayer = usePlayerStore(state => state.hideMiniPlayer);
  const setMiniPlayerHidden = usePlayerStore(state => state.setMiniPlayerHidden);
  const setStorePlaying = usePlayerStore(state => state.setIsPlaying);
  // Rename to real* to allow optimistic override below
  const realPosition = usePlayerStore(state => state.position);
  const realDuration = usePlayerStore(state => state.duration);
  const storePlaying = usePlayerStore(state => state.isPlaying);
  const miniPlayerStyle = useSettingsStore(state => state.miniPlayerStyle);
  const libraryFocusMode = useSettingsStore(state => state.libraryFocusMode);
  const navigation = useNavigation();
  
  // Use store instead of navigation state to avoid root-level crashes
  const isNowPlaying = hideMiniPlayer;

  // Optimistic Playback State
  const [optimisticPlaying, setOptimisticPlaying] = useState(false);
  
  // Animation for Play/Pause Button
  const playButtonScale = useSharedValue(1);

  const animatedButtonStyle = useAnimatedStyle(() => ({
    transform: [{ scale: playButtonScale.value }]
  }));

  // Sync optimistic state with store instead of native player
  useEffect(() => {
    setOptimisticPlaying(storePlaying);
  }, [storePlaying]);

  const togglePlay = (e?: any) => {
      e?.stopPropagation();
      if (!player) return;

      // 1. Optimistic Update
      const nextState = !optimisticPlaying;
      setOptimisticPlaying(nextState);

      // 2. Button Animation (Bounce In -> Out)
      playButtonScale.value = withSequence(
          withTiming(0.8, { duration: 100 }),
          withSpring(1, { damping: 10, stiffness: 200 })
      );

      // 3. Actual Action
      if (nextState) {
          setStorePlaying(true);
          player.play();
      } else {
          setStorePlaying(false);
          player.pause();
      }
  };

  
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
  
  const isIsland = miniPlayerStyle === 'island';
  
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
  }, [currentSong, expanded, isIsland]);
    
  // Create a "vignette" theme for island: Black -> Color -> Black
  const mainColor = gradientColors[1] || gradientColors[0];

  // Seek Lock to prevent visual glitch
  const isSeekingRef = useRef(false);
  const seekLockTimeout = useRef<NodeJS.Timeout | null>(null);

  // Optimistic position for smooth scrubbing
  const [optimizedPosition, setOptimizedPosition] = useState(0);

  // Sync effect
  useEffect(() => {
     if (!isSeekingRef.current) {
         setOptimizedPosition(realPosition);
     }
  }, [realPosition]);
  
  // Use optimistic position as source of truth for UI
  const storePosition = optimizedPosition;
  const storeDuration = realDuration;
  



  // ProgressBar width state (kept for classic mode)
  const [progressBarWidth, setProgressBarWidth] = useState(0);
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
          console.log('[MiniPlayer] Syncing audio for:', currentSong.title);
          await player.replace(currentSong.audioUri);
          setLoadedAudioId(currentSong.id);
          
          // On app startup (first load), don't auto-play
          // On user-initiated song change, auto-play
          if (isInitialLoad.current) {
            isInitialLoad.current = false;
            console.log('[MiniPlayer] Initial load - staying paused');
          } else {
            setStorePlaying(true);
            player.play();
            console.log('[MiniPlayer] User selected song - auto-playing');
          }
        } catch (error) {
          console.error('[MiniPlayer] Failed to sync audio:', error);
        }
      }
    };
    
    syncAudio();
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

  // Classic Height Animation — three stages: collapsed → half (50%) → full (95%)
  const animatedClassicStyle = useAnimatedStyle(() => {
    if (isIsland) return {};
    const halfHeight = screenHeight * 0.5;
    const fullHeight = screenHeight * 0.915;
    const currentHeight = interpolate(
      classicFullProgress.value,
      [0, 1],
      [
        interpolate(expansionProgress.value, [0, 1], [70, halfHeight], Extrapolation.CLAMP),
        fullHeight
      ],
      Extrapolation.CLAMP
    );
    return { height: currentHeight };
  });
  
  // Classic Lyrics Opacity (Expansion * Transition)
  const animatedClassicLyricsStyle = useAnimatedStyle(() => {
    const expandOp = interpolate(expansionProgress.value, [0.5, 1], [0, 1], Extrapolation.CLAMP);
    return {
      opacity: expandOp * transitionOpacity.value,
    };
  });
  
  // Safe progress calculation
  const progress = storeDuration > 0 && !isNaN(storePosition) 
    ? Math.min(storePosition / storeDuration, 1) 
    : 0;
  
  const formatTime = (seconds: number): string => {
    if (!seconds || isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };
  
  // Get Current Lyric (Use displayedSong for persistent view)
  // Use displayedSong if expanded/classic to prevent instant jump, else currentSong
  const songForLyrics = (!isIsland && expanded) ? displayedSong : currentSong;
  
  const lyricsToUse = (showTransliteration && songForLyrics?.transliteratedLyrics && songForLyrics.transliteratedLyrics.length > 0)
    ? songForLyrics.transliteratedLyrics
    : songForLyrics?.lyrics;

  const lyricsDelay = useSettingsStore(state => state.lyricsDelay);

  const currentLyricIndex = lyricsToUse
    ? getCurrentLineIndex(lyricsToUse, storePosition + lyricsDelay) // DELAY: User configured offset (default -1.2s)
    : -1;
  const currentLyricText = (currentLyricIndex !== -1 && lyricsToUse?.[currentLyricIndex]) 
    ? lyricsToUse[currentLyricIndex].text 
    : '';

  /* 
     VISUAL HIGHLIGHT LAG 
     User wants text to "come up" before highlighting.
     - currentLyricIndex: Logic source (time based).
  */






  
  const skipForward = (e?: any) => {
    e?.stopPropagation();
    // usePlayerStore.getState().nextInPlaylist() handles the logic
    usePlayerStore.getState().nextInPlaylist();
  };
  
  const skipBackward = (e?: any) => {
    e?.stopPropagation();
    // Spotify Rule: Restart if > 3s, else Previous Track
    if (storePosition > 3 && player) {
        // Optimistic UI Update: Instant reset to 0
        isSeekingRef.current = true;
        setOptimizedPosition(0);
        player.seekTo(0);
        
        // Release lock after delay to allow engine to catch up
        if (seekLockTimeout.current) clearTimeout(seekLockTimeout.current);
        seekLockTimeout.current = setTimeout(() => {
            isSeekingRef.current = false;
        }, 1000); // 1s cushion
    } else {
        usePlayerStore.getState().previousInPlaylist();
    }
  };

  const handleSeekPress = async (e: any) => {
      e.stopPropagation();
      if (!player || storeDuration <= 0 || progressBarWidth <= 0) return;
      const { locationX } = e.nativeEvent;
      const percentage = locationX / progressBarWidth;
      const seekTime = percentage * storeDuration;
      const wasPlaying = usePlayerStore.getState().isPlaying;
      await player.seekTo(seekTime);
      if (wasPlaying) player.play();
  };

  const panGesture = Gesture.Pan()
    .activeOffsetY([-5, 5])
    .activeOffsetX([-80, 80])
    .simultaneousWithExternalGesture()
    .onUpdate((event: any) => {
      // Horizontal swipe detection (classic full mode) — don't animate anything, just let it happen
      const isHorizontal = Math.abs(event.translationX) > Math.abs(event.translationY);
      if (!isIsland && expanded && classicFullExpanded && isHorizontal) {
        return; // Skip vertical animation updates during horizontal swipe
      }

      if (!isIsland && expanded) {
        // Classic Mode: two-stage expansion (half → full)
        if (!classicFullExpanded) {
          if (event.translationY < 0) {
            // Swiping up from half → preview full
            classicFullProgress.value = Math.min(Math.abs(event.translationY) / 200, 1);
          }
        } else {
          if (event.translationY > 0) {
            // Swiping down from full → preview half
            classicFullProgress.value = 1 - Math.min(event.translationY / 200, 1);
          }
        }
      } else if (expanded) {
        if (!lyricExpanded && !fullLyricExpanded) {
          if (event.translationY > 0) {
            lyricExpansionProgress.value = Math.min(event.translationY / 200, 1);
          }
        } else if (lyricExpanded && !fullLyricExpanded) {
           const hasLyrics = currentSong?.lyrics && currentSong.lyrics.length > 0;
           if (event.translationY > 0) {
             if (hasLyrics) {
                fullExpansionProgress.value = Math.min(event.translationY / 200, 1);
             }
           } else {
             lyricExpansionProgress.value = 1 - Math.min(Math.abs(event.translationY) / 200, 1);
           }
        } else if (fullLyricExpanded) {
          if (event.translationY < 0) {
            fullExpansionProgress.value = 1 - Math.min(Math.abs(event.translationY) / 200, 1);
          }
        }
      }
    })
    .onEnd((event: any) => {
      // Check horizontal swipe FIRST (classic full mode)
      const isHorizontal = Math.abs(event.translationX) > Math.abs(event.translationY);
      if (!isIsland && expanded && classicFullExpanded && isHorizontal) {
        const velocityX = event.velocityX;
        const translationX = event.translationX;

        if (translationX < -60 || velocityX < -600) {
          // Swipe left → next song
          runOnJS(skipForward)();
          return;
        } else if (translationX > 60 || velocityX > 600) {
          // Swipe right → previous song
          runOnJS(skipBackward)();
          return;
        }
      }

      if (!isIsland && expanded) {
        const velocity = event.velocityY;
        const translation = event.translationY;

        if (!classicFullExpanded) {
          // Half-opened state
          if (translation < -50 || velocity < -500) {
            // Swipe up → go full
            classicFullProgress.value = withSpring(1);
            runOnJS(setClassicFullExpanded)(true);
          } else if (translation > 50 || velocity > 500) {
            // Swipe down → close completely
            expansionProgress.value = withSpring(0);
            classicFullProgress.value = withSpring(0);
            runOnJS(setExpanded)(false);
            runOnJS(setClassicFullExpanded)(false);
          } else {
            // Snap back to half
            expansionProgress.value = withSpring(1);
            classicFullProgress.value = withSpring(0);
          }
        } else {
          // Fully expanded state
          if (translation > 50 || velocity > 500) {
            // Swipe down → go back to half
            classicFullProgress.value = withSpring(0);
            runOnJS(setClassicFullExpanded)(false);
          } else if (translation < -50 || velocity < -500) {
            // Swipe up more → snap back to full (already full)
            classicFullProgress.value = withSpring(1);
          } else {
            // Snap back to full
            classicFullProgress.value = withSpring(1);
          }
        }
      } else if (expanded) {
        const velocity = event.velocityY;
        const translation = event.translationY;

        if (!lyricExpanded && !fullLyricExpanded) {
          if (translation > 50 || velocity > 500) {
            lyricExpansionProgress.value = withSpring(1);
            runOnJS(setLyricExpanded)(true);
          } else {
            lyricExpansionProgress.value = withSpring(0);
          }
        } else if (lyricExpanded && !fullLyricExpanded) {
          const hasLyrics = currentSong?.lyrics && currentSong.lyrics.length > 0;
          if ((translation > 50 || velocity > 500) && hasLyrics) {
            fullExpansionProgress.value = withSpring(1);
            runOnJS(setFullLyricExpanded)(true);
          } else if (translation < -50 || velocity < -500) {
            lyricExpansionProgress.value = withSpring(0);
            runOnJS(setLyricExpanded)(false);
            runOnJS(setFullLyricExpanded)(false);
          } else {
            lyricExpansionProgress.value = withSpring(1);
            fullExpansionProgress.value = withSpring(0);
          }
        } else if (fullLyricExpanded) {
          if (translation < -50 || velocity < -500) {
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
    
    expansionProgress.value = withSpring(1, {
      damping: 14,
      stiffness: 150,
      mass: 0.6
    });
    setExpanded(true);
  }, [expanded]);

  const openNowPlaying = () => {
    if (currentSong) {
      setMiniPlayerHidden(true);
      (navigation as any).navigate('NowPlaying', { songId: currentSong.id });
      expansionProgress.value = withSpring(0);
      lyricExpansionProgress.value = withSpring(0);
      fullExpansionProgress.value = withSpring(0);
      classicFullProgress.value = withSpring(0);
      setExpanded(false);
      setLyricExpanded(false);
      setFullLyricExpanded(false);
      setClassicFullExpanded(false);
    }
  };

  const handleLyricPress = useCallback((timestamp: number) => {
      if (!fullLyricExpanded) {
          // In Half-Screen mode, tapping lyrics expands to Full Screen
          runOnJS(setFullLyricExpanded)(true);
          fullExpansionProgress.value = withSpring(1);
          return; // Do NOT seek in half mode
      } 
      // Only seek in Full Screen mode
      usePlayerStore.getState().seekTo(timestamp);
  }, [fullLyricExpanded, fullExpansionProgress]);

  const handleIslandSeek = useCallback(async (time: number) => {
    if(player) {
         // Lock updates
        isSeekingRef.current = true;

        // Optimistic Update: Set the UI position immediately to the target time
        // This prevents the "jump back" because progress will now be calculated from this time
        // until isSeekingRef is released.
        setOptimizedPosition(time);

        const wasPlaying = usePlayerStore.getState().isPlaying;
        await player.seekTo(time);
        if (wasPlaying) player.play();

        // Unlock after delay
        if (seekLockTimeout.current) clearTimeout(seekLockTimeout.current);
        seekLockTimeout.current = setTimeout(() => {
            isSeekingRef.current = false;
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
            currentTime={storePosition}
            duration={storeDuration > 0 ? storeDuration : 1}
            onSeek={handleIslandSeek}
            variant="classic"
            showTimeLabels={false}
            style={styles.classicScrubberOverride}
         />
      )}
      
      <AnimatedPressable 
        onPress={!expanded ? toggleExpand : undefined} 
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
        {/* Dynamic Background for Classic Mode (Same logic as Island) */}
        {!isIsland && (
           <View style={StyleSheet.absoluteFill}>
               {/* 1. Blurred Background Image */}
               {currentSong.coverImageUri ? (
                  <Image 
                    source={{ uri: currentSong.coverImageUri }} 
                    style={StyleSheet.absoluteFill}
                    resizeMode="cover"
                    blurRadius={30} // High blur for abstract background
                  />
               ) : (
                  <View style={[StyleSheet.absoluteFill, { backgroundColor: '#111' }]} />
               )}

               {/* 2. Vignette / Dark Overlay to make text readable */}
               <LinearGradient
                  colors={['rgba(0,0,0,0.3)', 'rgba(0,0,0,0.6)', 'rgba(0,0,0,0.9)']}
                  style={StyleSheet.absoluteFill}
               />
           </View>
        )}

        {isIsland && (
           <View style={[StyleSheet.absoluteFill, { borderRadius: expanded ? 40 : 30, overflow: 'hidden' }]}>
              {/* 1. Blurred Background Image */}
               {!libraryFocusMode && currentSong.coverImageUri ? (
                  <Image 
                    source={{ uri: currentSong.coverImageUri }} 
                    style={StyleSheet.absoluteFill}
                    resizeMode="cover" // Ensure colors spread to edges
                    blurRadius={22} // Reduced slightly for clearer center
                  />
               ) : (
                  <View style={[StyleSheet.absoluteFill, { backgroundColor: '#000' }]} />
               )}

              {/* 2. Vignette / Dark Overlay to make text pop */}
              <LinearGradient
                colors={['rgba(0,0,0,0.5)', 'rgba(0,0,0,0.2)', 'rgba(0,0,0,0.8)']}
                start={{x: 0, y: 0}}
                end={{x: 0, y: 1}}
                style={StyleSheet.absoluteFill}
              />
              
              <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.3)' }]} />
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
                                isPlaying={optimisticPlaying} 
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
                        <View style={styles.expandedControls}>
                             <Pressable onPress={skipBackward} hitSlop={10}>
                                 <Ionicons name="play-skip-back" size={24} color="#fff" />
                             </Pressable>
                             <Pressable onPress={togglePlay} hitSlop={20}>
                                 <Animated.View style={animatedButtonStyle}>
                                     <Ionicons name={optimisticPlaying ? 'pause' : 'play'} size={32} color="#fff" />
                                 </Animated.View>
                             </Pressable>
                             <Pressable onPress={skipForward} hitSlop={10}>
                                 <Ionicons name="play-skip-forward" size={24} color="#fff" />
                             </Pressable>
                        </View>

                        
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
                                    {!!currentLyricText ? currentLyricText : ''}
                                </Text>
                            </View>
                        ) : (
                            /* 2. EXPANDED MODE (Half & Full) - Unified FlatList */
                            <View style={styles.expandedLyricsContainer}>
                                <SynchronizedLyrics
                                    lyrics={lyricsToUse || []}
                                    currentTime={isSeekingRef.current ? storePosition : storePosition} // Force fresh read
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
                                    currentTime={storePosition}
                                    duration={storeDuration > 0 ? storeDuration : 1}
                                    onSeek={handleIslandSeek}
                                    variant="island"
                                />
                             </View>
                        )}
                    </Pressable>
                </GestureDetector>
            </View>
        ) : (
            // COLLAPSED / CLASSIC VIEW
            <View style={{ width: '100%', height: '100%' }}>
                <View style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    height: 70,
                    paddingHorizontal: 16,
                    width: '100%'
                }}>
                    {/* Cover Art - PRESSABLE -> Opens Full Player */}
                    <Pressable onPress={(e) => { e.stopPropagation(); openNowPlaying(); }}>
                        {currentSong.coverImageUri ? (
                        <Animated.Image 
                            source={{ uri: currentSong.coverImageUri }} 
                            style={[styles.coverThumbnail, isIsland && styles.islandCover]}
                        />
                        ) : (
                        <View style={[styles.placeholderThumbnail, isIsland && styles.islandCover]}>
                            <Ionicons name="musical-notes" size={20} color="#666" />
                        </View>
                        )}
                    </Pressable>
                    
                    {/* Song Info */}
                    <View style={styles.info}>
                    <Text style={styles.title} numberOfLines={1}>
                        {currentSong.title}
                    </Text>
                    <Text style={[styles.artist, isIsland && { display: 'none' }]} numberOfLines={1}>
                        {currentSong.artist || 'Unknown Artist'}
                    </Text>
                    </View>
                    
                    {/* Controls */}
                    {isIsland ? (
                    <View style={[styles.islandControls, { zIndex: 10 }]}>
                        <Pressable onPress={togglePlay} hitSlop={20}>
                            <Animated.View style={animatedButtonStyle}>
                                <Ionicons 
                                name={optimisticPlaying ? 'pause' : 'play'} 
                                size={24} 
                                color="#fff" 
                                />
                            </Animated.View>
                        </Pressable>
                    </View>
                    ) : (
                    /* Bar Mode Controls */
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <Pressable onPress={(e) => { e.stopPropagation(); skipBackward(e); }} style={styles.controlButton}>
                        <Ionicons name="play-skip-back" size={24} color="#fff" />
                        </Pressable>
                        
                        <Pressable onPress={(e) => { e.stopPropagation(); togglePlay(e); }} style={[styles.playButton, { marginHorizontal: 12 }]} hitSlop={20}>
                        <Animated.View style={animatedButtonStyle}>
                            <Ionicons name={optimisticPlaying ? 'pause' : 'play'} size={32} color="#fff" />
                        </Animated.View>
                        </Pressable>
                        
                        <Pressable onPress={(e) => { e.stopPropagation(); skipForward(e); }} style={styles.controlButton}>
                        <Ionicons name="play-skip-forward" size={24} color="#fff" />
                        </Pressable>
                    </View>
                    )}
                </View>

                {/* Classic Expanded Lyrics View */}
                {!isIsland && expanded && (
                    <GestureDetector gesture={panGesture}>
                        <Animated.View style={[styles.classicLyricsContainer, animatedClassicLyricsStyle]}>
                            <SynchronizedLyrics
                                lyrics={lyricsToUse || []}
                                currentTime={storePosition}
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
                            {/* Close Indicator */}
                             <View style={styles.dragHandle} />
                        </Animated.View>
                    </GestureDetector>
                )}
            </View>
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
    top: Platform.OS === 'ios' ? 58 : 40, 
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
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2
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
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2
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
