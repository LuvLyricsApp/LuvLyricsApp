/**
 * PlaylistsScreen - Library Hub
 * Displays all playlists in a grid, with "Liked Songs" at the top
 */

import React from 'react';
import { StyleSheet, View, Text, FlatList, Pressable, ActivityIndicator, Alert, GestureResponderEvent } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { usePlaylistStore } from '../store/playlistStore';
import { usePlayerStore } from '../store/playerStore';
import { CustomMenu } from '../components';
import { MosaicCover } from '../components/MosaicCover';
import { useThemeColors, useIsDark } from '../contexts/ThemeContext';
import { useSettingsStore } from '../store/settingsStore';
import { PlaylistsStrings } from '../constants/uiStrings';
import { useDailyStatsStore } from '../store/dailyStatsStore';
import { useSongsStore } from '../store/songsStore';
import { getGradientColors } from '../constants/gradients';
import { AuroraHeader } from '../components/AuroraHeader';
import { DarkColors } from '../constants/colors';
import { RootStackParamList } from '../types/navigation';
import { Playlist, Song } from '../types/song';

export const PlaylistsScreen: React.FC = () => {
  const colors = useThemeColors();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const isLoading = usePlaylistStore(state => state.isLoading);
  const deletePlaylist = usePlaylistStore(state => state.deletePlaylist);
  const playlists = usePlaylistStore(state => state.playlists);
  const fetchPlaylists = usePlaylistStore(state => state.fetchPlaylists);
  const setMiniPlayerHidden = usePlayerStore(state => state.setMiniPlayerHidden);
  
  const [playlistSongs, setPlaylistSongs] = React.useState<Record<string, Song[]>>({});

  const isDark = useIsDark();
  const libraryBackgroundMode = useSettingsStore(state => state.libraryBackgroundMode);
  const applyThemeToOtherPages = useSettingsStore(state => state.applyThemeToOtherPages);
  
  const isSolidBg = libraryBackgroundMode === 'purest-black'
    || libraryBackgroundMode === 'grey'
    || libraryBackgroundMode === 'theme-subtle'
    || libraryBackgroundMode === 'black'
    || libraryBackgroundMode === 'theme-blue';
  const currentSongId = usePlayerStore(state => state.currentSongId);
  const playerCurrentCover = usePlayerStore(state => state.currentSong?.coverImageUri);
  const playerCurrentGradient = usePlayerStore(state => state.currentSong?.gradientId);
  const { songs: allSongsStore, getSong } = useSongsStore();

  const [activeThemeColors, setActiveThemeColors] = React.useState<string[] | undefined>(undefined);
  const [activeImageUri, setActiveImageUri] = React.useState<string | null>(null);

  React.useEffect(() => {
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
        themeColors = ['#121212', '#212121', '#121212'];
        image = null;
      } else if (libraryBackgroundMode === 'theme-subtle') {
        themeColors = ['#0E1722', '#1E2A3A', '#0E1722'];
        image = null;
      } else if (libraryBackgroundMode === 'theme-blue') {
        themeColors = ['#0A1628', '#1A3A6B', '#2F8CFF'];
        image = null;
      }
      setActiveThemeColors(themeColors); setActiveImageUri(image);
    };
    updateTheme();
  }, [applyThemeToOtherPages, libraryBackgroundMode, currentSongId, playerCurrentCover, playerCurrentGradient, allSongsStore, allSongsStore.length, getSong]);

  // Load playlists on mount and refresh on focus
  useFocusEffect(
    React.useCallback(() => {
      fetchPlaylists();
      setMiniPlayerHidden(false);
    }, [fetchPlaylists, setMiniPlayerHidden])
  );

  // Fetch songs for each playlist to display in mosaic
  React.useEffect(() => {
    const fetchAllPlaylistSongs = async () => {
      const { getPlaylistSongs } = await import('../database/playlistQueries');
      const songsMap: Record<string, Song[]> = {};
      
      for (const playlist of playlists) {
        const songs = await getPlaylistSongs(playlist.id);
        songsMap[playlist.id] = songs.slice(0, 4); // Only need 4 for mosaic
      }
      
      setPlaylistSongs(songsMap);
    };
    
    if (playlists.length > 0) {
      fetchAllPlaylistSongs();
    }
  }, [playlists]);

  const handlePlaylistPress = (playlistId: string) => {
    navigation.navigate('PlaylistDetail', { playlistId });
  };

  const handleCreatePlaylist = () => {
    navigation.navigate('CreatePlaylist');
  };

  // Menu State
  const [menuVisible, setMenuVisible] = React.useState(false);
  const [menuAnchor, setMenuAnchor] = React.useState<{ x: number, y: number } | undefined>(undefined);
  const [selectedPlaylist, setSelectedPlaylist] = React.useState<Playlist | null>(null);

  const handleLongPress = (playlist: Playlist, event: GestureResponderEvent) => {
    if (playlist.isDefault) return; // Cannot modify "Liked Songs"
    
    const { pageX, pageY } = event.nativeEvent;
    setMenuAnchor({ x: pageX, y: pageY });
    setSelectedPlaylist(playlist);
    setMenuVisible(true);
  };

  const handleDeleteConfirm = () => {
      if (!selectedPlaylist) return;
      
      Alert.alert(
          'Delete Playlist',
          `Are you sure you want to delete "${selectedPlaylist.name}"?`,
          [
              { text: 'Cancel', style: 'cancel' },
              { 
                  text: 'Delete', 
                  style: 'destructive',
                  onPress: () => {
                      deletePlaylist(selectedPlaylist.id);
                      setMenuVisible(false);
                  }
              }
          ]
      );
  };

  const handleRename = () => {
      if (!selectedPlaylist) return;
      setMenuVisible(false);
      // Navigate to CreatePlaylistModal in Edit Mode
      navigation.navigate('CreatePlaylist', {
          playlistId: selectedPlaylist.id,
          initialName: selectedPlaylist.name
      });
  };

  const menuOptions = [
      {
          label: 'Rename Playlist',
          icon: 'pencil-outline' as const,
          onPress: handleRename
      },
      {
          label: 'Delete Playlist',
          icon: 'trash-outline' as const,
          onPress: handleDeleteConfirm,
          isDestructive: true
      }
  ];

  return (
    <View style={styles.container}>
      <View style={[StyleSheet.absoluteFill, { backgroundColor: isDark ? '#000' : colors.background }]} />
      {isDark && applyThemeToOtherPages && (
        <View style={StyleSheet.absoluteFill}>
          <AuroraHeader palette="library" colors={activeThemeColors} imageUri={activeImageUri} isSolid={isSolidBg} />
        </View>
      )}
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        {/* ... Header ... */}
        <View style={styles.header}>
          <Text style={styles.title}>{PlaylistsStrings.yourLibrary}</Text>
          <Pressable onPress={handleCreatePlaylist} style={styles.addButton}>
            <Ionicons name="add-circle-outline" size={28} color={colors.textPrimary} />
          </Pressable>
        </View>

        {isLoading && playlists.length === 0 ? (
             <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                 <ActivityIndicator size="large" color={colors.primary} />
             </View>
        ) : playlists.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="folder-open-outline" size={80} color={isDark ? 'rgba(255,255,255,0.2)' : colors.textMuted} />
            <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>{PlaylistsStrings.noPlaylistsYet}</Text>
            <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>Create your first playlist to get started</Text>
            <Pressable style={styles.createButton} onPress={handleCreatePlaylist}>
              <Ionicons name="add" size={24} color="#fff" />
              <Text style={styles.createButtonText}>{PlaylistsStrings.createPlaylist}</Text>
            </Pressable>
          </View>
        ) : (
          <FlatList
            data={playlists}
            key={'grid-2'}
            numColumns={2}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.gridList}
            renderItem={({ item }) => (
              <Pressable
                style={styles.playlistCard}
                onPress={() => handlePlaylistPress(item.id)}
                onLongPress={(e) => handleLongPress(item, e)}
                delayLongPress={300}
              >
                <MosaicCover songs={playlistSongs[item.id] || []} size={160} />
                <Text style={styles.playlistName} numberOfLines={2}>
                  {item.name}
                </Text>
                <Text style={styles.playlistCount}>
                  {item.songCount || 0} {item.songCount === 1 ? 'song' : 'songs'}
                </Text>
              </Pressable>
            )}
          />
        )}
      </SafeAreaView>

      <CustomMenu
        visible={menuVisible}
        onClose={() => setMenuVisible(false)}
        title={selectedPlaylist?.name || 'Options'}
        anchorPosition={menuAnchor}
        options={menuOptions}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: DarkColors.textPrimary,
  },
  addButton: {
    padding: 8,
  },
  gridList: {
    paddingHorizontal: 12,
    paddingBottom: 100,
  },
  playlistCard: {
    flex: 1,
    margin: 8,
    maxWidth: '46%',
  },
  playlistName: {
    fontSize: 16,
    fontWeight: '600',
    color: DarkColors.textPrimary,
    marginTop: 12,
  },
  playlistCount: {
    fontSize: 14,
    color: DarkColors.textSecondary,
    marginTop: 4,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 100,
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: DarkColors.textPrimary,
    marginTop: 16,
  },
  emptySubtitle: {
    fontSize: 14,
    color: DarkColors.textSecondary,
    marginTop: 8,
    textAlign: 'center',
  },
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1DB954',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
    marginTop: 24,
    gap: 8,
  },
  createButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
});

export default PlaylistsScreen;
