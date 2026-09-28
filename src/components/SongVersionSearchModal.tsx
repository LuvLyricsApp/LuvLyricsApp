import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, Modal, TextInput, Pressable,
  FlatList, ActivityIndicator, Keyboard
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Frosted } from './allegra/Frosted';
import { Artwork } from './allegra/Artwork';
import { Glass, Signal } from '../constants/allegraTheme';
import { UnifiedSong, Song } from '../types/song';
import { MultiSourceSearchService } from '../services/MultiSourceSearchService';
import { useSongsStore } from '../store/songsStore';
import * as FileSystem from 'expo-file-system/legacy';
import { Toast } from './Toast';

const getDocumentDirectory = () => FileSystem.documentDirectory ?? '';

interface Props {
  visible: boolean;
  targetSong: Song | null;
  onClose: () => void;
  onSuccess: () => void;
}

export const SongVersionSearchModal: React.FC<Props> = ({ visible, targetSong, onClose, onSuccess }) => {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<UnifiedSong[]>([]);
  const [loading, setLoading] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [toast, setToast] = useState<{ message: string; type: 'error' | 'success' } | null>(null);

  const updateSong = useSongsStore(state => state.updateSong);

  const deleteSongFile = async (uri: string) => {
    try { await FileSystem.deleteAsync(uri, { idempotent: true }); }
    catch (e) { if (__DEV__) console.warn('Failed to delete old audio:', e); }
  };

  useEffect(() => {
    if (visible && targetSong) {
      setQuery(targetSong.title);
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
    } catch {
      setToast({ message: "Couldn't search right now", type: 'error' });
    } finally { setLoading(false); }
  };

  const handleReplace = async (newVersion: UnifiedSong) => {
    if (!targetSong) return;
    setDownloadingId(newVersion.id);
    try {
      let downloadUrl = newVersion.downloadUrl;
      if (!downloadUrl && newVersion.streamUrl) downloadUrl = newVersion.streamUrl;
      if (!downloadUrl) throw new Error('this version has no audio');

      const filename = `${targetSong.id}_${Date.now()}.mp3`;
      const fileUri = `${getDocumentDirectory()}music/${filename}`;
      const dirInfo = await FileSystem.getInfoAsync(`${getDocumentDirectory()}music/`);
      if (!dirInfo.exists) await FileSystem.makeDirectoryAsync(`${getDocumentDirectory()}music/`, { intermediates: true });

      const downloadRes = await FileSystem.createDownloadResumable(
        downloadUrl, fileUri, {},
        (progress) => setDownloadProgress(progress.totalBytesWritten / progress.totalBytesExpectedToWrite)
      ).downloadAsync();

      if (!downloadRes || !downloadRes.uri) throw new Error('the download stopped');
      if (targetSong.audioUri) await deleteSongFile(targetSong.audioUri);

      await updateSong({ ...targetSong, audioUri: downloadRes.uri, duration: newVersion.duration || targetSong.duration, dateModified: new Date().toISOString() });
      onSuccess();
      onClose();
    } catch (e) {
      if (__DEV__) console.error('[SongVersion] replace failed:', e);
      const reason = e instanceof Error && e.message ? e.message : 'something stopped it';
      setToast({ message: `Couldn't swap it: ${reason}`, type: 'error' });
      setDownloadingId(null);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.container}>
        <Pressable style={[StyleSheet.absoluteFill, styles.scrim]} onPress={onClose} accessibilityLabel="Close" />
        <View style={[styles.content, { paddingBottom: 16 + insets.bottom }]}>
          <Frosted radius={28} intensity={60} tint={0.55} />
          <View style={styles.grabber} />
          <View style={styles.header}>
            <Text style={styles.title}>Another version</Text>
            <Pressable onPress={onClose} style={styles.closeBtn} hitSlop={8} accessibilityRole="button" accessibilityLabel="Close">
              <Ionicons name="close" size={20} color={Signal.ink} />
            </Pressable>
          </View>
          <Text style={styles.subtitle}>
            Find {targetSong ? `"${targetSong.title}"` : 'this song'} in another language or version. The one you pick replaces the audio on your phone.
          </Text>
          <View style={styles.searchBar}>
            <Ionicons name="search" size={16} color={Signal.inkMuted} />
            <TextInput
              style={styles.input} value={query} onChangeText={setQuery}
              placeholder="Song name and language" placeholderTextColor={Signal.inkFaint}
              selectionColor={Signal.wave} returnKeyType="search"
              onSubmitEditing={handleSearch} autoFocus
            />
          </View>

          {loading ? (
            <ActivityIndicator size="large" color={Signal.wave} style={{ marginTop: 40 }} />
          ) : (
            <FlatList
              data={results} keyExtractor={item => item.id} style={styles.list}
              contentContainerStyle={{ paddingBottom: 20 }}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => {
                const busy = downloadingId === item.id;
                return (
                  <Pressable
                    style={({ pressed }) => [styles.item, pressed && styles.itemPressed, !!downloadingId && !busy && styles.itemDimmed]}
                    onPress={() => handleReplace(item)} disabled={!!downloadingId}
                    accessibilityRole="button" accessibilityLabel={`Use ${item.title} by ${item.artist}`}
                  >
                    <Artwork uri={item.thumbnail || item.highResArt} title={item.title} artist={item.artist} size={48} style={styles.thumb} />
                    <View style={styles.info}>
                      <Text style={styles.itemTitle} numberOfLines={1}>{item.title}</Text>
                      <Text style={styles.itemArtist} numberOfLines={1}>{item.artist}</Text>
                    </View>
                    {busy ? (
                      <View style={styles.busy}>
                        <ActivityIndicator size="small" color={Signal.wave} />
                        <Text style={styles.busyText}>{Math.round(downloadProgress * 100)}%</Text>
                      </View>
                    ) : (
                      <Text style={styles.use}>Use</Text>
                    )}
                  </Pressable>
                );
              }}
              ListEmptyComponent={
                <Text style={styles.empty}>Search to see other versions.</Text>
              }
            />
          )}

          {toast && <Toast visible={true} message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'flex-end' },
  scrim: { backgroundColor: Glass.scrim },
  content: { height: '85%', borderTopLeftRadius: 28, borderTopRightRadius: 28, overflow: 'hidden', paddingHorizontal: 20 },
  grabber: { alignSelf: 'center', width: 36, height: 5, borderRadius: 3, marginTop: 8, backgroundColor: Glass.hairlineStrong },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 12, marginBottom: 8 },
  title: { fontSize: 20, fontWeight: '700', color: Signal.ink },
  closeBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: Glass.fillLight },
  subtitle: { color: Signal.inkMuted, fontSize: 14, lineHeight: 20, marginBottom: 14 },
  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, height: 44, marginBottom: 12,
    borderRadius: 999, backgroundColor: Glass.fillLight, borderWidth: StyleSheet.hairlineWidth, borderColor: Glass.hairline,
  },
  input: { flex: 1, color: Signal.ink, fontSize: 15, paddingVertical: 0 },
  list: { flex: 1, marginHorizontal: -8 },
  item: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 8, borderRadius: 14, gap: 12 },
  itemPressed: { backgroundColor: Glass.fillPressed },
  itemDimmed: { opacity: 0.4 },
  thumb: { width: 48, height: 48, borderRadius: 8 },
  info: { flex: 1 },
  itemTitle: { color: Signal.ink, fontWeight: '600', fontSize: 15 },
  itemArtist: { color: Signal.inkMuted, fontSize: 13, marginTop: 2 },
  use: { color: Signal.wave, fontSize: 15, fontWeight: '600', paddingHorizontal: 8 },
  busy: { alignItems: 'center', minWidth: 40 },
  busyText: { color: Signal.wave, fontSize: 11, marginTop: 2 },
  empty: { color: Signal.inkMuted, textAlign: 'center', marginTop: 40, fontSize: 14 },
});
