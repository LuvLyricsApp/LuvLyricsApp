import React, { useEffect, useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  StyleSheet,
  View,
  Text,
  Pressable,
  RefreshControl,
  Modal,
  ScrollView,
  Platform,
  Vibration,
  InteractionManager,
  Image,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { TabScreenProps } from '../types/navigation';
import { useSongsStore } from '../store/songsStore';
import { usePlayerStore } from '../store/playerStore';
import { useSettingsStore } from '../store/settingsStore';
import { useArtHistoryStore } from '../store/artHistoryStore';
import { useDailyStatsStore } from '../store/dailyStatsStore';
import { AuroraHeader } from '../components/AuroraHeader';
import { Toast } from '../components/Toast';
import { DownloadQueueModal } from '../components/DownloadQueueModal';
import { ModernDeleteModal } from '../components/ModernDeleteModal';
import { SongListItem } from '../components/SongListItem';
import { PerformanceHUD } from '../components/PerformanceHUD';
import { useDownloadQueueStore } from '../store/downloadQueueStore';
import { RecentlyPlayedMode } from '../components/RecentlyPlayedGrid';
import { CoverArtSearchScreen } from './CoverArtSearchScreen';
import { SongVersionSearchModal } from '../components/SongVersionSearchModal';
import { useThemeColors, useIsDark } from '../contexts/ThemeContext';
import { getGradientColors } from '../constants/gradients';
import { Song } from '../types/song';
import { songCanUpgradeToSyncedLyrics } from '../utils/lyricsState';
import * as ImagePicker from 'expo-image-picker';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { useLyricsScanQueueStore } from '../store/lyricsScanQueueStore';
import { useSortedSongs } from '../hooks/useSortedSongs';
import { usePlaybackQueue } from '../hooks/usePlaybackQueue';
import { FlashList, FlashListRef } from '@shopify/flash-list';
import Animated, { useSharedValue, useAnimatedScrollHandler, runOnJS, useAnimatedStyle } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import LibraryHeader from '../components/LibraryHeader';
import LibraryEmptyState from '../components/LibraryEmptyState';
import LibraryBottomSheet from '../components/LibraryBottomSheet';
import LibraryEditModal from '../components/LibraryEditModal';

const AnimatedFlashList = Animated.createAnimatedComponent(FlashList) as any;

type SongItemLayout = { span?: number; size?: number };

const setSongItemLayout = (layout: SongItemLayout) => {
  layout.size = 80;
  layout.span = 1;
};

type Props = TabScreenProps<'Library'>;

const LibraryScreen: React.FC<Props> = ({ navigation }) => {
  const colors = useThemeColors();
  const isDark = useIsDark();
  const insets = useSafeAreaInsets();
  const songs = useSongsStore(state => state.songs);
  const fetchSongs = useSongsStore(state => state.fetchSongs);
  const updateSong = useSongsStore(state => state.updateSong);
  const getSong = useSongsStore(state => state.getSong);
  const deleteSong = useSongsStore(state => state.deleteSong);
  const toggleLike = useSongsStore(state => state.toggleLike);
  const hideSong = useSongsStore(state => state.hideSong);

  const playerCurrentSong = usePlayerStore(state => state.currentSong);
  const playerCurrentSongId = usePlayerStore(state => state.currentSong?.id);
  const playerCurrentCover = usePlayerStore(state => state.currentSong?.coverImageUri);
  const playerCurrentGradient = usePlayerStore(state => state.currentSong?.gradientId);
  const { recentArts, addRecentArt } = useArtHistoryStore();
  const libraryBackgroundMode = useSettingsStore(state => state.libraryBackgroundMode);
  const playInMiniPlayerOnly = useSettingsStore(state => state.playInMiniPlayerOnly);
  const setMiniPlayerHidden = usePlayerStore(state => state.setMiniPlayerHidden);

  useFocusEffect(useCallback(() => { setMiniPlayerHidden(false); }, [setMiniPlayerHidden]));

  const [showBottomSheet, setShowBottomSheet] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [libraryFocusMode, setLibraryFocusMode] = useState(false);
  const setLibraryFocusModeStore = useSettingsStore(state => state.setLibraryFocusMode);
  const [activeThemeColors, setActiveThemeColors] = useState<string[] | undefined>(undefined);
  const [activeImageUri, setActiveImageUri] = useState<string | null>(null);
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
  const [selectedSongForArt, setSelectedSongForArt] = useState<Song | null>(null);

  const scrollY = useSharedValue(0);
  const lastSentFocusMode = useSharedValue(false);
  const flatListRef = React.useRef<FlashListRef<Song>>(null);
  const [headerHeight, setHeaderHeight] = useState(0);

  const isSolidBg = libraryBackgroundMode === 'purest-black'
    || libraryBackgroundMode === 'grey'
    || libraryBackgroundMode === 'theme-subtle'
    || libraryBackgroundMode === 'black'
    || libraryBackgroundMode === 'theme-blue';

  const headerAnimatedStyle = useAnimatedStyle(() => {
    if (isSolidBg) return { transform: [{ translateY: 0 }] };
    // Parallax — background scrolls 1:1 with list
    return { transform: [{ translateY: -scrollY.value }] };
  });

  const updateFocusMode = useCallback((shouldFocus: boolean) => {
    // Solid static backgrounds don't use focus-mode header hiding
    if (isSolidBg) shouldFocus = false;
    if (shouldFocus !== libraryFocusMode) {
      setLibraryFocusMode(shouldFocus);
      setLibraryFocusModeStore(shouldFocus);
    }
  }, [libraryFocusMode, setLibraryFocusModeStore, isSolidBg]);

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

  const activeDownloadsCount = useDownloadQueueStore(state => state.queue.filter(i => i.status === 'downloading' || i.status === 'pending' || i.status === 'staging').length);
  const addToScanQueue = useLyricsScanQueueStore(state => state.addToQueue);

  const filteredSongs = useSortedSongs(songs, searchQuery, 'recent', 'desc');

  const handleAddToQueue = useCallback((song: Song) => {
    const currentQueue = useLyricsScanQueueStore.getState().queue;
    const existing = currentQueue[song.id];
    const isPlainResult =
      (existing?.status === 'completed' && existing?.resultType === 'plain') ||
      (!existing && songCanUpgradeToSyncedLyrics(song));

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
  }, [addToScanQueue]);

  const handleBrandPress = useCallback(() => {
    if (!playerCurrentSongId) {
      setToast({ visible: true, message: 'Play a song first to open artist mode', type: 'info' });
      return;
    }
    Vibration.vibrate(10);
    setRecentlyPlayedMode((currentMode) => currentMode === 'recent' ? 'artist' : 'recent');
  }, [playerCurrentSongId]);

  const handleSearchFocus = useCallback(() => {
    if (headerHeight > 0) {
      flatListRef.current?.scrollToOffset({ offset: headerHeight, animated: true });
    }
  }, [headerHeight]);

  const handleSearchCancel = useCallback(() => {
    setIsSearchFocused(false);
    setSearchQuery('');
    flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
  }, []);

  const playSong = usePlaybackQueue({
    playInMiniPlayerOnly,
    setMiniPlayerHidden,
    navigation,
  });

  const handleSongPress = useCallback((song: Song) => {
    InteractionManager.runAfterInteractions(() => {
      playSong(song, filteredSongs, songs);
    });
  }, [playSong, filteredSongs, songs]);

  const handleSongLongPress = useCallback((song: Song) => {
    setSelectedSongForArt(song);
    setShowBottomSheet(true);
  }, []);

  const handleAddPress = useCallback(() => navigation.navigate('AddEditLyrics', {}), [navigation]);

  useEffect(() => {
    const updateTheme = async () => {
      let themeColors: string[] | undefined;
      let image: string | null = null;
      if (libraryBackgroundMode === 'current') {
        if (playerCurrentSongId) {
          image = playerCurrentCover || null;
          if (!image && playerCurrentGradient) {
            themeColors = playerCurrentGradient === 'dynamic' ? ['#f7971e', '#ffd200', '#ff6b35'] : getGradientColors(playerCurrentGradient);
          }
        }
      } else if (libraryBackgroundMode === 'daily') {
        const topId = useDailyStatsStore.getState().getTopSongOfYesterday() || useDailyStatsStore.getState().getTopSongOfToday();
        if (topId) {
          const song = songs.find(s => s.id === topId) || await getSong(topId);
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
        themeColors = ['#121212', '#212121', '#121212'];
        image = null;
      } else if (libraryBackgroundMode === 'theme-subtle') {
        // Theme Subtle — greyish blue tint, soft and elegant
        themeColors = ['#121820', '#1E2A38', '#121820'];
        image = null;
      } else if (libraryBackgroundMode === 'theme-blue') {
        // Vibrant theme blue gradient — noticeably blue
        themeColors = ['#0A1628', '#1A3A6B', '#2F8CFF'];
        image = null;
      }
      setActiveThemeColors(themeColors); setActiveImageUri(image);
    };
    updateTheme();
  }, [libraryBackgroundMode, playerCurrentSongId, playerCurrentCover, playerCurrentGradient, songs, songs.length, getSong]);

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
      if (uriToShare.startsWith('content://')) {
        const extension = uriToShare.includes('m4a') ? 'm4a' : 'mp3';
        const tempFile = `${FileSystem.cacheDirectory}share_temp_${Date.now()}.${extension}`;
        try {
          await FileSystem.copyAsync({ from: uriToShare, to: tempFile });
          uriToShare = tempFile;
        } catch (copyError) {
          console.error('Failed to copy content URI for sharing:', copyError);
        }
      }
      await Sharing.shareAsync(uriToShare, {
        dialogTitle: `Share "${selectedSongForArt.title}"`,
        mimeType: 'audio/mpeg',
        UTI: 'public.audio'
      });
    } catch (error) {
      console.error('Share error:', error);
      setToast({ visible: true, message: 'Failed to share song', type: 'error' });
    }
  };

  const handleRemoveCover = async () => {
    setShowBottomSheet(false);
    if (selectedSongForArt) {
      try {
        await updateSong({ ...selectedSongForArt, coverImageUri: undefined, dateModified: new Date().toISOString() });
        await fetchSongs();
        setToast({ visible: true, message: 'Cover art removed', type: 'success' });
      } catch {
        setToast({ visible: true, message: 'Failed to remove cover', type: 'error' });
      }
    }
  };

  const handleHideSong = async () => {
    setShowBottomSheet(false);
    if (selectedSongForArt) {
      try {
        await hideSong(selectedSongForArt.id, true);
        setToast({ visible: true, message: 'Song hidden from library', type: 'success' });
      } catch {
        setToast({ visible: true, message: 'Failed to hide song', type: 'error' });
      }
    }
  };

  const handleEditInfo = () => {
    setShowBottomSheet(false);
    setEditTitle(selectedSongForArt?.title || '');
    setEditArtist(selectedSongForArt?.artist || '');
    setTimeout(() => setShowEditInfoModal(true), 300);
  };

  const handleOpenVersionSearch = () => {
    setShowBottomSheet(false);
    setTimeout(() => setShowVersionSearchModal(true), 300);
  };

  const handleOpenCoverSearch = () => {
    setShowBottomSheet(false);
    setShowCoverSearch(true);
  };

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
      <View style={[StyleSheet.absoluteFill, { backgroundColor: isDark ? '#000' : colors.background }]} />
      {isDark && (
        <Animated.View style={[StyleSheet.absoluteFill, headerAnimatedStyle]}>
          <AuroraHeader palette="library" colors={activeThemeColors} imageUri={activeImageUri} isSolid={isSolidBg} />
        </Animated.View>
      )}
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        {!isSearchFocused && (
          <View style={styles.brandHeader}>
            <Pressable onPress={handleBrandPress} hitSlop={12} style={styles.brandPressable}>
              <Text style={[styles.brandName, { color: isDark ? '#fff' : colors.textPrimary, textShadowColor: isDark ? 'rgba(0,0,0,0.3)' : 'transparent' }]} numberOfLines={1}>
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
          drawDistance={1200}
          overrideItemLayout={(layout: any) => { setSongItemLayout(layout); }}
          getItemType={(_item: any) => 'song'}
          contentContainerStyle={{
            paddingBottom: 150 + insets.bottom,
            paddingTop: 10,
          }}
          extraData={[isSearchFocused]}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} colors={[colors.primary]} />
          }
          onScroll={scrollHandler}
          scrollEventThrottle={16}
          ListEmptyComponent={
            <LibraryEmptyState
              onAddPress={handleAddPress}
              onDownloadPress={() => (navigation as any).navigate('AudioDownloader')}
              colors={colors}
            />
          }
          ListHeaderComponent={
            <LibraryHeader
              hasSongs={filteredSongs.length > 0}
              onSongPress={handleSongPress}
              onSongLongPress={handleSongLongPress}
              onLikePress={toggleLike}
              onMagicPress={handleAddToQueue}
              activeDownloadsCount={activeDownloadsCount}
              onOpenQueueModal={() => setShowQueueModal(true)}
              onNavigateAudioDownloader={() => (navigation as any).navigate('AudioDownloader')}
              onAddPress={handleAddPress}
              searchQuery={searchQuery}
              onSearchQueryChange={setSearchQuery}
              isSearchFocused={isSearchFocused}
              onSearchFocus={handleSearchFocus}
              onSearchCancel={handleSearchCancel}
              currentSong={playerCurrentSong}
              recentlyPlayedMode={recentlyPlayedMode}
              onHeaderLayout={setHeaderHeight}
              isDark={isDark}
              colors={colors}
            />
          }
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        />
      </SafeAreaView>

      {/* Fade aurora gradient at bottom so it doesn't bleed below song list */}
      {isDark && (
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.85)']}
          style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 180 }}
          pointerEvents="none"
        />
      )}

      <LibraryBottomSheet
        visible={showBottomSheet}
        onClose={() => setShowBottomSheet(false)}
        selectedSong={selectedSongForArt}
        onShare={handleShareSong}
        onOpenVersionSearch={handleOpenVersionSearch}
        onPickImage={pickImage}
        onOpenCoverSearch={handleOpenCoverSearch}
        recentArts={recentArts}
        onSelectRecentArt={selectRecentArt}
        onRemoveCover={handleRemoveCover}
        onHideSong={handleHideSong}
        onEditInfo={handleEditInfo}
        onDelete={() => { setShowBottomSheet(false); setTimeout(() => setShowDeleteConfirm(true), 300); }}
        colors={colors}
      />

      <Modal visible={recentArtVisible} transparent animationType="slide" onRequestClose={() => setRecentArtVisible(false)}>
        <Pressable style={styles.recentArtOverlay} onPress={() => setRecentArtVisible(false)}>
          <View style={styles.recentArtContainer}>
            <Text style={styles.recentArtTitle}>Recent Art</Text>
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
        visible={showDeleteConfirm}
        title="Delete Song"
        message={`Delete "${selectedSongForArt?.title}"? This cannot be undone.`}
        onConfirm={handleDeleteSong}
        onCancel={() => setShowDeleteConfirm(false)}
      />

      <SongVersionSearchModal
        visible={showVersionSearchModal}
        targetSong={selectedSongForArt}
        onClose={() => setShowVersionSearchModal(false)}
        onSuccess={() => {
          fetchSongs();
          setToast({ visible: true, message: 'Song updated successfully!', type: 'success' });
        }}
      />

      <CoverArtSearchScreen
        visible={showCoverSearch}
        initialQuery={selectedSongForArt ? `${selectedSongForArt.title} ${selectedSongForArt.artist}` : ''}
        onClose={() => setShowCoverSearch(false)}
        onSelect={async (uri) => {
          setShowCoverSearch(false);
          if (selectedSongForArt) {
            try {
              await updateSong({ ...selectedSongForArt, coverImageUri: uri, dateModified: new Date().toISOString() });
              addRecentArt(uri);
              await fetchSongs();
              setToast({ visible: true, message: 'Cover art updated!', type: 'success' });
              setSelectedSongForArt(null);
            } catch {
              setToast({ visible: true, message: 'Failed to save cover', type: 'error' });
            }
          }
        }}
      />

      <LibraryEditModal
        visible={showEditInfoModal}
        onClose={() => setShowEditInfoModal(false)}
        title={editTitle}
        onTitleChange={setEditTitle}
        artist={editArtist}
        onArtistChange={setEditArtist}
        onSave={handleSaveInfo}
        primaryColor={colors.primary}
      />

      {toast && (<Toast visible={toast.visible} message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />)}
      <DownloadQueueModal visible={showQueueModal} onClose={() => setShowQueueModal(false)} />
      <PerformanceHUD />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  brandHeader: { paddingHorizontal: 20, paddingTop: Platform.OS === 'ios' ? 8 : 4, paddingBottom: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brandPressable: { alignSelf: 'flex-start', flexShrink: 0, maxWidth: '100%' },
  brandName: { fontSize: 34, fontWeight: '900', color: '#fff', letterSpacing: -1.5, textShadowColor: 'rgba(0,0,0,0.3)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 4, paddingRight: 10, marginLeft: 6, marginTop: 5, flexShrink: 0 },
  recentArtOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  recentArtContainer: { backgroundColor: '#06152B', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingVertical: 20, paddingBottom: 40 },
  recentArtTitle: { fontSize: 18, fontWeight: '700', color: '#FFFFFF', paddingHorizontal: 20, marginBottom: 16 },
  recentArtScroll: { paddingHorizontal: 20 },
  recentArtItem: { width: 120, height: 120, borderRadius: 12, overflow: 'hidden', marginRight: 12 },
  recentArtImage: { width: '100%', height: '100%' },
});

export default LibraryScreen;
