/**
 * PlaylistDetailScreen - Optimized & Refined
 * Features:
 * - Reanimated Scroll (Native Driver)
 * - Optimized Drag & Drop (Memoized Item)
 * - Debounced Search (useMemo)
 * - Dynamic Header (Syncs with playing song)
 */

import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Pressable,
  ActivityIndicator,
  TextInput,
  Dimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { useRoute, useNavigation, RouteProp, useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import DraggableFlatList, {
  RenderItemParams,
} from 'react-native-draggable-flatlist';
import * as ImagePicker from 'expo-image-picker';
import { BlurView } from 'expo-blur';
import Animated, {
  useAnimatedScrollHandler,
  useSharedValue,
  useAnimatedStyle,
  interpolate,
  Extrapolation,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FlashList } from '@shopify/flash-list';

import { useThemeColors } from '../contexts/ThemeContext';
import { Song } from '../types/song';
import { getGradientForSong, getGradientColors } from '../constants/gradients';
import { useDailyStatsStore } from '../store/dailyStatsStore';
import { useSongsStore } from '../store/songsStore';
import { AuroraHeader } from '../components/AuroraHeader';
import { usePlayer } from '../contexts/PlayerContext';
import { usePlayerStore, playerControls } from '../store/playerStore';
import { useSettingsStore } from '../store/settingsStore';
import { usePositionStore } from '../store/positionStore';
import * as playlistQueries from '../database/playlistQueries';
import { PlaylistItem } from '../components/PlaylistItem';
import { CustomMenu } from '../components/CustomMenu';
import { CoverFlow } from '../components/CoverFlow';
import { BouncePressable } from '../components/BouncePressable';
import { safeGoBack } from '../utils/navigationService';
import TimelineScrubber from '../components/TimelineScrubber';
import { ModernDeleteModal } from '../components/ModernDeleteModal';
import { Toast } from '../components/Toast';
import { useLyricsScanQueueStore } from '../store/lyricsScanQueueStore';
import { useSortedSongs } from '../hooks/useSortedSongs';
import { songCanUpgradeToSyncedLyrics } from '../utils/lyricsState';
import { bottomChromeHeight } from '../constants/layout';

type PlaylistDetailRouteProp = RouteProp<
  { PlaylistDetail: { playlistId: string } },
  'PlaylistDetail'
>;

const SCREEN_WIDTH = Dimensions.get('window').width;

const AnimatedDraggableFlatList = Animated.createAnimatedComponent(DraggableFlatList) as unknown as typeof DraggableFlatList;
const AnimatedFlashList = Animated.createAnimatedComponent(FlashList) as unknown as React.FC<any>;

export const PlaylistDetailScreen: React.FC = () => {
  const colors = useThemeColors();
  const route = useRoute<PlaylistDetailRouteProp>();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { playlistId } = route.params;

  const [songs, setSongs] = useState<Song[]>([]);
  const [playlistName, setPlaylistName] = useState('');
  const [playlistCover, setPlaylistCover] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isEditMode, setIsEditMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchActive, setIsSearchActive] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [songToDelete, setSongToDelete] = useState<string | null>(null);
  const [toast, setToast] = useState<{ visible: boolean; message: string; type: 'success' | 'error' | 'info' } | null>(null);
  /** Cover rail focus (may differ from playing track while browsing). */
  const [focusedCoverIndex, setFocusedCoverIndex] = useState(0);

  // Store Hooks
  const currentSongId = usePlayerStore(state => state.currentSongId);
  const currentPlaylistId = usePlayerStore(state => state.currentPlaylistId);
  const currentSong = usePlayerStore(state => state.currentSong);
  const setPlaylistQueue = usePlayerStore(state => state.setPlaylistQueue);
  const { play } = playerControls;
  const isPlaying = usePlayerStore(state => state.isPlaying);
  const nextInPlaylist = usePlayerStore(state => state.nextInPlaylist);
  const previousInPlaylist = usePlayerStore(state => state.previousInPlaylist);
  const position = usePositionStore(state => state.position);
  const duration = usePositionStore(state => state.duration);
  
  const activeIsPlaying = currentPlaylistId === playlistId;


  const libraryBackgroundMode = useSettingsStore(state => state.libraryBackgroundMode);
  const applyThemeToOtherPages = useSettingsStore(state => state.applyThemeToOtherPages);
  const isSolidBg = libraryBackgroundMode === 'purest-black'
    || libraryBackgroundMode === 'grey'
    || libraryBackgroundMode === 'theme-subtle'
    || libraryBackgroundMode === 'black'
    || libraryBackgroundMode === 'theme-blue';
  const playerCurrentCover = usePlayerStore(state => state.currentSong?.coverImageUri);
  const playerCurrentGradient = usePlayerStore(state => state.currentSong?.gradientId);
  const getSong = useSongsStore(state => state.getSong);
  const allSongsStore = useSongsStore(state => state.songs);

  // This screen lives in the Library tab's stack, so the tab bar is always behind
  // it. The classic mini player only stacks on top of that when a song is loaded.
  const miniPlayerStyle = useSettingsStore(state => state.miniPlayerStyle);
  const hasClassicBar = miniPlayerStyle === 'bar' && !!currentSong;
  const bottomChrome = bottomChromeHeight(insets.bottom, true, hasClassicBar);
  const fabBottom = bottomChrome + 16;
  const listPaddingBottom = bottomChrome + 80;

  const [activeThemeColors, setActiveThemeColors] = useState<string[] | undefined>(undefined);
  const [activeImageUri, setActiveImageUri] = useState<string | null>(null);

  useEffect(() => {
    if (!applyThemeToOtherPages) {
      setActiveThemeColors(undefined);
      setActiveImageUri(null);
      return;
    }
    const updateTheme = async () => {
      let themeColors: string[] | undefined;
      let image: string | null = null;
      if (libraryBackgroundMode === 'current') {
        if (currentSongId) {
          image = playerCurrentCover || null;
          if (!image && playerCurrentGradient) {
            themeColors = playerCurrentGradient === 'dynamic' ? ['#f7971e', '#ffd200', '#ff6b35'] : getGradientColors(playerCurrentGradient);
          }
        }
      } else if (libraryBackgroundMode === 'daily') {
        const topId = useDailyStatsStore.getState().getTopSongOfYesterday() || useDailyStatsStore.getState().getTopSongOfToday();
        if (topId) {
          const song = allSongsStore.find(s => s.id === topId) || await getSong(topId);
          if (song) {
            image = song.coverImageUri || null;
            if (!image && song.gradientId) {
              themeColors = song.gradientId === 'dynamic' ? ['#f7971e', '#ffd200', '#ff6b35'] : getGradientColors(song.gradientId);
            }
          }
        }
      } else if (libraryBackgroundMode === 'black') {
        themeColors = ['#050505', '#050505', '#050505'];
        image = null;
      } else if (libraryBackgroundMode === 'purest-black') {
        themeColors = ['#000000', '#000000', '#000000'];
        image = null;
      } else if (libraryBackgroundMode === 'grey') {
        themeColors = ['#0D0D0D', '#181818', '#0D0D0D'];
        image = null;
      } else if (libraryBackgroundMode === 'theme-subtle') {
        themeColors = ['#0A0A0A', '#1F1F1F', '#0A0A0A'];
        image = null;
      } else if (libraryBackgroundMode === 'theme-blue') {
        themeColors = ['#0A1628', '#1A3A6B', '#2F8CFF'];
        image = null;
      }
      setActiveThemeColors(themeColors); setActiveImageUri(image);
    };
    updateTheme();
  }, [applyThemeToOtherPages, libraryBackgroundMode, currentSongId, playerCurrentCover, playerCurrentGradient, allSongsStore, allSongsStore.length, getSong]);

  // Scan Queue Logic
  const scanQueue = useLyricsScanQueueStore(state => state.queue);
  const addToScanQueue = useLyricsScanQueueStore(state => state.addToQueue);

  const handleAddToQueue = useCallback((song: Song) => {
      const existing = scanQueue[song.id];
      
      // If result is plain, we allow "Upgrading" to synced
      const isPlainResult =
        (existing?.status === 'completed' && existing?.resultType === 'plain') ||
        (!existing && songCanUpgradeToSyncedLyrics(song));

      if (existing) {
         if (existing.status === 'failed' || isPlainResult) {
            // Allow retry or "Upgrade"
            addToScanQueue(song, isPlainResult); // forceSynced = true if currently plain
            setToast({ 
                visible: true, 
                message: isPlainResult ? `Retrying for synced lyrics: "${song.title}"` : `Retrying: "${song.title}"`, 
                type: 'info' 
            });
         } else {
            setToast({ visible: true, message: `Already searching for "${song.title}"`, type: 'info' });
            return;
         }
      } else {
         addToScanQueue(song);
         setToast({ visible: true, message: `Added to Magic Search: "${song.title}"`, type: 'success' });
      }
  }, [scanQueue, addToScanQueue]);

  // Sort State
  type SortOption = 'custom' | 'title' | 'artist' | 'date';
  type SortDirection = 'asc' | 'desc';
  
  const [sortOption, setSortOption] = useState<SortOption>('custom');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [sortMenuVisible, setSortMenuVisible] = useState(false);
  const [sortMenuAnchor, setSortMenuAnchor] = useState<{ x: number, y: number } | undefined>(undefined);
  
  // Persistence Key
  const SORT_PREF_KEY = `playlist_sort_${playlistId}`;

  // Load Sort Settings
  useEffect(() => {
     const loadSort = async () => {
         try {
             // We use require here to avoid top-level async issues if any, implies AsyncStorage
             const AsyncStorage = require('@react-native-async-storage/async-storage').default;
             const saved = await AsyncStorage.getItem(SORT_PREF_KEY);
             if (saved) {
                 const { option, direction } = JSON.parse(saved);
                 setSortOption(option);
                 setSortDirection(direction);
             }
         } catch (e) {
             console.log('Failed to load sort settings', e);
         }
     };
     loadSort();
  }, [playlistId, SORT_PREF_KEY]);

  // Save Sort Settings
  const saveSort = async (option: SortOption, direction: SortDirection) => {
      try {
          const AsyncStorage = require('@react-native-async-storage/async-storage').default;
          await AsyncStorage.setItem(SORT_PREF_KEY, JSON.stringify({ option, direction }));
      } catch (e) {
          console.error('Failed to save sort settings', e);
      }
  };

  const handleSortChange = (option: SortOption) => {
      // If clicking same option, toggle direction
      // If clicking different, set to Asc (or desc for date)
      let newDirection: SortDirection = 'asc';
      
      if (option === sortOption) {
          newDirection = sortDirection === 'asc' ? 'desc' : 'asc';
      } else {
          // Default directions: Date -> Desc (Newest), Others -> Asc (A-Z)
          if (option === 'date') newDirection = 'desc';
          else newDirection = 'asc';
      }
      
      setSortOption(option);
      setSortDirection(newDirection);
      saveSort(option, newDirection);
      setSortMenuVisible(false);
  };

  const getSortLabel = () => {
      const dirArrow = sortDirection === 'asc' ? '↑' : '↓';
      switch(sortOption) {
          case 'title': return `Alphabetical ${dirArrow}`;
          case 'artist': return `Artist ${dirArrow}`;
          case 'date': return `Recently Uploaded ${dirArrow}`;
          default: return 'Custom Order';
      }
  };

   const player = usePlayer();
   const isSeeking = useRef(false);
   const seekTimeout = useRef<NodeJS.Timeout | null>(null);

  // Removed manual interval polling of player.currentTime (does not exist in expo-audio)
  // We rely on 'position' from usePlayerStore which is synced in PlayerContext.

  // Ensure Audio is Loaded (Robust Check)
  useEffect(() => {
    const loadAudioIfNeeded = async () => {
      if (activeIsPlaying && currentSong && player) {
        const state = usePlayerStore.getState();
        // If IDs don't match, load it.
        // Trust loadedAudioId primarily. The duration check caused resets on Pause->Play.
        const needsLoad = state.loadedAudioId !== currentSong.id;
        
        if (needsLoad) {
           if (currentSong.audioUri) {
               try {
                   console.log(`[InlinePlayer] Loading audio for: ${currentSong.title}`);
                   await player.replace(currentSong.audioUri);
                   state.setLoadedAudioId(currentSong.id);
                   if (isPlaying) {
                       // Small delay to ensure native player is ready
                       setTimeout(() => player.play(), 100);
                   }
               } catch (e) {
                   console.log('[InlinePlayer] Load failed', e);
               }
           }
        }
      }
    };
    
    loadAudioIfNeeded();
  }, [activeIsPlaying, currentSong, player, isPlaying]);

  // Reanimated Shared Values
  const scrollY = useSharedValue(0);

  // formatDuration removed as unused

  // Scroll Handler
  const scrollHandler = useAnimatedScrollHandler((event) => {
    scrollY.value = event.contentOffset.y;
  });

  const flatListRef = React.useRef<any>(null);

  // Load Data
  const loadData = useCallback(async () => {
    try {
      // Don't set loading true here avoids flickering on refresh
      const playlists = await playlistQueries.getAllPlaylists();
      const playlist = playlists.find((p) => p.id === playlistId);
      const playlistSongs = await playlistQueries.getPlaylistSongs(playlistId);

      setPlaylistName(playlist?.name || 'Playlist');
      setPlaylistCover(playlist?.coverImageUri || null);
      setSongs(playlistSongs);
    } catch (e) {
      console.error('Failed to load playlist', e);
    } finally {
      setLoading(false);
    }
  }, [playlistId]); // Reload when playlistId changes

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const filteredSongs = useSortedSongs(songs, searchQuery, sortOption, sortDirection);

  // Update Queue when Sort Changes?
  // Only if we are CURRENTLY playing this playlist.
  useEffect(() => {
      if (activeIsPlaying && !searchQuery) { // Don't disrupt queue on search, only sort
           // Check if order actually changed effectively?
           // Easiest is to just update the queue in store without interrupting playback
           if (usePlayerStore.getState().updateQueue) {
                usePlayerStore.getState().updateQueue(filteredSongs);
           }
      }
  }, [filteredSongs, activeIsPlaying, searchQuery]);

  // Dynamic Header Logic & Gradient
  // Ensure the current song actually belongs to this playlist before showing it as active
  const isSongInPlaylist = currentSong && songs.some(s => s.id === currentSong.id);
  const activeSongInPlaylist = (activeIsPlaying && isSongInPlaylist) ? currentSong : null;
  
  // Playing track index in the filtered list (for rail highlight + follow).
  const currentIndex = activeIsPlaying && currentSong
    ? filteredSongs.findIndex(s => s.id === currentSong.id)
    : -1;

  const focusedSong =
    filteredSongs[focusedCoverIndex] ??
    filteredSongs[0] ??
    null;
  
  // Blurred header bg follows the focused rail cover (browse) then playhead.
  const headerImageUri =
    focusedSong?.coverImageUri ||
    activeSongInPlaylist?.coverImageUri ||
    playlistCover ||
    songs[0]?.coverImageUri;

  const activeSongGradient = useMemo(() => {
     if (focusedSong) return getGradientForSong(focusedSong);
     if (activeSongInPlaylist) return getGradientForSong(activeSongInPlaylist);
     return getGradientForSong(songs[0] || { id: 'default', gradientId: 'dynamic' });
  }, [focusedSong, activeSongInPlaylist, songs]);

  const totalDuration = useMemo(
    () => songs.reduce((acc, song) => acc + (song.duration || 0), 0),
    [songs]
  );

  const formatTotalDuration = () => {
    const hours = Math.floor(totalDuration / 3600);
    const mins = Math.floor((totalDuration % 3600) / 60);
    if (hours > 0) return `${hours} hr ${mins} min`;
    return `${mins} min`;
  };

  // --- ACTIONS ---

  // --- ACTIONS ---
  
  // handlePlayPause and handleShuffle removed as they are not currently used in the UI.
  // These can be reinstated if Play/Shuffle buttons are added to the header.
  
  const handleSongPress = useCallback((song: Song, index: number) => {
    // If we filter, the index passed is from filtered list.
    // We should queue the FILTERED list so "Next" matches what user sees.
    setPlaylistQueue(playlistId, filteredSongs, index);
    play();
  }, [playlistId, filteredSongs, setPlaylistQueue, play]);

  const handleDeleteSong = useCallback(async (songId: string) => {
    setSongToDelete(songId);
    setShowDeleteConfirm(true);
  }, []);

  const handleDragEnd = useCallback(async ({ data }: { data: Song[] }) => {
      setSongs(data);
      if (searchQuery) return; // Don't save order if filtering
      try {
          await playlistQueries.updateSongOrder(playlistId, data.map(s => s.id));
      } catch (e) {
          console.error('Reorder failed', e);
      }
  }, [playlistId, searchQuery]);

  const [menuVisible, setMenuVisible] = useState(false);
  const [menuPosition, setMenuPosition] = useState<{ x: number; y: number } | undefined>(undefined);

  const handleCoverPress = (event?: any) => {
    if (!isEditMode) return;
    
    let pageX = 50;
    let pageY = 150;

    if (event?.nativeEvent?.pageX !== undefined) {
        pageX = event.nativeEvent.pageX;
        pageY = event.nativeEvent.pageY;
    } else if (event?.absoluteX !== undefined) {
        pageX = event.absoluteX;
        pageY = event.absoluteY;
    }

    setMenuPosition({ x: pageX, y: pageY });
    setMenuVisible(true);
  };

  const handleResetCover = async () => {
    setPlaylistCover(null);
    await playlistQueries.updatePlaylist(playlistId, { coverImageUri: '' }); 
  };

  const handlePickLibrary = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.5,
    });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      const uri = result.assets[0].uri;
      setPlaylistCover(uri);
      await playlistQueries.updatePlaylist(playlistId, { coverImageUri: uri });
    }
  };

  interface MenuOption {
    label: string;
    icon?: keyof typeof Ionicons.glyphMap;
    onPress: (e?: any) => void;
    isDestructive?: boolean;
  }

  const menuOptions: MenuOption[] = [
    {
        label: 'Choose from Library',
        icon: 'images',
        onPress: () => { handlePickLibrary(); }
    },
    {
        label: 'Reset to Default',
        icon: 'refresh',
        isDestructive: true,
        onPress: () => { handleResetCover(); }
    }
  ];

  // --- RENDERERS ---

  // Passing props to memoized component
   const renderItem = useCallback(({ item, drag, isActive, getIndex }: RenderItemParams<Song>) => {
    // scanJob lookup removed - PlaylistItem handles it internally

    return (
      <PlaylistItem
        item={item}
        drag={drag}
        isActive={isActive}
        getIndex={getIndex}
        currentSongId={currentSongId}
        isPlaying={isPlaying}
        isEditMode={isEditMode}
        onPress={handleSongPress}
        onMagicPress={handleAddToQueue}

        // isScanning/isCompleted removed
        onDelete={handleDeleteSong}
        displayIndex={getIndex ? getIndex() : 0}
      />
    );

  }, [currentSongId, isPlaying, isEditMode, handleSongPress, handleDeleteSong, handleAddToQueue]);

  // Like home LuvLyrics header: fully clear at rest, solid black only after scroll.
  const headerStyle = useAnimatedStyle(() => {
    const opacity = interpolate(scrollY.value, [0, 60, 140], [0, 0.55, 1], Extrapolation.CLAMP);
    return {
      backgroundColor: `rgba(0,0,0,${opacity})`,
    };
  });

  const animatedGradientStyle = useAnimatedStyle(() => {
     // Scroll the background up with the list (Parallax-like or just direct scroll)
     // The user requested: "not fade but it also shld scroll the bg"
     return { 
        transform: [
            { translateY: -scrollY.value } 
        ]
     };
  });

  const fabStyle = useAnimatedStyle(() => {
    const show = scrollY.value > 400;
    return {
        opacity: withTiming(show ? 1 : 0),
        transform: [{ scale: withTiming(show ? 1 : 0.8) }],
    };
  });

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color="#fff" />
      </View>
    );
  }

  const renderHeader = () => (
          <View style={styles.listHeader}>
             {/* Bent CoverFlow deck + free-form fling (loop, tap-to-play, live title) */}
             {filteredSongs.length > 0 ? (
                 <CoverFlow
                    songs={filteredSongs}
                    playingIndex={currentIndex}
                    defaultGradientColors={activeSongGradient}
                    isEditMode={isEditMode}
                    onFocusedIndexChange={setFocusedCoverIndex}
                    onSelectSong={(index, song) => handleSongPress(song, index)}
                    onEditPress={handleCoverPress}
                 />
             ) : (
                 <Pressable onPress={handleCoverPress} disabled={!isEditMode}>
                   <View style={styles.coverContainer}>
                      {headerImageUri ? (
                          <Image
                            source={{ uri: headerImageUri }}
                            style={styles.coverArt}
                            contentFit="cover"
                            cachePolicy="memory-disk"
                            transition={0}
                          />
                      ) : (
                          <LinearGradient colors={activeSongGradient as [string, string]} style={styles.coverArt}>
                              <Ionicons name="musical-notes" size={80} color="rgba(255,255,255,0.4)" />
                          </LinearGradient>
                      )}
                      
                      {isEditMode && (
                          <View style={styles.editOverlay}>
                              <Ionicons name="camera" size={32} color="#fff" />
                          </View>
                      )}
                   </View>
                 </Pressable>
             )}

             {/* Live song title under rail (same cover ≠ same song) */}
             <Text style={styles.focusedSongTitle} numberOfLines={2}>
               {focusedSong?.title ?? ' '}
             </Text>
             {!!focusedSong?.artist && (
               <Text style={styles.focusedSongArtist} numberOfLines={1}>
                 {focusedSong.artist}
               </Text>
             )}
             <View style={styles.metaContainer}>
                <Text style={styles.playlistMeta}>{songs.length} songs • {formatTotalDuration()}</Text>
                {/* Sort Button */}
                <Pressable 
                    style={styles.sortButton}
                    onPress={(e) => {
                        const { pageX, pageY } = e.nativeEvent;
                        setSortMenuAnchor({ x: pageX, y: pageY });
                        setSortMenuVisible(true);
                    }}
                >
                    <Ionicons 
                        name={sortOption === 'custom' ? "filter" : "filter-circle"}
                        size={16}
                        color={sortOption === 'custom' ? "rgba(255,255,255,0.6)" : colors.primary}
                    />
                    <Text style={[
                        styles.sortButtonText,
                        sortOption !== 'custom' && { color: colors.primary }
                    ]}>
                        {getSortLabel()}
                    </Text>
                </Pressable>
             </View>

             {/* Search Bar Removed from here */}
             
             {/* Inline Player Controls */}
             {/* Show this ALWAYS, or only when songs exist? User said "keep... in that place" */}
             {songs.length > 0 && (
                 <View style={styles.inlinePlayerContainer}>
                     {/* Scrubber - Full Width */}
                     <View style={styles.scrubberContainer}>
                         <TimelineScrubber 
                            currentTime={activeIsPlaying ? position : 0}
                            duration={activeIsPlaying ? (duration > 0 ? duration : (currentSong?.duration || 180)) : (songs[0]?.duration || 180)}
                            onSeek={async (value) => {
                                if (activeIsPlaying && player) {
                                    isSeeking.current = true;
                                    if (seekTimeout.current) clearTimeout(seekTimeout.current);
                                    const wasPlaying = usePlayerStore.getState().isPlaying;
                                    await player.seekTo(value);
                                    if (wasPlaying) player.play();
                                    seekTimeout.current = setTimeout(() => {
                                        isSeeking.current = false;
                                    }, 1000);
                                }
                            }}
                         />
                     </View>

                     {/* Compact transport — BouncePressable for light alive feedback */}
                     <View style={styles.inlineControlsRow}>
                        <BouncePressable
                            style={styles.skipButton}
                            onPress={() => {
                              if (activeIsPlaying) previousInPlaylist();
                            }}
                            disabled={!activeIsPlaying}
                            hitSlop={6}
                        >
                            <Ionicons name="play-skip-back" size={20} color={activeIsPlaying ? '#FFF' : 'rgba(255,255,255,0.3)'} />
                        </BouncePressable>

                        <BouncePressable
                            style={styles.skipButton}
                            onPress={async () => {
                                if (activeIsPlaying && player) {
                                    const newTime = Math.max(0, position - 10);
                                    const wasPlaying = usePlayerStore.getState().isPlaying;
                                    await player.seekTo(newTime);
                                    if (wasPlaying) player.play();
                                }
                            }}
                            disabled={!activeIsPlaying}
                            hitSlop={6}
                        >
                            <Ionicons name="play-back" size={20} color={activeIsPlaying ? '#FFF' : 'rgba(255,255,255,0.3)'} />
                        </BouncePressable>

                        <BouncePressable
                            style={styles.playButtonLarge}
                            strong
                            onPress={() => {
                                if (activeIsPlaying) {
                                    usePlayerStore.getState().requestPlayback(!isPlaying);
                                } else if (songs.length > 0) {
                                    usePlayerStore.getState().setPlaylistQueue(playlistId, songs, 0);
                                }
                            }}
                        >
                            <Ionicons
                                name={activeIsPlaying && isPlaying ? 'pause' : 'play'}
                                size={22}
                                color="#000"
                                style={{ marginLeft: activeIsPlaying && isPlaying ? 0 : 1 }}
                            />
                        </BouncePressable>

                        <BouncePressable
                            style={styles.skipButton}
                            onPress={async () => {
                                if (activeIsPlaying && player && duration > 1) {
                                    const newTime = Math.min(duration - 1, position + 10);
                                    const wasPlaying = usePlayerStore.getState().isPlaying;
                                    await player.seekTo(newTime);
                                    if (wasPlaying) player.play();
                                }
                            }}
                            disabled={!activeIsPlaying}
                            hitSlop={6}
                        >
                            <Ionicons name="play-forward" size={20} color={activeIsPlaying ? '#FFF' : 'rgba(255,255,255,0.3)'} />
                        </BouncePressable>

                        <BouncePressable
                            style={styles.skipButton}
                            onPress={() => {
                              if (activeIsPlaying) nextInPlaylist();
                            }}
                            disabled={!activeIsPlaying}
                            hitSlop={6}
                        >
                            <Ionicons name="play-skip-forward" size={20} color={activeIsPlaying ? '#FFF' : 'rgba(255,255,255,0.3)'} />
                        </BouncePressable>
                     </View>
                 </View>
             )}
          </View>
  );

  return (
    <View style={styles.container}>
      {applyThemeToOtherPages ? (
        <Animated.View style={[StyleSheet.absoluteFill, animatedGradientStyle]} pointerEvents="none">
          <AuroraHeader palette="library" colors={activeThemeColors} imageUri={activeImageUri} isSolid={isSolidBg} />
        </Animated.View>
      ) : (
        /* Blurred cover behind the deck — expo-image cross-dissolves on source
           change, so no hard cut when the focused track changes. */
        <Animated.View
          style={[StyleSheet.absoluteFill, animatedGradientStyle, { backgroundColor: '#000', height: 500 }]}
          pointerEvents="none"
        >
          {headerImageUri ? (
            <Image
              source={{ uri: headerImageUri }}
              style={[StyleSheet.absoluteFill, { opacity: 0.62 }]}
              contentFit="cover"
              blurRadius={90}
              cachePolicy="memory-disk"
              transition={520}
            />
          ) : null}

          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.35)', '#000'] as const}
            style={StyleSheet.absoluteFill}
            locations={[0.15, 0.55, 1]}
          />
        </Animated.View>
      )}

      {/* Sticky Header — clear at top (home-style), black only after scroll */}
      <Animated.View style={[styles.stickyHeader, { height: 50 + insets.top, paddingTop: insets.top }, headerStyle]}>
          {!isSearchActive && (
              <Pressable
                  style={styles.iconButton}
                  hitSlop={12}
                  onPress={() => safeGoBack(navigation)}
              >
                <Ionicons name="chevron-back" size={28} color="#fff" />
              </Pressable>
          )}
          
          {/* Title always visible over artwork (like home brand name). */}
          {!isSearchActive && (
              <Animated.Text style={styles.stickyHeaderTitle} numberOfLines={2}>
                  {playlistName}
              </Animated.Text>
          )}
          
          <View style={{flex: 1}} />

          {isSearchActive ? (
              <Animated.View style={[styles.searchPill, { flex: 1, marginRight: 8 }]}>
                  <Ionicons name="search" size={20} color="#666" style={{marginLeft: 12}} />
                  <TextInput
                        style={styles.searchInput}
                        placeholder="Find in playlist"
                        placeholderTextColor="#666"
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                        autoFocus
                  />
                  <Pressable onPress={() => { setIsSearchActive(false); setSearchQuery(''); }} style={{padding: 8}}>
                      <Ionicons name="close-circle" size={20} color="#666" />
                  </Pressable>
              </Animated.View>
          ) : (
             <Pressable 
                style={[styles.iconButton, { marginRight: 8 }]} 
                hitSlop={12}
                onPress={() => setIsSearchActive(true)}
             >
                <Ionicons name="search" size={24} color="#fff" />
             </Pressable>
          )}
          
           <Pressable 
              style={[styles.iconButton, { marginRight: 8 }]} 
              hitSlop={12}
              onPress={() => (navigation as any).navigate('AddToPlaylist', { playlistId })}
           >
              <Ionicons name="add" size={28} color="#fff" />
           </Pressable>

          <Pressable 
             style={[styles.iconButton, isEditMode && styles.activeButton]} 
             hitSlop={12}
             onPress={() => setIsEditMode(!isEditMode)}
          >
            <Ionicons name="ellipsis-horizontal" size={24} color="#fff" />
          </Pressable>
      </Animated.View>

      {/* Main List */}
      {!isEditMode ? (
        <AnimatedFlashList
            ref={flatListRef}
            data={filteredSongs}
            estimatedItemSize={76} // Exact height of PlaylistItem
            activationDistance={20}
            containerStyle={{ flex: 1 }}
            itemContainerStyle={{ height: 76 }} // Enforce height on container
            keyExtractor={(item: { id: any; }) => item.id}
            renderItem={({ item, index }: { item: Song, index: number }) => renderItem({ item, getIndex: () => index, drag: undefined, isActive: false } as any)}
            onScroll={scrollHandler}
            scrollEventThrottle={1}
            contentContainerStyle={{ paddingBottom: listPaddingBottom, paddingTop: 50 + insets.top }}
            ListHeaderComponent={renderHeader()}
        />
      ) : (
      <AnimatedDraggableFlatList
        ref={flatListRef}
        data={filteredSongs}
        onDragEnd={handleDragEnd}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        onScroll={scrollHandler}
        scrollEventThrottle={1} // Use 1 for maximum update frequency
        contentContainerStyle={{ paddingBottom: listPaddingBottom, paddingTop: 50 + insets.top }} 
        ListHeaderComponent={renderHeader()}
      />
      )}

      
      {isEditMode && (
          <BlurView intensity={20} tint="dark" style={[styles.editModeToast, { top: 60 + insets.top }]}>
              <Text style={styles.editModeText}>Editing Playlist</Text>
          </BlurView>
      )}

      <CustomMenu
        visible={menuVisible}
        onClose={() => setMenuVisible(false)}
        options={menuOptions}
        title="Edit Cover Art"
        anchorPosition={menuPosition}
      />

      <CustomMenu
        visible={sortMenuVisible}
        onClose={() => setSortMenuVisible(false)}
        options={[
            { 
               label: 'Custom Order', 
               icon: sortOption === 'custom' ? 'checkmark' : undefined, 
               onPress: () => handleSortChange('custom') 
            },
            { 
               label: `Alphabetical ${sortOption === 'title' ? (sortDirection === 'asc' ? '(A-Z)' : '(Z-A)') : ''}`, 
               icon: sortOption === 'title' ? (sortDirection === 'asc' ? 'arrow-down' : 'arrow-up') : 'text',
               onPress: () => handleSortChange('title') 
            },
            { 
               label: `Recently Uploaded ${sortOption === 'date' ? (sortDirection === 'asc' ? '(Oldest)' : '(Newest)') : ''}`, 
               icon: sortOption === 'date' ? (sortDirection === 'asc' ? 'arrow-up' : 'arrow-down') : 'time', 
               onPress: () => handleSortChange('date') 
            },
            { 
               label: `Artist ${sortOption === 'artist' ? (sortDirection === 'asc' ? '(A-Z)' : '(Z-A)') : ''}`, 
               icon: sortOption === 'artist' ? (sortDirection === 'asc' ? 'arrow-down' : 'arrow-up') : 'person',
               onPress: () => handleSortChange('artist') 
            },
        ]}
        title="Sort Playlist"
        anchorPosition={sortMenuAnchor}
      />

      {/* Scroll To Top FAB */}
      <Animated.View 
        style={[
            styles.fab,
            // Clears the tab bar plus the classic mini player when it is showing —
            // a flat 80 put this button entirely behind the bar.
            { bottom: fabBottom },
            fabStyle
        ]}
        pointerEvents="box-none" 
      >
         <Pressable 
            style={styles.fabButton}
            onPress={() => {
                flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
            }}
         >
            <Ionicons name="arrow-up" size={24} color="#000" />
         </Pressable>
      </Animated.View>

      <ModernDeleteModal
        visible={showDeleteConfirm}
        title="Remove Song"
        message="Remove this song from the playlist?"
        confirmText="Remove"
        onConfirm={async () => {
            if (songToDelete) {
                await playlistQueries.removeSongFromPlaylist(playlistId, songToDelete);
                loadData();
                setShowDeleteConfirm(false);
                setToast({ visible: true, message: 'Song removed from playlist', type: 'success' });
            }
        }}
        onCancel={() => setShowDeleteConfirm(false)}
      />

      <Toast 
        visible={toast?.visible || false} 
        message={toast?.message || ''} 
        type={toast?.type || 'info'} 
        onDismiss={() => setToast(null)} 
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  center: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  stickyHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    zIndex: 100,
  },
  stickyHeaderTitle: {
      flex: 1,
      fontSize: 18,
      fontWeight: 'bold',
      color: '#fff',
      marginLeft: 16,
      textAlign: 'center',
      marginRight: 16,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    // Transparent like home brand actions — no black strip at rest.
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
  },
  activeButton: {
      backgroundColor: '#1DB954',
  },
  listHeader: {
    alignItems: 'center',
    marginBottom: 12,
    width: '100%',
    // No horizontal clip — stacked cover peeks must paint outside the centre.
    paddingHorizontal: 0,
    overflow: 'visible',
  },
  coverContainer: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 10,
    elevation: 8,
    marginBottom: 10,
    marginTop: 4,
  },
  inlinePlayerContainer: {
      marginBottom: 12,
      marginTop: 6,
      width: '100%',
      maxWidth: 340,
      alignSelf: 'center',
  },
  coverArt: {
    width: 188,
    height: 188,
    borderRadius: 14,
  },
  editOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
  },
  playingIndicator: {
      position: 'absolute',
      bottom: 8,
      right: 8,
      backgroundColor: '#1DB954',
      width: 32,
      height: 32,
      borderRadius: 16,
      justifyContent: 'center',
      alignItems: 'center'
  },
  playlistName: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 2,
    paddingHorizontal: 8,
  },
  focusedSongTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
    textAlign: 'center',
    marginTop: 2,
    marginBottom: 2,
    paddingHorizontal: 20,
  },
  focusedSongArtist: {
    fontSize: 13,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.65)',
    textAlign: 'center',
    marginBottom: 4,
    paddingHorizontal: 24,
  },
  playlistMeta: {
      color: 'rgba(255,255,255,0.6)',
      fontSize: 13,
      fontWeight: '500',
  },
  metaContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 2,
      marginBottom: 2,
      gap: 8,
  },
  sortButton: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: 'rgba(255,255,255,0.1)',
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 12,
      gap: 4,
  },
  sortButtonText: {
      fontSize: 12,
      color: 'rgba(255,255,255,0.8)',
      fontWeight: '500',
  },
  searchPill: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: 'rgba(255,255,255,0.9)',
      borderRadius: 20,
      height: 40,
  },
  searchContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: 'rgba(255,255,255,0.1)',
      marginHorizontal: 24,
      borderRadius: 8,
      paddingHorizontal: 12,
      height: 40,
      marginBottom: 20,
      width: SCREEN_WIDTH - 48,
  },
  searchIcon: {
      marginRight: 8
  },
  searchInput: {
      flex: 1,
      fontSize: 14,
      color: '#000' 
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
  },
  playButtonLarge: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 4,
  },
  secondaryButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  editModeToast: {
      position: 'absolute',
      alignSelf: 'center',
      paddingHorizontal: 20,
      paddingVertical: 8,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.2)',
      overflow: 'hidden',
  },
  editModeText: {
      color: '#fff',
      fontWeight: '600',
      fontSize: 12,
  },
  swipeHintContainer: {
      ...StyleSheet.absoluteFillObject,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 10,
  },
  scrubberContainer: {
      width: '100%',
      paddingHorizontal: 4,
      marginBottom: 6,
  },
  timerRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginTop: 2,
      width: '100%',
  },
  timerText: {
      fontSize: 11,
      color: '#FFFFFF',
      fontVariant: ['tabular-nums'],
  },
  // Compact transport — buttons sit as one control cluster, not across the screen.
  inlineControlsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 14,
      alignSelf: 'center',
      paddingHorizontal: 12,
      paddingVertical: 4,
      borderRadius: 28,
      backgroundColor: 'rgba(255,255,255,0.06)',
  },
  skipButton: {
      alignItems: 'center',
      justifyContent: 'center',
      width: 40,
      height: 40,
      borderRadius: 20,
  },
  skipText: {
      position: 'absolute',
      fontSize: 8,
      fontWeight: 'bold',
      color: '#FFF',
      marginTop: 2,
  },
  fab: {
      position: 'absolute',
      right: 20,
      zIndex: 999,
  },
  fabButton: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: '#fff',
      justifyContent: 'center',
      alignItems: 'center',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.3,
      shadowRadius: 4,
      elevation: 6,
  },
});

export default PlaylistDetailScreen;
