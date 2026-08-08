/**
 * LyricFlow - Search Screen
 * Real-time search with filter chips
 */

import React, { useState, useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { TabScreenProps } from '../types/navigation';
import { useSongsStore } from '../store/songsStore';
import { usePlayerStore } from '../store/playerStore';
import { useSettingsStore } from '../store/settingsStore';
import { useThemeColors, useIsDark } from '../contexts/ThemeContext';
import { Song } from '../types/song';
import SearchHeader from '../components/SearchHeader';
import SearchFilterChips from '../components/SearchFilterChips';
import SearchRecentSearches from '../components/SearchRecentSearches';
import SearchResultsList from '../components/SearchResultsList';
import { safeGoBack } from '../utils/navigationService';

type Props = TabScreenProps<'Search'>;

const SearchScreen: React.FC<Props> = ({ navigation }) => {
  const colors = useThemeColors();
  const isDark = useIsDark();
  const [query, setQuery] = useState('');
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [results, setResults] = useState<Song[]>([]);
  const [filterAudio, setFilterAudio] = useState<'all' | 'audio' | 'no-audio'>('all');
  const [filterTimestamp, setFilterTimestamp] = useState<'all' | 'timestamp' | 'no-timestamp'>('all');
  const searchSongs = useSongsStore(state => state.searchSongs);
  const setCurrentSong = useSongsStore(state => state.setCurrentSong);
  const toggleLike = useSongsStore(state => state.toggleLike);
  const setMiniPlayerHidden = usePlayerStore(state => state.setMiniPlayerHidden);
  const playerCurrentSong = usePlayerStore(state => state.currentSong);
  const playInMiniPlayerOnly = useSettingsStore(state => state.playInMiniPlayerOnly);

  const handleSearch = useCallback(async (text: string) => {
    setQuery(text);
    if (text.trim().length > 0) {
      let found = await searchSongs(text);

      if (filterAudio === 'audio') {
        found = found.filter(s => s.audioUri);
      } else if (filterAudio === 'no-audio') {
        found = found.filter(s => !s.audioUri);
      }

      if (filterTimestamp === 'timestamp') {
        found = found.filter(s => s.lyrics.some(l => l.timestamp > 0));
      } else if (filterTimestamp === 'no-timestamp') {
        found = found.filter(s => !s.lyrics.some(l => l.timestamp > 0));
      }

      setResults(found);
    } else {
      setResults([]);
    }
  }, [searchSongs, filterAudio, filterTimestamp]);

  React.useEffect(() => {
    setMiniPlayerHidden(true);
    return () => setMiniPlayerHidden(false);
  }, [setMiniPlayerHidden]);

  React.useEffect(() => {
    if (query.trim().length > 0) {
      handleSearch(query);
    }
  }, [filterAudio, filterTimestamp, query, handleSearch]);

  const handleSearchSubmit = useCallback(() => {
    if (query.trim().length === 0) return;
    setRecentSearches(prev => {
      const newHistory = [query.trim(), ...prev.filter(q => q !== query.trim())];
      return newHistory.slice(0, 8);
    });
  }, [query]);

  const handleRecentSearchPress = useCallback((searchText: string) => {
    handleSearch(searchText);
  }, [handleSearch]);

  const handleSongPress = useCallback((song: Song) => {
    setRecentSearches(prev => {
      const newHistory = [song.title, ...prev.filter(q => q !== song.title)];
      return newHistory.slice(0, 8);
    });

    const isCurrentlyPlaying = playerCurrentSong?.id === song.id;

    if (playInMiniPlayerOnly) {
      if (isCurrentlyPlaying) {
        setMiniPlayerHidden(true);
        navigation.navigate('NowPlaying', { songId: song.id });
      } else {
        setCurrentSong(song);
        usePlayerStore.getState().setInitialSong(song);
        usePlayerStore.getState().loadSong(song.id);
      }
    } else {
      setCurrentSong(song);
      setMiniPlayerHidden(true);
      usePlayerStore.getState().setInitialSong(song);
      usePlayerStore.getState().loadSong(song.id);
      navigation.navigate('NowPlaying', { songId: song.id });
    }
  }, [navigation, setCurrentSong, setMiniPlayerHidden, playInMiniPlayerOnly, playerCurrentSong?.id]);

  return (
    <View style={[styles.container, { backgroundColor: isDark ? '#000000' : colors.background }]}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <SearchHeader
          query={query}
          onQueryChange={handleSearch}
          onSubmit={handleSearchSubmit}
          onGoBack={() => {
            // Tab root has no stack history — clear the query instead of GO_BACK noise.
            if (navigation.canGoBack()) {
              safeGoBack(navigation);
            } else if (query.length > 0) {
              setQuery('');
              setResults([]);
            }
          }}
          isDark={isDark}
          colors={colors}
        />

        {query.length > 0 && (
          <SearchFilterChips
            filterAudio={filterAudio}
            setFilterAudio={setFilterAudio}
            filterTimestamp={filterTimestamp}
            setFilterTimestamp={setFilterTimestamp}
            isDark={isDark}
            colors={colors}
          />
        )}

        {query.length === 0 ? (
          <SearchRecentSearches
            searches={recentSearches}
            onPress={handleRecentSearchPress}
            isDark={isDark}
            colors={colors}
          />
        ) : (
          <SearchResultsList
            results={results}
            onSongPress={handleSongPress}
            toggleLike={toggleLike}
            isDark={isDark}
            colors={colors}
          />
        )}
      </SafeAreaView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
});

export default SearchScreen;
