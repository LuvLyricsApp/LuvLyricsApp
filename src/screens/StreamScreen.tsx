/**
 * Stream — listen to anything in the catalog without downloading it.
 *
 * Laid out the way the big players do a home feed: search and mood chips up
 * top (YouTube Music), a "listen again" shortcut grid (Spotify), Quick picks as
 * paged columns of songs (YouTube Music), then plain cover shelves. Echo Music's
 * feed decides what's in it (services/stream/homeFeed.ts + recommend.ts).
 * Tapping a song streams it through the normal player queue with radio
 * autoplay; ↓ saves it into the Library; long-press plays it next.
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
import * as Haptics from '../utils/haptics';
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
import { searchOfficial } from '../services/stream/officialSearch';
import { YTMusicClient } from '../services/ytmusic/YTMusicClient';
import { HomeChip, HomePage, Shelf, YTItem, YTPageItem } from '../services/ytmusic/browse';
import { YTSong } from '../services/ytmusic/parsers';
import { playYTSongs } from '../services/stream/browsePlay';
import { BrowseShelf } from '../components/browse/BrowseShelf';
import { useFollowedArtistsStore } from '../store/followedArtistsStore';
import { personalMoodMix, Taste } from '../services/stream/moodMix';
import { tasteSeeds } from '../services/luvsTaste';
import { leadArtist } from '../services/ytmusic/browse';
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
import { isDoubleTap, pillBarTop, PILL_STACK_GAP } from '../navigation/tabs';
import { CLASSIC_MINI_PLAYER_HEIGHT } from '../constants/layout';

const HEADER_HEIGHT = 52;

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

  // Double-tap the Stream tab: straight to the search field with the keyboard
  // up. The first tap still switches tabs at once — nothing waits on a timer.
  const scrollRef = useRef<ScrollView>(null);
  const searchRef = useRef<TextInput>(null);
  const lastTabPress = useRef(0);
  useEffect(() => navigation.addListener('tabPress', () => {
    const now = Date.now();
    if (isDoubleTap(lastTabPress.current, now)) {
      lastTabPress.current = 0;
      Haptics.selectionAsync().catch(() => {});
      scrollRef.current?.scrollTo({ y: 0, animated: true });
      // After the tab switch has settled, or focus is lost to the transition.
      setTimeout(() => searchRef.current?.focus(), 60);
    } else {
      lastTabPress.current = now;
    }
  }), [navigation]);

  // Settings mounts lazily and its first open showed one empty frame while it
  // laid out; once launch has settled, build it in the background instead.
  useEffect(() => {
    const t = setTimeout(() => navigation.preload('Settings'), 8000);
    return () => clearTimeout(t);
  }, [navigation]);

  // YouTube Music's own home (Echo's feed): mood chips and shelves.
  const [ytHome, setYtHome] = useState<HomePage | null>(null);
  const [ytChip, setYtChip] = useState<HomeChip | null>(null);
  const [chipShelves, setChipShelves] = useState<Shelf[] | null>(null);
  const [artists, setArtists] = useState<YTPageItem<'artist'>[]>([]);
  const [pendingSong, setPendingSong] = useState<string | null>(null);
  const followed = useFollowedArtistsStore(s => s.artists);


  const loadYtHome = useCallback(async () => {
    const first = await YTMusicClient.home().catch(() => null);
    if (!first) return;
    setYtHome(first);
    // Echo fills the feed with one more page straight away.
    if (first.continuation) {
      const more = await YTMusicClient.homeMore(first.continuation).catch(() => null);
      if (more?.shelves.length) setYtHome({ ...first, shelves: [...first.shelves, ...more.shelves], continuation: more.continuation });
    }
  }, []);
  useEffect(() => { loadYtHome(); }, [loadYtHome]);

  const openItem = useCallback((item: Exclude<YTItem, { kind: 'song' }>) => {
    if (item.kind === 'artist') navigation.navigate('Browse', { screen: 'Artist', params: { browseId: item.browseId } });
    else navigation.navigate('Browse', { screen: 'Collection', params: { browseId: item.browseId, title: item.title, thumbnail: item.thumbnail } });
  }, [navigation]);

  const playYT = useCallback(async (songs: YTSong[], index: number) => {
    Haptics.selectionAsync().catch(() => {});
    setPendingSong(songs[index]?.videoId ?? null);
    const ok = await playYTSongs(songs, index);
    setPendingSong(null);
    if (!ok) setToast('That one isn\u2019t available to stream');
  }, []);

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

  // "Your <mood> mix": the chip's mood by the artists you follow and play,
  // in your languages (services/stream/moodMix).
  const [moodMix, setMoodMix] = useState<YTSong[] | null>(null);
  const mixSeq = useRef(0);
  const loadMoodMix = useCallback((label: string) => {
    const seq = ++mixSeq.current;
    setMoodMix(null);
    const seen = new Set<string>();
    const artistsInOrder = [
      ...followed.map(a => a.name),
      ...tasteSeeds(historyRef.current, localRef.current, Date.now(), 8).map(s => leadArtist(s.artist)),
    ].filter(a => a && !/^unknown artist$/i.test(a) && !seen.has(a.toLowerCase()) && seen.add(a.toLowerCase()));
    const taste: Taste = { artists: artistsInOrder, languages: preferred };
    personalMoodMix(label, taste, q => YTMusicClient.searchSongs(q))
      .then(songs => { if (seq === mixSeq.current) setMoodMix(songs); })
      .catch(() => { if (seq === mixSeq.current) setMoodMix([]); });
  }, [followed, preferred]);

  const loadFeed = useCallback(async () => {
    const next = await buildHomeFeed(
      { localSongs: localRef.current, history: historyRef.current, languages: preferred },
      { searchMusic: q => searchOfficial(q), recommend: seed => recommendFor(seed, 12) },
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
    setArtists([]);
    if (!moodLabel) YTMusicClient.searchArtists(q).then(a => { if (seq === searchSeq.current) setArtists(a); }).catch(() => {});
    const found = await searchOfficial(q).catch(() => []);
    if (seq !== searchSeq.current) return; // a newer search won
    setResults(found);
    setSearching(false);
  }, [query]);

  const clearSearch = useCallback(() => {
    searchSeq.current++;
    setArtists([]);
    setYtChip(null);
    setChipShelves(null);
    mixSeq.current++;
    setMoodMix(null);
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
    setToast(`Saving “${song.title}” to your library`);
  }, [addToDownloads]);

  const queueNext = useCallback((song: UnifiedSong) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    StreamService.playNext(song);
    setToast('Playing next');
  }, []);

  const openDownloads = useCallback(() => {
    // Downloads are the Library tab now.
    navigation.navigate('Library', { screen: 'LibraryHome' });
  }, [navigation]);

  const ytChips = useMemo(() => ytHome?.chips ?? [], [ytHome]);
  const selectMood = useCallback((label: string | null) => {
    Haptics.selectionAsync().catch(() => {});
    // YouTube Music's chips open their own shelves, as in Echo.
    const chip = ytChips.find(c => c.title === label);
    if (chip?.browse) {
      clearSearch();
      setMood(chip.title);
      setYtChip(chip);
      loadMoodMix(chip.title);
      YTMusicClient.home(chip.browse).then(page => setChipShelves(page.shelves)).catch(() => setChipShelves([]));
      return;
    }
    const picked = MOODS.find(m => m.label === label);
    if (!picked) clearSearch();
    else {
      runSearch(picked.query, picked.label);
      loadMoodMix(picked.label);
    }
  }, [clearSearch, runSearch, ytChips, loadMoodMix]);

  const isFocused = useIsFocused();
  // Clear the tab bar pill plus the mini player pill stacked above it.
  const bottomClearance = pillBarTop(insets.bottom) + PILL_STACK_GAP + CLASSIC_MINI_PLAYER_HEIGHT + Space.lg;
  const isPlaying = usePlayerStore(s => s.isPlaying);
  const shaderMood: AuraMood = (mood && (SHADER_MOOD[mood] ?? (/relax|chill|sleep|focus|romance|sad|calm/i.test(mood) ? 'chill' : undefined))) || 'energy';

  // The shader takes its colours from whatever is playing (or the top pick).
  const washArt = currentSong?.coverImageUri ?? feed?.keepListening[0]?.highResArt ?? feed?.quickPicks[0]?.highResArt;
  const palette = useArtworkPalette(washArt);

  const track = (s: UnifiedSong): TrackItem => ({
    key: streamIdFor(s),
    title: s.title,
    artist: s.artist,
    artwork: s.highResArt,
    isCurrent: currentSongId === streamIdFor(s),
    download: s,
  });
  const localTrack = (s: Song): TrackItem => ({
    key: s.id,
    title: s.title,
    artist: s.artist,
    artwork: s.coverImageUri,
    isCurrent: currentSongId === s.id,
  });

  const searchActive = results !== null || searching;

  const followedShelf: Shelf | null = followed.length > 0
    ? { title: 'Your artists', items: followed.map(a => ({ kind: 'artist' as const, browseId: a.browseId, title: a.name, thumbnail: a.thumbnail })) }
    : null;
  const ytShelves = (ytHome?.shelves ?? []).map((shelf, i) => (
    <BrowseShelf key={`yt-${shelf.title}-${i}`} shelf={shelf} onOpen={openItem} onPlay={playYT} pendingId={pendingSong} />
  ));

  const mixSection = mood ? (
    moodMix === null ? (
      <View>
        <SectionHeading title={`Your ${mood.toLowerCase()} mix`} subtitle="Finding it in artists you play…" />
        <ActivityIndicator color={Signal.wave} style={styles.spinner} />
      </View>
    ) : moodMix.length > 0 ? (
      <BrowseShelf
        shelf={{ title: `Your ${mood.toLowerCase()} mix`, strapline: 'From artists you play, in your languages', items: moodMix.map(song => ({ kind: 'song' as const, song })) }}
        rows
        maxRows={8}
        onMore={() => playYT(moodMix, 0)}
        onOpen={openItem}
        onPlay={playYT}
        pendingId={pendingSong}
      />
    ) : null
  ) : null;

  let body: React.ReactNode;
  if (ytChip && !searchActive) {
    body = (
      <View>
        <SectionHeading title={ytChip.title} action="Clear" onAction={clearSearch} />
        {mixSection}
        {chipShelves === null ? <ActivityIndicator color={Signal.wave} style={styles.spinner} /> : null}
        {chipShelves?.length === 0 ? <Text style={styles.empty}>Nothing here right now. Try another mood.</Text> : null}
        {(chipShelves ?? []).map((shelf, i) => (
          <BrowseShelf key={`chip-${shelf.title}-${i}`} shelf={shelf} onOpen={openItem} onPlay={playYT} pendingId={pendingSong} />
        ))}
      </View>
    );
  } else if (searchActive) {
    const count = results?.length ?? 0;
    body = (
      <View>
        <SectionHeading
          title={mood ?? `“${query.trim()}”`}
          subtitle={searching ? 'Searching…' : `${count} ${count === 1 ? 'song' : 'songs'}`}
          action="Clear"
          onAction={clearSearch}
        />
        {mixSection}
        {artists.length > 0 ? (
          <BrowseShelf shelf={{ title: 'Artists', items: artists }} onOpen={openItem} onPlay={playYT} pendingId={pendingSong} />
        ) : null}
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
  } else if ((!feed || (feed.quickPicks.length === 0 && feed.keepListening.length === 0)) && ytShelves.length > 0) {
    body = (
      <RiseIn>
        {followedShelf ? <BrowseShelf shelf={followedShelf} onOpen={openItem} onPlay={playYT} /> : null}
        {ytShelves}
      </RiseIn>
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

        {followedShelf ? <BrowseShelf shelf={followedShelf} onOpen={openItem} onPlay={playYT} /> : null}
        {ytShelves}
      </RiseIn>
    );
  }

  return (
    <View style={styles.screen}>
      {/* Allegra's live shader: the playing cover's colours, full energy while
          music plays, and the picked mood's motion. Frames stop off-screen. */}
      <DynamicAura palette={palette} playing={isPlaying} active={isFocused} mood={shaderMood} dim={0.18} />
      <ScrollView
        ref={scrollRef}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.content, { paddingTop: insets.top + Space.xs, paddingBottom: bottomClearance }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Signal.wave} progressViewOffset={insets.top + 40} />}
      >
        <View style={styles.header}>
          <Text style={styles.title} accessibilityRole="header">Stream</Text>
        </View>

        <View style={styles.search}>
          <Ionicons name="search" size={18} color={Signal.inkMuted} />
          <TextInput
            ref={searchRef}
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
          <MoodChips moods={ytChips.length > 0 ? ytChips.map(c => c.title) : MOOD_LABELS} selected={mood} onSelect={selectMood} />
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
  content: {},
  header: { height: HEADER_HEIGHT, justifyContent: 'center', paddingHorizontal: GUTTER },
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
