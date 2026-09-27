import React from 'react';
import { Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface SearchRecentSearchesProps {
  searches: string[];
  onPress: (search: string) => void;
  isDark: boolean;
  colors: {
    textPrimary: string;
    textSecondary: string;
    textMuted: string;
    divider: string;
  };
}

const SearchRecentSearches: React.FC<SearchRecentSearchesProps> = ({ searches, onPress, isDark, colors }) => {
  return (
    <ScrollView contentContainerStyle={styles.recentSearchesContainer}>
      {searches.length > 0 && (
        <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>Recent searches</Text>
      )}
      {searches.map((item, index) => (
        <Pressable
          key={index}
          style={[styles.recentItem, { borderBottomColor: isDark ? 'rgba(255,255,255,0.05)' : colors.divider }]}
          onPress={() => onPress(item)}
        >
          <Ionicons name="time-outline" size={20} color={colors.textSecondary} />
          <Text style={[styles.recentText, { color: colors.textPrimary }]}>{item}</Text>
          <Ionicons name="arrow-up-outline" size={16} color={colors.textSecondary} style={{ transform: [{ rotate: '-45deg' }] }} />
        </Pressable>
      ))}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  recentSearchesContainer: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 12,
  },
  recentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  recentText: {
    flex: 1,
    fontSize: 16,
    marginLeft: 12,
  },
});

export default React.memo(SearchRecentSearches);
