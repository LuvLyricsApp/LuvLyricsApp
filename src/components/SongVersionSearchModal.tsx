
import React, { useState, useEffect, useCallback } from 'react';
import { 
  View, Text, StyleSheet, Modal, TextInput, Pressable, 
  FlatList, ActivityIndicator, Image, Keyboard 
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/colors';
import { UnifiedSong, Song } from '../types/song';
import { MultiSourceSearchService } from '../services/MultiSourceSearchService';
import { useSongsStore } from '../store/songsStore';
import * as FileSystem from 'expo-file-system/legacy';
import { Toast } from './Toast';

// Helper to access documentDirectory safely
const getDocumentDirectory = () => {
    return FileSystem.documentDirectory ?? '';
};

interface Props {
  visible: boolean;
  targetSong: Song | null;
  onClose: () => void;
  onSuccess: () => void;
}

export const SongVersionSearchModal: React.FC<Props> = ({ visible, targetSong, onClose, onSuccess }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<UnifiedSong[]>([]);
  const [loading, setLoading] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [toast, setToast] = useState<{ message: string, type: 'error' | 'success' } | null>(null);

  const updateSong = useSongsStore(state => state.updateSong);
  const deleteSongFile = async (uri: string) => {
      try {
          await FileSystem.deleteAsync(uri, { idempotent: true });
      } catch (e) {
          console.warn('Failed to delete old audio:', e);
      }
  };

  useEffect(() => {
    if (visible && targetSong) {
      setQuery(targetSong.title); // Pre-fill with title
      setResults([]);
      setLoading(false);
      setDownloadingId(null);
      setDownloadProgress(0);
    }
  }, [visible, targetSong]);

  const handleSearch = async () => {
    if (!query.trim()) return;
    Keyboard.dismiss();
    setLoading(true);
    try {
      const searchResults = await MultiSourceSearchService.searchMusic(query);
      setResults(searchResults);
    } catch (e) {
        setToast({ message: 'Search failed', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleReplace = async (newVersion: UnifiedSong) => {
      if (!targetSong) return;
      setDownloadingId(newVersion.id);
      
      try {
          // 1. Get Stream URL (if not already present)
          let downloadUrl = newVersion.downloadUrl;
          if (!downloadUrl && newVersion.streamUrl) {
              downloadUrl = newVersion.streamUrl;
          }
          
          if (!downloadUrl) {
              console.warn('[VersionReplace] No direct URL found. Result:', newVersion);
              throw new Error('No audio URL found for this version.');
          }

          // 2. Download File
          const filename = `${targetSong.id}_${Date.now()}.mp3`; // New unique name
          const fileUri = `${getDocumentDirectory()}music/${filename}`;
          
          // Ensure directory exists
          const dirInfo = await FileSystem.getInfoAsync(`${getDocumentDirectory()}music/`);
          if (!dirInfo.exists) {
              await FileSystem.makeDirectoryAsync(`${getDocumentDirectory()}music/`, { intermediates: true });
          }

          const downloadRes = await FileSystem.createDownloadResumable(
              downloadUrl,
              fileUri,
              {},
              (progress) => {
                  const p = progress.totalBytesWritten / progress.totalBytesExpectedToWrite;
                  setDownloadProgress(p);
              }
          ).downloadAsync();

          if (!downloadRes || !downloadRes.uri) throw new Error('Download failed');

          // 3. Delete Old File
          if (targetSong.audioUri) {
              await deleteSongFile(targetSong.audioUri);
          }

          // 4. Update Song Record
          await updateSong({
              ...targetSong,
              audioUri: downloadRes.uri,
              duration: newVersion.duration || targetSong.duration, // Update duration if known
              // Optionally update title/artist if the user wants purely the new metadata?
              // The user said "change the language", so maybe they want to keep the "Identity" (ID) but change the content.
              // I'll keep the ID safe.
              dateModified: new Date().toISOString()
          });

          onSuccess();
          onClose();

      } catch (e: any) {
          console.error(e);
          setToast({ message: `Failed: ${e.message || 'Unknown error'}`, type: 'error' });
          setDownloadingId(null);
      }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={styles.content}>
          <View style={styles.header}>
            <Text style={styles.title}>Change Language / Version</Text>
            <Pressable onPress={onClose}><Ionicons name="close" size={24} color="#FFF" /></Pressable>
          </View>
          
          <Text style={styles.subtitle}>Search for "{targetSong?.title}" in another language:</Text>
          
          <View style={styles.searchBar}>
            <TextInput 
                style={styles.input} 
                value={query} 
                onChangeText={setQuery} 
                placeholder="e.g. Song Name (Tamil)" 
                placeholderTextColor="#666" 
                onSubmitEditing={handleSearch}
                autoFocus
            />
            <Pressable onPress={handleSearch} style={styles.searchButton}>
                <Ionicons name="search" size={20} color="#000" />
            </Pressable>
          </View>

          {loading ? (
              <ActivityIndicator size="large" color={Colors.primary} style={{ marginTop: 40 }} />
          ) : (
              <FlatList
                data={results}
                keyExtractor={item => item.id}
                style={styles.list}
                contentContainerStyle={{ paddingBottom: 20 }}
                renderItem={({ item }) => (
                    <Pressable style={styles.item} onPress={() => handleReplace(item)} disabled={!!downloadingId}>
                        <Image source={{ uri: item.thumbnail || item.highResArt }} style={styles.thumb} />
                        <View style={styles.info}>
                            <Text style={styles.itemTitle} numberOfLines={1}>{item.title}</Text>
                            <Text style={styles.itemArtist} numberOfLines={1}>{item.artist}</Text>
                        </View>
                        {downloadingId === item.id ? (
                            <View>
                                <ActivityIndicator size="small" color={Colors.primary} />
                                <Text style={{ color: Colors.primary, fontSize: 10 }}>{(downloadProgress * 100).toFixed(0)}%</Text>
                            </View>
                        ) : (
                            <Ionicons name="download-outline" size={24} color={Colors.primary} />
                        )}
                    </Pressable>
                )}
                ListEmptyComponent={!loading && results.length === 0 ? <Text style={styles.empty}>No results found</Text> : null}
              />
          )}
          
          {toast && <Toast visible={true} message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', padding: 20 },
  content: { backgroundColor: '#1E1E1E', borderRadius: 20, height: '80%', padding: 20 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  title: { fontSize: 20, fontWeight: 'bold', color: '#FFF' },
  subtitle: { color: '#AAA', marginBottom: 12 },
  searchBar: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  input: { flex: 1, backgroundColor: '#333', borderRadius: 10, padding: 12, color: '#FFF', fontSize: 16 },
  searchButton: { backgroundColor: Colors.primary, padding: 12, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  list: { flex: 1 },
  item: { flexDirection: 'row', alignItems: 'center', padding: 12, backgroundColor: '#2A2A2A', borderRadius: 12, marginBottom: 10, gap: 12 },
  thumb: { width: 50, height: 50, borderRadius: 6, backgroundColor: '#444' },
  info: { flex: 1 },
  itemTitle: { color: '#FFF', fontWeight: 'bold', fontSize: 14 },
  itemArtist: { color: '#AAA', fontSize: 12 },
  empty: { color: '#666', textAlign: 'center', marginTop: 40 }
});
