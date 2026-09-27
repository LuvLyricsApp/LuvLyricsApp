/**
 * Stream — listen to anything in the catalog without downloading it.
 *
 * Laid out the way the big players do a home feed: search and mood chips up
 * top (YouTube Music), a "listen again" shortcut grid (Spotify), Quick picks as
 * paged columns of songs (YouTube Music), then plain cover shelves. Echo Music's
 * feed decides what's in it (services/stream/homeFeed.ts + recommend.ts).
 * Tapping a song streams it through the normal player queue with radio
 * autoplay; ↓ saves it into Downloads; long-press plays it next.
 *
 * The header scrolls away with the content — no collapsing bar. Behind it all
 * runs Allegra's live shader (DynamicAura), tinted by the playing cover.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
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
import { useIsFocused, useNavigation } from '@react-navigation/native';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { TabParamList } from '../types/navigation';
import { Radius, Signal, Space } from '../constants/allegraTheme';
import { useArtworkPalette } from '../components/allegra/useArtworkPalette';
import DynamicAura from '../components/allegra/DynamicAura';
import { AuraMood } from '../components/allegra/MusicFlowField';
import { RiseIn } from '../components/allegra/motion';
import { PrimaryButton, SectionHeading } from '../components/allegra/home';
import { CoverShelf, GUTTER, MoodChips, QuickPicks, ShortcutGrid, SongRow, TrackItem } from '../components/stream/StreamHome';
import { ShimmerBlock } from '../components/stream/StreamItems';
import { searchMusic } from '../services/MultiSourceSearchService';
import { recommendFor } from '../services/stream/recommend';
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

const ISLAND_CLEARANCE = 52; // the Dynamic Island mini player floats top-right

const MOODS = [
  { label: 'Chill', query: 'chill lofi' },
  { label: 'Energy', query: 'workout hits' },
  { label: 'Romance', query: 'romantic hits' },
  { label: 'Focus', query: 'instrumental focus' },
  { label: 'Party', query: 'party hits' },
  { label: 'Heartbreak', query: 'sad songs' },
] as const;
const MOOD_LABELS = MOODS.map(m => m.label);

// Calm moods slow the shader; the loud ones give it energy.
const SHADER_MOOD: Record<string, AuraMood> = {
  Chill: 'chill', Focus: 'chill', Romance: 'chill', Heartbreak: 'chill',
  Energy: 'energy', Party: 'energy',
};

const StreamScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<BottomTabNavigationProp<TabParamList>>();
  const localSongs = useSongsStore(s => s.songs);
  const history = useStreamHistoryStore(s => s.plays);
  const languages = useLuvsPreferencesStore(s => s.preferredLanguages);
  const currentSongId = usePlayerStore(s => s.currentSongId);
  const currentSong = usePlayerStore(s => s.currentSong);
  const addToDownloads = useDownloadQueueStore(s => s.addToQueue);

  const [feed, setFeed] = useState<HomeFeed | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<UnifiedSong[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [mood, setMood] = useState<string | null>(null);
  const searchSeq = useRef(0);

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
      { searchMusic: q => searchMusic(q), recommend: seed => recommendFor(seed, 12) },
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

  const runSearch = useCallback(async (text?: string, moodLabel: string | null = null) => {
    const q = (text ?? query).trim();
    if (!q) return;
    // A mood chip searches its own query without writing it into the field.
    if (text !== undefined && !moodLabel) setQuery(text);
    setMood(moodLabel);
    Keyboard.dismiss();
    const seq = ++searchSeq.current;
    setSearching(true);
    setResults([]);
    const found = await searchMusic(q).catch(() => []);
    if (seq !== searchSeq.current) return; // a newer search won
    setResults(found);
    setSearching(false);
  }, [query]);

  const clearSearch = useCallback(() => {
    searchSeq.current++;
    setQuery('');
    setMood(null);
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

  const selectMood = useCallback((label: string | null) => {
    Haptics.selectionAsync().catch(() => {});
    const picked = MOODS.find(m => m.label === label);
    if (!picked) clearSearch();
    else runSearch(picked.query, picked.label);
  }, [clearSearch, runSearch]);

  const isFocused = useIsFocused();
  const isPlaying = usePlayerStore(s => s.isPlaying);
  const shaderMood: AuraMood = (mood && SHADER_MOOD[mood]) || 'energy';

  // The shader takes its colours from whatever is playing (or the top pick).
  const washArt = currentSong?.coverImageUri ?? feed?.keepListening[0]?.highResArt ?? feed?.quickPicks[0]?.highResArt;
  const palette = useArtworkPalette(washArt);

  const track = (s: UnifiedSong): TrackItem => ({
    key: streamIdFor(s),
    title: s.title,
    artist: s.artist,
    artwork: s.highResArt,
    isCurrent: currentSongId === streamIdFor(s),
  });
  const localTrack = (s: Song): TrackItem => ({
    key: s.id,
    title: s.title,
    artist: s.artist,
    artwork: s.coverImageUri,
    isCurrent: currentSongId === s.id,
  });

  const searchActive = results !== null || searching;

  let body: React.ReactNode;
  if (searchActive) {
    const count = results?.length ?? 0;
    body = (
      <View>
        <SectionHeading
          title={mood ?? `“${query.trim()}”`}
          subtitle={searching ? 'Searching…' : `${count} ${count === 1 ? 'song' : 'songs'}`}
          action="Clear"
          onAction={clearSearch}
        />
        {searching ? <ActivityIndicator color={Signal.wave} style={styles.spinner} /> : null}
        {!searching && count === 0 ? (
          <Text style={styles.empty}>Nothing streamable for that. Try the artist name or a different spelling.</Text>
        ) : null}
        <View style={styles.list}>
          {(results ?? []).map((song, i) => (
            <SongRow
              key={streamIdFor(song)}
              item={track(song)}
              onPress={() => play(results ?? [], i)}
              onLongPress={() => queueNext(song)}
              onSave={() => save(song)}
            />
          ))}
        </View>
      </View>
    );
  } else if (loading && !feed) {
    body = (
      <View style={styles.skeleton}>
        <View style={styles.skeletonGrid}>
          {[0, 1, 2, 3].map(i => <ShimmerBlock key={i} width="48%" height={56} radius={6} />)}
        </View>
        <ShimmerBlock width={140} height={22} radius={6} />
        {[0, 1, 2, 3].map(i => <ShimmerBlock key={i} width="100%" height={52} radius={6} />)}
      </View>
    );
  } else if (!feed || (feed.quickPicks.length === 0 && feed.keepListening.length === 0)) {
    body = (
      <View style={styles.emptyCard}>
        <Ionicons name="cloud-offline-outline" size={28} color={Signal.inkMuted} />
        <Text style={styles.emptyTitle}>Can't reach the catalog</Text>
        <Text style={styles.emptyBody}>Check your connection and pull down to try again. Your downloads still play offline.</Text>
        <PrimaryButton label="Open downloads" icon="download-outline" onPress={openDownloads} />
      </View>
    );
  } else {
    // An even count so the two-column grid never ends on a hole.
    const listenAgain = feed.keepListening.slice(0, Math.min(6, feed.keepListening.length - (feed.keepListening.length % 2)));
    const discover = feed.dailyDiscover.map(d => d.recommendation);
    body = (
      <RiseIn>
        {listenAgain.length >= 2 ? (
          <View style={styles.firstSection}>
            <ShortcutGrid
              items={listenAgain.map(track)}
              onPress={i => play(listenAgain, i)}
              onLongPress={i => queueNext(listenAgain[i])}
            />
          </View>
        ) : null}

        {feed.quickPicks.length > 0 ? (
          <>
            <SectionHeading
              title="Quick picks"
              subtitle={feed.coldStart ? 'Trending now' : 'Radio from your favourites'}
              action="Play all"
              onAction={() => play(feed.quickPicks, 0)}
            />
            <QuickPicks
              items={feed.quickPicks.map(track)}
              onPress={i => play(feed.quickPicks, i)}
              onLongPress={i => queueNext(feed.quickPicks[i])}
              onSave={i => save(feed.quickPicks[i])}
            />
          </>
        ) : null}

        {discover.length > 0 ? (
          <>
            <SectionHeading title="Daily discover" subtitle="New songs that follow ones you play" />
            <CoverShelf items={discover.map(track)} onPress={i => play(discover, i)} onLongPress={i => queueNext(discover[i])} />
          </>
        ) : null}

        {feed.similar.map(shelf => (
          <View key={shelf.artist}>
            <SectionHeading title={`More like ${shelf.artist}`} action="Play" onAction={() => play(shelf.songs, 0)} />
            <CoverShelf items={shelf.songs.map(track)} onPress={i => play(shelf.songs, i)} onLongPress={i => queueNext(shelf.songs[i])} />
          </View>
        ))}

        {feed.forgottenFavorites.length > 0 ? (
          <>
            <SectionHeading title="Forgotten favourites" subtitle="From your downloads" action="See all" onAction={openDownloads} />
            <CoverShelf items={feed.forgottenFavorites.map(localTrack)} onPress={i => playLocal(feed.forgottenFavorites, i)} />
          </>
        ) : null}
      </RiseIn>
    );
  }

  return (
    <View style={styles.screen}>
      {/* Allegra's live shader: the playing cover's colours, full energy while
          music plays, and the picked mood's motion. Frames stop off-screen. */}
      <DynamicAura palette={palette} playing={isPlaying} active={isFocused} mood={shaderMood} dim={0.18} />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.content, { paddingTop: insets.top + Space.xs }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Signal.wave} progressViewOffset={insets.top + 40} />}
      >
        {/* Shares its line with the Dynamic Island mini player, top right. */}
        <View style={styles.header}>
          <Text style={styles.title} accessibilityRole="header">Stream</Text>
        </View>

        <View style={styles.search}>
          <Ionicons name="search" size={18} color={Signal.inkMuted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={() => runSearch()}
            placeholder="Songs, artists, albums"
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

        <View style={styles.chips}>
          <MoodChips moods={MOOD_LABELS} selected={mood} onSelect={selectMood} />
        </View>

        {body}
      </ScrollView>
      {/* Keeps the status bar legible over scrolled content. */}
      <LinearGradient
        pointerEvents="none"
        colors={['rgba(10, 11, 14, 0.92)', 'rgba(10, 11, 14, 0)']}
        style={[styles.statusScrim, { height: insets.top + 16 }]}
      />
      {toast ? <Toast visible message={toast} type="info" duration={2200} onDismiss={() => setToast(null)} /> : null}
    </View>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Signal.bg },
  content: { paddingBottom: 180 },
  header: { height: ISLAND_CLEARANCE, justifyContent: 'center', paddingHorizontal: GUTTER },
  title: { fontSize: 28, fontWeight: '700', color: Signal.ink },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    marginHorizontal: GUTTER,
    marginTop: Space.xs,
    height: 44,
    paddingHorizontal: Space.sm,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.09)',
  },
  searchInput: { flex: 1, color: Signal.ink, fontSize: 16, paddingVertical: 0 },
  chips: { marginTop: Space.sm },
  firstSection: { marginTop: Space.md },
  list: { paddingHorizontal: GUTTER },
  spinner: { marginTop: Space.lg },
  skeleton: { paddingHorizontal: GUTTER, gap: Space.sm, marginTop: Space.lg },
  skeletonGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: Space.xs, marginBottom: Space.md },
  empty: { color: Signal.inkMuted, fontSize: 15, textAlign: 'center', marginTop: Space.lg, paddingHorizontal: Space.xl },
  emptyCard: {
    marginHorizontal: GUTTER,
    marginTop: Space.xl,
    padding: Space.lg,
    borderRadius: Radius.well,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    alignItems: 'center',
    gap: Space.sm,
  },
  emptyTitle: { fontWeight: '700', fontSize: 18, color: Signal.ink },
  emptyBody: { fontSize: 14, color: Signal.inkMuted, textAlign: 'center' },
  statusScrim: { position: 'absolute', top: 0, left: 0, right: 0 },
});

export default StreamScreen;
