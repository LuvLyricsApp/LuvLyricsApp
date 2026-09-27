/**
 * Stream — listen to anything in the catalog without downloading it.
 *
 * Echo Music's home-feed structure (Quick picks, Keep listening, Daily
 * discover, Similar to, Forgotten favorites) in Allegra's listening-room
 * material. Tapping a song streams it through the normal player queue with
 * radio autoplay; the download button saves it into the library.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { TabParamList } from '../types/navigation';
import { Glass, Radius, Signal, Space } from '../constants/allegraTheme';
import { ArtworkCard, SectionHeader, ShimmerBlock, TrackRow } from '../components/stream/StreamItems';
import { getRecommendations, searchMusic } from '../services/MultiSourceSearchService';
import { buildHomeFeed, HomeFeed } from '../services/stream/homeFeed';
import { StreamService } from '../services/stream/StreamService';
import { streamIdFor } from '../services/stream/streamSong';
import { useSongsStore } from '../store/songsStore';
import { usePlayerStore } from '../store/playerStore';
import { useStreamHistoryStore } from '../store/streamHistoryStore';
import { useLuvsPreferencesStore } from '../store/luvsPreferencesStore';
import { useDownloadQueueStore } from '../store/downloadQueueStore';
import { Song, UnifiedSong } from '../types/song';
import { Toast } from '../components/Toast';

const QUICK_PICK_ROWS = 4;
const ISLAND_CLEARANCE = 56; // the Dynamic Island mini player floats top-right

const greeting = (): string => {
  const h = new Date().getHours();
  if (h < 5) return 'Late night';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
};

const chunk = <T,>(items: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
};

const StreamScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<BottomTabNavigationProp<TabParamList>>();
  const localSongs = useSongsStore(s => s.songs);
  const history = useStreamHistoryStore(s => s.plays);
  const languages = useLuvsPreferencesStore(s => s.preferredLanguages);
  const currentSongId = usePlayerStore(s => s.currentSongId);
  const addToDownloads = useDownloadQueueStore(s => s.addToQueue);

  const [feed, setFeed] = useState<HomeFeed | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<UnifiedSong[] | null>(null);
  const [searching, setSearching] = useState(false);
  const searchSeq = useRef(0);
  const [toast, setToast] = useState<string | null>(null);

  const preferred = useMemo(
    () => [...languages].filter(l => l.weight > 0).sort((a, b) => b.weight - a.weight).map(l => l.language),
    [languages],
  );

  // History changes on every stream — read it at load time instead of rebuilding
  // the feed (and refetching radio) each time a song starts.
  const historyRef = useRef(history);
  historyRef.current = history;
  const localRef = useRef(localSongs);
  localRef.current = localSongs;

  const loadFeed = useCallback(async () => {
    const next = await buildHomeFeed(
      { localSongs: localRef.current, history: historyRef.current, languages: preferred },
      { searchMusic: q => searchMusic(q), getRecommendations },
    ).catch(() => null);
    setFeed(next);
  }, [preferred]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    loadFeed().finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [loadFeed]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadFeed();
    setRefreshing(false);
  }, [loadFeed]);

  const runSearch = useCallback(async () => {
    const q = query.trim();
    if (!q) return;
    Keyboard.dismiss();
    const seq = ++searchSeq.current;
    setSearching(true);
    const found = await searchMusic(q).catch(() => []);
    if (seq !== searchSeq.current) return; // a newer search won
    setResults(found);
    setSearching(false);
  }, [query]);

  const clearSearch = useCallback(() => {
    searchSeq.current++;
    setQuery('');
    setResults(null);
    setSearching(false);
  }, []);

  const play = useCallback((list: UnifiedSong[], index: number) => {
    Haptics.selectionAsync().catch(() => {});
    StreamService.play(list, index);
  }, []);

  const playLocal = useCallback((list: Song[], index: number) => {
    Haptics.selectionAsync().catch(() => {});
    usePlayerStore.getState().setPlaylistQueue('forgotten-favorites', list, index);
  }, []);

  const save = useCallback((song: UnifiedSong) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    addToDownloads([song]);
    setToast(`Saving “${song.title}” to Downloads`);
  }, [addToDownloads]);

  const queueNext = useCallback((song: UnifiedSong) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    StreamService.playNext(song);
    setToast('Playing next');
  }, []);

  const openDownloads = useCallback(() => {
    // Downloads lives inside the Library tab's stack so the tab bar stays put.
    navigation.navigate('Library', { screen: 'Downloads' });
  }, [navigation]);

  const renderRow = (song: UnifiedSong, index: number, list: UnifiedSong[], meta?: string) => (
    <TrackRow
      key={streamIdFor(song)}
      title={song.title}
      artist={song.artist}
      artwork={song.highResArt}
      duration={song.duration}
      meta={meta}
      isCurrent={currentSongId === streamIdFor(song)}
      onPress={() => play(list, index)}
      onLongPress={() => queueNext(song)}
      trailingIcon="arrow-down-circle-outline"
      trailingLabel={`Save ${song.title} to Downloads`}
      onTrailingPress={() => save(song)}
    />
  );

  const header = (
    <View style={{ paddingTop: insets.top + ISLAND_CLEARANCE }}>
      <View style={styles.titleRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>{greeting().toUpperCase()}</Text>
          <Text style={styles.title}>Stream</Text>
        </View>
        <Pressable
          onPress={openDownloads}
          accessibilityRole="button"
          accessibilityLabel="Open downloads"
          style={({ pressed }) => [styles.downloadsPill, pressed && { opacity: 0.8 }]}
        >
          <Ionicons name="download-outline" size={16} color={Signal.ink} />
          <Text style={styles.downloadsText}>Downloads</Text>
        </Pressable>
      </View>

      <View style={styles.searchWrap}>
        <Ionicons name="search" size={18} color={Signal.inkMuted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={runSearch}
          placeholder="Songs, artists, moods"
          placeholderTextColor={Signal.inkFaint}
          returnKeyType="search"
          autoCorrect={false}
          style={styles.searchInput}
          accessibilityLabel="Search the catalog"
        />
        {query.length > 0 ? (
          <Pressable onPress={clearSearch} hitSlop={10} accessibilityRole="button" accessibilityLabel="Clear search">
            <Ionicons name="close-circle" size={18} color={Signal.inkMuted} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );

  const backdrop = (
    <LinearGradient
      pointerEvents="none"
      colors={['rgba(123, 175, 212, 0.16)', 'rgba(217, 230, 106, 0.05)', 'rgba(10, 11, 14, 0)']}
      locations={[0, 0.35, 1]}
      style={styles.backdrop}
    />
  );

  // ── Search results ───────────────────────────────────────────────────────
  if (results !== null || searching) {
    return (
      <View style={styles.screen}>
        {backdrop}
        <FlatList
          data={results ?? []}
          keyExtractor={(item: UnifiedSong) => streamIdFor(item)}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={
            <>
              {header}
              <SectionHeader title={searching ? 'Searching…' : `Results for “${query.trim()}”`} />
            </>
          }
          renderItem={({ item, index }) => renderRow(item, index, results ?? [], item.source)}
          ListEmptyComponent={
            searching ? (
              <ActivityIndicator color={Signal.wave} style={{ marginTop: Space.xl }} />
            ) : (
              <Text style={styles.empty}>Nothing streamable for that. Try the artist name or a different spelling.</Text>
            )
          }
          contentContainerStyle={{ paddingBottom: 180 }}
        />
        {toast ? <Toast visible message={toast} type="info" duration={2200} onDismiss={() => setToast(null)} /> : null}
      </View>
    );
  }

  // ── Home feed ────────────────────────────────────────────────────────────
  const quickPickColumns = chunk(feed?.quickPicks ?? [], QUICK_PICK_ROWS);

  return (
    <View style={styles.screen}>
      {backdrop}
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: 180 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Signal.wave} />}
      >
        {header}

        {loading && !feed ? (
          <View style={{ paddingHorizontal: Space.md + 4, gap: Space.sm, marginTop: Space.xl }}>
            <ShimmerBlock width={180} height={22} />
            {[0, 1, 2, 3].map(i => <ShimmerBlock key={i} width="100%" height={56} />)}
            <ShimmerBlock width={140} height={22} />
            <View style={{ flexDirection: 'row', gap: Space.sm }}>
              {[0, 1, 2].map(i => <ShimmerBlock key={i} width={148} height={148} radius={Radius.art} />)}
            </View>
          </View>
        ) : null}

        {!loading && feed && feed.quickPicks.length === 0 && feed.keepListening.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons name="cloud-offline-outline" size={28} color={Signal.inkMuted} />
            <Text style={styles.emptyTitle}>Can't reach the catalog</Text>
            <Text style={styles.emptyBody}>Check your connection and pull down to try again. Your downloads still play offline.</Text>
            <Pressable onPress={openDownloads} style={({ pressed }) => [styles.primaryPill, pressed && { opacity: 0.85 }]}>
              <Text style={styles.primaryPillText}>Open Downloads</Text>
            </Pressable>
          </View>
        ) : null}

        {feed && feed.quickPicks.length > 0 ? (
          <>
            <SectionHeader
              subtitle={feed.coldStart ? 'Trending' : 'Start radio from a song'}
              title="Quick picks"
              action="Play all"
              onAction={() => play(feed.quickPicks, 0)}
            />
            <FlatList
              horizontal
              data={quickPickColumns}
              keyExtractor={(_, i) => `qp-${i}`}
              showsHorizontalScrollIndicator={false}
              snapToInterval={COLUMN_WIDTH}
              decelerationRate="fast"
              renderItem={({ item: column, index: col }) => (
                <View style={{ width: COLUMN_WIDTH }}>
                  {column.map((song, row) => renderRow(song, col * QUICK_PICK_ROWS + row, feed.quickPicks))}
                </View>
              )}
            />
          </>
        ) : null}

        {feed && feed.keepListening.length > 0 ? (
          <>
            <SectionHeader subtitle="Recently streamed" title="Keep listening" />
            <FlatList
              horizontal
              data={feed.keepListening}
              keyExtractor={(item: UnifiedSong) => streamIdFor(item)}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.shelf}
              renderItem={({ item, index }) => (
                <ArtworkCard
                  title={item.title}
                  subtitle={item.artist}
                  artwork={item.highResArt}
                  onPress={() => play(feed.keepListening, index)}
                  onLongPress={() => queueNext(item)}
                />
              )}
            />
          </>
        ) : null}

        {feed && feed.dailyDiscover.length > 0 ? (
          <>
            <SectionHeader subtitle="Made for you" title="Daily discover" />
            <FlatList
              horizontal
              data={feed.dailyDiscover}
              keyExtractor={d => streamIdFor(d.recommendation)}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.shelf}
              renderItem={({ item }) => (
                <ArtworkCard
                  size={200}
                  eyebrow={`BECAUSE YOU PLAYED ${item.seed.title.toUpperCase()}`}
                  title={item.recommendation.title}
                  subtitle={item.recommendation.artist}
                  artwork={item.recommendation.highResArt}
                  onPress={() => play([item.recommendation], 0)}
                  onLongPress={() => queueNext(item.recommendation)}
                />
              )}
            />
          </>
        ) : null}

        {feed?.similar.map(shelf => (
          <React.Fragment key={shelf.artist}>
            <SectionHeader subtitle="Similar to" title={shelf.artist} action="Play" onAction={() => play(shelf.songs, 0)} />
            <FlatList
              horizontal
              data={shelf.songs}
              keyExtractor={(item: UnifiedSong) => streamIdFor(item)}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.shelf}
              renderItem={({ item, index }) => (
                <ArtworkCard
                  title={item.title}
                  subtitle={item.artist}
                  artwork={item.highResArt}
                  onPress={() => play(shelf.songs, index)}
                  onLongPress={() => queueNext(item)}
                />
              )}
            />
          </React.Fragment>
        ))}

        {feed && feed.forgottenFavorites.length > 0 ? (
          <>
            <SectionHeader subtitle="From your downloads" title="Forgotten favorites" action="See all" onAction={openDownloads} />
            <FlatList
              horizontal
              data={feed.forgottenFavorites}
              keyExtractor={s => s.id}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.shelf}
              renderItem={({ item, index }) => (
                <ArtworkCard
                  title={item.title}
                  subtitle={item.artist}
                  artwork={item.coverImageUri}
                  onPress={() => playLocal(feed.forgottenFavorites, index)}
                />
              )}
            />
          </>
        ) : null}
      </ScrollView>
      {toast ? <Toast visible message={toast} type="info" duration={2200} onDismiss={() => setToast(null)} /> : null}
    </View>
  );
};

const COLUMN_WIDTH = 340;

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Signal.bg,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    height: 420,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: Space.md + 4,
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    color: Signal.inkMuted,
  },
  title: {
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: -1,
    color: Signal.ink,
  },
  downloadsPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 36,
    paddingHorizontal: 14,
    borderRadius: Radius.pill,
    backgroundColor: Glass.fill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Glass.hairlineStrong,
    marginBottom: 4,
  },
  downloadsText: {
    fontSize: 13,
    fontWeight: '700',
    color: Signal.ink,
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    marginHorizontal: Space.md,
    marginTop: Space.md,
    height: 46,
    paddingHorizontal: Space.md,
    borderRadius: Radius.pill,
    backgroundColor: Glass.fill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Glass.hairline,
  },
  searchInput: {
    flex: 1,
    color: Signal.ink,
    fontSize: 16,
    paddingVertical: 0,
  },
  shelf: {
    paddingHorizontal: Space.md + 4,
    gap: Space.md,
  },
  empty: {
    color: Signal.inkMuted,
    fontSize: 15,
    textAlign: 'center',
    marginTop: Space.xl,
    paddingHorizontal: Space.xl,
  },
  emptyCard: {
    marginHorizontal: Space.md,
    marginTop: Space.xl,
    padding: Space.lg,
    borderRadius: Radius.panel,
    backgroundColor: Glass.fill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Glass.hairline,
    alignItems: 'center',
    gap: Space.xs,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Signal.ink,
  },
  emptyBody: {
    fontSize: 14,
    color: Signal.inkMuted,
    textAlign: 'center',
  },
  primaryPill: {
    marginTop: Space.sm,
    height: 44,
    paddingHorizontal: Space.lg,
    borderRadius: Radius.pill,
    backgroundColor: Signal.wave,
    justifyContent: 'center',
  },
  primaryPillText: {
    fontSize: 15,
    fontWeight: '700',
    color: Signal.waveInk,
  },
});

export default StreamScreen;
