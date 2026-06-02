import React, { useCallback } from 'react';
import { View, Text, FlatList, StyleSheet } from 'react-native';
import SearchResultItem from './SearchResultItem';
import { SearchResultsStrings } from '../constants/uiStrings';
import { Song } from '../types/song';

interface SearchResultsListProps {
  results: Song[];
  onSongPress: (song: Song) => void;
  toggleLike: (id: string) => void;
  isDark: boolean;
  colors: {
    textPrimary: string;
    textSecondary: string;
    textMuted: string;
    card: string;
    cardHover: string;
    error: string;
  };
}

const SearchResultsList: React.FC<SearchResultsListProps> = ({ results, onSongPress, toggleLike, isDark, colors }) => {
  const renderResult = useCallback(({ item }: { item: Song }) => (
    <SearchResultItem
      item={item}
      onPress={onSongPress}
      toggleLike={toggleLike}
      isDark={isDark}
      colors={colors}
    />
  ), [onSongPress, toggleLike, isDark, colors]);

  return (
    <FlatList
      data={results}
      keyExtractor={(item) => item.id}
      renderItem={renderResult}
      contentContainerStyle={styles.resultsContent}
      ListEmptyComponent={
        <View style={styles.emptyResults}>
          <Text style={[styles.emptyText, { color: colors.textMuted }]}>{SearchResultsStrings.noResultsFound}</Text>
        </View>
      }
    />
  );
};

const styles = StyleSheet.create({
  resultsContent: {
    paddingBottom: 100,
  },
  emptyResults: {
    padding: 48,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
  },
});

export default React.memo(SearchResultsList);
