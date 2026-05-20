import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
  Image,
  Dimensions,
  TextInput,
  ActivityIndicator,
  type ListRenderItem,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { Colors } from '../constants/colors';
import { usePlaylistStore } from '../store/playlistStore';
import { useSongsStore } from '../store/songsStore';
import { RootStackParamList } from '../types/navigation';
import { Song, Playlist } from '../types/song';
import * as playlistQueries from '../database/playlistQueries';

type AddToPlaylistNavigationProp = NativeStackNavigationProp<RootStackParamList>;
type AddToPlaylistRouteProp = RouteProp<RootStackParamList, 'AddToPlaylist'>;
type AddToPlaylistMode = 'ADD_SONGS_TO_PLAYLIST' | 'ADD_SONG_TO_PLAYLISTS';
type SelectableItem = Song | Playlist;

const SCREEN_WIDTH = Dimensions.get('window').width;
const GRID_ITEM_WIDTH = (SCREEN_WIDTH - 48 - 12) / 3; // 3 columns, 24px padding sides, 6px gap

const isSongItem = (item: SelectableItem): item is Song => 'title' in item;

export const AddToPlaylistModal = () => {
  const navigation = useNavigation<AddToPlaylistNavigationProp>();
  const route = useRoute<AddToPlaylistRouteProp>();
  const params = route.params || {};

  // Determine Mode
  const mode: AddToPlaylistMode = params.playlistId ? 'ADD_SONGS_TO_PLAYLIST' : 'ADD_SONG_TO_PLAYLISTS';
  const targetPlaylistId = params.playlistId;
  const targetSongId = params.songId;

  // Stores
  const playlists = usePlaylistStore(state => state.playlists);
  const fetchPlaylists = usePlaylistStore(state => state.fetchPlaylists);
  const addSongToPlaylist = usePlaylistStore(state => state.addSongToPlaylist);
  const addSongsToPlaylist = usePlaylistStore(state => state.addSongsToPlaylist);
  const songs = useSongsStore(state => state.songs);
  const fetchSongs = useSongsStore(state => state.fetchSongs);

  // State
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('grid');
  
  // Selection State
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [existingItems, setExistingItems] = useState<Set<string>>(new Set());

  // Load Data
  useEffect(() => {
    const init = async () => {
      setLoading(true);
      try {
        if (mode === 'ADD_SONGS_TO_PLAYLIST' && targetPlaylistId) {
            // 1. Fetch all songs if not loaded
            if (songs.length === 0) await fetchSongs();
            
            // 2. Fetch songs ALREADY in this playlist to exclude/disable them
            const currentSongs = await playlistQueries.getPlaylistSongs(targetPlaylistId);
            const existingIds = new Set(currentSongs.map(s => s.id));
            setExistingItems(existingIds);
        } else {
            // Fetch playlists
            await fetchPlaylists();
        }
      } catch (error) {
        console.error("Failed to init modal", error);
      } finally {
        setLoading(false);
      }
    };
    init();
  }, [mode, targetPlaylistId, songs.length, fetchSongs, fetchPlaylists]);

  // Filter Data
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

  // Actions
  const toggleSelection = useCallback((id: string) => {
    if (existingItems.has(id)) return; // Cannot toggle existing

    setSelectedItems(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, [existingItems]);

  const handleDone = async () => {
    try {
        setLoading(true);
        if (mode === 'ADD_SONGS_TO_PLAYLIST' && targetPlaylistId) {
            await addSongsToPlaylist(targetPlaylistId, Array.from(selectedItems));
        } else if (targetSongId) {
             const promises = Array.from(selectedItems).map(pid => addSongToPlaylist(pid, targetSongId));
             await Promise.all(promises);
        }
        navigation.goBack();
    } catch (e) {
        console.error("Failed to save", e);
        setLoading(false);
    }
  };

  // Renderers
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
                  <Image 
                    source={item.coverImageUri ? { uri: item.coverImageUri } : require('../../assets/icon.png')} // Fallback or placeholder check
                    style={[styles.gridImage, isExisting && { opacity: 0.3 }]} 
                  />
                   {!item.coverImageUri && (
                      <View style={[StyleSheet.absoluteFill, styles.placeholderGrid]}>
                          <Ionicons name="musical-note" size={24} color="#666" />
                      </View>
                   )}
                  
                  {isSelected && (
                      <View style={styles.checkOverlay}>
                          <Ionicons name="checkmark-circle" size={24} color={Colors.primary} />
                      </View>
                  )}
                  {isExisting && (
                       <View style={styles.checkOverlay}>
                          <Ionicons name="checkmark-done-circle" size={24} color="#666" />
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
                 <Image 
                    source={item.coverImageUri ? { uri: item.coverImageUri } : require('../../assets/icon.png')} 
                    style={[styles.listImage, isExisting && { opacity: 0.5 }]} 
                 />
                  {!item.coverImageUri && (
                      <View style={[styles.listImage, styles.placeholderList]}>
                          <Ionicons name="musical-note" size={20} color="#666" />
                      </View>
                   )}
                 <View style={styles.listTextContainer}>
                     <Text style={[styles.listTitle, isExisting && { color: '#666' }]} numberOfLines={1}>{item.title}</Text>
                     <Text style={styles.listSubtitle} numberOfLines={1}>{item.artist}</Text>
                 </View>
              </View>
              <View style={styles.listCheckbox}>
                   {isSelected && <Ionicons name="checkmark-circle" size={24} color={Colors.primary} />}
                   {isExisting && <Ionicons name="checkmark-done-circle" size={24} color="#666" />}
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
                      <Ionicons name="musical-notes" size={20} color="#666" />
                  </View>
                 <View style={styles.listTextContainer}>
                     <Text style={styles.listTitle} numberOfLines={1}>{item.name}</Text>
                     <Text style={styles.listSubtitle} numberOfLines={1}>{item.songCount} songs</Text>
                 </View>
              </View>
               <View style={styles.listCheckbox}>
                   {isSelected ? (
                       <Ionicons name="checkmark-circle" size={24} color={Colors.primary} />
                   ) : (
                       <View style={styles.emptyCircle} />
                   )}
              </View>
          </Pressable>
       );
  }, [selectedItems, toggleSelection]);

  const renderSelectableItem = useCallback<ListRenderItem<SelectableItem>>(({ item }) => {
      if (mode === 'ADD_SONGS_TO_PLAYLIST' && isSongItem(item)) {
          return renderSongItem({ item });
      }

      if (mode === 'ADD_SONG_TO_PLAYLISTS' && !isSongItem(item)) {
          return renderPlaylistItem({ item });
      }

      return null;
  }, [mode, renderSongItem, renderPlaylistItem]);

  return (
    <View style={styles.container}>
      <BlurView intensity={80} tint="dark" style={StyleSheet.absoluteFill} />
      
      <View style={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <View>
              <Text style={styles.title}>
                  {mode === 'ADD_SONGS_TO_PLAYLIST' ? 'Add Songs' : 'Add to Playlist'}
              </Text>
              {mode === 'ADD_SONGS_TO_PLAYLIST' && (
                  <Text style={styles.subtitle}>{selectedItems.size} selected</Text>
              )}
          </View>
          
          <View style={styles.headerRight}>
              {mode === 'ADD_SONGS_TO_PLAYLIST' && (
                  <Pressable onPress={() => setViewMode(prev => prev === 'grid' ? 'list' : 'grid')} style={styles.iconBtn}>
                      <Ionicons name={viewMode === 'grid' ? 'list' : 'grid'} size={22} color="#fff" />
                  </Pressable>
              )}
              <Pressable onPress={() => navigation.goBack()} style={styles.iconBtn}>
                <Ionicons name="close" size={24} color="#fff" />
              </Pressable>
          </View>
        </View>

        {/* Search */}
        <View style={styles.searchBar}>
            <Ionicons name="search" size={20} color="#666" style={{marginRight: 8}}/>
            <TextInput 
                style={styles.searchInput}
                placeholder="Search..."
                placeholderTextColor="#666"
                value={searchQuery}
                onChangeText={setSearchQuery}
            />
        </View>

        {/* Content */}
        {loading ? (
             <ActivityIndicator color={Colors.primary} size="large" style={{flex: 1}} />
        ) : (
             <FlatList<SelectableItem>
                key={viewMode} // Force full re-render on toggle
                data={dataToRender}
                keyExtractor={(item) => item.id}
                numColumns={mode === 'ADD_SONGS_TO_PLAYLIST' && viewMode === 'grid' ? 3 : 1}
                renderItem={renderSelectableItem}
                contentContainerStyle={styles.listContent}
                columnWrapperStyle={mode === 'ADD_SONGS_TO_PLAYLIST' && viewMode === 'grid' ? { gap: 6 } : undefined}
                initialNumToRender={20}
             />
        )}

        {/* Footer */}
        <View style={styles.footer}>
          <Pressable 
            style={[styles.doneButton, selectedItems.size === 0 && styles.disabledButton]} 
            onPress={handleDone}
            disabled={selectedItems.size === 0}
          >
            <Text style={styles.doneText}>
              {mode === 'ADD_SONGS_TO_PLAYLIST' ? `Add ${selectedItems.size} Songs` : 'Done'}
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  content: {
    backgroundColor: '#1E1E1E',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    height: '85%', // Taller for better browsing
    padding: 24,
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  headerRight: {
      flexDirection: 'row',
      gap: 16
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#fff',
  },
  subtitle: {
      fontSize: 14,
      color: Colors.primary,
      marginTop: 2
  },
  iconBtn: {
      padding: 4
  },
  searchBar: {
      flexDirection: 'row',
      backgroundColor: '#333',
      borderRadius: 12,
      paddingHorizontal: 12,
      height: 44,
      alignItems: 'center',
      marginBottom: 20
  },
  searchInput: {
      flex: 1,
      color: '#fff',
      fontSize: 16
  },
  listContent: {
    paddingBottom: 100,
  },
  // Grid Styles
  gridItem: {
      width: GRID_ITEM_WIDTH,
      marginBottom: 12,
      alignItems: 'center'
  },
  gridItemSelected: {
      opacity: 0.8
  },
  gridImage: {
      width: GRID_ITEM_WIDTH,
      height: GRID_ITEM_WIDTH,
      borderRadius: 8,
      backgroundColor: '#333',
      marginBottom: 6
  },
  placeholderGrid: {
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center'
  },
  gridText: {
      color: '#fff',
      fontSize: 12,
      textAlign: 'center',
      width: '100%'
  },
  checkOverlay: {
      position: 'absolute',
      top: 4,
      right: 4,
      backgroundColor: 'rgba(0,0,0,0.6)',
      borderRadius: 12
  },
  // List Styles
  listItem: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 16,
      backgroundColor: 'rgba(255,255,255,0.05)',
      padding: 8,
      borderRadius: 12
  },
  listItemSelected: {
      backgroundColor: 'rgba(29, 185, 84, 0.1)',
      borderColor: Colors.primary,
      borderWidth: 1
  },
  listLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1
  },
  listImage: {
      width: 48,
      height: 48,
      borderRadius: 6,
      marginRight: 12,
      backgroundColor: '#333'
  },
  placeholderList: {
      justifyContent: 'center',
      alignItems: 'center'
  },
  listTextContainer: {
     flex: 1
  },
  listTitle: {
      color: '#fff',
      fontSize: 16,
      fontWeight: '500',
      marginBottom: 2
  },
  listSubtitle: {
      color: '#aaa',
      fontSize: 13
  },
  listCheckbox: {
      marginLeft: 12
  },
  emptyCircle: {
      width: 24,
      height: 24,
      borderRadius: 12,
      borderWidth: 2,
      borderColor: '#666'
  },
  footer: {
    position: 'absolute',
    bottom: 32,
    left: 24,
    right: 24,
  },
  doneButton: {
    backgroundColor: Colors.primary || '#1DB954',
    padding: 16,
    borderRadius: 32,
    alignItems: 'center',
  },
  disabledButton: {
    opacity: 0.5,
    backgroundColor: '#333',
  },
  doneText: {
    color: '#000',
    fontWeight: 'bold',
    fontSize: 16,
  },
});
export default AddToPlaylistModal;
