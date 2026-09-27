/**
 * YouTube Music shelves, drawn the way Echo Music draws them: a heading
 * (with its small strapline), then either song rows or a horizontal run of
 * cards — square covers for songs, albums and playlists, round photos for
 * artists.
 */
import React, { memo } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Artwork from '../allegra/Artwork';
import { Shelf, YTItem } from '../../services/ytmusic/browse';
import { YTSong } from '../../services/ytmusic/parsers';

const CARD = 150;
const ARTIST = 124;

export interface ShelfActions {
  /** Open an artist, album or playlist page. */
  onOpen: (item: Exclude<YTItem, { kind: 'song' }>) => void;
  /** Play these songs starting at `index`. */
  onPlay: (songs: YTSong[], index: number) => void;
  /** The song currently being resolved (spinner on its row). */
  pendingId?: string | null;
}

const songsOf = (items: YTItem[]): YTSong[] =>
  items.flatMap(i => (i.kind === 'song' ? [i.song] : []));

export const SongRow: React.FC<{ song: YTSong; onPress: () => void; pending?: boolean; index?: number }> = memo(({ song, onPress, pending }) => (
  <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel={`Play ${song.title}`}>
    <Artwork uri={song.thumbnail} title={song.title} artist={song.artists.join(', ')} size={52} style={styles.rowArt} />
    <View style={styles.rowText}>
      <Text style={styles.rowTitle} numberOfLines={1}>{song.title}</Text>
      <Text style={styles.rowSub} numberOfLines={1}>{song.artists.join(', ')}{song.album ? ` · ${song.album}` : ''}</Text>
    </View>
    {pending ? <Ionicons name="ellipsis-horizontal" size={18} color="rgba(255,255,255,0.7)" /> : null}
  </Pressable>
));
SongRow.displayName = 'SongRow';

const Card: React.FC<{ item: YTItem; onPress: () => void }> = memo(({ item, onPress }) => {
  const round = item.kind === 'artist';
  const title = item.kind === 'song' ? item.song.title : item.title;
  const sub = item.kind === 'song' ? item.song.artists.join(', ') : item.subtitle;
  const art = item.kind === 'song' ? item.song.thumbnail : item.thumbnail;
  const size = round ? ARTIST : CARD;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [{ width: size }, pressed && styles.pressedCard]} accessibilityRole="button" accessibilityLabel={title}>
      <Artwork uri={art} title={title} size={size} style={[styles.cardArt, { width: size, height: size, borderRadius: round ? size / 2 : 10 }]} />
      <Text style={[styles.cardTitle, round && styles.center]} numberOfLines={round ? 1 : 2}>{title}</Text>
      {sub && !round ? <Text style={styles.cardSub} numberOfLines={1}>{sub}</Text> : null}
    </Pressable>
  );
});
Card.displayName = 'Card';

export const ShelfHeader: React.FC<{ title: string; strapline?: string; onMore?: () => void }> = ({ title, strapline, onMore }) => (
  <View style={styles.header}>
    <View style={styles.flex}>
      {strapline ? <Text style={styles.strapline} numberOfLines={1}>{strapline}</Text> : null}
      <Text style={styles.title} numberOfLines={1}>{title}</Text>
    </View>
    {onMore ? (
      <Pressable onPress={onMore} hitSlop={12} accessibilityRole="button" accessibilityLabel={`More ${title}`}>
        <Ionicons name="arrow-forward" size={22} color="rgba(255,255,255,0.8)" />
      </Pressable>
    ) : null}
  </View>
);

/** One shelf. `rows` draws song lists vertically (an artist's top songs). */
export const BrowseShelf: React.FC<{ shelf: Shelf; rows?: boolean; maxRows?: number; onMore?: () => void } & ShelfActions> = ({
  shelf, rows = false, maxRows = 5, onMore, onOpen, onPlay, pendingId,
}) => {
  const songs = songsOf(shelf.items);
  const allSongs = songs.length === shelf.items.length;
  if (rows && allSongs) {
    return (
      <View style={styles.shelf}>
        <ShelfHeader title={shelf.title} strapline={shelf.strapline} onMore={onMore} />
        {songs.slice(0, maxRows).map((song, i) => (
          <SongRow key={`${song.videoId}-${i}`} song={song} pending={pendingId === song.videoId} onPress={() => onPlay(songs, i)} />
        ))}
      </View>
    );
  }
  return (
    <View style={styles.shelf}>
      <ShelfHeader title={shelf.title} strapline={shelf.strapline} onMore={onMore} />
      <FlatList
        horizontal
        data={shelf.items}
        keyExtractor={(item, i) => `${item.kind === 'song' ? item.song.videoId : item.browseId}-${i}`}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.carousel}
        initialNumToRender={4}
        windowSize={5}
        renderItem={({ item }) => (
          <Card
            item={item}
            onPress={() => {
              if (item.kind === 'song') onPlay(songs, Math.max(0, songs.findIndex(s => s.videoId === item.song.videoId)));
              else onOpen(item);
            }}
          />
        )}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1 },
  shelf: { marginTop: 26 },
  header: { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 20, marginBottom: 12, gap: 12 },
  strapline: { color: 'rgba(255,255,255,0.6)', fontSize: 13, fontWeight: '600', marginBottom: 2 },
  title: { color: '#fff', fontSize: 22, fontWeight: '700' },
  carousel: { paddingHorizontal: 20, gap: 14 },
  cardArt: { overflow: 'hidden' },
  cardTitle: { color: '#fff', fontSize: 14, fontWeight: '600', marginTop: 8 },
  cardSub: { color: 'rgba(255,255,255,0.6)', fontSize: 13, marginTop: 2 },
  center: { textAlign: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 7, gap: 12 },
  rowArt: { width: 52, height: 52, borderRadius: 8, overflow: 'hidden' },
  rowText: { flex: 1 },
  rowTitle: { color: '#fff', fontSize: 16, fontWeight: '600' },
  rowSub: { color: 'rgba(255,255,255,0.6)', fontSize: 13, marginTop: 2 },
  pressed: { backgroundColor: 'rgba(255,255,255,0.06)' },
  pressedCard: { opacity: 0.8, transform: [{ scale: 0.98 }] },
});
