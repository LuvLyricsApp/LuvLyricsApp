import React from 'react';
import { View, Text, Pressable, StyleSheet, TextInput, LayoutAnimation } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { RecentlyPlayedGrid, RecentlyPlayedMode } from './RecentlyPlayedGrid';
import { Song } from '../types/song';

interface LibraryHeaderProps {
  hasSongs: boolean;
  onSongPress: (song: Song) => void;
  onSongLongPress: (song: Song) => void;
  onLikePress: (id: string) => void;
  onMagicPress: (song: Song) => void;
  searchQuery: string;
  onSearchQueryChange: (text: string) => void;
  isSearchFocused: boolean;
  onSearchFocus: () => void;
  onSearchCancel: () => void;
  currentSong: Song | null;
  recentlyPlayedMode: RecentlyPlayedMode;
  onHeaderLayout: (height: number) => void;
  isDark: boolean;
  colors: {
    textPrimary: string;
    textSecondary: string;
    textMuted: string;
    border: string;
  };
}

const LibraryHeader: React.FC<LibraryHeaderProps> = ({
  hasSongs,
  onSongPress,
  onSongLongPress,
  onLikePress,
  onMagicPress,
  searchQuery,
  onSearchQueryChange,
  isSearchFocused,
  onSearchFocus,
  onSearchCancel,
  currentSong,
  recentlyPlayedMode,
  onHeaderLayout,
  isDark,
  colors,
}) => {
  if (!hasSongs) return null;

  return (
    <View>
      <View onLayout={(e) => onHeaderLayout(e.nativeEvent.layout.height)}>
        <RecentlyPlayedGrid
          onSongPress={onSongPress}
          onSongLongPress={onSongLongPress}
          onLikePress={onLikePress}
          onMagicPress={onMagicPress}
          mode={recentlyPlayedMode}
          currentSong={currentSong}
          style={styles.recentlyPlayedGrid}
        />
      </View>
      <View style={styles.searchRow}>
        <View style={[styles.searchBarContainer, styles.searchBarFlex, {
          backgroundColor: isDark ? (isSearchFocused ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.08)') : (isSearchFocused ? '#E0E0E5' : '#E8E8ED'),
          borderColor: isDark ? 'rgba(255,255,255,0.1)' : colors.border,
        }]}>
          <Ionicons name="search" size={20} color={isDark ? '#FFF' : colors.textMuted} style={styles.searchIcon} />
          <TextInput
            style={[styles.searchInput, { color: isDark ? '#fff' : colors.textPrimary }]}
            placeholder="Filter local library..."
            placeholderTextColor={isDark ? 'rgba(255,255,255,0.4)' : colors.textMuted}
            value={searchQuery}
            onFocus={onSearchFocus}
            returnKeyType="search"
            onChangeText={(text) => {
              onSearchQueryChange(text);
              if (!isSearchFocused && text.length > 0) {
                LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
              }
            }}
          />
          {searchQuery ? (
            <Pressable onPress={() => onSearchQueryChange('')} style={styles.clearButton}>
              <Ionicons name="close-circle" size={18} color={colors.textMuted} />
            </Pressable>
          ) : null}
        </View>
        {isSearchFocused && (
          <Pressable onPress={onSearchCancel} style={styles.cancelButton}>
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  recentlyPlayedGrid: { marginBottom: 4 },
  searchRow: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 20, marginTop: 4, marginBottom: 16 },
  searchBarFlex: { flex: 1, marginHorizontal: 0, marginBottom: 0 },
  searchBarContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 12, height: 48, marginBottom: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  searchIcon: { marginLeft: 12 },
  searchInput: { flex: 1, color: '#fff', fontSize: 16, height: '100%', paddingHorizontal: 12 },
  clearButton: { padding: 8 },
  cancelButton: { marginLeft: 12 },
  cancelText: { color: '#1DB954', fontSize: 16, fontWeight: '600' },
});

export default React.memo(LibraryHeader);
