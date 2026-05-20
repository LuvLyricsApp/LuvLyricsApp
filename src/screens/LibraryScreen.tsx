import React, { useEffect, useCallback, useMemo, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  StyleSheet,
  View,
  Text,
  Pressable,
  RefreshControl,
  Image,
  Modal,
  ScrollView,
  Platform,
  Vibration,
  TextInput,
  LayoutAnimation,
  UIManager,
  Keyboard,
  InteractionManager,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { TabScreenProps } from '../types/navigation';
import { useSongsStore } from '../store/songsStore';
import { usePlayerStore } from '../store/playerStore';
import { useSettingsStore } from '../store/settingsStore';
import { useArtHistoryStore } from '../store/artHistoryStore';
import { useDailyStatsStore } from '../store/dailyStatsStore';
import { AuroraHeader } from '../components/AuroraHeader';
import { CustomMenu } from '../components/CustomMenu';
import { Toast } from '../components/Toast';
import { DownloadQueueModal } from '../components/DownloadQueueModal';
import { ModernDeleteModal } from '../components/ModernDeleteModal';
import { SongListItem } from '../components/SongListItem';
import { PerformanceHUD } from '../components/PerformanceHUD';
import { useDownloadQueueStore } from '../store/downloadQueueStore';
import { RecentlyPlayedGrid, RecentlyPlayedMode } from '../components/RecentlyPlayedGrid';
import { CoverArtSearchScreen } from './CoverArtSearchScreen';
import { SongVersionSearchModal } from '../components/SongVersionSearchModal';
import { Colors } from '../constants/colors';
import { getGradientColors } from '../constants/gradients';
import { Song } from '../types/song';
import * as ImagePicker from 'expo-image-picker';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { useLyricsScanQueueStore } from '../store/lyricsScanQueueStore';
import { FlashList, FlashListRef } from '@shopify/flash-list';
import Animated, { 
  useSharedValue, 
  useAnimatedScrollHandler, 
  runOnJS,
  useAnimatedStyle
} from 'react-native-reanimated';



// ============================================
// ADAPTIVE PERFORMANCE DETECTION
// ============================================

const AnimatedFlashList = Animated.createAnimatedComponent(FlashList) as any;

type SongItemLayout = {
  span?: number;
  size?: number;
};

const setSongItemLayout = (layout: SongItemLayout) => {
  layout.size = 80;
  layout.span = 1;
};

const DEVICE_REFRESH_RATE = Platform.select({
  ios: 120,
  android: 60,
  default: 60,
});

const IS_HIGH_REFRESH = DEVICE_REFRESH_RATE >= 90;

type Props = TabScreenProps<'Library'>;



const LibraryScreen: React.FC<Props> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const songs = useSongsStore(state => state.songs);
  const fetchSongs = useSongsStore(state => state.fetchSongs);
  const setCurrentSong = useSongsStore(state => state.setCurrentSong);
  const updateSong = useSongsStore(state => state.updateSong);
  const getSong = useSongsStore(state => state.getSong);
  const deleteSong = useSongsStore(state => state.deleteSong);
  const toggleLike = useSongsStore(state => state.toggleLike);
  const hideSong = useSongsStore(state => state.hideSong);
  
  // Sliced selectors — only re-render when specific fields change, not on every position tick
  const playerCurrentSong = usePlayerStore(state => state.currentSong);
  const playerCurrentSongId = usePlayerStore(state => state.currentSong?.id);
  const playerCurrentCover = usePlayerStore(state => state.currentSong?.coverImageUri);
  const playerCurrentGradient = usePlayerStore(state => state.currentSong?.gradientId);
  const { recentArts, addRecentArt } = useArtHistoryStore();
  const libraryBackgroundMode = useSettingsStore(state => state.libraryBackgroundMode);
  const playInMiniPlayerOnly = useSettingsStore(state => state.playInMiniPlayerOnly);
  const miniPlayerStyle = useSettingsStore(state => state.miniPlayerStyle);
  const isIsland = miniPlayerStyle === 'island';
  const setMiniPlayerHidden = usePlayerStore(state => state.setMiniPlayerHidden);
  
  useFocusEffect(useCallback(() => { setMiniPlayerHidden(false); }, [setMiniPlayerHidden]));
  
  const [showBottomSheet, setShowBottomSheet] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [libraryFocusMode, setLibraryFocusMode] = useState(false);
  const setLibraryFocusModeStore = useSettingsStore(state => state.setLibraryFocusMode);
  const [activeThemeColors, setActiveThemeColors] = useState<string[] | undefined>(undefined);
  const [activeImageUri, setActiveImageUri] = useState<string | null>(null);
  const [artMenuVisible, setArtMenuVisible] = useState(false);
  const [selectedSongForArt, setSelectedSongForArt] = useState<Song | null>(null);
  const [recentArtVisible, setRecentArtVisible] = useState(false);
  const [showCoverSearch, setShowCoverSearch] = useState(false);
  const [showVersionSearchModal, setShowVersionSearchModal] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [toast, setToast] = useState<{ visible: boolean; message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [showQueueModal, setShowQueueModal] = useState(false);
  const [showEditInfoModal, setShowEditInfoModal] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editArtist, setEditArtist] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [recentlyPlayedMode, setRecentlyPlayedMode] = useState<RecentlyPlayedMode>('recent');
  
  const scrollY = useSharedValue(0);
  const lastSentFocusMode = useSharedValue(false);
  const flatListRef = React.useRef<FlashListRef<Song>>(null);
  const [headerHeight, setHeaderHeight] = useState(0);
  const headerAnimatedStyle = useAnimatedStyle(() => {
     if (libraryBackgroundMode === 'black' || libraryBackgroundMode === 'grey') return { transform: [{ translateY: 0 }] };
     // Revert Parallax -> Background moves 1:1 with list (solid sheet feel)
     return { 
        transform: [{ translateY: -scrollY.value }] 
     };
  });

  const updateFocusMode = useCallback((shouldFocus: boolean) => {
    // Disable focus mode behavior (hiding header) for solid backgrounds
    if (libraryBackgroundMode === 'black' || libraryBackgroundMode === 'grey') {
        shouldFocus = false;
    }
    
    if (shouldFocus !== libraryFocusMode) {
      setLibraryFocusMode(shouldFocus);
      setLibraryFocusModeStore(shouldFocus);
    }
  }, [libraryFocusMode, setLibraryFocusModeStore, libraryBackgroundMode]);

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      'worklet';
      const y = event.contentOffset.y;
      scrollY.value = y;
      const isFocusZone = y > 150;
      if (isFocusZone !== lastSentFocusMode.value) {
        lastSentFocusMode.value = isFocusZone;
        runOnJS(updateFocusMode)(isFocusZone);
      }
    },
  });

  const handleSimpleScroll = useCallback((event: any) => {
    const y = event.nativeEvent.contentOffset.y;
    updateFocusMode(y > 150);
  }, [updateFocusMode]);



  // recentlyPlayed logic moved to RecentlyPlayedGrid.tsx for performance optimization
  
  const activeDownloadsCount = useDownloadQueueStore(state => state.queue.filter(i => i.status === 'downloading' || i.status === 'pending' || i.status === 'staging').length);
  const scanQueue = useLyricsScanQueueStore(state => state.queue);
  const addToScanQueue = useLyricsScanQueueStore(state => state.addToQueue);

  // getScanStatus callback removed - SongListItem subscribes internally

  const filteredSongs = useMemo(() => {
     if (!searchQuery.trim()) return songs;
     const query = searchQuery.toLowerCase().trim();
     return songs.filter(song =>
       song.title.toLowerCase().includes(query) ||
       song.artist?.toLowerCase().includes(query) ||
       song.album?.toLowerCase().includes(query)
     );
  }, [songs, searchQuery]);

  const handleAddToQueue = useCallback((song: Song) => {
      // Access state directly to avoid re-creating callback on every queue update
      const currentQueue = useLyricsScanQueueStore.getState().queue;
      const existing = currentQueue[song.id];
      const isPlainResult = existing?.status === 'completed' && existing?.resultType === 'plain';
      
      if (existing) {
         if (existing.status === 'failed' || isPlainResult) {
            addToScanQueue(song, isPlainResult);
            Vibration.vibrate(50);
            setToast({ visible: true, message: isPlainResult ? `Retrying for synced lyrics: "${song.title}"` : `Retrying: "${song.title}"`, type: 'info' });
         } else {
            setToast({ visible: true, message: `Already searching for "${song.title}"`, type: 'info' });
         }
      } else {
         addToScanQueue(song);
         Vibration.vibrate(50);
         setToast({ visible: true, message: `Searching lyrics for "${song.title}"...`, type: 'success' });
      }
  }, [addToScanQueue]); // Removed scanQueue dependency!

  const handleBrandPress = useCallback(() => {
    if (!playerCurrentSongId) {
      setToast({ visible: true, message: 'Play a song first to open artist mode', type: 'info' });
      return;
    }

    Vibration.vibrate(10);
    setRecentlyPlayedMode((currentMode) => currentMode === 'recent' ? 'artist' : 'recent');
  }, [playerCurrentSongId]);

  const handleSearchFocus = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setIsSearchFocused(true);
    // Scroll to hide the top part
    if (headerHeight > 0) {
        flatListRef.current?.scrollToOffset({ offset: headerHeight, animated: true });
    }
  };

  const handleSearchCancel = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setIsSearchFocused(false);
    setSearchQuery('');
    Keyboard.dismiss();
    // Scroll back to top
    flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
  };

  const handleSongPress = useCallback((song: Song) => {
    const playerState = usePlayerStore.getState();
    const currentId = playerState.currentSongId;
    const loadedId = playerState.loadedAudioId;
    
    // Check if same song (ID match) OR if the audio engine has it loaded
    const isCurrentlyPlaying = currentId === song.id || loadedId === song.id;
    
    // Use InteractionManager instead of setTimeout(75) for zero artificial delay
    InteractionManager.runAfterInteractions(() => {
        // Find index in current filtered list
        const index = filteredSongs.findIndex(s => s.id === song.id);
        
        if (playInMiniPlayerOnly) {
          if (isCurrentlyPlaying) {
              setMiniPlayerHidden(true);
              navigation.navigate('NowPlaying', { songId: song.id });
          } else {
              if (index !== -1) {
                  // Set queue and play
                  usePlayerStore.getState().setPlaylistQueue('library', filteredSongs, index);
                  setCurrentSong(song); 
              } else {
                  // Fallback: song not in current filter — find in full library so queue is always set
                  const fallbackIndex = songs.findIndex(s => s.id === song.id);
                  if (fallbackIndex !== -1) {
                      usePlayerStore.getState().setPlaylistQueue('library', songs, fallbackIndex);
                  } else {
                      setCurrentSong(song);
                      usePlayerStore.getState().setInitialSong(song);
                      usePlayerStore.getState().loadSong(song.id);
                  }
              }
          }
        } else {
          setMiniPlayerHidden(true);
          if (isCurrentlyPlaying) {
               navigation.navigate('NowPlaying', { songId: song.id });
          } else {
               if (index !== -1) {
                   // Set queue and play
                   usePlayerStore.getState().setPlaylistQueue('library', filteredSongs, index);
               } else {
                   // Fallback: song not in current filter — find in full library so queue is always set
                   const fallbackIdx = songs.findIndex(s => s.id === song.id);
                   if (fallbackIdx !== -1) {
                       usePlayerStore.getState().setPlaylistQueue('library', songs, fallbackIdx);
                   } else {
                       usePlayerStore.getState().setInitialSong(song);
                       usePlayerStore.getState().loadSong(song.id);
                   }
               }
               navigation.navigate('NowPlaying', { songId: song.id });
          }
        }
    });
  }, [navigation, setCurrentSong, playInMiniPlayerOnly, setMiniPlayerHidden, filteredSongs]);

  const handleSongLongPress = useCallback((song: Song) => {
    setSelectedSongForArt(song);
    setShowBottomSheet(true);
  }, []);

  const handleAddPress = () => navigation.navigate('AddEditLyrics', {});

  // Memoized header — prevents recreation on every parent render
  const memoizedHeader = useMemo(() => (
    <View>
      {filteredSongs.length > 0 ? (
        <>
          <View onLayout={(e) => setHeaderHeight(e.nativeEvent.layout.height)}>
            <RecentlyPlayedGrid 
              onSongPress={handleSongPress}
              onSongLongPress={handleSongLongPress}
              onLikePress={toggleLike}
              onMagicPress={handleAddToQueue}
              mode={recentlyPlayedMode}
              currentSong={playerCurrentSong}
              style={styles.recentlyPlayedGrid}
            />
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>All Songs</Text>
                <View style={styles.headerActions}>
                  <Pressable style={styles.actionButton} onPress={() => setShowQueueModal(true)}>
                    <Ionicons name="list" size={22} color={Colors.textSecondary} />
                    {activeDownloadsCount > 0 && <View style={styles.badge}><Text style={styles.badgeText}>{activeDownloadsCount}</Text></View>}
                  </Pressable>
                  <Pressable style={styles.actionButton} onPress={() => (navigation as any).navigate('AudioDownloader')}>
                    <Ionicons name="cloud-download-outline" size={22} color={Colors.textSecondary} />
                  </Pressable>
                  <Pressable style={styles.actionButton} onPress={handleAddPress}>
                    <Ionicons name="add" size={24} color={Colors.textSecondary} />
                  </Pressable>
                </View>
              </View>
            </View>
          <View style={styles.searchRow}>
              <View style={[styles.searchBarContainer, styles.searchBarFlex, isSearchFocused ? styles.searchBarFocused : styles.searchBarDefault]}>
                 <Ionicons name="search" size={20} color="#FFF" style={styles.searchIcon} />
                 <TextInput
                    style={styles.searchInput} placeholder="Filter local library..." placeholderTextColor="#FFF"
                    value={searchQuery} onFocus={handleSearchFocus} returnKeyType="search"
                    onChangeText={(text) => {
                        setSearchQuery(text);
                        if (!isSearchFocused && text.length > 0) {
                          LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                          setIsSearchFocused(true);
                        }
                    }}
                 />
                 {searchQuery ? (<Pressable onPress={() => setSearchQuery('')} style={styles.clearButton}><Ionicons name="close-circle" size={18} color="#666" /></Pressable>) : null}
              </View>
              {isSearchFocused && (<Pressable onPress={handleSearchCancel} style={styles.cancelButton}><Text style={styles.cancelText}>Cancel</Text></Pressable>)}
          </View>
        </>
      ) : null}
    </View>
  ), [filteredSongs.length, handleSongPress, handleSongLongPress, toggleLike, handleAddToQueue, activeDownloadsCount, navigation, handleAddPress, isSearchFocused, searchQuery, handleSearchFocus, handleSearchCancel, playerCurrentSong, recentlyPlayedMode]);

  useEffect(() => {
    // LayoutAnimation setup removed to avoid 'no-op' warning in New Architecture.
    // LayoutAnimation.configureNext still works within specific handlers.
  }, []);

  useEffect(() => {
    const updateTheme = async () => {
      let colors: string[] | undefined;
      let image: string | null = null;
      if (libraryBackgroundMode === 'current') {
         if (playerCurrentSongId) {
             image = playerCurrentCover || null;
             if (!image && playerCurrentGradient) {
                colors = playerCurrentGradient === 'dynamic' ? ['#f7971e', '#ffd200', '#ff6b35'] : getGradientColors(playerCurrentGradient);
             }
         }
      } else if (libraryBackgroundMode === 'daily') {
         const topId = useDailyStatsStore.getState().getTopSongOfYesterday() || useDailyStatsStore.getState().getTopSongOfToday();
         if (topId) {
            const song = songs.find(s => s.id === topId) || await getSong(topId);
            if (song) {
                 image = song.coverImageUri || null;
                 if (!image && song.gradientId) {
                    colors = song.gradientId === 'dynamic' ? ['#f7971e', '#ffd200', '#ff6b35'] : getGradientColors(song.gradientId);
                 }
            }
         }
      } else if (libraryBackgroundMode === 'black') {
          // Pure Black: Use black colors which AuroraHeader will render on black bg
          colors = ['#000000', '#000000', '#000000'];
          image = null;
      } else if (libraryBackgroundMode === 'grey') {
          // Spotify-ish Grey: Subtle dark grey gradient
          colors = ['#121212', '#282828', '#121212'];
          image = null;
      }
      setActiveThemeColors(colors); setActiveImageUri(image);
    };
    updateTheme();
  }, [libraryBackgroundMode, playerCurrentSongId, playerCurrentCover, playerCurrentGradient, songs.length, getSong]);
  
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', fetchSongs);
    return unsubscribe;
  }, [navigation, fetchSongs]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true); await fetchSongs(); setRefreshing(false);
  }, [fetchSongs]);
  
  const handleDeleteSong = async () => {
    if (!selectedSongForArt) return;
    try {
        await deleteSong(selectedSongForArt.id);
        setShowDeleteConfirm(false); setShowBottomSheet(false);
        setToast({ visible: true, message: 'Song deleted', type: 'success' });
    } catch {
        setToast({ visible: true, message: 'Failed to delete song', type: 'error' });
    }
  };

  const pickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, aspect: [1, 1], quality: 0.8 });
      if (!result.canceled && result.assets[0].uri && selectedSongForArt) {
        const uri = result.assets[0].uri;
        await updateSong({ ...selectedSongForArt, coverImageUri: uri, dateModified: new Date().toISOString() });
        addRecentArt(uri); setShowBottomSheet(false); fetchSongs();
      }
    } catch {
      setToast({ visible: true, message: 'Failed to save cover', type: 'error' });
    }
  };

  const selectRecentArt = async (uri: string) => {
    if (selectedSongForArt) {
      try {
        await updateSong({ ...selectedSongForArt, coverImageUri: uri, dateModified: new Date().toISOString() });
        addRecentArt(uri);
        setShowBottomSheet(false); fetchSongs();
      } catch {
        setToast({ visible: true, message: 'Failed to save cover', type: 'error' });
      }
    }
  };

  const handleSaveInfo = async () => {
      if (selectedSongForArt && editTitle.trim()) {
          try {
              await updateSong({ ...selectedSongForArt, title: editTitle.trim(), artist: editArtist.trim(), dateModified: new Date().toISOString() });
              await fetchSongs(); setToast({ visible: true, message: 'Song info updated', type: 'success' }); setShowEditInfoModal(false);
          } catch {
              setToast({ visible: true, message: 'Failed to update song', type: 'error' });
          }
      }
  };

  const handleShareSong = async () => {
    if (!selectedSongForArt) return;
    
    // Check if audio file exists
    if (!selectedSongForArt.audioUri) {
        setToast({ visible: true, message: 'No audio file found to share', type: 'error' });
        return;
    }

    try {
        const isAvailable = await Sharing.isAvailableAsync();
        if (!isAvailable) {
            setToast({ visible: true, message: 'Sharing is not available on this device', type: 'error' });
            return;
        }

        setShowBottomSheet(false);

        let uriToShare = selectedSongForArt.audioUri;

        // Fix for SAF content:// URIs (Android)
        if (uriToShare.startsWith('content://')) {
            const extension = uriToShare.includes('m4a') ? 'm4a' : 'mp3';
            const tempFile = `${FileSystem.cacheDirectory}share_temp_${Date.now()}.${extension}`;
            try {
                await FileSystem.copyAsync({
                    from: uriToShare,
                    to: tempFile
                });
                uriToShare = tempFile;
            } catch (copyError) {
                console.error('Failed to copy content URI for sharing:', copyError);
                // Continue with original URI as fallback
            }
        }

        await Sharing.shareAsync(uriToShare, {
            dialogTitle: `Share "${selectedSongForArt.title}"`,
            mimeType: 'audio/mpeg', // Best guess for MP3/M4A compatibility
            UTI: 'public.audio' // iOS compatibility
        });
    } catch (error) {
        console.error('Share error:', error);
        setToast({ visible: true, message: 'Failed to share song', type: 'error' });
    }
  };

  const artOptions = [
    { label: 'Choose from Gallery', icon: 'image-outline' as const, onPress: pickImage },
    { label: 'Search Web (Cover)', icon: 'globe-outline' as const, onPress: () => { setArtMenuVisible(false); setShowCoverSearch(true); } },
    { label: 'Change Language / Version', icon: 'language-outline' as const, onPress: () => { setArtMenuVisible(false); setShowVersionSearchModal(true); } },
    ...(recentArts.length > 0 ? [{ label: 'Recent Art', icon: 'time-outline' as const, onPress: () => { setArtMenuVisible(false); setTimeout(() => setRecentArtVisible(true), 100); } }] : []),
    { label: 'Delete Song', icon: 'trash-outline' as const, onPress: () => { setArtMenuVisible(false); if (selectedSongForArt) setShowDeleteConfirm(true); } },
  ];

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <Ionicons name="musical-notes-outline" size={80} color={Colors.textSecondary} />
      <Text style={styles.emptyTitle}>No songs yet</Text>
      <Text style={styles.emptySubtitle}>Add your first song with timestamped lyrics</Text>
      <View style={styles.emptyActionsRow}>
        <Pressable style={styles.addButton} onPress={handleAddPress}>
          <Ionicons name="add" size={20} color="#F4F4F5" />
          <Text style={styles.addButtonText}>Add Lyrics</Text>
        </Pressable>
        <Pressable style={styles.downloadButton} onPress={() => (navigation as any).navigate('AudioDownloader')}>
          <Ionicons name="cloud-download-outline" size={20} color="#EAEAF0" />
          <Text style={styles.downloadButtonText}>Download Music</Text>
        </Pressable>
      </View>
    </View>
  );

  const renderItem = useCallback(({ item }: { item: Song }) => {
    return (
      <SongListItem 
        song={item} 
        onPress={handleSongPress} 
        onLongPress={handleSongLongPress} 
        addToScanQueue={handleAddToQueue} 
      />
    );
  }, [handleSongPress, handleSongLongPress, handleAddToQueue]);

  return (
    <View style={styles.container}>
      <View style={[StyleSheet.absoluteFill, { backgroundColor: '#000' }]} />
      <Animated.View style={[StyleSheet.absoluteFill, headerAnimatedStyle]}>
        <AuroraHeader palette="library" colors={activeThemeColors} imageUri={activeImageUri} />
      </Animated.View>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        {!isSearchFocused && (
          <View style={styles.brandHeader}>
            <Pressable onPress={handleBrandPress} hitSlop={12} style={styles.brandPressable}>
              <Text style={styles.brandName} numberOfLines={1}>
                LuvLyrics
              </Text>
            </Pressable>
          </View>
        )}

          <AnimatedFlashList
            ref={flatListRef}
            data={filteredSongs}
            keyExtractor={(item: any) => item.id}
            renderItem={renderItem}
            estimatedItemSize={80}  
            drawDistance={1200}     // Reduced to prevent "slow update" warnings
            overrideItemLayout={(layout) => {
              setSongItemLayout(layout);
            }}
            getItemType={(item) => 'song'} 
            contentContainerStyle={{ 
                paddingBottom: 150 + insets.bottom,
                paddingTop: 10, // Fixed: Reduced from 180 to 20 (plus header height naturally handles rest)
            }}
            extraData={[isSearchFocused]}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={Colors.primary} colors={[Colors.primary]} />
            }
            onScroll={scrollHandler} 
            scrollEventThrottle={16}
            ListEmptyComponent={renderEmpty}
            ListHeaderComponent={memoizedHeader} 
            keyboardShouldPersistTaps="handled" 
            keyboardDismissMode="on-drag"
          />
      </SafeAreaView>
      <CustomMenu visible={artMenuVisible} onClose={() => setArtMenuVisible(false)} title="Cover Art Options" options={artOptions} />
      <Modal visible={recentArtVisible} transparent animationType="slide" onRequestClose={() => setRecentArtVisible(false)}>
        <Pressable style={styles.recentArtOverlay} onPress={() => setRecentArtVisible(false)}>
          <View style={styles.recentArtContainer}><Text style={styles.recentArtTitle}>Recent Art</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.recentArtScroll}>
              {recentArts.map((uri, index) => (
                <Pressable key={index} style={styles.recentArtItem} onPress={() => { selectRecentArt(uri); setRecentArtVisible(false); }}>
                  <Image source={{ uri }} style={styles.recentArtImage} />
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
      <ModernDeleteModal
        visible={showDeleteConfirm} title="Delete Song" message={`Delete "${selectedSongForArt?.title}"? This cannot be undone.`}
        onConfirm={handleDeleteSong} onCancel={() => setShowDeleteConfirm(false)}
      />
      <Modal visible={showBottomSheet} transparent animationType="slide" onRequestClose={() => setShowBottomSheet(false)}>
        <Pressable style={styles.bottomSheetOverlay} onPress={() => setShowBottomSheet(false)}>
          <Pressable style={styles.bottomSheetContainer} onPress={(e) => e.stopPropagation()}>
            <View style={styles.bottomSheetHandle} /><Text style={styles.bottomSheetTitle}>{selectedSongForArt?.title}</Text><Text style={styles.bottomSheetSubtitle}>{selectedSongForArt?.artist}</Text>
            <Pressable style={styles.bottomSheetOption} onPress={handleShareSong}>
              <Ionicons name="share-social-outline" size={24} color={Colors.primary} />
              <Text style={styles.bottomSheetOptionText}>Share Audio</Text>
            </Pressable>
            <Pressable style={styles.bottomSheetOption} onPress={() => { setShowBottomSheet(false); setTimeout(() => setShowVersionSearchModal(true), 300); }}>
              <Ionicons name="language-outline" size={24} color={Colors.primary} />
              <Text style={styles.bottomSheetOptionText}>Change Language / Version</Text>
            </Pressable>
            <Pressable style={styles.bottomSheetOption} onPress={pickImage}><Ionicons name="image-outline" size={24} color={Colors.primary} /><Text style={styles.bottomSheetOptionText}>Choose from Gallery</Text></Pressable>
            <Pressable style={styles.bottomSheetOption} onPress={() => { setShowBottomSheet(false); setShowCoverSearch(true); }}><Ionicons name="globe-outline" size={24} color={Colors.primary} /><Text style={styles.bottomSheetOptionText}>Search Web</Text></Pressable>
            {recentArts.length > 0 && (
              <View style={{ marginTop: 16 }}><Text style={[styles.bottomSheetSubtitle, { textAlign: 'left', marginBottom: 12 }]}>Recent Cover Art</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
                  {recentArts.map((uri, index) => (
                    <Pressable key={index} onPress={() => selectRecentArt(uri)} style={{ marginRight: 12 }}><Image source={{ uri }} style={{ width: 80, height: 80, borderRadius: 8, backgroundColor: '#333' }} /></Pressable>
                  ))}
                </ScrollView>
              </View>
            )}
            <Pressable style={styles.bottomSheetOption} onPress={async () => {
                setShowBottomSheet(false); if (selectedSongForArt) {
                  await updateSong({ ...selectedSongForArt, coverImageUri: undefined, dateModified: new Date().toISOString() });
                  await fetchSongs(); setToast({ visible: true, message: 'Cover art removed', type: 'success' });
                }
              }}><Ionicons name="trash-outline" size={24} color="#FF4444" /><Text style={[styles.bottomSheetOptionText, { color: '#FF4444' }]}>Remove Cover Art</Text></Pressable>
            <Pressable style={styles.bottomSheetOption} onPress={async () => {
                setShowBottomSheet(false); if (selectedSongForArt) {
                  await hideSong(selectedSongForArt.id, true); setToast({ visible: true, message: 'Song hidden from library', type: 'success' });
                }
              }}><Ionicons name="eye-off-outline" size={24} color="#FFA500" /><Text style={[styles.bottomSheetOptionText, { color: '#FFA500' }]}>Hide Song</Text></Pressable>
            <Pressable style={styles.bottomSheetOption} onPress={() => { setShowBottomSheet(false); setEditTitle(selectedSongForArt?.title || ''); setEditArtist(selectedSongForArt?.artist || ''); setTimeout(() => setShowEditInfoModal(true), 300); }}><Ionicons name="create-outline" size={24} color={Colors.primary} /><Text style={styles.bottomSheetOptionText}>Edit Song Info</Text></Pressable>
            <Pressable style={[styles.bottomSheetOption, styles.bottomSheetCancel, { borderBottomWidth: 0, marginTop: 12, backgroundColor: '#2A2A2A' }]} onPress={() => { setShowBottomSheet(false); setTimeout(() => setShowDeleteConfirm(true), 300); }}><Ionicons name="trash" size={20} color="#FF4444" style={{ marginRight: 8 }} /><Text style={{ fontSize: 16, fontWeight: '700', color: '#FF4444', marginLeft: 0 }}>Delete Song</Text></Pressable>
          </Pressable>
        </Pressable>
      </Modal>
      <SongVersionSearchModal 
        visible={showVersionSearchModal} 
        targetSong={selectedSongForArt} 
        onClose={() => setShowVersionSearchModal(false)}
        onSuccess={() => {
            fetchSongs();
            setToast({ visible: true, message: 'Song updated successfully!', type: 'success' });
        }}
      />
      <CoverArtSearchScreen visible={showCoverSearch} initialQuery={selectedSongForArt ? `${selectedSongForArt.title} ${selectedSongForArt.artist}` : ''} onClose={() => setShowCoverSearch(false)} onSelect={async (uri) => { setShowCoverSearch(false); if (selectedSongForArt) { try { await updateSong({ ...selectedSongForArt, coverImageUri: uri, dateModified: new Date().toISOString() }); addRecentArt(uri); await fetchSongs(); setToast({ visible: true, message: 'Cover art updated!', type: 'success' }); setSelectedSongForArt(null); } catch { setToast({ visible: true, message: 'Failed to save cover', type: 'error' }); } } }} />
      {toast && (<Toast visible={toast.visible} message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />)}
      <DownloadQueueModal visible={showQueueModal} onClose={() => setShowQueueModal(false)} />
      <Modal visible={showEditInfoModal} transparent animationType="fade" onRequestClose={() => setShowEditInfoModal(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
          <View style={{ backgroundColor: '#1E1E1E', borderRadius: 20, padding: 24, width: '100%', maxWidth: 340 }}><Text style={{ fontSize: 20, fontWeight: 'bold', color: '#fff', marginBottom: 20, textAlign: 'center' }}>Edit Song Info</Text>
            <Text style={{ color: '#aaa', marginBottom: 8, fontSize: 12, textTransform: 'uppercase' }}>Title</Text>
            <TextInput value={editTitle} onChangeText={setEditTitle} style={{ backgroundColor: '#333', color: '#fff', borderRadius: 12, padding: 12, marginBottom: 16, fontSize: 16 }} placeholder="Song Title" placeholderTextColor="#666" />
            <Text style={{ color: '#aaa', marginBottom: 8, fontSize: 12, textTransform: 'uppercase' }}>Artist</Text>
            <TextInput value={editArtist} onChangeText={setEditArtist} style={{ backgroundColor: '#333', color: '#fff', borderRadius: 12, padding: 12, marginBottom: 24, fontSize: 16 }} placeholder="Artist Name" placeholderTextColor="#666" />
            <View style={{ flexDirection: 'row', gap: 12 }}><Pressable style={{ flex: 1, padding: 14, borderRadius: 12, backgroundColor: '#333', alignItems: 'center' }} onPress={() => setShowEditInfoModal(false)}><Text style={{ color: '#fff', fontWeight: '600', fontSize: 16 }}>Cancel</Text></Pressable><Pressable style={{ flex: 1, padding: 14, borderRadius: 12, backgroundColor: Colors.primary, alignItems: 'center' }} onPress={handleSaveInfo}><Text style={{ color: '#000', fontWeight: 'bold', fontSize: 16 }}>Save</Text></Pressable></View>
          </View>
        </View>
      </Modal>
      <PerformanceHUD />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8, zIndex: 10 },
  brandHeader: { paddingHorizontal: 20, paddingTop: Platform.OS === 'ios' ? 8 : 4, paddingBottom: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brandPressable: { alignSelf: 'flex-start', flexShrink: 0, maxWidth: '100%' },
  brandName: { fontSize: 34, fontWeight: '900', color: '#fff', letterSpacing: -1.5, textShadowColor: 'rgba(0,0,0,0.3)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 4, paddingRight: 10, marginLeft: 6, marginTop: 5, flexShrink: 0 },
  headerLeft: { flex: 1 },
  headerRight: { flexDirection: 'row', gap: 20 },
  headerButton: { padding: 4, position: 'relative' },
  badge: { position: 'absolute', top: -4, right: -4, backgroundColor: '#007AFF', borderRadius: 8, minWidth: 16, height: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4, borderWidth: 1, borderColor: '#000' },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  listContent: { paddingHorizontal: 16, paddingBottom: 100, flexGrow: 1 },
  topGrid: { flexDirection: 'row', gap: 16, marginBottom: 32 },
  horizontalScroll: { paddingRight: 16, gap: 12 },
  horizontalCard: { width: 160 },
  row: { gap: 16, marginBottom: 24 },
  cardWrapper: { flex: 1 },
  cardLeft: { marginRight: 0 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, marginTop: 8, paddingHorizontal: 20 },
  recentlyPlayedGrid: { marginBottom: 8 },
  searchRow: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 20, marginBottom: 20 },
  searchBarFlex: { flex: 1, marginHorizontal: 0, marginBottom: 0 },
  searchBarFocused: { backgroundColor: 'rgba(255,255,255,0.15)' },
  searchBarDefault: { backgroundColor: 'rgba(255,255,255,0.1)' },
  searchIcon: { marginLeft: 12 },
  clearButton: { padding: 8 },
  cancelButton: { marginLeft: 12 },
  cancelText: { color: Colors.primary, fontSize: 16, fontWeight: '600' },
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
  listPaddingIsland: { paddingTop: 20, paddingHorizontal: 16 },
  listPaddingDefault: { paddingTop: 25, paddingHorizontal: 16 },
  footerSearching: { height: 500 },
  footerDefault: { height: 100 },
  searchBarContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 12, height: 48, marginBottom: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  searchInput: { flex: 1, color: '#fff', fontSize: 16, height: '100%', paddingHorizontal: 12 },
  sectionTitle: { fontSize: 24, fontWeight: '700', color: Colors.textPrimary, letterSpacing: -0.5 },
  moreButton: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 },
  moreButtonText: { fontSize: 12, fontWeight: '500', color: 'rgba(255,255,255,0.6)' },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 100, gap: 12 },
  emptyTitle: { fontSize: 22, fontWeight: '700', color: Colors.textPrimary, marginTop: 12 },
  emptySubtitle: { fontSize: 14, color: Colors.textSecondary, textAlign: 'center', maxWidth: 250 },
  emptyActionsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, marginTop: 20, flexWrap: 'wrap' },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 24,
    minHeight: 46,
    minWidth: 150,
  },
  addButtonText: { fontSize: 14, fontWeight: '600', color: '#F4F4F5' },
  downloadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 24,
    minHeight: 46,
    minWidth: 150,
  },
  downloadButtonText: { fontSize: 14, fontWeight: '600', color: '#EAEAF0' },
  fab: { position: 'absolute', bottom: 180, right: 24, width: 56, height: 56, borderRadius: 28, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', elevation: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8 },
  listItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 12, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 12, marginBottom: 8, gap: 12 },
  listItemThumbnail: { width: 50, height: 50, borderRadius: 6, overflow: 'hidden', backgroundColor: '#2C2C2E' },
  defaultListThumbnail: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center', backgroundColor: '#2C2C2E' },
  listItemImage: { width: '100%', height: '100%' },
  listItemContent: { flex: 1 },
  listItemTitle: { fontSize: 16, fontWeight: '600', color: Colors.textPrimary, marginBottom: 2 },
  listItemArtist: { fontSize: 14, color: Colors.textSecondary },
  listItemDuration: { fontSize: 14, color: Colors.textSecondary, marginRight: 8 },
  recentArtOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  recentArtContainer: { backgroundColor: '#1C1C1E', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingVertical: 20, paddingBottom: 40 },
  recentArtTitle: { fontSize: 18, fontWeight: '700', color: Colors.textPrimary, paddingHorizontal: 20, marginBottom: 16 },
  recentArtScroll: { paddingHorizontal: 20 },
  recentArtItem: { width: 120, height: 120, borderRadius: 12, overflow: 'hidden', marginRight: 12 },
  recentArtImage: { width: '100%', height: '100%' },
  headerActions: { flexDirection: 'row', gap: 16, paddingRight: 16 },
  actionButton: { padding: 4 },
  swipeAction: { justifyContent: 'center', alignItems: 'center', width: 60, height: '100%', borderRadius: 12, marginLeft: 8 },
  scanningOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', borderRadius: 4 },
  bottomSheetOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  bottomSheetContainer: { backgroundColor: '#1E1E1E', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 40 },
  bottomSheetHandle: { width: 40, height: 4, backgroundColor: '#333', borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
  bottomSheetTitle: { fontSize: 18, fontWeight: 'bold', color: '#fff', marginBottom: 4, textAlign: 'center' },
  bottomSheetSubtitle: { fontSize: 14, color: '#aaa', marginBottom: 24, textAlign: 'center' },
  bottomSheetOption: { flexDirection: 'row', alignItems: 'center', paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#333' },
  bottomSheetOptionText: { fontSize: 16, color: '#fff', marginLeft: 12 },
  bottomSheetCancel: { borderBottomWidth: 0, marginTop: 10, justifyContent: 'center', backgroundColor: '#333', borderRadius: 12 },
  bottomSheetCancelText: { fontSize: 16, fontWeight: '600', color: '#fff' },
});

export default LibraryScreen;
