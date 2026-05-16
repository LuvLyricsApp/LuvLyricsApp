import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, Pressable, StyleSheet, Image, Alert, Platform, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, runOnJS, useAnimatedReaction, withRepeat, Easing, withSequence, cancelAnimation } from 'react-native-reanimated';
import * as GestureHandler from 'react-native-gesture-handler';
import { SafeAreaView } from 'react-native-safe-area-context';
import { usePlayer } from '../contexts/PlayerContext';
import { usePlayerStore } from '../store/playerStore';
import { useSongsStore } from '../store/songsStore';
import { useArtHistoryStore } from '../store/artHistoryStore';
import TimelineScrubber from '../components/TimelineScrubber';
import CustomMenu from '../components/CustomMenu';
import { RootStackScreenProps } from '../types/navigation';
import { useFocusEffect } from '@react-navigation/native';
import * as queries from '../database/queries';
import { getGradientColors } from '../constants/gradients';
import { AuroraHeader } from '../components/AuroraHeader';
import { CoverArtSearchScreen } from './CoverArtSearchScreen'; // Import the new screen (as a component/modal)
// Toast removed as unused
import { useSettingsStore } from '../store/settingsStore';
import { RotatingVinyl } from '../components/VinylRecord';
import SynchronizedLyrics from '../components/SynchronizedLyrics';
const { Gesture, GestureDetector } = GestureHandler;
const { width } = Dimensions.get('window');

type Props = RootStackScreenProps<'NowPlaying'>;

const NowPlayingScreen: React.FC<Props> = ({ navigation, route }) => {
  const player = usePlayer();
  const currentSong = usePlayerStore(state => state.currentSong);
  const showTransliteration = usePlayerStore(state => state.showTransliteration);
  const updateCurrentSong = usePlayerStore(state => state.updateCurrentSong);
  const loadedAudioId = usePlayerStore(state => state.loadedAudioId);
  const setLoadedAudioId = usePlayerStore(state => state.setLoadedAudioId);
  const setMiniPlayerHiddenSource = usePlayerStore(state => state.setMiniPlayerHiddenSource);
  const storePosition = usePlayerStore(state => state.position);
  const storeDuration = usePlayerStore(state => state.duration);
  const storePlaying = usePlayerStore(state => state.isPlaying);
  const setStorePlaying = usePlayerStore(state => state.setIsPlaying);

  const toggleLike = useSongsStore(state => state.toggleLike);
  const addRecentArt = useArtHistoryStore(state => state.addRecentArt);
  const autoHideControls = useSettingsStore(state => state.autoHideControls);
  const setAutoHideControls = useSettingsStore(state => state.setAutoHideControls);
  const animateBackground = useSettingsStore(state => state.animateBackground);
  const setAnimateBackground = useSettingsStore(state => state.setAnimateBackground);
  const { songId } = route.params;
  
  const flatListRef = useRef<any>(null);
  const contentHeightRef = useRef(0);
  const activeLoadSongIdRef = useRef<string | null>(null);
  const [menuVisible, setMenuVisible] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState<{ x: number, y: number } | undefined>(undefined);
  const [showCoverSearch, setShowCoverSearch] = useState(false); // State for Cover Search Modal
  const [controlsVisible, setControlsVisible] = useState(true);
  const [showLyrics, setShowLyrics] = useState(true); // Issue  5: Lyrics toggle state
  
  // Visibility Management: Hide MiniPlayer when NowPlaying is open (and focused)
  useFocusEffect(
    React.useCallback(() => {
      setMiniPlayerHiddenSource('NowPlaying', true);
      return () => {
         // Only unhide if we are actually leaving the NowPlaying context entirely
         setMiniPlayerHiddenSource('NowPlaying', false);
      };
    }, [setMiniPlayerHiddenSource])
  );
  
  // Animation for Auto-Hide
  const controlsOpacity = useSharedValue(1);
  const hideTimerRef = useRef<NodeJS.Timeout | null>(null);

  const resetHideTimer = useCallback(() => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    controlsOpacity.value = withTiming(1, { duration: 200 });
    // Ensure controls are interactive immediately when showing
    setControlsVisible(true);
    
    if (autoHideControls && storePlaying) {
      hideTimerRef.current = setTimeout(() => {
        controlsOpacity.value = withTiming(0, { duration: 500 }); // Fade out
      }, 3500);
    }
  }, [autoHideControls, storePlaying, controlsOpacity]);

  // Issue 1: Swipe-Down Gesture to Reveal Controls
  // Using simultaneousWithExternalGesture() allows this to work even when scrolling the FlatList
  const panGesture = Gesture.Pan()
    .activeOffsetY(20) // Activate if moved down 20px (swipe down)
    .failOffsetY(-20)  // Fail if moved up 20px (scrolling down lyrics)
    .simultaneousWithExternalGesture()
    .onUpdate((e) => {
      // If swiping down significantly (>50) and controls are hidden, show them
      if (e.translationY > 50 && controlsOpacity.value < 0.5) {
        runOnJS(resetHideTimer)();
      }
    });



  useEffect(() => {
     resetHideTimer();
     return () => {
         if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
     };
  }, [storePlaying, autoHideControls]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: controlsOpacity.value,
  }));

  const handleMenuPress = (event: any) => {
    const { nativeEvent } = event;
    const anchor = { x: nativeEvent.pageX, y: nativeEvent.pageY };
    setMenuAnchor(anchor);
    setMenuVisible(true);
  };

  // Shared Values for 3 Blobs
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
        // Massive Blobs (Lava Lamp)
        // BLOB 1: Top-Left -> Bottom-Right
        blob1TranslateX.value = withRepeat(withTiming(width * 0.5, { duration: 45000, easing: Easing.inOut(Easing.ease) }), -1, true);
        blob1TranslateY.value = withRepeat(withTiming(width * 0.3, { duration: 55000, easing: Easing.inOut(Easing.ease) }), -1, true);
        blob1Scale.value = withRepeat(withTiming(1.2, { duration: 60000, easing: Easing.inOut(Easing.ease) }), -1, true);

        // BLOB 2: Bottom-Right -> Top-Left
        blob2TranslateX.value = withRepeat(withTiming(-width * 0.5, { duration: 50000, easing: Easing.inOut(Easing.ease) }), -1, true);
        blob2TranslateY.value = withRepeat(withTiming(-width * 0.4, { duration: 62000, easing: Easing.inOut(Easing.ease) }), -1, true);
        blob2Scale.value = withRepeat(withTiming(1.3, { duration: 58000, easing: Easing.inOut(Easing.ease) }), -1, true);

        // BLOB 3: Center Pulse
        blob3TranslateX.value = withRepeat(withTiming(-width * 0.2, { duration: 38000, easing: Easing.inOut(Easing.ease) }), -1, true);
        blob3TranslateY.value = withRepeat(withTiming(width * 0.2, { duration: 42000, easing: Easing.inOut(Easing.ease) }), -1, true);
        blob3Scale.value = withRepeat(withTiming(1.4, { duration: 48000, easing: Easing.inOut(Easing.ease) }), -1, true);

    } else {
        // Reset to default
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

  // Animated Styles
  const blob1Style = useAnimatedStyle(() => ({
       transform: [
           { translateX: blob1TranslateX.value } as any,
           { translateY: blob1TranslateY.value } as any,
           { scale: blob1Scale.value } as any
       ]
  }));

  const blob2Style = useAnimatedStyle(() => ({
       transform: [
           { translateX: blob2TranslateX.value } as any,
           { translateY: blob2TranslateY.value } as any,
           { scale: blob2Scale.value } as any
       ]
  }));

  const blob3Style = useAnimatedStyle(() => ({
       transform: [
           { translateX: blob3TranslateX.value } as any,
           { translateY: blob3TranslateY.value } as any,
           { scale: blob3Scale.value } as any
       ]
  }));
  
  useEffect(() => {
    const load = async () => {
      try {
        // 1. Immediate Audio Check (using data from Library/Store)
        const targetSongId = songId; // Lock ID

        // If the store has advanced to a different song (e.g. auto-next),
        // MiniPlayer owns that transition — don't fight it by reloading the old song.
        if (currentSong?.id && currentSong.id !== targetSongId) return;

        // If we have the song in store but no audioUri, we MUST fetch it.
        // But usually Library passes a valid object.
        let songToPlay = currentSong?.id === targetSongId ? currentSong : null;

        // If store is empty/wrong, fetch DB immediately
        if (!songToPlay || !songToPlay.audioUri) {
             if (__DEV__) console.log('[NowPlaying] Fetching song from DB...');
             songToPlay = await queries.getSongById(targetSongId);
        }

        if (!songToPlay?.audioUri) {
          Alert.alert('No Audio', 'This song has no audio file attached');
          return;
        }

        // 2. Play Audio (Priority)
        // If this exact song is already loaded, never replace again.
        if (loadedAudioId === targetSongId) {
           if (__DEV__) console.log('[NowPlaying] Audio already loaded');
           if (!storePlaying) player?.play();
        } else {
           // Prevent duplicate replace calls while an in-flight load for the same song exists.
           if (activeLoadSongIdRef.current === targetSongId) return;
           activeLoadSongIdRef.current = targetSongId;
           // Load new
           if (__DEV__) console.log('[NowPlaying] Loading audio:', songToPlay.title);
           await player?.replace(songToPlay.audioUri); // This is the heavy op
           setLoadedAudioId(targetSongId);
           player?.play();
           activeLoadSongIdRef.current = null;
        }

        // 3. Hydrate Lyrics (Background)
        // If the initial song didn't have lyrics (common from Library list), fetch them now
        // We do this AFTER audio starts to avoid delaying playback
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
  }, [songId, currentSong?.id, currentSong?.audioUri, currentSong?.lyrics?.length, loadedAudioId, player, setLoadedAudioId, storePlaying, updateCurrentSong]);

  // Removed manual interval polling of player.currentTime to prevent threading issues.
  // We use storePosition from usePlayerStore which is updated thread-safely in PlayerContext.

  // Issue: Intro Instrumental
  // If the first lyric starts after > 3 seconds, insert a dummy "Instrumental" line at 0:00
  const processedLyrics = React.useMemo(() => {
     const rawLyrics = (showTransliteration && currentSong?.transliteratedLyrics) 
        ? currentSong.transliteratedLyrics 
        : (currentSong?.lyrics || []);
     
     if (rawLyrics.length > 0) {
         // RUNTIME FALLBACK: Check for "collapsed" timestamps (all 0 or stuck)
         // If the last line has timestamp 0, it means we failed to parse timestamps originally.
         const lastTimestamp = rawLyrics[rawLyrics.length - 1].timestamp;
         const isCollapsed = lastTimestamp === 0 && rawLyrics.length > 1;

         if (isCollapsed) {
             const duration = (storeDuration && storeDuration > 0) 
                ? storeDuration 
                : (currentSong?.duration || 180);
             
             console.log(`[NowPlaying] âš ï¸ Detected collapsed lyrics. Auto-generating timestamps for ${duration}s`);
             
             // Auto-distribute
             const newLyrics = rawLyrics.map((line, index) => ({
                 ...line,
                 timestamp: (index / rawLyrics.length) * duration
             }));
             return newLyrics;
         }

         const firstTimestamp = rawLyrics[0].timestamp;
         // If start is delayed by > 2s, pretend 0-first is instrumental
         if (firstTimestamp > 2) {
             return [{ timestamp: 0, text: '' }, ...rawLyrics];
         }
     }
     return rawLyrics;
  }, [currentSong?.lyrics, currentSong?.transliteratedLyrics, showTransliteration, storeDuration, currentSong?.duration]);

  // âœ… Determine if lyrics are "Linear" (Plain/Teleprompter)
  const isLinear = React.useMemo(() => {
     if (!processedLyrics || processedLyrics.length <= 10) return false;
     
     // Check gaps across multiple lines to avoid false positives (e.g. rhythmic intro)
     const firstGap = processedLyrics[1].timestamp - processedLyrics[0].timestamp;
     let isConstant = true;
     
     // Check first 8 gaps
     for (let i = 1; i < 9; i++) {
         const gap = processedLyrics[i+1].timestamp - processedLyrics[i].timestamp;
         if (Math.abs(gap - firstGap) > 0.05) { // Allow tiny variance
             isConstant = false;
             break;
         }
     }
     
     return isConstant;
  }, [processedLyrics]);

  const [activeLyricIndex, setActiveLyricIndex] = useState(-1);
  const isUserScrolling = useRef(false); // âœ… Track user interaction
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null); // âœ… Track timeout to clear it

  const { lyricsDelay } = useSettingsStore();

  // âœ… Auto-Scroll & Sync Logic
  useEffect(() => {
    if (!processedLyrics || processedLyrics.length === 0) return;

    // Standard Time-Based Index Calculation
    // Use configured delay
    const effectiveTime = storePosition + lyricsDelay;
    
    const index = processedLyrics.findIndex((line, i) => {
      const nextLine = processedLyrics[i + 1];
      return effectiveTime >= line.timestamp && (!nextLine || effectiveTime < nextLine.timestamp);
    });

    if (!isLinear) {
        // For Synced Lyrics, Time determines Highlight
        if (index !== activeLyricIndex) {
            setActiveLyricIndex(index);
        }
    }

    // SCROLL LOGIC
    // âœ… Skip auto-scroll if user is interacting
    if (isLinear && flatListRef.current && contentHeightRef.current > 0 && !isUserScrolling.current) {
        // Precise Layout Calculation
        const HEADER_HEIGHT = 420; // 300 (Spacer) + 20 (Margin) + 100 (PaddingTop)
        const FOOTER_HEIGHT = 450; // 250 (PaddingBottom) + 200 (ListFooter)
        const totalContentHeight = contentHeightRef.current;
        const textHeight = Math.max(0, totalContentHeight - HEADER_HEIGHT - FOOTER_HEIGHT);
        
        // Calculate Y position of the "Active Point" within the full content
        // We assume plain lyrics are distributed evenly across the text height
        const progress = Math.min(1, Math.max(0, storePosition / (storeDuration || 180)));
        const activeY = HEADER_HEIGHT + (textHeight * progress);
        
        // Calculate Target Scroll Offset to center activeY on screen
        const screenHeight = Dimensions.get('window').height;
        const targetOffset = activeY - (screenHeight * 0.4); // Position at 40% down from top
        
        flatListRef.current.scrollToOffset({
             offset: Math.max(0, targetOffset),
             animated: true // smooth interpolation
        });
        // Note: We do NOT set activeLyricIndex here. 
        // We let the onScroll event handle the highlighting based on visual position.
        return;
    }

    // STANDARD SYNCED SCROLL (Jump to line)
    // Handled internally by SynchronizedLyrics component now.
  }, [storePosition, currentSong, processedLyrics, isLinear, activeLyricIndex, flatListRef, contentHeightRef, isUserScrolling, setActiveLyricIndex, storeDuration]);

  // âœ… Playback Controls
  const playButtonScale = useSharedValue(1);

  const togglePlay = () => {
    resetHideTimer();
    if (!player) return;

    // 1. Instant Bounce Animation
    playButtonScale.value = withSequence(
        withTiming(0.8, { duration: 100 }), 
        withTiming(1, { duration: 100 })
    );

    // 2. Actual Toggle
    if (storePlaying) {
      setStorePlaying(false);
      player?.pause(); 
    } else {
      setStorePlaying(true);
      player?.play();
    }
  };

  const playButtonStyle = useAnimatedStyle(() => ({
    transform: [{ scale: playButtonScale.value }] 
  }));

  const skipForward = async () => {
    resetHideTimer();
    // usePlayerStore.getState().nextInPlaylist();
    usePlayerStore.getState().nextInPlaylist();
  };

  const skipBackward = async () => {
    resetHideTimer();
    if (!player) return;
    
    // Spotify Rule: Restart if > 3s, else Previous Track
    if (storePosition > 3) {
         // Optimistic Update for NowPlaying Scrubber
         // We use the store's updateProgress to force the UI to 0 immediately
         usePlayerStore.getState().updateProgress(0, storeDuration);
         await player.seekTo(0);
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
      // Optimistic update: immediately jump lyrics to tapped position
      usePlayerStore.getState().updateProgress(timestamp, storeDuration);
      await player.seekTo(timestamp); // Timestamp is in seconds.
      player.play(); // Ensure playback continues
  };

  // âœ… Use Loaded Audio ID
  useEffect(() => {
    // Already implemented in previous step, ensuring it persists
  }, []);

  // Dynamic Theme Logic
  // Dynamic Theme Logic
  const isDynamicTheme = currentSong?.gradientId === 'dynamic';
  
  // If dynamic but NO cover art, fallback to a default gradient (e.g. Aurora)
  const effectiveGradientId = (isDynamicTheme && !currentSong?.coverImageUri) 
      ? 'aurora' 
      : (currentSong?.gradientId || 'aurora');

  const gradientColors = !isDynamicTheme || !currentSong?.coverImageUri
    ? getGradientColors(effectiveGradientId) 
    : ['#000', '#000'];

  // ... imports moved to top



  return (
    <GestureDetector gesture={panGesture}>
      <View style={styles.container}>
         {/* Background: Dynamic Blur or Black */}
         <View style={[StyleSheet.absoluteFill, { backgroundColor: '#000' }]} />
       
       {isDynamicTheme && currentSong?.coverImageUri ? (
          <View style={[StyleSheet.absoluteFill, { overflow: 'hidden' }]}>
             {/* Background Base (Darkened) */}
             <Image 
                  source={{ uri: currentSong.coverImageUri }} 
                  style={[StyleSheet.absoluteFill, { opacity: 0.15 }]} 
                  blurRadius={120} 
                  resizeMode="cover"
             />

             {/* Blob 1: Top Left - MASSIVE */}
             <Animated.View style={[{ position: 'absolute', top: -width * 0.5, left: -width * 0.5, width: width * 2, height: width * 2, borderRadius: width }, blob1Style]}>
                <Image 
                  source={{ uri: currentSong.coverImageUri }} 
                  style={{ width: '100%', height: '100%', opacity: 0.4 }} 
                  blurRadius={100} 
                />
             </Animated.View>
             
             {/* Blob 2: Bottom Right - MASSIVE */}
             <Animated.View style={[{ position: 'absolute', bottom: -width * 0.5, right: -width * 0.5, width: width * 2, height: width * 2, borderRadius: width }, blob2Style]}>
                <Image 
                  source={{ uri: currentSong.coverImageUri }} 
                  style={{ width: '100%', height: '100%', opacity: 0.35 }} 
                  blurRadius={110} 
                />
             </Animated.View>

             {/* Blob 3: Center - MASSIVE */}
             <Animated.View style={[{ position: 'absolute', top: 0, left: 0, width: width * 1.8, height: width * 1.8, borderRadius: width }, blob3Style]}>
                <Image 
                  source={{ uri: currentSong.coverImageUri }} 
                  style={{ width: '100%', height: '100%', opacity: 0.25 }} 
                  blurRadius={90} 
                />
             </Animated.View>
            <LinearGradient
                colors={['rgba(0,0,0,0.1)', 'rgba(0,0,0,0.5)', '#000']}
                locations={[0.2, 0.7, 1.0]}
                style={StyleSheet.absoluteFill}
            />
          </View>
       ) : (
          <AuroraHeader colors={gradientColors} animated={animateBackground} />
       )}
       
       {/* Ensure AuroraHeader is NOT shown if dynamic to avoid clashing, or maybe show it with low opacity? 
           User wants "Dynamic Theme", usually means the blur IS the theme. 
           So we replace AuroraHeader with the blur. 
       */}
       

 
       {/* Header with Blur for "Opaque" look that matches theme */}
       <Animated.View style={[styles.headerContainer, animatedStyle]} pointerEvents={controlsVisible ? 'auto' : 'none'}>
         <BlurView intensity={80} tint="dark" style={styles.blurContainer}>
           <SafeAreaView edges={['top']} style={styles.headerContent}>
              <Pressable onPress={() => navigation.goBack()} style={styles.headerButton}>
                <Ionicons name="chevron-down" size={28} color="#fff" />
              </Pressable>
              
              <View style={{ alignItems: 'center', flex: 1 }}>
                <Text style={styles.headerTitle} numberOfLines={1}>NOW PLAYING</Text>
                <Text style={styles.headerSubtitle} numberOfLines={1}>{currentSong?.title}</Text>
              </View>
              
              <View style={styles.headerRight}>
                <CustomMenu 
                  visible={menuVisible}
                  onClose={() => setMenuVisible(false)}
                  anchorPosition={menuAnchor}
                  options={[
                    {
                      label: showLyrics ? 'Hide Lyrics' : 'Show Lyrics',
                      icon: showLyrics ? 'eye-off-outline' : 'eye-outline',
                      onPress: () => {
                        setMenuVisible(false);
                        setShowLyrics(!showLyrics);
                      }
                    },
                    {
                      label: 'Go to Current Lyric',
                      icon: 'locate-outline',
                      onPress: () => {
                        setMenuVisible(false);
                        if (flatListRef.current && activeLyricIndex !== -1 && !isLinear) {
                          // Scroll to active lyric for synced lyrics
                          flatListRef.current.scrollToIndex({
                            index: activeLyricIndex,
                            animated: true,
                            viewPosition: 0.3,
                          });
                          // Toast log removed to fix missing state
                        } else if (isLinear) {
                          // Toast log removed to fix missing state
                        } else {
                          // Toast log removed to fix missing state
                        }
                      }
                    },
                    {
                      label: 'Edit Lyrics',
                      icon: 'create-outline',
                      onPress: () => {
                        setMenuVisible(false);
                        navigation.navigate('AddEditLyrics', { songId: currentSong?.id });
                      }
                    },
                    {
                      label: 'Sync Lyrics',
                      icon: 'timer-outline',
                      onPress: () => {
                         setMenuVisible(false);
                         // Is this just edit mode? Or Sync mode? 
                         // The user has a sync mode in AddEditLyrics.
                         navigation.navigate('AddEditLyrics', { songId: currentSong?.id });
                      }
                    },
                    {
                       label: autoHideControls ? 'Disable Auto-Hide' : 'Enable Auto-Hide',
                       icon: autoHideControls ? 'eye-outline' : 'eye-off-outline',
                       onPress: () => {
                           setMenuVisible(false);
                           setAutoHideControls(!autoHideControls);
                       }
                    },
                    {
                       label: animateBackground ? 'Disable Animation' : 'Enable Animation',
                       icon: animateBackground ? 'contrast-outline' : 'contrast',
                       onPress: () => {
                           setMenuVisible(false);
                           setAnimateBackground(!animateBackground);
                       }
                    }
                  ]}
                />
                <Pressable onPress={handleMenuPress} style={styles.headerButton}>
                  <Ionicons name="ellipsis-horizontal" size={24} color="#fff" />
                </Pressable>
              </View>
           </SafeAreaView>
         </BlurView>
       </Animated.View>
 
        <CoverArtSearchScreen 
           visible={showCoverSearch}
           initialQuery={`${currentSong?.title} ${currentSong?.artist}`}
           onClose={() => setShowCoverSearch(false)}
           onSelect={async (uri) => {
               setShowCoverSearch(false);
               if (currentSong) {
                   // Update Store
                   const updatedSong = { ...currentSong, coverImageUri: uri };
                   
                   // Optimistic update
                   updateCurrentSong({ coverImageUri: uri }); 
                   
                   try {
                        // Corrected: Pass the full updated song object
                        await queries.updateSong(updatedSong);
                        addRecentArt(uri);
                   } catch (e) {
                       if (__DEV__) console.error('[NowPlaying] Failed to save cover:', e);
                       // Revert optimistic update if needed, but user just sees error
                   }
               }
           }}
        />
 
       {/* Main Content Area - Lyrics take priority */}
       <View style={styles.contentArea}>
           {showLyrics ? (
             // Lyrics List
          <SynchronizedLyrics 
             lyrics={processedLyrics || []}
             currentTime={storePosition}
             onLyricPress={handleLyricTap}
             songTitle={currentSong?.title}
             highlightColor={gradientColors[0] !== '#000' ? gradientColors[0] : 'rgba(255,255,255,0.2)'}
             isUserScrolling={isUserScrolling.current}
             onScrollStateChange={(isScrolling) => {
                 isUserScrolling.current = isScrolling;
                 if (!isScrolling) {
                     if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
                     scrollTimeoutRef.current = setTimeout(() => {
                         isUserScrolling.current = false;
                     }, 4000);
                 } else {
                     if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
                 }
             }}
             headerContent={
                <View style={styles.topSpacer}>
                    {/* Main Cover Art Header - Interactive */}
                    <Pressable 
                        onLongPress={() => setShowCoverSearch(true)}
                        style={({ pressed }) => [
                            styles.mainCoverContainer,
                            pressed && { opacity: 0.8 }
                        ]}
                    >
                        {currentSong?.coverImageUri ? (
                            <Image source={{ uri: currentSong.coverImageUri }} style={styles.mainCover} />
                        ) : (
                             <View style={[styles.mainCover, { backgroundColor: '#333', justifyContent: 'center', alignItems: 'center' }]}>
                                 <Ionicons name="musical-note" size={60} color="#666" />
                             </View>
                        )}
                    </Pressable>
                </View>
             }
          />
          ) : (
            // Issue 6: Vinyl Record Display (when lyrics are hidden)
            <View style={styles.vinylContainer}>
                <RotatingVinyl 
                  imageUri={currentSong?.coverImageUri} 
                  size={width * 0.75} 
                  isPlaying={storePlaying}
                />
            </View>
          )}
      </View>

      {/* Issue 4: Dynamic Island Bottom Controls */}
      <Animated.View style={[styles.bottomControlsContainer, animatedStyle]} pointerEvents={controlsVisible ? 'auto' : 'none'}>
          {/* 3-Layer Background Stack (Dynamic Island Style) - Replaced with Real BlurView */}
          <View style={[styles.bottomControlsPill, { backgroundColor: '#181818' }]}>

             
             {/* Dynamic Island Body - Blurred Album Art Color */}
             {currentSong?.coverImageUri && (
                <Image 
                  source={{ uri: currentSong.coverImageUri }} 
                  style={[StyleSheet.absoluteFill, { opacity: 0.5 }]} 
                  blurRadius={50}
                />
             )}

             {/* Dark Gradient Overlay for readability & depth */}
             <LinearGradient
              colors={['rgba(0,0,0,0.3)', 'rgba(0,0,0,0.7)']}
              style={StyleSheet.absoluteFill}
             />
            
          {/* Content */}
             {/* Content */}
             <View style={styles.bottomControlsContent}>
               
               {/* 0. Top Right Menu (Three Dots) - Absolute Positioned */}
               <View style={{ position: 'absolute', top: 15, right: 20, zIndex: 10 }}>
                  <Pressable onPress={() => setShowLyrics(!showLyrics)} style={{ padding: 4 }}>
                    <Ionicons name="ellipsis-horizontal" size={24} color="rgba(255,255,255,0.6)" />
                  </Pressable>
               </View>

               {/* 1. Main Controls - Top */}
               <View style={styles.controls}>
                  <Pressable onPress={skipBackward} style={styles.controlBtn}>
                    <Ionicons name="play-back" size={24} color="#fff" /> 
                  </Pressable>
                  
                  <Pressable onPress={togglePlay} style={styles.playBtnLarge}>
                    <Animated.View style={playButtonStyle}>
                         <Ionicons 
                          name={storePlaying ? 'pause' : 'play'} 
                          size={32} 
                          color="#000" 
                        />
                    </Animated.View>
                  </Pressable>
                  
                  <Pressable onPress={skipForward} style={styles.controlBtn}>
                    <Ionicons name="play-forward" size={24} color="#fff" /> 
                  </Pressable>
               </View>

               {/* 2. Scrubber - Middle */}
               <View style={{ marginVertical: 8 }}> 
                  <TimelineScrubber 
                     currentTime={storePosition} 
                     duration={storeDuration} 
                     onSeek={handleScrub}
                     variant="classic"
                  />
               </View>

               {/* 3. Mini Info (Title + Artist) - Bottom & Centered (No Cover) */}
                <View style={[styles.miniInfo, { paddingHorizontal: 40 }]}>
                   <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', width: '100%', position: 'relative' }}>
                       <View style={{ flex: 1, alignItems: 'center' }}>
                           <Text style={styles.miniTitle} numberOfLines={1}>{currentSong?.title}</Text>
                           <Text style={styles.miniArtist} numberOfLines={1}>{currentSong?.artist}</Text>
                       </View>
                       
                       <Pressable 
                         onPress={() => currentSong && toggleLike(currentSong.id)}
                         style={({ pressed }) => [
                           { position: 'absolute', right: -25 },
                           pressed && { transform: [{ scale: 1.4 }] }
                         ]}
                         hitSlop={15}
                       >
                           <Ionicons 
                             name={currentSong?.isLiked ? "heart" : "heart-outline"} 
                             size={30} 
                             color="#fff"
                           />
                       </Pressable>
                   </View>
                </View>
             </View>
          </View>
      </Animated.View>
    </View>
    </GestureDetector>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  headerContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 20,
    overflow: 'hidden', // Ensure blur respects bounds
    // No background color, BlurView handles it
  },
  blurContainer: {
    flex: 1,
    backgroundColor: 'rgba(10,10,10,0.3)', // Added semi-transparent dark background for "More Solid" look
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    paddingTop: Platform.OS === 'android' ? 20 : 0, 
  },
  headerSubtitle: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.7)',
    fontWeight: '500',
  },
  headerRight: {
     flexDirection: 'row',
     alignItems: 'center',
     gap: 8
  },

  headerTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    maxWidth: '60%',
    textAlign: 'center',
  },
  headerButton: {
    padding: 8,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 20,
  },
  contentArea: {
    flex: 1, // Takes up remaining space above controls
  },
  lyricsContainer: {
    paddingHorizontal: 24,
    paddingTop: 100, // Adjusted for Header
    paddingBottom: 250, // Adjusted for Bottom Controls
  },
  topSpacer: {
    height: 300, // Allocate space for cover art
    justifyContent: 'center', // Center vertically within the spacer if needed
    alignItems: 'center',
    marginBottom: 20,
  },
  mainCoverContainer: {
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 4.65,
    elevation: 8,
  },
  mainCover: {
    width: 250,
    height: 250,
    borderRadius: 12,
  },
  lyricLine: {
    paddingVertical: 10,
    marginBottom: 8,
    borderRadius: 12,
  },
  activeLyricLine: {
     // Optional background highlight
  },
  lyricText: {
    fontSize: 24, // Large text as requested
    color: '#ffffff', // White base, opacity controls dimming
    fontWeight: '700',
    lineHeight: 34,
  },
  activeLyric: {
    color: '#fff',
    fontSize: 28, // Pop out
    textShadowColor: 'rgba(255, 255, 255, 0.9)', // Stronger glow
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 20, // Wider glow
  },


  miniInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6, // Lift text up a bit
    marginTop: 5,    
  },
  miniCover: {
    width: 40, // Smaller cover
    height: 40,
    borderRadius: 6,
    backgroundColor: '#333',
  },
  miniTitle: {
    fontSize: 16, // Smaller text
    fontWeight: '700',
    color: '#fff',
  },
  miniArtist: {
    fontSize: 12, // Smaller text
    color: '#888',
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center', 
    paddingHorizontal: 20,
    marginTop: 5,   // Reduced top margin
    gap: 25,        // Tighter gap
  },
  heartGlow: {
    padding: 4,
    shadowOffset: { width: 0, height: 0 },
  },
  controlBtn: {
     padding: 8,    // Smaller padding
  },
  playBtnLarge: {
     width: 65,     // Slightly smaller but still prominent
     height: 65,
     borderRadius: 35,
     backgroundColor: '#fff',
     justifyContent: 'center',
     alignItems: 'center',
  },
  instrumentalContainer: {
    paddingVertical: 10,
    alignItems: 'flex-start', 
    justifyContent: 'center',
  },
  instrumentalContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    opacity: 0.8,
  },
  instrumentalText: {
    fontSize: 18,
    fontStyle: 'italic',
    color: 'rgba(255,255,255,0.6)',
    fontWeight: '500',
  },
  activeInstrumentalText: {
    color: '#FFD700', 
    opacity: 1,
    textShadowColor: 'rgba(255, 215, 0, 0.5)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 10,
  },
  lyricTextContainer: {
    minHeight: 40,
    justifyContent: 'center',
  },
  // Issue 4: Dynamic Island-style bottom controls
  bottomControlsContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 15,
  },
  bottomControlsPill: {
    marginHorizontal: 0, 
    marginBottom: 0,     
    borderTopLeftRadius: 25, // Slightly sharper
    borderTopRightRadius: 25,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
    paddingBottom: Platform.OS === 'ios' ? 20 : 0, 
  },
  bottomControlsContent: {
    paddingHorizontal: 20,
    paddingVertical: 15, // Reduced vertical padding
  },
  // Issue 6: Vinyl container
  vinylContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: 200, // Adjusted for smaller controls
  },
});

export default NowPlayingScreen;
