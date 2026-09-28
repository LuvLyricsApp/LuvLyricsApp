import React, { useState, useEffect } from 'react';
import {
  View, Text, Modal, StyleSheet, TextInput, TouchableOpacity,
  FlatList, ActivityIndicator, Alert, ScrollView
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LyricsRepository, SearchResult } from '../services/LyricsRepository';
import { Glass, Radius, Signal } from '../constants/allegraTheme';

interface LrcSearchModalProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (result: SearchResult) => void;
  initialQuery: { title: string; artist: string; duration: number };
  autoPick?: boolean;
}

export const LrcSearchModal: React.FC<LrcSearchModalProps> = ({
  visible, onClose, onSelect, initialQuery, autoPick = false
}) => {
  const [artistName, setArtistName] = useState(initialQuery.artist);
  const [songName, setSongName] = useState(initialQuery.title);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [previewItem, setPreviewItem] = useState<SearchResult | null>(null);
  const [editedLyrics, setEditedLyrics] = useState('');

  const handleSearch = React.useCallback(async (overrideTitle?: string, overrideArtist?: string) => {
    const titleToUse = overrideTitle !== undefined ? overrideTitle : songName;
    const artistToUse = overrideArtist !== undefined ? overrideArtist : artistName;
    if (!titleToUse.trim()) return;
    setLoading(true);
    setStatusMessage('Searching the lyrics sources…');
    setResults([]);
    try {
      const searchResults = await LyricsRepository.searchSmart(
        `${titleToUse} ${artistToUse}`,
        { ...initialQuery, title: titleToUse, artist: artistToUse },
        (msg) => setStatusMessage(msg)
      );
      setResults(searchResults);
      if (autoPick && searchResults.length > 0) {
        const bestSynced = searchResults.find(r => r.type === 'synced');
        if (bestSynced) { onSelect(bestSynced); return; }
      }
    } catch (error) {
      if (__DEV__) console.warn('Search failed:', error);
      Alert.alert('Couldn’t search', 'The lyrics sources didn’t answer. Try again in a moment.');
    } finally {
      setLoading(false);
      setStatusMessage('');
    }
  }, [songName, artistName, initialQuery, autoPick, onSelect]);

  useEffect(() => {
    if (visible) {
      setArtistName(initialQuery.artist);
      setSongName(initialQuery.title);
      handleSearch(initialQuery.title, initialQuery.artist);
    } else {
      setPreviewItem(null);
      setEditedLyrics('');
      setResults([]);
    }
  }, [visible, initialQuery, handleSearch]);

  const handleSelect = (item: SearchResult) => {
    setPreviewItem(item);
    setEditedLyrics(item.syncedLyrics || item.plainLyrics);
  };

  const handleApply = () => {
    if (!previewItem) return;
    onSelect({
      ...previewItem,
      syncedLyrics: previewItem.type === 'synced' ? editedLyrics : '',
      plainLyrics: previewItem.type === 'plain' ? editedLyrics : previewItem.plainLyrics,
    });
    onClose();
  };

  const handleBack = () => setPreviewItem(null);

  const renderItem = ({ item }: { item: SearchResult }) => (
    <TouchableOpacity style={styles.resultItem} onPress={() => handleSelect(item)}>
      <View style={styles.resultContent}>
        <Text style={styles.resultTitle} numberOfLines={1}>{item.trackName}</Text>
        <Text style={styles.resultArtist} numberOfLines={1}>{item.artistName}</Text>
        <View style={styles.badgesContainer}>
          <View style={[styles.badge,
            item.source === 'LRCLIB.net' || item.source === 'LRCLIB' ? styles.badgeLrc :
            item.source.includes('JioSaavn') ? styles.badgeSaavn :
            item.source.includes('Lyrica') ? styles.badgeLyrica : styles.badgeGenius
          ]}>
            <Text style={styles.badgeText}>{item.source}</Text>
          </View>
          {item.type === 'synced' && (
            <View style={[styles.badge, styles.badgeSynced]}>
              <Ionicons name="time" size={10} color={Signal.waveInk} style={{ marginRight: 2 }} />
              <Text style={[styles.badgeText, styles.badgeTextOn]}>Synced</Text>
            </View>
          )}
          {item.matchScore > 0 && (
            <View style={[styles.badge, item.matchScore > 80 ? styles.badgeHigh : styles.badgeLow]}>
              <Text style={styles.badgeText}>{Math.round(item.matchScore)}% match</Text>
            </View>
          )}
        </View>
        {item.matchReason ? <Text style={styles.matchReason}>{item.matchReason}</Text> : null}
      </View>
      <Ionicons name="chevron-forward" size={18} color={Signal.inkMuted} />
    </TouchableOpacity>
  );

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Choose a source</Text>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Ionicons name="close" size={20} color={Signal.ink} />
          </TouchableOpacity>
        </View>

        <View style={styles.searchContainer}>
          <View style={styles.inputRow}>
            <TextInput style={styles.searchInput} value={songName} onChangeText={setSongName}
              placeholder="Song title" placeholderTextColor={Signal.inkFaint} selectionColor={Signal.wave} onSubmitEditing={() => handleSearch()} returnKeyType="search" />
          </View>
          <View style={styles.inputRow}>
            <TextInput style={styles.searchInput} value={artistName} onChangeText={setArtistName}
              placeholder="Artist" placeholderTextColor={Signal.inkFaint} selectionColor={Signal.wave} onSubmitEditing={() => handleSearch()} returnKeyType="search" />
          </View>
          <TouchableOpacity onPress={() => handleSearch()} style={styles.searchButton}>
            <Ionicons name="search" size={18} color={Signal.waveInk} />
            <Text style={styles.searchButtonText}>Search</Text>
          </TouchableOpacity>
        </View>

        {previewItem ? (
          <View style={styles.previewContainer}>
            <View style={styles.previewHeader}>
              <TouchableOpacity onPress={handleBack} style={styles.backButton}>
                <Ionicons name="chevron-back" size={22} color={Signal.ink} />
                <Text style={styles.backButtonText}>Back</Text>
              </TouchableOpacity>
              <Text style={styles.previewTitle}>Preview</Text>
              <View style={{ width: 60 }} />
            </View>
            <View style={styles.previewContent}>
              <View style={styles.previewMeta}>
                <Text style={styles.previewTrack}>{previewItem.trackName}</Text>
                <Text style={styles.previewArtist}>{previewItem.artistName}</Text>
                <View style={styles.badgesContainer}>
                  <View style={[styles.badge,
                    previewItem.source.includes('LRCLIB') ? styles.badgeLrc :
                    previewItem.source.includes('JioSaavn') ? styles.badgeSaavn :
                    previewItem.source.includes('Lyrica') ? styles.badgeLyrica : styles.badgeGenius
                  ]}>
                    <Text style={styles.badgeText}>{previewItem.source}</Text>
                  </View>
                  <View style={[styles.badge, previewItem.type === 'synced' ? styles.badgeSynced : styles.badgeLow]}>
                    <Text style={[styles.badgeText, previewItem.type === 'synced' && styles.badgeTextOn]}>{previewItem.type === 'synced' ? 'Synced' : 'Not synced'}</Text>
                  </View>
                </View>
              </View>
              <ScrollView style={styles.previewScroll} contentContainerStyle={styles.previewScrollContent}>
                <TextInput style={styles.previewInput} value={editedLyrics} onChangeText={setEditedLyrics}
                  multiline scrollEnabled={false} textAlignVertical="top" autoCapitalize="none" autoCorrect={false} />
              </ScrollView>
            </View>
            <View style={styles.previewFooter}>
              <TouchableOpacity style={styles.applyButton} onPress={handleApply}>
                <Text style={styles.applyButtonText}>Use these lyrics</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={Signal.wave} />
            <Text style={styles.loadingText}>{statusMessage}</Text>
          </View>
        ) : (
          <FlatList
            data={results} renderItem={renderItem} keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Ionicons name="musical-notes-outline" size={40} color={Signal.inkFaint} />
                <Text style={styles.emptyText}>No lyrics found</Text>
                <Text style={styles.emptySubText}>Try the title without extras like “(From …)”</Text>
              </View>
            }
          />
        )}
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Signal.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16 },
  headerTitle: { fontSize: 20, fontWeight: '700', color: Signal.ink },
  closeButton: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: Glass.fillLight, borderWidth: StyleSheet.hairlineWidth, borderColor: Glass.hairline },
  searchContainer: { paddingHorizontal: 16, paddingBottom: 8, gap: 10 },
  inputRow: { flexDirection: 'row' },
  searchInput: { flex: 1, backgroundColor: Glass.fillLight, borderRadius: Radius.well, borderWidth: StyleSheet.hairlineWidth, borderColor: Glass.hairline, paddingHorizontal: 16, paddingVertical: 12, color: Signal.ink, fontSize: 16 },
  searchButton: { borderRadius: Radius.pill, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: Signal.wave },
  searchButtonText: { color: Signal.waveInk, fontSize: 15, fontWeight: '700' },
  listContent: { padding: 16 },
  resultItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: Glass.fill, borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, borderColor: Glass.hairline, padding: 16, marginBottom: 10 },
  resultContent: { flex: 1, marginRight: 12 },
  resultTitle: { fontSize: 16, fontWeight: '600', color: Signal.ink, marginBottom: 3 },
  resultArtist: { fontSize: 13, color: Signal.inkMuted, marginBottom: 8 },
  badgesContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 6 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: Radius.pill, flexDirection: 'row', alignItems: 'center', backgroundColor: Glass.fillLight, borderWidth: StyleSheet.hairlineWidth, borderColor: Glass.hairline },
  badgeLrc: {},
  badgeSaavn: {},
  badgeLyrica: {},
  badgeGenius: {},
  badgeSynced: { backgroundColor: Signal.wave, borderColor: Signal.wave },
  badgeHigh: {},
  badgeLow: {},
  badgeText: { fontSize: 11, fontWeight: '600', color: Signal.inkSoft },
  badgeTextOn: { color: Signal.waveInk },
  matchReason: { fontSize: 12, color: Signal.inkMuted },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingText: { color: Signal.inkMuted, marginTop: 12, fontSize: 14 },
  emptyContainer: { alignItems: 'center', justifyContent: 'center', padding: 40 },
  emptyText: { color: Signal.ink, fontSize: 17, fontWeight: '600', marginTop: 14 },
  emptySubText: { color: Signal.inkMuted, marginTop: 6, textAlign: 'center' },
  previewContainer: { flex: 1, backgroundColor: Signal.bg },
  previewHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 12 },
  backButton: { flexDirection: 'row', alignItems: 'center', padding: 4 },
  backButtonText: { color: Signal.ink, fontSize: 16, marginLeft: 2 },
  previewTitle: { color: Signal.ink, fontSize: 17, fontWeight: '600' },
  previewContent: { flex: 1, paddingHorizontal: 16 },
  previewMeta: { marginBottom: 12, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Glass.hairline },
  previewTrack: { color: Signal.ink, fontSize: 20, fontWeight: '700', marginBottom: 3 },
  previewArtist: { color: Signal.inkSoft, fontSize: 15, marginBottom: 8 },
  previewScroll: { flex: 1 },
  previewScrollContent: { paddingBottom: 24 },
  previewInput: { color: Signal.inkSoft, fontSize: 15, lineHeight: 23, minHeight: 300, padding: 0 },
  previewFooter: { padding: 16 },
  applyButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 14, borderRadius: Radius.pill, backgroundColor: Signal.wave },
  applyButtonText: { color: Signal.waveInk, fontSize: 16, fontWeight: '700' },
});
