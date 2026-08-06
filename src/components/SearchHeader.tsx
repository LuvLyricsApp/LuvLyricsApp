import React from 'react';
import { View, TextInput, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface SearchHeaderProps {
  query: string;
  onQueryChange: (text: string) => void;
  onSubmit: () => void;
  onGoBack: () => void;
  isDark: boolean;
  colors: {
    background: string;
    textPrimary: string;
    textSecondary: string;
    card: string;
    border: string;
  };
}

const SearchHeader: React.FC<SearchHeaderProps> = ({ query, onQueryChange, onSubmit, onGoBack, isDark, colors }) => {
  return (
    <View style={[styles.header, { backgroundColor: isDark ? '#000000' : colors.background }]}>
      <Pressable style={styles.backButton} onPress={onGoBack}>
        <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
      </Pressable>
      <View style={[styles.searchBar, { backgroundColor: isDark ? 'rgba(33,33,33,0.8)' : colors.card, borderColor: isDark ? 'rgba(255,255,255,0.1)' : colors.border }]}>
        <Ionicons name="search" size={20} color={colors.textSecondary} />
        <TextInput
          style={[styles.searchInput, { color: colors.textPrimary }]}
          placeholder="Search songs, albums, artists"
          placeholderTextColor={colors.textSecondary}
          value={query}
          onChangeText={onQueryChange}
          onSubmitEditing={onSubmit}
          autoFocus
        />
        {query.length > 0 && (
          <Pressable onPress={() => onQueryChange('')}>
            <Ionicons name="close-circle" size={20} color={colors.textSecondary} />
          </Pressable>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  backButton: {
    padding: 4,
  },
  searchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 24,
    paddingHorizontal: 16,
    height: 48,
    gap: 8,
    borderWidth: 1,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
  },
});

export default React.memo(SearchHeader);
