/**
 * PlaylistsScreen - Library Hub
 * Displays all playlists in a grid, with "Liked Songs" at the top
 */

import React from 'react';
import { StyleSheet, View, Text, FlatList, Pressable, ActivityIndicator, Alert, GestureResponderEvent } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect, useIsFocused } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { usePlaylistStore } from '../store/playlistStore';
import { usePlayerStore } from '../store/playerStore';
import { CustomMenu } from '../components/CustomMenu';
import { MosaicCover } from '../components/MosaicCover';
import DynamicAura from '../components/allegra/DynamicAura';
import { useArtworkPalette } from '../components/allegra/useArtworkPalette';
import { useThemeColors } from '../contexts/ThemeContext';
import { PlaylistsStrings } from '../constants/uiStrings';
import { displayPlaylistName } from '../utils/sentenceCase';
import { DarkColors } from '../constants/colors';
import { LibraryStackParamList, RootStackParamList } from '../types/navigation';
import { Glass, Radius, Signal } from '../constants/allegraTheme';
import { Playlist, Song } from '../types/song';

export const PlaylistsScreen: React.FC = () => {
  const colors = useThemeColors();
  // This screen sits in the Library tab's nested stack: PlaylistDetail resolves
  // locally, everything else bubbles up to the root stack.
  const navigation = useNavigation<
    NativeStackNavigationProp<LibraryStackParamList & RootStackParamList>
  >();
  const isLoading = usePlaylistStore(state => state.isLoading);
  const deletePlaylist = usePlaylistStore(state => state.deletePlaylist);
  const playlists = usePlaylistStore(state => state.playlists);
  const fetchPlaylists = usePlaylistStore(state => state.fetchPlaylists);
  const setMiniPlayerHidden = usePlayerStore(state => state.setMiniPlayerHidden);
  
  const [playlistSongs, setPlaylistSongs] = React.useState<Record<string, Song[]>>({});

  // Same room as Library: the live shader, tinted by the playing cover.
  const isFocused = useIsFocused();
  const isPlaying = usePlayerStore(state => state.isPlaying);
  const playingCover = usePlayerStore(state => state.currentSong?.coverImageUri);
  const palette = useArtworkPalette(playingCover);

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
          'Delete playlist',
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
          label: 'Rename playlist',
          icon: 'pencil-outline' as const,
          onPress: handleRename
      },
      {
          label: 'Delete playlist',
          icon: 'trash-outline' as const,
          onPress: handleDeleteConfirm,
          isDestructive: true
      }
  ];

  return (
    <View style={styles.container}>
      <DynamicAura palette={palette} playing={isPlaying} active={isFocused} dim={0.25} />
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        {/* ... Header ... */}
        <View style={styles.header}>
          {navigation.canGoBack() ? (
            <Pressable onPress={() => navigation.goBack()} hitSlop={10} accessibilityRole="button" accessibilityLabel="Back" style={styles.backButton}>
              <Ionicons name="chevron-back" size={26} color={colors.textPrimary} />
            </Pressable>
          ) : null}
          <Text style={[styles.title, styles.titleFlex]}>Playlists</Text>
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
            <Ionicons name="folder-open-outline" size={80} color="rgba(255,255,255,0.2)" />
            <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>{PlaylistsStrings.noPlaylistsYet}</Text>
            <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>Create your first playlist to get started</Text>
            <Pressable style={styles.createButton} onPress={handleCreatePlaylist}>
              <Ionicons name="add" size={24} color={Signal.waveInk} />
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
                <MosaicCover songs={playlistSongs[item.id] || []} size={160} name={displayPlaylistName(item.name)} />
                <Text style={styles.playlistName} numberOfLines={2}>
                  {displayPlaylistName(item.name)}
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
  backButton: { marginRight: 6 },
  titleFlex: { flex: 1 },
  downloadsEntry: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 16,
    marginBottom: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: Radius.panel,
    backgroundColor: Glass.fill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Glass.hairline,
  },
  downloadsIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Signal.wave,
    alignItems: 'center',
    justifyContent: 'center',
  },
  downloadsTitle: { fontSize: 16, fontWeight: '700', color: Signal.ink },
  downloadsMeta: { fontSize: 12, color: Signal.inkMuted, marginTop: 2 },
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
    paddingBottom: 220,
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
    paddingBottom: 220,
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
    backgroundColor: Signal.wave,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
    marginTop: 24,
    gap: 8,
  },
  createButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: Signal.waveInk,
  },
});

export default PlaylistsScreen;
