/**
 * Library — your songs. The Downloads layout (live colour room, play /
 * shuffle, filter, sort, downloads in flight) with what the old Home screen
 * did: recently played, add lyrics, the download queue, and a long press on
 * any song for cover / version / info / lyrics / share / hide / delete.
 *
 * The root of the Library tab; Playlists sit behind the header button.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from '../utils/haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useIsFocused, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { CompositeNavigationProp } from '@react-navigation/native';
import { LibraryStackParamList, RootStackParamList } from '../types/navigation';
import { RecentlyPlayedGrid } from '../components/RecentlyPlayedGrid';
import { DownloadQueueModal } from '../components/DownloadQueueModal';
import { PerformanceHUD } from '../components/PerformanceHUD';
import { useSongActions } from '../components/library/useSongActions';
import DynamicAura from '../components/allegra/DynamicAura';
import { useArtworkPalette } from '../components/allegra/useArtworkPalette';
import { RiseIn } from '../components/allegra/motion';
import { GlassButton, PrimaryButton, SectionHeading, Sleeve } from '../components/allegra/home';
import { Glass, Radius, Signal, Space } from '../constants/allegraTheme';
import { TrackRow } from '../components/stream/StreamItems';
import { useSongsStore } from '../store/songsStore';
import { usePlayerStore } from '../store/playerStore';
import { QueueItem, useDownloadQueueStore } from '../store/downloadQueueStore';
import { Song } from '../types/song';

const LIBRARY_QUEUE_ID = 'library';

type Nav = CompositeNavigationProp<NativeStackNavigationProp<LibraryStackParamList>, NativeStackNavigationProp<RootStackParamList>>;

type SortMode = 'recent' | 'title' | 'artist';

const sorters: Record<SortMode, (a: Song, b: Song) => number> = {
  recent: (a, b) => Date.parse(b.dateCreated) - Date.parse(a.dateCreated),
  title: (a, b) => a.title.localeCompare(b.title),
  artist: (a, b) => (a.artist ?? '').localeCompare(b.artist ?? ''),
};

const LibraryScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();
  const fetchSongs = useSongsStore(s => s.fetchSongs);
  const toggleLike = useSongsStore(s => s.toggleLike);
  const currentSong = usePlayerStore(s => s.currentSong);
  const actions = useSongActions();
  const [queueOpen, setQueueOpen] = useState(false);
  const songs = useSongsStore(s => s.songs);
  const queue = useDownloadQueueStore(s => s.queue);
  const retryItem = useDownloadQueueStore(s => s.retryItem);
  const clearCompleted = useDownloadQueueStore(s => s.clearCompleted);
  const currentSongId = usePlayerStore(s => s.currentSongId);
  const currentCover = usePlayerStore(s => s.currentSong?.coverImageUri);
  const isPlaying = usePlayerStore(s => s.isPlaying);
  const isFocused = useIsFocused();
  const [sort, setSort] = useState<SortMode>('recent');
  const [filter, setFilter] = useState('');

  const downloaded = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    return songs
      .filter(s => !s.isHidden)
      .filter(s => !needle || s.title.toLowerCase().includes(needle) || (s.artist ?? '').toLowerCase().includes(needle))
      .sort(sorters[sort]);
  }, [songs, sort, filter]);

  // The room takes the colour of what's playing, else of the newest download.
  const stageSong = downloaded.find(s => s.coverImageUri) ?? downloaded[0];
  const stageArt = currentCover ?? stageSong?.coverImageUri;
  const palette = useArtworkPalette(stageArt);

  const active = useMemo(() => queue.filter(q => q.status !== 'completed'), [queue]);

  // Songs can change elsewhere (a download lands, lyrics arrive): refresh on focus.
  useEffect(() => navigation.addListener('focus', () => { fetchSongs(); }), [navigation, fetchSongs]);

  const playSong = useCallback((song: Song) => {
    const index = downloaded.findIndex(s => s.id === song.id);
    if (index >= 0) usePlayerStore.getState().setPlaylistQueue(LIBRARY_QUEUE_ID, downloaded, index);
    else usePlayerStore.getState().setPlaylistQueue(LIBRARY_QUEUE_ID, [song], 0);
  }, [downloaded]);
  const doneCount = queue.length - active.length;

  const play = useCallback((index: number, shuffle = false) => {
    if (downloaded.length === 0) return;
    Haptics.selectionAsync().catch(() => {});
    let list = downloaded;
    let start = index;
    if (shuffle) {
      list = [...downloaded];
      for (let i = list.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [list[i], list[j]] = [list[j], list[i]];
      }
      start = 0;
    }
    usePlayerStore.getState().setPlaylistQueue(LIBRARY_QUEUE_ID, list, start);
  }, [downloaded]);

  const totalMinutes = Math.round(downloaded.reduce((sum, s) => sum + (s.duration || 0), 0) / 60);

  const renderActive = (item: QueueItem) => (
    <TrackRow
      key={item.id}
      title={item.song.title}
      artist={item.song.artist}
      artwork={item.song.highResArt}
      meta={item.status === 'failed' ? 'Failed' : item.stageStatus || item.status}
      progress={item.status === 'failed' ? undefined : item.progress}
      onPress={() => {}}
      trailingIcon={item.status === 'failed' ? 'refresh' : undefined}
      trailingLabel="Retry download"
      onTrailingPress={item.status === 'failed' ? () => retryItem(item.id) : undefined}
    />
  );

  const header = (
    <View style={{ paddingTop: insets.top + Space.sm }}>
      <View style={styles.topBar}>
        <Text style={styles.title} accessibilityRole="header">Library</Text>
        <View style={styles.topActions}>
          <Pressable onPress={() => navigation.navigate('AddEditLyrics', {})} hitSlop={8} accessibilityRole="button" accessibilityLabel="Add lyrics" style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}>
            <Ionicons name="add" size={22} color={Signal.ink} />
          </Pressable>
          <Pressable onPress={() => setQueueOpen(true)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Download queue" style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}>
            <Ionicons name="arrow-down" size={20} color={Signal.ink} />
            {active.length > 0 ? <View style={styles.badge}><Text style={styles.badgeText}>{active.length}</Text></View> : null}
          </Pressable>
          <Pressable onPress={() => navigation.navigate('Playlists')} hitSlop={8} accessibilityRole="button" accessibilityLabel="Playlists" style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}>
            <Ionicons name="albums-outline" size={20} color={Signal.ink} />
          </Pressable>
        </View>
      </View>

      <RiseIn style={styles.hero}>
        <View style={styles.heroRow}>
          <Sleeve
            artwork={stageArt}
            title={stageSong?.title ?? 'Library'}
            artist={stageSong?.artist}
            size={112}
            playing={false}
            onPress={() => play(0)}
            label="Play your library"
          />
          <View style={styles.heroMeta}>
            <Text style={styles.meta}>
              {downloaded.length} {downloaded.length === 1 ? 'song' : 'songs'}
              {totalMinutes > 0 ? ` · ${totalMinutes} min` : ''}
            </Text>
            <Text style={styles.metaSoft}>Plays offline, lyrics included</Text>
            <View style={styles.actions}>
              <PrimaryButton compact icon="play" label="Play" onPress={() => play(0)} disabled={downloaded.length === 0} />
              <GlassButton compact icon="shuffle" label="Shuffle" onPress={() => play(0, true)} disabled={downloaded.length === 0} />
            </View>
          </View>
        </View>
      </RiseIn>

      {downloaded.length > 0 ? (
        <>
          <SectionHeading title="Recently played" />
          <RecentlyPlayedGrid
            onSongPress={playSong}
            onSongLongPress={actions.open}
            onLikePress={toggleLike}
            onMagicPress={actions.findLyrics}
            currentSong={currentSong}
            style={styles.recent}
          />
        </>
      ) : null}

      {active.length > 0 ? (
        <>
          <SectionHeading
            title="Downloading"
            subtitle={`${active.length} in progress`}
            action={doneCount > 0 ? 'Clear done' : undefined}
            onAction={doneCount > 0 ? clearCompleted : undefined}
          />
          {active.map(renderActive)}
        </>
      ) : null}

      <View style={styles.filterRow}>
        <View style={styles.filterField}>
          <Ionicons name="search" size={16} color={Signal.inkMuted} />
          <TextInput
            value={filter}
            onChangeText={setFilter}
            placeholder="Filter your songs"
            placeholderTextColor={Signal.inkFaint}
            style={styles.filterInput}
            autoCorrect={false}
            accessibilityLabel="Filter your songs"
          />
        </View>
      </View>
      <View style={styles.chips}>
        {(['recent', 'title', 'artist'] as SortMode[]).map(mode => (
          <Pressable
            key={mode}
            onPress={() => setSort(mode)}
            accessibilityRole="button"
            accessibilityState={{ selected: sort === mode }}
            style={[styles.chip, sort === mode && styles.chipActive]}
          >
            <Text style={[styles.chipText, sort === mode && styles.chipTextActive]}>
              {mode === 'recent' ? 'Recently added' : mode === 'title' ? 'Title' : 'Artist'}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );

  return (
    <View style={styles.screen}>
      <DynamicAura palette={palette} playing={isPlaying} active={isFocused} dim={0.25} />
      <FlatList
        data={downloaded}
        keyExtractor={s => s.id}
        ListHeaderComponent={header}
        keyboardShouldPersistTaps="handled"
        initialNumToRender={14}
        windowSize={9}
        renderItem={({ item, index }) => (
          <TrackRow
            title={item.title}
            artist={item.artist}
            artwork={item.coverImageUri}
            duration={item.duration}
            meta={item.lyrics?.length ? 'Lyrics' : undefined}
            isCurrent={currentSongId === item.id}
            onPress={() => play(index)}
            onLongPress={() => actions.open(item)}
          />
        )}
        ListEmptyComponent={
          <View style={styles.emptyCard}>
            <Ionicons name="cloud-download-outline" size={28} color={Signal.inkMuted} />
            <Text style={styles.emptyTitle}>{filter ? 'No matches' : 'No songs yet'}</Text>
            <Text style={styles.emptyBody}>
              {filter
                ? 'Try a different title or artist.'
                : 'Save any song from Stream or Luvs, or add one with lyrics, and it plays offline from here.'}
            </Text>
          </View>
        }
        contentContainerStyle={{ paddingBottom: 220 }}
      />
      {actions.element}
      <DownloadQueueModal visible={queueOpen} onClose={() => setQueueOpen(false)} />
      <PerformanceHUD />
    </View>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Signal.bg },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Space.md + 4 },
  topActions: { flexDirection: 'row', gap: 8 },
  pressed: { opacity: 0.7 },
  badge: { position: 'absolute', top: -2, right: -2, minWidth: 16, height: 16, borderRadius: 8, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center', backgroundColor: Signal.wave },
  badgeText: { color: Signal.waveInk, fontSize: 10, fontWeight: '700' },
  recent: { marginTop: 4 },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Glass.fill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Glass.hairline,
  },
  hero: { paddingHorizontal: Space.md + 4, marginTop: Space.md },
  title: { fontWeight: '700', fontSize: 34, lineHeight: 38, color: Signal.ink },
  heroRow: { flexDirection: 'row', alignItems: 'center', gap: Space.lg, marginTop: Space.lg },
  heroMeta: { flex: 1, minWidth: 0 },
  meta: { fontWeight: '600', fontSize: 16, color: Signal.ink },
  metaSoft: { fontWeight: '400', fontSize: 13, color: Signal.inkMuted, marginTop: 2 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 14 },
  filterRow: { paddingHorizontal: Space.md, marginTop: Space.lg },
  filterField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    height: 42,
    paddingHorizontal: Space.md,
    borderRadius: Radius.pill,
    backgroundColor: Glass.fill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Glass.hairline,
  },
  filterInput: { flex: 1, color: Signal.ink, fontSize: 15, fontWeight: '400', paddingVertical: 0 },
  chips: { flexDirection: 'row', gap: Space.xs, paddingHorizontal: Space.md, marginTop: Space.sm, marginBottom: Space.xs },
  chip: {
    height: 32,
    paddingHorizontal: 14,
    borderRadius: Radius.pill,
    justifyContent: 'center',
    backgroundColor: Glass.fillLight,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Glass.hairline,
  },
  chipActive: { backgroundColor: Signal.wave, borderColor: Signal.wave },
  chipText: { fontWeight: '600', fontSize: 13, color: Signal.inkSoft },
  chipTextActive: { color: Signal.waveInk },
  emptyCard: {
    marginHorizontal: Space.md,
    marginTop: Space.lg,
    padding: Space.lg,
    borderRadius: Radius.panel,
    backgroundColor: Glass.fill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Glass.hairline,
    alignItems: 'center',
    gap: Space.xs,
  },
  emptyTitle: { fontWeight: '700', fontSize: 18, color: Signal.ink },
  emptyBody: { fontWeight: '400', fontSize: 14, color: Signal.inkMuted, textAlign: 'center' },
});

export default LibraryScreen;
