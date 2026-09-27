/**
 * Stream home building blocks, modelled on the layouts every major player has
 * settled on rather than on a landing page:
 *
 *   MoodChips      YouTube Music's filter row — rounded-rect chips, one selected
 *   ShortcutGrid   Spotify's two-column "jump back in" grid (up to six)
 *   QuickPicks     YouTube Music's paged columns of four song rows
 *   SongRow        one track: art, title, artist, a single trailing action
 *   CoverShelf     horizontal shelf of plain square covers with title + artist
 *
 * Flat surfaces, no glass, no numbered ranks, no play disc on every cover — the
 * whole cover is the play target. The playing song is marked with the signal
 * colour and a speaker glyph on its art.
 */
import React from 'react';
import { FlatList, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Signal, Space } from '../../constants/allegraTheme';
import Artwork from '../allegra/Artwork';
import { Tactile } from '../allegra/motion';

// Matches SectionHeading's inset so headings and content share an edge.
export const GUTTER = Space.lg - 4;
const SURFACE = 'rgba(255, 255, 255, 0.07)';
const SURFACE_ON = 'rgba(255, 255, 255, 0.12)';

export interface TrackItem {
  key: string;
  title: string;
  artist?: string;
  artwork?: string;
  isCurrent: boolean;
}

const PlayingMark: React.FC<{ size: number }> = ({ size }) => (
  <View style={[StyleSheet.absoluteFill, styles.playingMark]}>
    <Ionicons name="volume-medium" size={size} color={Signal.wave} />
  </View>
);

// ─── Mood chips ────────────────────────────────────────────────────────────

export const MoodChips: React.FC<{
  moods: readonly string[];
  selected: string | null;
  onSelect: (mood: string | null) => void;
}> = ({ moods, selected, onSelect }) => (
  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} keyboardShouldPersistTaps="handled">
    {moods.map(mood => {
      const on = mood === selected;
      return (
        <Tactile
          key={mood}
          onPress={() => onSelect(on ? null : mood)}
          pressScale={0.96}
          accessibilityRole="button"
          accessibilityState={{ selected: on }}
          style={[styles.chip, on && styles.chipOn]}
        >
          <Text style={[styles.chipText, on && styles.chipTextOn]}>{mood}</Text>
        </Tactile>
      );
    })}
  </ScrollView>
);

// ─── Shortcut grid ─────────────────────────────────────────────────────────

export const ShortcutGrid: React.FC<{
  items: TrackItem[];
  onPress: (index: number) => void;
  onLongPress?: (index: number) => void;
}> = ({ items, onPress, onLongPress }) => (
  <View style={styles.grid}>
    {items.slice(0, 6).map((item, i) => (
      <View key={item.key} style={styles.gridCell}>
        <Tactile
          onPress={() => onPress(i)}
          onLongPress={onLongPress ? () => onLongPress(i) : undefined}
          pressScale={0.97}
          accessibilityRole="button"
          accessibilityLabel={`${item.title}${item.artist ? `, ${item.artist}` : ''}`}
          style={styles.shortcut}
        >
          <View style={styles.shortcutArt}>
            <Artwork uri={item.artwork} title={item.title} artist={item.artist} size={56} style={StyleSheet.absoluteFill} />
            {item.isCurrent ? <PlayingMark size={18} /> : null}
          </View>
          <Text style={[styles.shortcutTitle, item.isCurrent && styles.current]} numberOfLines={2}>{item.title}</Text>
        </Tactile>
      </View>
    ))}
  </View>
);

// ─── Song row ──────────────────────────────────────────────────────────────

export const SongRow: React.FC<{
  item: TrackItem;
  onPress: () => void;
  onLongPress?: () => void;
  onSave?: () => void;
}> = ({ item, onPress, onLongPress, onSave }) => (
  <View style={styles.row}>
    <Tactile
      onPress={onPress}
      onLongPress={onLongPress}
      pressScale={0.985}
      accessibilityRole="button"
      accessibilityLabel={`${item.title}${item.artist ? `, ${item.artist}` : ''}`}
      wrapperStyle={styles.flex}
      style={styles.rowMain}
    >
      <View style={styles.rowArt}>
        <Artwork uri={item.artwork} title={item.title} artist={item.artist} size={52} style={StyleSheet.absoluteFill} />
        {item.isCurrent ? <PlayingMark size={18} /> : null}
      </View>
      <View style={styles.flex}>
        <Text style={[styles.rowTitle, item.isCurrent && styles.current]} numberOfLines={1}>{item.title}</Text>
        {item.artist ? <Text style={styles.rowArtist} numberOfLines={1}>{item.artist}</Text> : null}
      </View>
    </Tactile>
    {onSave ? (
      <Tactile onPress={onSave} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Download ${item.title}`} style={styles.rowAction}>
        <Ionicons name="arrow-down-circle-outline" size={22} color={Signal.inkMuted} />
      </Tactile>
    ) : null}
  </View>
);

// ─── Quick picks: paged columns of four ────────────────────────────────────

const ROWS_PER_COLUMN = 4;

export const QuickPicks: React.FC<{
  items: TrackItem[];
  onPress: (index: number) => void;
  onLongPress?: (index: number) => void;
  onSave?: (index: number) => void;
}> = ({ items, onPress, onLongPress, onSave }) => {
  const { width } = useWindowDimensions();
  // The next column peeks in, so it reads as swipeable without a hint.
  const columnWidth = width - GUTTER * 2 - 40;
  const columns: number[][] = [];
  for (let i = 0; i < items.length; i += ROWS_PER_COLUMN) {
    columns.push(items.slice(i, i + ROWS_PER_COLUMN).map((_, j) => i + j));
  }
  return (
    <FlatList
      horizontal
      data={columns}
      keyExtractor={col => `col-${col[0]}`}
      showsHorizontalScrollIndicator={false}
      snapToInterval={columnWidth + Space.xs}
      decelerationRate="fast"
      contentContainerStyle={styles.columns}
      renderItem={({ item: col }) => (
        <View style={{ width: columnWidth }}>
          {col.map(i => (
            <SongRow
              key={items[i].key}
              item={items[i]}
              onPress={() => onPress(i)}
              onLongPress={onLongPress ? () => onLongPress(i) : undefined}
              onSave={onSave ? () => onSave(i) : undefined}
            />
          ))}
        </View>
      )}
    />
  );
};

// ─── Cover shelf ───────────────────────────────────────────────────────────

const COVER = 148;

export const CoverShelf: React.FC<{
  items: TrackItem[];
  onPress: (index: number) => void;
  onLongPress?: (index: number) => void;
}> = ({ items, onPress, onLongPress }) => (
  <FlatList
    horizontal
    data={items}
    keyExtractor={item => item.key}
    showsHorizontalScrollIndicator={false}
    contentContainerStyle={styles.shelf}
    renderItem={({ item, index }) => (
      <Tactile
        onPress={() => onPress(index)}
        onLongPress={onLongPress ? () => onLongPress(index) : undefined}
        pressScale={0.97}
        accessibilityRole="button"
        accessibilityLabel={`${item.title}${item.artist ? `, ${item.artist}` : ''}`}
        style={styles.cover}
      >
        <View style={styles.coverArt}>
          <Artwork uri={item.artwork} title={item.title} artist={item.artist} size={COVER} style={StyleSheet.absoluteFill} />
          {item.isCurrent ? <PlayingMark size={28} /> : null}
        </View>
        <Text style={[styles.coverTitle, item.isCurrent && styles.current]} numberOfLines={1}>{item.title}</Text>
        {item.artist ? <Text style={styles.coverArtist} numberOfLines={1}>{item.artist}</Text> : null}
      </Tactile>
    )}
  />
);

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  current: { color: Signal.wave },
  playingMark: { alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0, 0, 0, 0.45)' },

  chips: { paddingHorizontal: GUTTER, gap: Space.xs },
  chip: {
    height: 34,
    paddingHorizontal: 14,
    borderRadius: 8,
    justifyContent: 'center',
    backgroundColor: SURFACE,
  },
  chipOn: { backgroundColor: Signal.ink },
  chipText: { fontSize: 14, fontWeight: '600', color: Signal.ink },
  chipTextOn: { color: Signal.bg },

  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: GUTTER - 4 },
  gridCell: { width: '50%', padding: 4 },
  shortcut: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 56,
    borderRadius: 6,
    overflow: 'hidden',
    backgroundColor: SURFACE,
  },
  shortcutArt: { width: 56, height: 56 },
  shortcutTitle: { flex: 1, fontSize: 13, lineHeight: 16, fontWeight: '700', color: Signal.ink, paddingHorizontal: 10 },

  columns: { paddingHorizontal: GUTTER, gap: Space.xs },
  row: { flexDirection: 'row', alignItems: 'center' },
  rowMain: { flexDirection: 'row', alignItems: 'center', gap: Space.sm, paddingVertical: 6 },
  rowArt: { width: 52, height: 52, borderRadius: 6, overflow: 'hidden', backgroundColor: SURFACE_ON },
  rowTitle: { fontSize: 16, fontWeight: '600', color: Signal.ink },
  rowArtist: { fontSize: 14, color: Signal.inkMuted, marginTop: 2 },
  rowAction: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },

  shelf: { paddingHorizontal: GUTTER, gap: Space.sm },
  cover: { width: COVER },
  coverArt: { width: COVER, height: COVER, borderRadius: 8, overflow: 'hidden', backgroundColor: SURFACE_ON },
  coverTitle: { fontSize: 14, fontWeight: '600', color: Signal.ink, marginTop: 8 },
  coverArtist: { fontSize: 13, color: Signal.inkMuted, marginTop: 2 },
});
