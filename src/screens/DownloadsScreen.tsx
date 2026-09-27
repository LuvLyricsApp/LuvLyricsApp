/**
 * Downloads — everything that plays offline, plus what is downloading now.
 *
 * Lives inside the Library tab's stack so the tab bar and mini player stay on
 * screen. Songs play through the normal library queue; in-flight downloads
 * show a progress hairline and can be retried when they fail.
 */
import React, { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Glass, Radius, Signal, Space } from '../constants/allegraTheme';
import { SectionHeader, TrackRow } from '../components/stream/StreamItems';
import { useSongsStore } from '../store/songsStore';
import { usePlayerStore } from '../store/playerStore';
import { QueueItem, useDownloadQueueStore } from '../store/downloadQueueStore';
import { Song } from '../types/song';
import { isOnDevice } from '../services/stream/streamSong';

const DOWNLOADS_QUEUE_ID = 'downloads';

type SortMode = 'recent' | 'title' | 'artist';

const sorters: Record<SortMode, (a: Song, b: Song) => number> = {
  recent: (a, b) => Date.parse(b.dateCreated) - Date.parse(a.dateCreated),
  title: (a, b) => a.title.localeCompare(b.title),
  artist: (a, b) => (a.artist ?? '').localeCompare(b.artist ?? ''),
};

const DownloadsScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const songs = useSongsStore(s => s.songs);
  const queue = useDownloadQueueStore(s => s.queue);
  const retryItem = useDownloadQueueStore(s => s.retryItem);
  const clearCompleted = useDownloadQueueStore(s => s.clearCompleted);
  const currentSongId = usePlayerStore(s => s.currentSongId);
  const [sort, setSort] = useState<SortMode>('recent');
  const [filter, setFilter] = useState('');

  const downloaded = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    return songs
      .filter(s => isOnDevice(s.audioUri) && !s.isHidden)
      .filter(s => !needle || s.title.toLowerCase().includes(needle) || (s.artist ?? '').toLowerCase().includes(needle))
      .sort(sorters[sort]);
  }, [songs, sort, filter]);

  const active = useMemo(() => queue.filter(q => q.status !== 'completed'), [queue]);
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
    usePlayerStore.getState().setPlaylistQueue(DOWNLOADS_QUEUE_ID, list, start);
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
        <Pressable
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel="Back"
          style={({ pressed }) => [styles.iconButton, pressed && { opacity: 0.7 }]}
        >
          <Ionicons name="chevron-back" size={22} color={Signal.ink} />
        </Pressable>
      </View>

      <View style={styles.hero}>
        <Text style={styles.eyebrow}>ON THIS DEVICE</Text>
        <Text style={styles.title}>Downloads</Text>
        <Text style={styles.meta}>
          {downloaded.length} {downloaded.length === 1 ? 'song' : 'songs'}
          {totalMinutes > 0 ? ` · ${totalMinutes} min` : ''} · plays offline
        </Text>
        <View style={styles.actions}>
          <Pressable
            onPress={() => play(0)}
            disabled={downloaded.length === 0}
            accessibilityRole="button"
            accessibilityLabel="Play all downloads"
            style={({ pressed }) => [styles.primary, pressed && styles.pressed, downloaded.length === 0 && styles.disabled]}
          >
            <Ionicons name="play" size={18} color={Signal.waveInk} />
            <Text style={styles.primaryText}>Play</Text>
          </Pressable>
          <Pressable
            onPress={() => play(0, true)}
            disabled={downloaded.length === 0}
            accessibilityRole="button"
            accessibilityLabel="Shuffle downloads"
            style={({ pressed }) => [styles.secondary, pressed && styles.pressed, downloaded.length === 0 && styles.disabled]}
          >
            <Ionicons name="shuffle" size={18} color={Signal.ink} />
            <Text style={styles.secondaryText}>Shuffle</Text>
          </Pressable>
        </View>
      </View>

      {active.length > 0 ? (
        <>
          <SectionHeader
            subtitle={`${active.length} in progress`}
            title="Downloading"
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
            placeholder="Filter downloads"
            placeholderTextColor={Signal.inkFaint}
            style={styles.filterInput}
            autoCorrect={false}
            accessibilityLabel="Filter downloads"
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
      <LinearGradient
        pointerEvents="none"
        colors={['rgba(217, 230, 106, 0.10)', 'rgba(123, 175, 212, 0.06)', 'rgba(10, 11, 14, 0)']}
        style={styles.backdrop}
      />
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
          />
        )}
        ListEmptyComponent={
          <View style={styles.emptyCard}>
            <Ionicons name="cloud-download-outline" size={28} color={Signal.inkMuted} />
            <Text style={styles.emptyTitle}>{filter ? 'No matches' : 'Nothing downloaded yet'}</Text>
            <Text style={styles.emptyBody}>
              {filter
                ? 'Try a different title or artist.'
                : 'Tap the download button on any song in Stream or Luvs and it will play offline from here.'}
            </Text>
          </View>
        }
        contentContainerStyle={{ paddingBottom: 180 }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Signal.bg },
  backdrop: { ...StyleSheet.absoluteFillObject, height: 380 },
  topBar: { flexDirection: 'row', paddingHorizontal: Space.sm },
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
  eyebrow: { fontSize: 12, fontWeight: '700', letterSpacing: 1, color: Signal.inkMuted },
  title: { fontSize: 34, fontWeight: '800', letterSpacing: -1, color: Signal.ink },
  meta: { fontSize: 14, color: Signal.inkMuted, marginTop: 4 },
  actions: { flexDirection: 'row', gap: Space.sm, marginTop: Space.md },
  primary: {
    flex: 1,
    height: 48,
    borderRadius: Radius.pill,
    backgroundColor: Signal.wave,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  primaryText: { fontSize: 16, fontWeight: '700', color: Signal.waveInk },
  secondary: {
    flex: 1,
    height: 48,
    borderRadius: Radius.pill,
    backgroundColor: Glass.fill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Glass.hairlineStrong,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  secondaryText: { fontSize: 16, fontWeight: '700', color: Signal.ink },
  pressed: { transform: [{ scale: 0.97 }], opacity: 0.9 },
  disabled: { opacity: 0.4 },
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
  filterInput: { flex: 1, color: Signal.ink, fontSize: 15, paddingVertical: 0 },
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
  chipText: { fontSize: 13, fontWeight: '600', color: Signal.inkSoft },
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
  emptyTitle: { fontSize: 18, fontWeight: '700', color: Signal.ink },
  emptyBody: { fontSize: 14, color: Signal.inkMuted, textAlign: 'center' },
});

export default DownloadsScreen;
