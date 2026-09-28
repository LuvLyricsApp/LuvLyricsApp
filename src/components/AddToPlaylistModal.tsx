import { displayPlaylistName } from '../utils/sentenceCase';
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
  Dimensions,
  TextInput,
  ActivityIndicator,
  type ListRenderItem,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { usePlaylistStore } from '../store/playlistStore';
import { useSongsStore } from '../store/songsStore';
import { RootStackParamList } from '../types/navigation';
import { Song, Playlist } from '../types/song';
import * as playlistQueries from '../database/playlistQueries';
import { safeGoBack } from '../utils/navigationService';
import Artwork from './allegra/Artwork';
import { Frosted } from './allegra/Frosted';
import { Tactile } from './allegra/motion';
import * as Haptics from '../utils/haptics';
import { Glass, Radius, Signal } from '../constants/allegraTheme';

type AddToPlaylistNavigationProp = NativeStackNavigationProp<RootStackParamList>;
type AddToPlaylistRouteProp = RouteProp<RootStackParamList, 'AddToPlaylist'>;
type AddToPlaylistMode = 'ADD_SONGS_TO_PLAYLIST' | 'ADD_SONG_TO_PLAYLISTS';
type SelectableItem = Song | Playlist;

const SCREEN_WIDTH = Dimensions.get('window').width;
const GRID_ITEM_WIDTH = (SCREEN_WIDTH - 48 - 12) / 3;

const isSongItem = (item: SelectableItem): item is Song => 'title' in item;

export const AddToPlaylistModal = () => {
  const navigation = useNavigation<AddToPlaylistNavigationProp>();
  const route = useRoute<AddToPlaylistRouteProp>();
  const params = route.params || {};

  const mode: AddToPlaylistMode = params.playlistId ? 'ADD_SONGS_TO_PLAYLIST' : 'ADD_SONG_TO_PLAYLISTS';
  const targetPlaylistId = params.playlistId;
  const targetSongId = params.songId;

  const playlists = usePlaylistStore(state => state.playlists);
  const fetchPlaylists = usePlaylistStore(state => state.fetchPlaylists);
  const addSongToPlaylist = usePlaylistStore(state => state.addSongToPlaylist);
  const addSongsToPlaylist = usePlaylistStore(state => state.addSongsToPlaylist);
  const songs = useSongsStore(state => state.songs);
  const fetchSongs = useSongsStore(state => state.fetchSongs);

  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('grid');
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [existingItems, setExistingItems] = useState<Set<string>>(new Set());

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      try {
        if (mode === 'ADD_SONGS_TO_PLAYLIST' && targetPlaylistId) {
          if (songs.length === 0) await fetchSongs();
          const currentSongs = await playlistQueries.getPlaylistSongs(targetPlaylistId);
          setExistingItems(new Set(currentSongs.map(s => s.id)));
        } else {
          await fetchPlaylists();
        }
      } catch (error) {
        console.error('Failed to init modal', error);
      } finally {
        setLoading(false);
      }
    };
    init();
  }, [mode, targetPlaylistId, songs.length, fetchSongs, fetchPlaylists]);

  const dataToRender = useMemo<SelectableItem[]>(() => {
    if (mode === 'ADD_SONGS_TO_PLAYLIST') {
      if (!searchQuery) return songs;
      const lower = searchQuery.toLowerCase();
      return songs.filter(s => s.title.toLowerCase().includes(lower) || s.artist?.toLowerCase().includes(lower));
    }
    if (!searchQuery) return playlists;
    const lower = searchQuery.toLowerCase();
    return playlists.filter(p => p.name.toLowerCase().includes(lower));
  }, [mode, songs, playlists, searchQuery]);

  const toggleSelection = useCallback((id: string) => {
    if (existingItems.has(id)) return;
    Haptics.selectionAsync().catch(() => {});
    setSelectedItems(prev => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); } else { next.add(id); }
      return next;
    });
  }, [existingItems]);

  const handleDone = async () => {
    try {
      setLoading(true);
      if (mode === 'ADD_SONGS_TO_PLAYLIST' && targetPlaylistId) {
        await addSongsToPlaylist(targetPlaylistId, Array.from(selectedItems));
      } else if (targetSongId) {
        await Promise.all(Array.from(selectedItems).map(pid => addSongToPlaylist(pid, targetSongId)));
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      safeGoBack(navigation);
    } catch (e) {
      console.error('Failed to save', e);
      setLoading(false);
    }
  };

  const renderSongItem = useCallback(({ item }: { item: Song }) => {
    const isSelected = selectedItems.has(item.id);
    const isExisting = existingItems.has(item.id);

    if (viewMode === 'grid') {
      return (
        <Pressable
          style={[styles.gridItem, (isSelected || isExisting) && styles.gridItemSelected]}
          onPress={() => toggleSelection(item.id)}
          disabled={isExisting}
        >
          <View style={[styles.gridImage, isExisting && { opacity: 0.3 }]}>
            <Artwork uri={item.coverImageUri} title={item.title} artist={item.artist} size={GRID_ITEM_WIDTH} style={StyleSheet.absoluteFill} />
          </View>
          {isSelected && (
            <View style={styles.checkOverlay}>
              <Ionicons name="checkmark-circle" size={24} color={Signal.wave} />
            </View>
          )}
          {isExisting && (
            <View style={styles.checkOverlay}>
              <Ionicons name="checkmark-done-circle" size={24} color={Signal.inkMuted} />
            </View>
          )}
          <Text style={styles.gridText} numberOfLines={1}>{item.title}</Text>
        </Pressable>
      );
    }

    return (
      <Pressable
        style={[styles.listItem, (isSelected || isExisting) && styles.listItemSelected]}
        onPress={() => toggleSelection(item.id)}
        disabled={isExisting}
      >
        <View style={styles.listLeft}>
          <View style={[styles.listImage, isExisting && { opacity: 0.5 }]}>
            <Artwork uri={item.coverImageUri} title={item.title} artist={item.artist} size={48} style={StyleSheet.absoluteFill} />
          </View>
          <View style={styles.listTextContainer}>
            <Text style={[styles.listTitle, isExisting && styles.listTitleExisting]} numberOfLines={1}>{item.title}</Text>
            <Text style={styles.listSubtitle} numberOfLines={1}>{item.artist}</Text>
          </View>
        </View>
        <View style={styles.listCheckbox}>
          {isSelected && <Ionicons name="checkmark-circle" size={24} color={Signal.wave} />}
          {isExisting && <Ionicons name="checkmark-done-circle" size={24} color={Signal.inkMuted} />}
          {!isSelected && !isExisting && <View style={styles.emptyCircle} />}
        </View>
      </Pressable>
    );
  }, [selectedItems, existingItems, viewMode, toggleSelection]);

  const renderPlaylistItem = useCallback(({ item }: { item: Playlist }) => {
    const isSelected = selectedItems.has(item.id);
    return (
      <Pressable
        style={[styles.listItem, isSelected && styles.listItemSelected]}
        onPress={() => toggleSelection(item.id)}
      >
        <View style={styles.listLeft}>
          <View style={[styles.listImage, styles.placeholderList]}>
            <Ionicons name="musical-notes" size={20} color={Signal.inkMuted} />
          </View>
          <View style={styles.listTextContainer}>
            <Text style={styles.listTitle} numberOfLines={1}>{displayPlaylistName(item.name)}</Text>
            <Text style={styles.listSubtitle} numberOfLines={1}>{item.songCount === 1 ? '1 song' : `${item.songCount} songs`}</Text>
          </View>
        </View>
        <View style={styles.listCheckbox}>
          {isSelected
            ? <Ionicons name="checkmark-circle" size={24} color={Signal.wave} />
            : <View style={styles.emptyCircle} />}
        </View>
      </Pressable>
    );
  }, [selectedItems, toggleSelection]);

  const renderSelectableItem = useCallback<ListRenderItem<SelectableItem>>(({ item }) => {
    if (mode === 'ADD_SONGS_TO_PLAYLIST' && isSongItem(item)) return renderSongItem({ item });
    if (mode === 'ADD_SONG_TO_PLAYLISTS' && !isSongItem(item)) return renderPlaylistItem({ item });
    return null;
  }, [mode, renderSongItem, renderPlaylistItem]);

  return (
    <View style={styles.container}>
      <Pressable style={StyleSheet.absoluteFill} onPress={() => safeGoBack(navigation)} accessibilityLabel="Close" />
      <View style={styles.content}>
        <Frosted radius={Radius.sheet} intensity={60} tint={0.6} />
        <View style={styles.grabber} />
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>
              {mode === 'ADD_SONGS_TO_PLAYLIST' ? 'Add songs' : 'Add to playlist'}
            </Text>
            {mode === 'ADD_SONGS_TO_PLAYLIST' && (
              <Text style={styles.subtitle}>{selectedItems.size} selected</Text>
            )}
          </View>
          <View style={styles.headerRight}>
            {mode === 'ADD_SONGS_TO_PLAYLIST' && (
              <Tactile
                onPress={() => setViewMode(prev => prev === 'grid' ? 'list' : 'grid')}
                style={styles.iconBtn}
                accessibilityRole="button"
                accessibilityLabel={viewMode === 'grid' ? 'Show as list' : 'Show as grid'}
              >
                <Ionicons name={viewMode === 'grid' ? 'list' : 'grid'} size={20} color={Signal.ink} />
              </Tactile>
            )}
            <Tactile onPress={() => safeGoBack(navigation)} style={styles.iconBtn} accessibilityRole="button" accessibilityLabel="Close">
              <Ionicons name="close" size={22} color={Signal.ink} />
            </Tactile>
          </View>
        </View>

        <View style={styles.searchBar}>
          <Ionicons name="search" size={18} color={Signal.inkMuted} style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder={mode === 'ADD_SONGS_TO_PLAYLIST' ? 'Search your songs' : 'Search playlists'}
            placeholderTextColor={Signal.inkFaint}
            selectionColor={Signal.wave}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>

        {loading ? (
          <ActivityIndicator color={Signal.wave} size="large" style={styles.loading} />
        ) : (
          <FlatList<SelectableItem>
            key={viewMode}
            data={dataToRender}
            keyExtractor={(item) => item.id}
            numColumns={mode === 'ADD_SONGS_TO_PLAYLIST' && viewMode === 'grid' ? 3 : 1}
            renderItem={renderSelectableItem}
            contentContainerStyle={styles.listContent}
            columnWrapperStyle={mode === 'ADD_SONGS_TO_PLAYLIST' && viewMode === 'grid' ? { gap: 6 } : undefined}
            initialNumToRender={20}
          />
        )}

        <View style={styles.footer}>
          <Tactile
            style={[styles.doneButton, selectedItems.size === 0 && styles.disabledButton]}
            onPress={handleDone}
            disabled={selectedItems.size === 0}
            accessibilityRole="button"
            accessibilityState={{ disabled: selectedItems.size === 0 }}
          >
            <Text style={styles.doneText}>
              {mode !== 'ADD_SONGS_TO_PLAYLIST'
                ? 'Done'
                : selectedItems.size === 1 ? 'Add 1 song' : selectedItems.size > 1 ? `Add ${selectedItems.size} songs` : 'Add songs'}
            </Text>
          </Tactile>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Glass.scrim, justifyContent: 'flex-end' },
  content: { borderTopLeftRadius: Radius.sheet, borderTopRightRadius: Radius.sheet, overflow: 'hidden', height: '85%', paddingHorizontal: 24, paddingTop: 10, paddingBottom: 40 },
  grabber: { alignSelf: 'center', width: 36, height: 5, borderRadius: 3, backgroundColor: Glass.hairlineStrong, marginBottom: 14 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  headerRight: { flexDirection: 'row', gap: 10 },
  title: { fontSize: 22, fontWeight: '700', color: Signal.ink },
  subtitle: { fontSize: 14, marginTop: 2, color: Signal.inkMuted },
  iconBtn: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: Glass.fillLight },
  searchBar: { flexDirection: 'row', backgroundColor: Glass.fillLight, borderRadius: Radius.pill, paddingHorizontal: 14, height: 44, alignItems: 'center', marginBottom: 20 },
  searchIcon: { marginRight: 8 },
  searchInput: { flex: 1, color: Signal.ink, fontSize: 16 },
  loading: { flex: 1 },
  listContent: { paddingBottom: 100 },
  gridItem: { width: GRID_ITEM_WIDTH, marginBottom: 12, alignItems: 'center' },
  gridItemSelected: { opacity: 0.8 },
  gridImage: { width: GRID_ITEM_WIDTH, height: GRID_ITEM_WIDTH, borderRadius: Radius.thumb, overflow: 'hidden', marginBottom: 6 },
  gridText: { color: Signal.inkSoft, fontSize: 12, textAlign: 'center', width: '100%' },
  checkOverlay: { position: 'absolute', top: 4, right: 4, backgroundColor: Glass.scrimHeavy, borderRadius: 12 },
  // The border is always there (clear at rest) so selecting never shifts the row.
  listItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, backgroundColor: Glass.fillLight, padding: 8, borderRadius: Radius.well, borderWidth: 1, borderColor: 'transparent' },
  listItemSelected: { backgroundColor: 'rgba(217, 230, 106, 0.1)', borderColor: 'rgba(217, 230, 106, 0.45)' },
  listLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  listImage: { width: 48, height: 48, borderRadius: Radius.thumb, overflow: 'hidden', marginRight: 12 },
  placeholderList: { justifyContent: 'center', alignItems: 'center', backgroundColor: Glass.fillPressed },
  listTextContainer: { flex: 1 },
  listTitle: { color: Signal.ink, fontSize: 16, fontWeight: '600', marginBottom: 2 },
  listTitleExisting: { color: Signal.inkFaint },
  listSubtitle: { color: Signal.inkMuted, fontSize: 13 },
  listCheckbox: { marginLeft: 12 },
  emptyCircle: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: Signal.inkFaint },
  footer: { position: 'absolute', bottom: 32, left: 24, right: 24 },
  doneButton: { height: 52, borderRadius: Radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: Signal.wave },
  disabledButton: { opacity: 0.4 },
  doneText: { color: Signal.waveInk, fontWeight: '700', fontSize: 16 },
});

export default AddToPlaylistModal;
