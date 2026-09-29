/**
 * Library — the songs on this phone, in the room lit by what's playing.
 *
 *   Deck       your recent songs as a coverflow of glass cards: drag along the
 *              row, tap the middle one to play it (components/library/GlassDeck),
 *              with a glass pill under it to shuffle, step and play / pause —
 *              and a frosted play bar that stays at the top once you scroll
 *   Artists    round covers sized by how many of their songs you keep; tap to
 *              see only theirs (ArtistOrbit)
 *   Downloads  songs still arriving
 *   Songs      filter, sort, and an A–Z rail to jump through a long list
 *
 * Long-press any song for cover / version / info / lyrics / share / hide /
 * delete. Playlists and the download queue sit behind the header buttons.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, LayoutChangeEvent, Pressable, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { Extrapolation, interpolate, runOnJS, useAnimatedReaction, useAnimatedScrollHandler, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from '../utils/haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useIsFocused, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { CompositeNavigationProp } from '@react-navigation/native';
import { LibraryStackParamList, RootStackParamList } from '../types/navigation';
import { DownloadQueueModal } from '../components/DownloadQueueModal';
import { useSongActions } from '../components/library/useSongActions';
import GlassDeck from '../components/library/GlassDeck';
import ArtistOrbit from '../components/library/ArtistOrbit';
import AlphabetRail from '../components/library/AlphabetRail';
import { groupArtists, leadArtist, letterIndex } from '../components/library/libraryShape';
import DynamicAura from '../components/allegra/DynamicAura';
import { useArtworkPalette } from '../components/allegra/useArtworkPalette';
import { RiseIn, Tactile } from '../components/allegra/motion';
import { PrimaryButton, SectionHeading } from '../components/allegra/home';
import { Glass, Radius, Signal, Space } from '../constants/allegraTheme';
import { TrackRow } from '../components/stream/StreamItems';
import { useSongsStore } from '../store/songsStore';
import { usePlayerStore } from '../store/playerStore';
import { QueueItem, useDownloadQueueStore } from '../store/downloadQueueStore';
import { useBottomClearance } from '../hooks/useBottomClearance';
import { Song } from '../types/song';
import { shuffled } from '../utils/shuffle';
import { countOf } from '../utils/formatters';

const LIBRARY_QUEUE_ID = 'library';
/** TrackRow's fixed height, so the A–Z rail can jump straight to a row. */
const ROW_H = 64;
const DECK_MAX = 8;

type Nav = CompositeNavigationProp<NativeStackNavigationProp<LibraryStackParamList>, NativeStackNavigationProp<RootStackParamList>>;

type SortMode = 'recent' | 'title' | 'artist';

const sorters: Record<SortMode, (a: Song, b: Song) => number> = {
  recent: (a, b) => Date.parse(b.dateCreated) - Date.parse(a.dateCreated),
  title: (a, b) => a.title.localeCompare(b.title),
  artist: (a, b) => (a.artist ?? '').localeCompare(b.artist ?? ''),
};

const AnimatedFlatList = Animated.createAnimatedComponent(FlatList<Song>);

const LibraryScreen: React.FC = () => {
  const { width: screenW, height: screenH } = useWindowDimensions();
  // The middle glass card's width; its neighbours peek out either side.
  const deckSize = Math.round(Math.min(screenW * 0.5, 232));
  const insets = useSafeAreaInsets();
  const bottomClearance = useBottomClearance(32);
  const navigation = useNavigation<Nav>();
  const fetchSongs = useSongsStore(s => s.fetchSongs);
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
  const [artist, setArtist] = useState<string | null>(null);

  const visible = useMemo(() => songs.filter(s => !s.isHidden), [songs]);
  const artists = useMemo(() => groupArtists(visible), [visible]);

  const list = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    return visible
      .filter(s => !artist || leadArtist(s.artist) === artist)
      .filter(s => !needle || s.title.toLowerCase().includes(needle) || (s.artist ?? '').toLowerCase().includes(needle))
      .sort(sorters[sort]);
  }, [visible, sort, filter, artist]);

  // The deck: what you played last, else what arrived last.
  const deck = useMemo(() => {
    const played = visible
      .filter(s => s.lastPlayed)
      .sort((a, b) => Date.parse(b.lastPlayed ?? '') - Date.parse(a.lastPlayed ?? ''));
    const newest = [...visible].sort(sorters.recent);
    const picks: Song[] = [];
    for (const s of [...played, ...newest]) {
      if (picks.length >= DECK_MAX) break;
      if (!picks.some(p => p.id === s.id)) picks.push(s);
    }
    return picks;
  }, [visible]);

  // The room takes the colour of what's playing, else of the front of the deck.
  const palette = useArtworkPalette(currentCover ?? deck[0]?.coverImageUri);
  const active = useMemo(() => queue.filter(q => q.status !== 'completed'), [queue]);
  const doneCount = queue.length - active.length;

  // Songs can change elsewhere (a download lands, lyrics arrive): refresh on focus.
  useEffect(() => navigation.addListener('focus', () => { fetchSongs(); }), [navigation, fetchSongs]);

  const playList = useCallback((items: Song[], index: number, shuffle = false) => {
    if (items.length === 0) return;
    Haptics.selectionAsync().catch(() => {});
    usePlayerStore.getState().setPlaylistQueue(LIBRARY_QUEUE_ID, shuffle ? shuffled(items) : items, shuffle ? 0 : index);
  }, []);
  const playAll = useCallback((shuffle = false) => playList(list, 0, shuffle), [list, playList]);
  const togglePlayback = useCallback(() => {
    usePlayerStore.getState().requestPlayback(!usePlayerStore.getState().isPlaying);
  }, []);
  const playFromDeck = useCallback((song: Song) => {
    const index = deck.findIndex(s => s.id === song.id);
    playList(deck, Math.max(0, index));
  }, [deck, playList]);

  const totalMinutes = Math.round(list.reduce((sum, s) => sum + (s.duration || 0), 0) / 60);
  const lengthText = totalMinutes >= 90 ? `${Math.round(totalMinutes / 60)} h` : `${totalMinutes} min`;

  // ── Scroll: the sticky play bar and the A–Z rail ────────────────────────
  const listRef = useRef<FlatList<Song>>(null);
  const headerH = useRef(0);
  const [heroBottom, setHeroBottom] = useState(420);
  const scrollY = useSharedValue(0);
  const [inList, setInList] = useState(false);
  const onScroll = useAnimatedScrollHandler(e => { scrollY.value = e.contentOffset.y; });
  // Past the deck: the bar and the A–Z rail come in (JS hears only the crossing).
  useAnimatedReaction(
    () => scrollY.value > heroBottom,
    (past, before) => { if (past !== before) runOnJS(setInList)(past); },
    [heroBottom],
  );
  const stickyStyle = useAnimatedStyle(() => {
    const t = interpolate(scrollY.value, [heroBottom - 80, heroBottom], [0, 1], Extrapolation.CLAMP);
    return { opacity: t, transform: [{ translateY: (1 - t) * -12 }] };
  });

  const railLetters = useMemo(() => {
    if (sort === 'recent' || list.length < 30) return [];
    return letterIndex(list, s => (sort === 'title' ? s.title : leadArtist(s.artist) || s.artist));
  }, [list, sort]);
  const jumpTo = useCallback((index: number) => {
    listRef.current?.scrollToIndex({ index, animated: false, viewOffset: insets.top + 72 });
  }, [insets.top]);

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

  const headerButtons = (
    <View style={styles.topActions}>
      <Tactile onPress={() => setQueueOpen(true)} hitSlop={8} pressScale={0.9} accessibilityRole="button" accessibilityLabel="Download queue" style={styles.iconButton}>
        <Ionicons name="arrow-down" size={20} color={Signal.ink} />
        {active.length > 0 ? <View style={styles.badge}><Text style={styles.badgeText}>{active.length}</Text></View> : null}
      </Tactile>
      <Tactile onPress={() => navigation.navigate('Playlists')} hitSlop={8} pressScale={0.9} accessibilityRole="button" accessibilityLabel="Playlists" style={styles.iconButton}>
        <Ionicons name="albums-outline" size={20} color={Signal.ink} />
      </Tactile>
    </View>
  );

  const header = (
    <View
      style={{ paddingTop: insets.top + Space.sm }}
      onLayout={(e: LayoutChangeEvent) => { headerH.current = e.nativeEvent.layout.height; }}
    >
      <View style={styles.topBar}>
        <Text style={styles.title} accessibilityRole="header">Library</Text>
        {headerButtons}
      </View>

      {visible.length > 0 ? (
        <RiseIn style={styles.hero}>
          <View onLayout={(e: LayoutChangeEvent) => setHeroBottom(e.nativeEvent.layout.y + e.nativeEvent.layout.height)}>
            <GlassDeck
              songs={deck}
              size={deckSize}
              currentId={currentSongId}
              isPlaying={isPlaying}
              onPlay={playFromDeck}
              onTogglePlay={togglePlayback}
              onShuffle={() => playAll(true)}
            />
            <Text style={styles.meta}>
              {countOf(visible.length, 'song')} · plays offline, lyrics included
            </Text>
          </View>
        </RiseIn>
      ) : null}

      {artists.length > 1 ? (
        <>
          <SectionHeading title="Your artists" subtitle={artist ? 'Tap again to see everyone' : undefined} />
          <ArtistOrbit artists={artists} selected={artist} onSelect={setArtist} />
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

      {visible.length > 0 ? (
        <>
          <SectionHeading
            title={artist ?? 'Songs'}
            subtitle={`${list.length} ${list.length === 1 ? 'song' : 'songs'}${totalMinutes > 0 ? ` · ${lengthText}` : ''}`}
            action={artist ? 'Play' : undefined}
            onAction={artist ? () => playAll(false) : undefined}
          />
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
                selectionColor={Signal.wave}
                accessibilityLabel="Filter your songs"
              />
              {filter ? (
                <Pressable onPress={() => setFilter('')} hitSlop={10} accessibilityRole="button" accessibilityLabel="Clear filter">
                  <Ionicons name="close-circle" size={16} color={Signal.inkMuted} />
                </Pressable>
              ) : null}
            </View>
          </View>
          <View style={styles.chips}>
            {artist ? (
              <Pressable onPress={() => setArtist(null)} accessibilityRole="button" accessibilityLabel={`Show everyone, not only ${artist}`} style={[styles.chip, styles.chipActive, styles.chipArtist]}>
                <Text style={[styles.chipText, styles.chipTextActive]} numberOfLines={1}>{artist}</Text>
                <Ionicons name="close" size={14} color={Signal.waveInk} />
              </Pressable>
            ) : null}
            {(['recent', 'title', 'artist'] as SortMode[]).map(mode => (
              <Pressable
                key={mode}
                onPress={() => { Haptics.selectionAsync().catch(() => {}); setSort(mode); }}
                accessibilityRole="button"
                accessibilityState={{ selected: sort === mode }}
                style={[styles.chip, sort === mode && !artist && styles.chipActive, sort === mode && artist && styles.chipOn]}
              >
                <Text style={[styles.chipText, sort === mode && !artist && styles.chipTextActive]}>
                  {mode === 'recent' ? 'Recently added' : mode === 'title' ? 'A–Z' : 'By artist'}
                </Text>
              </Pressable>
            ))}
          </View>
        </>
      ) : null}
    </View>
  );

  return (
    <View style={styles.screen}>
      <DynamicAura palette={palette} playing={isPlaying} active={isFocused} dim={0.2} />
      <AnimatedFlatList
        ref={listRef}
        data={list}
        keyExtractor={s => s.id}
        ListHeaderComponent={header}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        initialNumToRender={14}
        windowSize={9}
        onScroll={onScroll}
        scrollEventThrottle={16}
        getItemLayout={(_, index) => ({ length: ROW_H, offset: headerH.current + ROW_H * index, index })}
        onScrollToIndexFailed={({ index }) => listRef.current?.scrollToOffset({ offset: headerH.current + ROW_H * index, animated: false })}
        renderItem={({ item, index }) => (
          <View style={railLetters.length > 0 ? styles.rowBesideRail : undefined}>
          <TrackRow
            title={item.title}
            artist={item.artist}
            artwork={item.coverImageUri}
            duration={item.duration}
            meta={item.lyrics?.length ? 'Lyrics' : undefined}
            isCurrent={currentSongId === item.id}
            onPress={() => playList(list, index)}
            onLongPress={() => actions.open(item)}
          />
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.emptyCard}>
            <Ionicons name={filter || artist ? 'search' : 'cloud-download-outline'} size={28} color={Signal.inkMuted} />
            <Text style={styles.emptyTitle}>{filter || artist ? 'No matches' : 'No songs yet'}</Text>
            <Text style={styles.emptyBody}>
              {filter || artist
                ? 'Try another title or artist.'
                : 'Save any song from Stream or Luvs and it plays offline from here, lyrics included.'}
            </Text>
            {!filter && !artist ? (
              <PrimaryButton icon="radio-outline" label="Find songs on Stream" onPress={() => navigation.navigate('Stream' as never)} />
            ) : null}
          </View>
        }
        contentContainerStyle={{ paddingBottom: bottomClearance }}
      />

      {/* Keeps the status bar legible over scrolled rows. */}
      <Animated.View pointerEvents="none" style={[styles.scrim, { height: insets.top + 70 }, stickyStyle]}>
        <LinearGradient colors={['rgba(8, 9, 12, 0.94)', 'rgba(8, 9, 12, 0.7)', 'rgba(8, 9, 12, 0)']} style={StyleSheet.absoluteFill} />
      </Animated.View>
      {/* Stays at the top once the deck scrolls away: play and shuffle are always one tap. */}
      <Animated.View style={[styles.sticky, { paddingTop: insets.top + 6 }, stickyStyle]} pointerEvents={inList ? 'box-none' : 'none'}>
        <View style={styles.stickyBar}>
          <Text style={styles.stickyTitle} numberOfLines={1}>{artist ?? 'Library'}</Text>
          <Tactile onPress={() => playAll(true)} pressScale={0.9} accessibilityRole="button" accessibilityLabel="Shuffle" style={styles.stickyGlass}>
            <Ionicons name="shuffle" size={18} color={Signal.ink} />
          </Tactile>
          <Tactile onPress={() => playAll(false)} pressScale={0.9} accessibilityRole="button" accessibilityLabel="Play all" style={styles.stickyPlay}>
            <Ionicons name="play" size={18} color={Signal.waveInk} />
          </Tactile>
        </View>
      </Animated.View>

      {inList && railLetters.length > 0 ? (
        <AlphabetRail
          letters={railLetters}
          onPick={jumpTo}
          style={[styles.rail, { top: insets.top + 84, maxHeight: screenH - insets.top - 84 - bottomClearance }]}
        />
      ) : null}

      {actions.element}
      <DownloadQueueModal visible={queueOpen} onClose={() => setQueueOpen(false)} />
    </View>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Signal.bg },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Space.md + 4 },
  topActions: { flexDirection: 'row', gap: 8 },
  badge: { position: 'absolute', top: -2, right: -2, minWidth: 16, height: 16, borderRadius: 8, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center', backgroundColor: Signal.wave },
  badgeText: { color: Signal.waveInk, fontSize: 10, fontWeight: '700' },
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
  title: { fontWeight: '700', fontSize: 28, color: Signal.ink },
  hero: { marginTop: Space.lg, alignItems: 'center' },
  actions: { flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', gap: 10, marginTop: 6 },
  meta: { fontWeight: '400', fontSize: 13, color: Signal.inkMuted, marginTop: 10, textAlign: 'center' },
  filterRow: { paddingHorizontal: Space.md, marginTop: 4 },
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
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Space.xs, paddingHorizontal: Space.md, marginTop: Space.sm, marginBottom: Space.xs },
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
  chipOn: { borderColor: Signal.wave },
  chipArtist: { flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: 200 },
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
    gap: Space.sm,
  },
  emptyTitle: { fontWeight: '700', fontSize: 18, color: Signal.ink },
  emptyBody: { fontWeight: '400', fontSize: 14, color: Signal.inkMuted, textAlign: 'center' },
  scrim: { position: 'absolute', top: 0, left: 0, right: 0 },
  sticky: { position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: 12 },
  stickyBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 54,
    paddingLeft: 18,
    paddingRight: 7,
    borderRadius: Radius.pill,
    backgroundColor: 'rgba(14, 16, 20, 0.95)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Glass.hairlineStrong,
  },
  stickyTitle: { flex: 1, color: Signal.ink, fontSize: 17, fontWeight: '700' },
  stickyGlass: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: Glass.fillLight },
  stickyPlay: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: Signal.wave },
  rail: { position: 'absolute', right: 4 },
  // Long titles stop short of the A–Z rail instead of running under it.
  rowBesideRail: { paddingRight: 26 },
});

export default LibraryScreen;
