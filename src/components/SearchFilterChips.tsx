import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface SearchFilterChipsProps {
  filterAudio: 'all' | 'audio' | 'no-audio';
  setFilterAudio: (val: 'all' | 'audio' | 'no-audio') => void;
  filterTimestamp: 'all' | 'timestamp' | 'no-timestamp';
  setFilterTimestamp: (val: 'all' | 'timestamp' | 'no-timestamp') => void;
  isDark: boolean;
  colors: {
    textSecondary: string;
    card: string;
    border: string;
  };
}

const SearchFilterChips: React.FC<SearchFilterChipsProps> = ({ filterAudio, setFilterAudio, filterTimestamp, setFilterTimestamp, isDark, colors }) => {
  return (
    <View style={styles.filterChips}>
      <Pressable
        style={[styles.chip, { backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : colors.card, borderColor: isDark ? 'rgba(255,255,255,0.1)' : colors.border }, filterAudio === 'audio' && styles.chipActive]}
        onPress={() => setFilterAudio(filterAudio === 'audio' ? 'all' : 'audio')}
      >
        <Ionicons name="musical-note" size={16} color={filterAudio === 'audio' ? '#fff' : colors.textSecondary} />
        <Text style={[styles.chipText, { color: filterAudio === 'audio' ? '#fff' : colors.textSecondary }, filterAudio === 'audio' && styles.chipTextActive]}>Audio</Text>
      </Pressable>
      <Pressable
        style={[styles.chip, { backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : colors.card, borderColor: isDark ? 'rgba(255,255,255,0.1)' : colors.border }, filterAudio === 'no-audio' && styles.chipActive]}
        onPress={() => setFilterAudio(filterAudio === 'no-audio' ? 'all' : 'no-audio')}
      >
        <Ionicons name="musical-note-outline" size={16} color={filterAudio === 'no-audio' ? '#fff' : colors.textSecondary} />
        <Text style={[styles.chipText, { color: filterAudio === 'no-audio' ? '#fff' : colors.textSecondary }, filterAudio === 'no-audio' && styles.chipTextActive]}>No Audio</Text>
      </Pressable>
      <Pressable
        style={[styles.chip, { backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : colors.card, borderColor: isDark ? 'rgba(255,255,255,0.1)' : colors.border }, filterTimestamp === 'timestamp' && styles.chipActive]}
        onPress={() => setFilterTimestamp(filterTimestamp === 'timestamp' ? 'all' : 'timestamp')}
      >
        <Ionicons name="time" size={16} color={filterTimestamp === 'timestamp' ? '#fff' : colors.textSecondary} />
        <Text style={[styles.chipText, { color: filterTimestamp === 'timestamp' ? '#fff' : colors.textSecondary }, filterTimestamp === 'timestamp' && styles.chipTextActive]}>Timestamped</Text>
      </Pressable>
      <Pressable
        style={[styles.chip, { backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : colors.card, borderColor: isDark ? 'rgba(255,255,255,0.1)' : colors.border }, filterTimestamp === 'no-timestamp' && styles.chipActive]}
        onPress={() => setFilterTimestamp(filterTimestamp === 'no-timestamp' ? 'all' : 'no-timestamp')}
      >
        <Ionicons name="time-outline" size={16} color={filterTimestamp === 'no-timestamp' ? '#fff' : colors.textSecondary} />
        <Text style={[styles.chipText, { color: filterTimestamp === 'no-timestamp' ? '#fff' : colors.textSecondary }, filterTimestamp === 'no-timestamp' && styles.chipTextActive]}>No Timestamp</Text>
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  filterChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  chipActive: {
    backgroundColor: '#2E2E2E',
    borderColor: 'rgba(255,255,255,0.14)',
  },
  chipText: {
    fontSize: 14,
    fontWeight: '600',
  },
  chipTextActive: {
    color: '#fff',
  },
});

export default React.memo(SearchFilterChips);
