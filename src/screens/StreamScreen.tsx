/**
 * Stream — listen to anything in the catalog without downloading it.
 *
 * Allegra's home composition (spotlight hero, quick rail, ranked chart, tiles,
 * mood cards) over its live ambient field, tinted by the song on stage. Echo
 * Music's feed decides what's in it (see services/stream/homeFeed.ts +
 * recommend.ts). Tapping a song streams it through the normal player queue
 * with radio autoplay; the ↓ saves it into Downloads.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useIsFocused, useNavigation } from '@react-navigation/native';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { TabParamList } from '../types/navigation';
import { BlurIntensity, Glass, Radius, Signal, Space } from '../constants/allegraTheme';
import { BlurView } from 'expo-blur';
import { Fonts } from '../constants/fonts';
import DynamicAura from '../components/allegra/DynamicAura';
import { useArtworkPalette } from '../components/allegra/useArtworkPalette';
import { accentInk } from '../components/allegra/palette';
import { RiseIn } from '../components/allegra/motion';
import {
  ChartRow,
  Eyebrow,
  GlassButton,
  MoodCard,
  PrimaryButton,
  QuickCard,
  SectionHeading,
  Sleeve,
  SpotlightWash,
  Tile,
} from '../components/allegra/home';
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
const CHART_LENGTH = 8;

const MOODS = [
  { label: 'Chill', note: 'Low-key, late night', tint: '#7bafd4', icon: 'moon' as const, query: 'chill lofi' },
  { label: 'Energy', note: 'Workout & pre-game', tint: '#ee6b5f', icon: 'flash' as const, query: 'workout hits' },
  { label: 'Romance', note: 'Slow and close', tint: '#e0679b', icon: 'heart' as const, query: 'romantic hits' },
  { label: 'Focus', note: 'Instrumental flow', tint: '#c4dd74', icon: 'leaf' as const, query: 'instrumental focus' },
  { label: 'Party', note: 'Turn it up', tint: '#ffb347', icon: 'sparkles' as const, query: 'party hits' },
  { label: 'Heartbreak', note: 'Feel it all', tint: '#a18ec2', icon: 'rainy' as const, query: 'sad songs' },
];

const greeting = (): string => {
  const h = new Date().getHours();
  if (h < 5) return 'Late night';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
};

const StreamScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<BottomTabNavigationProp<TabParamList>>();
  const isFocused = useIsFocused();
  const localSongs = useSongsStore(s => s.songs);
  const history = useStreamHistoryStore(s => s.plays);
  const languages = useLuvsPreferencesStore(s => s.preferredLanguages);
  const currentSongId = usePlayerStore(s => s.currentSongId);
  const currentSong = usePlayerStore(s => s.currentSong);
  const isPlaying = usePlayerStore(s => s.isPlaying);
  const addToDownloads = useDownloadQueueStore(s => s.addToQueue);

  const [feed, setFeed] = useState<HomeFeed | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<UnifiedSong[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
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

  const runSearch = useCallback(async (text?: string) => {
    const q = (text ?? query).trim();
    if (!q) return;
    if (text !== undefined) setQuery(text);
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
    setResults(null);
    setSearching(false);
  }, []);

  const play = useCallback((list: UnifiedSong[], index: number) => {
    Haptics.selectionAsync().catch(() => {});
    StreamService.play(list, index);
  }, []);

  const shuffle = useCallback((list: UnifiedSong[]) => {
    if (list.length === 0) return;
    const copy = [...list];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    play(copy, 0);
  }, [play]);

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

  const togglePlayback = useCallback(() => {
    usePlayerStore.getState().requestPlayback(!usePlayerStore.getState().isPlaying);
  }, []);

  // ── What's on stage: the playing song, else the freshest pick ──────────────
  const pickedForYou = feed?.keepListening[0] ?? feed?.quickPicks[0];
  const stage = currentSong
    ? { title: currentSong.title, artist: currentSong.artist ?? '', artwork: currentSong.coverImageUri, live: true }
    : pickedForYou
      ? { title: pickedForYou.title, artist: pickedForYou.artist, artwork: pickedForYou.highResArt, live: false }
      : null;
  const palette = useArtworkPalette(stage?.artwork);
  const eyebrowInk = accentInk(palette);
  const railSongs = feed ? (feed.keepListening.length > 0 ? feed.keepListening : feed.quickPicks.slice(CHART_LENGTH)) : [];

  // ── Scroll-linked spotlight: drifts up slower than content and dims ────────
  const scrollY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler(e => { scrollY.value = e.contentOffset.y; });
  const heroStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [0, 320], [1, 0.35], Extrapolation.CLAMP),
    transform: [{ translateY: interpolate(scrollY.value, [-100, 0, 400], [-30, 0, 120], Extrapolation.CLAMP) }],
  }));

  // iOS large-title collapse: a compact glass bar takes over once the big
  // title has scrolled under the status bar.
  const compactStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [150, 210], [0, 1], Extrapolation.CLAMP),
    transform: [{ translateY: interpolate(scrollY.value, [150, 210], [-6, 0], Extrapolation.CLAMP) }],
  }));

  const onStagePlay = () => {
    if (stage?.live) togglePlayback();
    else if (pickedForYou) play([pickedForYou, ...(feed?.quickPicks ?? [])], 0);
  };

  const searchActive = results !== null || searching;

  const hero = (
    <Animated.View style={[styles.spotlight, { paddingTop: insets.top + ISLAND_CLEARANCE }, heroStyle]}>
      <SpotlightWash artwork={stage?.artwork} />
      <Eyebrow accent={eyebrowInk} icon="radio">{greeting()}</Eyebrow>
      <Text style={styles.h1}>{history.length > 0 ? 'Welcome back' : 'Your music, all in one place'}</Text>
      <Text style={styles.lede}>Stream anything. Radio picks what's next, lyrics follow along, and one tap keeps it offline.</Text>

      {stage ? (
        <View style={styles.now}>
          <Sleeve
            artwork={stage.artwork}
            title={stage.title}
            artist={stage.artist}
            size={128}
            playing={stage.live && isPlaying}
            onPress={onStagePlay}
            label={stage.live ? (isPlaying ? 'Pause' : 'Play') : `Play ${stage.title}`}
          />
          <View style={styles.nowMeta}>
            <Eyebrow accent={stage.live ? Signal.wave : undefined}>{stage.live ? (isPlaying ? 'Now playing' : 'Paused') : 'Picked for you'}</Eyebrow>
            <Text style={styles.nowTitle} numberOfLines={2}>{stage.title}</Text>
            <Text style={styles.nowArtist} numberOfLines={1}>{stage.artist}</Text>
            <View style={styles.actions}>
              <PrimaryButton compact icon={stage.live && isPlaying ? 'pause' : 'play'} label={stage.live && isPlaying ? 'Pause' : 'Play'} onPress={onStagePlay} />
              <GlassButton compact icon="shuffle" accessibilityLabel="Shuffle quick picks" onPress={() => shuffle(feed?.quickPicks ?? [])} disabled={!feed?.quickPicks.length} />
              <GlassButton compact icon="download-outline" accessibilityLabel="Open downloads" onPress={openDownloads} />
            </View>
          </View>
        </View>
      ) : null}

      <View style={styles.search}>
        <Ionicons name="search" size={18} color={Signal.inkMuted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={() => runSearch()}
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

      {!searchActive && railSongs.length > 0 ? (
        <FlatList
          horizontal
          data={railSongs}
          keyExtractor={(s: UnifiedSong) => `rail-${streamIdFor(s)}`}
          showsHorizontalScrollIndicator={false}
          style={styles.rail}
          contentContainerStyle={styles.railContent}
          renderItem={({ item, index }) => (
            <QuickCard
              title={item.title}
              subtitle={item.artist}
              artwork={item.highResArt}
              isCurrent={currentSongId === streamIdFor(item)}
              onPress={() => play(railSongs, index)}
              onLongPress={() => queueNext(item)}
            />
          )}
        />
      ) : null}
    </Animated.View>
  );

  // Rows cascade in 40ms apart (research: 30–60ms offsets read as one gesture).
  const chart = (list: UnifiedSong[], firstIndex = 0) =>
    list.map((song, i) => (
      <RiseIn key={streamIdFor(song)} index={firstIndex + i}>
      <ChartRow
        rank={i + 1}
        title={song.title}
        subtitle={song.artist}
        artwork={song.highResArt}
        isCurrent={currentSongId === streamIdFor(song)}
        onPress={() => play(list, i)}
        onLongPress={() => queueNext(song)}
        onAction={() => save(song)}
        actionLabel={`Save ${song.title} to Downloads`}
      />
      </RiseIn>
    ));

  const tileShelf = (key: string, list: UnifiedSong[], eyebrowFor?: (s: UnifiedSong, i: number) => string | undefined) => (
    <FlatList
      key={key}
      horizontal
      data={list}
      keyExtractor={(s: UnifiedSong) => `${key}-${streamIdFor(s)}`}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.shelf}
      renderItem={({ item, index }) => (
        <Tile
          title={item.title}
          subtitle={item.artist}
          eyebrow={eyebrowFor?.(item, index)}
          artwork={item.highResArt}
          isCurrent={currentSongId === streamIdFor(item)}
          onPress={() => play(list, index)}
          onLongPress={() => queueNext(item)}
          onAction={() => save(item)}
        />
      )}
    />
  );

  let body: React.ReactNode;
  if (searchActive) {
    body = (
      <RiseIn>
        <SectionHeading eyebrow={searching ? 'Searching' : `${results?.length ?? 0} results`} title={`“${query.trim()}”`} action="Clear" onAction={clearSearch} />
        {searching ? <ActivityIndicator color={Signal.wave} style={styles.spinner} /> : null}
        {!searching && results?.length === 0 ? (
          <Text style={styles.empty}>Nothing streamable for that. Try the artist name or a different spelling.</Text>
        ) : null}
        {results ? chart(results) : null}
      </RiseIn>
    );
  } else if (loading && !feed) {
    body = (
      <View style={styles.skeleton}>
        <ShimmerBlock width={180} height={22} />
        {[0, 1, 2, 3, 4].map(i => <ShimmerBlock key={i} width="100%" height={60} radius={14} />)}
        <ShimmerBlock width={140} height={22} />
        <View style={styles.skeletonRow}>
          {[0, 1, 2].map(i => <ShimmerBlock key={i} width={156} height={156} radius={18} />)}
        </View>
      </View>
    );
  } else if (!feed || (feed.quickPicks.length === 0 && feed.keepListening.length === 0)) {
    body = (
      <RiseIn style={styles.emptyCard}>
        <Ionicons name="cloud-offline-outline" size={28} color={Signal.inkMuted} />
        <Text style={styles.emptyTitle}>Can't reach the catalog</Text>
        <Text style={styles.emptyBody}>Check your connection and pull down to try again. Your downloads still play offline.</Text>
        <PrimaryButton label="Open Downloads" icon="download-outline" onPress={openDownloads} />
      </RiseIn>
    );
  } else {
    const chartSongs = feed.quickPicks.slice(0, CHART_LENGTH);
    body = (
      <>
        {chartSongs.length > 0 ? (
          <View>
            <RiseIn index={1}>
            <SectionHeading
              eyebrow={feed.coldStart ? 'Trending now' : 'Radio from your favourites'}
              accent={eyebrowInk}
              title="Quick picks"
              action="Play all"
              onAction={() => play(feed.quickPicks, 0)}
            />
            </RiseIn>
            {chart(chartSongs, 2)}
          </View>
        ) : null}

        {feed.dailyDiscover.length > 0 ? (
          <RiseIn index={2}>
            <SectionHeading eyebrow="Made for you" accent={eyebrowInk} title="Daily discover" />
            {tileShelf('discover', feed.dailyDiscover.map(d => d.recommendation), (_s, i) => `After ${feed.dailyDiscover[i].seed.title}`)}
          </RiseIn>
        ) : null}

        <RiseIn index={3}>
          <SectionHeading eyebrow="Tap a room" accent={eyebrowInk} title="Moods" />
          <View style={styles.moodGrid}>
            {MOODS.map(m => (
              <View key={m.label} style={styles.moodCell}>
                <MoodCard label={m.label} note={m.note} tint={m.tint} icon={m.icon} onPress={() => runSearch(m.query)} />
              </View>
            ))}
          </View>
        </RiseIn>

        {feed.similar.map((shelf, i) => (
          <RiseIn key={shelf.artist} index={4 + i}>
            <SectionHeading eyebrow="Similar to" accent={eyebrowInk} title={shelf.artist} action="Play" onAction={() => play(shelf.songs, 0)} />
            {tileShelf(`similar-${shelf.artist}`, shelf.songs)}
          </RiseIn>
        ))}

        {feed.forgottenFavorites.length > 0 ? (
          <RiseIn index={6}>
            <SectionHeading eyebrow="From your downloads" accent={eyebrowInk} title="Forgotten favorites" action="See all" onAction={openDownloads} />
            <FlatList
              horizontal
              data={feed.forgottenFavorites}
              keyExtractor={s => `fav-${s.id}`}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.shelf}
              renderItem={({ item, index }) => (
                <Tile
                  title={item.title}
                  subtitle={item.artist}
                  artwork={item.coverImageUri}
                  isCurrent={currentSongId === item.id}
                  onPress={() => playLocal(feed.forgottenFavorites, index)}
                />
              )}
            />
          </RiseIn>
        ) : null}
      </>
    );
  }

  return (
    <View style={styles.screen}>
      <DynamicAura palette={palette} playing={isPlaying} active={isFocused} dim={0.1} />
      <Animated.ScrollView
        onScroll={onScroll}
        scrollEventThrottle={16}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Signal.wave} progressViewOffset={insets.top + 40} />}
      >
        {hero}
        {body}
      </Animated.ScrollView>
      <Animated.View pointerEvents="none" style={[styles.compact, { height: insets.top + 50 }, compactStyle]}>
        <BlurView intensity={BlurIntensity.panel} tint="dark" style={StyleSheet.absoluteFill} />
        <View style={styles.compactScrim} />
        <Text style={[styles.compactTitle, { marginTop: insets.top + 12 }]}>Stream</Text>
        <View style={styles.compactRule} />
      </Animated.View>
      {toast ? <Toast visible message={toast} type="info" duration={2200} onDismiss={() => setToast(null)} /> : null}
    </View>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Signal.bg },
  content: { paddingBottom: 180 },
  spotlight: {
    overflow: 'hidden',
    paddingHorizontal: Space.lg - 4,
    paddingBottom: Space.lg,
  },
  h1: {
    fontFamily: Fonts.interBold,
    fontSize: 34,
    lineHeight: 36,
    letterSpacing: -1.4,
    color: Signal.ink,
    marginTop: 2,
  },
  lede: {
    fontFamily: Fonts.interRegular,
    fontSize: 14.5,
    lineHeight: 21,
    color: Signal.inkMuted,
    marginTop: 10,
    maxWidth: 340,
  },
  now: { flexDirection: 'row', alignItems: 'center', gap: Space.lg, marginTop: Space.lg + 4 },
  nowMeta: { flex: 1, minWidth: 0 },
  nowTitle: { fontFamily: Fonts.interBold, fontSize: 20, lineHeight: 24, letterSpacing: -0.5, color: Signal.ink },
  nowArtist: { fontFamily: Fonts.interMedium, fontSize: 14, color: Signal.inkMuted, marginTop: 2 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 14 },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    marginTop: Space.lg,
    height: 48,
    paddingHorizontal: Space.md,
    borderRadius: Radius.pill,
    backgroundColor: Glass.fill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Glass.hairlineStrong,
  },
  searchInput: { flex: 1, color: Signal.ink, fontSize: 16, fontFamily: Fonts.interRegular, paddingVertical: 0 },
  rail: { marginTop: Space.md, marginHorizontal: -(Space.lg - 4) },
  railContent: { paddingHorizontal: Space.lg - 4, gap: 10 },
  shelf: { paddingHorizontal: Space.lg - 4, gap: Space.md },
  moodGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: Space.lg - 4 - 5 },
  moodCell: { width: '50%', padding: 5 },
  spinner: { marginTop: Space.lg },
  skeleton: { paddingHorizontal: Space.lg - 4, gap: Space.sm, marginTop: Space.lg },
  skeletonRow: { flexDirection: 'row', gap: Space.md },
  empty: { color: Signal.inkMuted, fontSize: 15, textAlign: 'center', marginTop: Space.lg, paddingHorizontal: Space.xl },
  emptyCard: {
    marginHorizontal: Space.md,
    marginTop: Space.lg,
    padding: Space.lg,
    borderRadius: Radius.panel,
    backgroundColor: Glass.fill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Glass.hairline,
    alignItems: 'center',
    gap: Space.sm,
  },
  compact: { position: 'absolute', top: 0, left: 0, right: 0, overflow: 'hidden' },
  compactScrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(10, 11, 14, 0.45)' },
  compactTitle: { fontFamily: Fonts.interBold, fontSize: 17, letterSpacing: -0.3, color: Signal.ink, paddingHorizontal: Space.lg - 4 },
  compactRule: { position: 'absolute', left: 0, right: 0, bottom: 0, height: StyleSheet.hairlineWidth, backgroundColor: Glass.hairline },
  emptyTitle: { fontFamily: Fonts.interBold, fontSize: 18, color: Signal.ink },
  emptyBody: { fontFamily: Fonts.interRegular, fontSize: 14, color: Signal.inkMuted, textAlign: 'center' },
});

export default StreamScreen;
