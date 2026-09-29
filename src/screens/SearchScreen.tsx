/**
 * Search — one field for everything: what is on this phone (downloaded songs
 * and your playlists) and what is online (the streaming catalog).
 *
 *   All            best of both: phone matches first (they play instantly,
 *                  offline), then the catalog
 *   On this phone  every local song and playlist that matches
 *   Online         the catalog, streamable, with ↓ to save
 *
 * Phone results answer as you type (native index, ~120ms debounce). The
 * catalog waits for a pause (350ms) and a sequence number drops any answer
 * that arrives after a newer query. Empty field: recent searches and moods.
 *
 * Same room as Stream: Allegra's live shader tinted by the playing cover, a
 * frosted field, sentence-case shelves, the shared SongRow.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from '../utils/haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import { TabScreenProps } from '../types/navigation';
import { useSongsStore } from '../store/songsStore';
import { usePlaylistStore } from '../store/playlistStore';
import { usePlayerStore } from '../store/playerStore';
import { useSettingsStore } from '../store/settingsStore';
import { useSearchHistoryStore } from '../store/searchHistoryStore';
import { useDownloadQueueStore } from '../store/downloadQueueStore';
import { Playlist, Song, UnifiedSong } from '../types/song';
import { searchMusic } from '../services/MultiSourceSearchService';
import { YTMusicClient } from '../services/ytmusic/YTMusicClient';
import type { YTPageItem } from '../services/ytmusic/browse';

type YTArtistResult = YTPageItem<'artist'>;
import { StreamService } from '../services/stream/StreamService';
import { streamIdFor } from '../services/stream/streamSong';
import { openPlayerSheet } from '../navigation/playerSheet';
import { Radius, Signal, Space } from '../constants/allegraTheme';
import DynamicAura from '../components/allegra/DynamicAura';
import { useArtworkPalette } from '../components/allegra/useArtworkPalette';
import { RiseIn, Tactile } from '../components/allegra/motion';
import { SectionHeading } from '../components/allegra/home';
import Artwork from '../components/allegra/Artwork';
import { GUTTER, MoodChips, SongRow, TrackItem } from '../components/stream/StreamHome';
import { Toast } from '../components/Toast';
import { useBottomClearance } from '../hooks/useBottomClearance';

type Props = TabScreenProps<'Search'>;
type Scope = 'All' | 'On this phone' | 'Online';
const SCOPES: Scope[] = ['All', 'On this phone', 'Online'];

const LOCAL_DEBOUNCE_MS = 120;
const ONLINE_DEBOUNCE_MS = 350;
/** In "All", each side shows this many before "See all". */
const PREVIEW = 4;

const MOODS = [
  { label: 'Chill', query: 'chill lofi', icon: 'cafe-outline' },
  { label: 'Energy', query: 'workout hits', icon: 'flash-outline' },
  { label: 'Romance', query: 'romantic hits', icon: 'heart-outline' },
  { label: 'Focus', query: 'instrumental focus', icon: 'leaf-outline' },
  { label: 'Party', query: 'party hits', icon: 'musical-notes-outline' },
  { label: 'Heartbreak', query: 'sad songs', icon: 'rainy-outline' },
] as const;

const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').trim();

const SearchScreen: React.FC<Props> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const bottomClearance = useBottomClearance();
  const isFocused = useIsFocused();
  const inputRef = useRef<TextInput>(null);

  const searchSongs = useSongsStore(s => s.searchSongs);
  const librarySongs = useSongsStore(s => s.songs);
  const playlists = usePlaylistStore(s => s.playlists);
  const currentSongId = usePlayerStore(s => s.currentSongId);
  const currentCover = usePlayerStore(s => s.currentSong?.coverImageUri);
  const isPlaying = usePlayerStore(s => s.isPlaying);
  const playInMiniPlayerOnly = useSettingsStore(s => s.playInMiniPlayerOnly);
  const recent = useSearchHistoryStore(s => s.recent);
  const remember = useSearchHistoryStore(s => s.remember);
  const forget = useSearchHistoryStore(s => s.forget);
  const clearRecent = useSearchHistoryStore(s => s.clear);
  const addToDownloads = useDownloadQueueStore(s => s.addToQueue);

  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<Scope>('All');
  const [local, setLocal] = useState<Song[]>([]);
  const [online, setOnline] = useState<UnifiedSong[] | null>(null);
  const [artists, setArtists] = useState<YTArtistResult[]>([]);
  const [onlineBusy, setOnlineBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const localSeq = useRef(0);
  const onlineSeq = useRef(0);

  const palette = useArtworkPalette(currentCover);
  const q = query.trim();

  // Opening Search from the ••• menu means "I want to type": focus the field.
  useFocusEffect(useCallback(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 250);
    return () => clearTimeout(t);
  }, []));

  // ── Phone: native index, answers while typing ──────────────────────────
  useEffect(() => {
    const seq = ++localSeq.current;
    if (!q) { setLocal([]); return; }
    const t = setTimeout(async () => {
      const found = await searchSongs(q).catch(() => [] as Song[]);
      if (seq === localSeq.current) setLocal(found);
    }, LOCAL_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [q, searchSongs]);

  // ── Online: the catalog, after a pause ─────────────────────────────────
  useEffect(() => {
    const seq = ++onlineSeq.current;
    setOnlineBusy(false);
    if (!q) { setOnline(null); setArtists([]); return; }
    // Scoped to the phone: keep the last catalog answer, don't fetch.
    if (scope === 'On this phone') return;
    setOnlineBusy(true);
    const t = setTimeout(async () => {
      const [found, people] = await Promise.all([
        searchMusic(q).catch(() => [] as UnifiedSong[]),
        YTMusicClient.searchArtists(q).catch(() => [] as YTArtistResult[]),
      ]);
      if (seq !== onlineSeq.current) return; // a newer query won
      setOnline(found);
      setArtists(people.slice(0, 8));
      setOnlineBusy(false);
    }, ONLINE_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [q, scope]);

  const matchingPlaylists = useMemo(() => {
    if (!q) return [];
    const needle = norm(q);
    return playlists.filter(p => norm(p.name).includes(needle)).slice(0, 8);
  }, [q, playlists]);

  // Online results that are already downloaded are shown once, under the phone.
  const onlineFresh = useMemo(() => {
    if (!online) return [];
    const have = new Set(local.map(s => `${norm(s.title)}|${norm(s.artist ?? '')}`));
    return online.filter(s => !have.has(`${norm(s.title)}|${norm(s.artist)}`));
  }, [online, local]);

  // ── Actions ────────────────────────────────────────────────────────────
  const commit = useCallback(() => { if (q) remember(q); }, [q, remember]);

  const playLocal = useCallback((list: Song[], index: number) => {
    Haptics.selectionAsync().catch(() => {});
    commit();
    Keyboard.dismiss();
    const song = list[index];
    const player = usePlayerStore.getState();
    const alreadyOn = player.currentSongId === song.id;
    if (!alreadyOn) {
      // The whole library is the queue, so next/auto-next keep going.
      const libIndex = librarySongs.findIndex(s => s.id === song.id);
      if (libIndex !== -1) player.setPlaylistQueue('library', librarySongs, libIndex);
      else player.setPlaylistQueue('search', list, index);
    }
    if (!playInMiniPlayerOnly || alreadyOn) openPlayerSheet(song.id);
  }, [commit, librarySongs, playInMiniPlayerOnly]);

  const playOnline = useCallback((list: UnifiedSong[], index: number) => {
    Haptics.selectionAsync().catch(() => {});
    commit();
    Keyboard.dismiss();
    StreamService.play(list, index);
  }, [commit]);

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

  const openPlaylist = useCallback((playlist: Playlist) => {
    commit();
    Keyboard.dismiss();
    navigation.navigate('Library', { screen: 'PlaylistDetail', params: { playlistId: playlist.id } });
  }, [commit, navigation]);

  const searchFor = useCallback((text: string, nextScope: Scope = 'All') => {
    Haptics.selectionAsync().catch(() => {});
    setQuery(text);
    setScope(nextScope);
    remember(text);
    Keyboard.dismiss();
  }, [remember]);

  const clearField = useCallback(() => {
    setQuery('');
    inputRef.current?.focus();
  }, []);

  const localTrack = (s: Song): TrackItem => ({
    key: s.id, title: s.title, artist: s.artist, artwork: s.coverImageUri, isCurrent: currentSongId === s.id,
  });
  const onlineTrack = (s: UnifiedSong): TrackItem => ({
    key: streamIdFor(s), title: s.title, artist: s.artist, artwork: s.highResArt, isCurrent: currentSongId === streamIdFor(s), download: s,
  });

  // ── Body ───────────────────────────────────────────────────────────────
  let body: React.ReactNode;
  if (!q) {
    body = (
      <RiseIn>
        {recent.length > 0 ? (
          <>
            <SectionHeading title="Recent searches" action="Clear" onAction={clearRecent} />
            <View style={styles.list}>
              {recent.map(r => (
                <View key={r} style={styles.recentRow}>
                  <Pressable
                    onPress={() => searchFor(r)}
                    style={({ pressed }) => [styles.recentMain, pressed && styles.pressed]}
                    accessibilityRole="button"
                    accessibilityLabel={`Search ${r}`}
                  >
                    <Ionicons name="time-outline" size={18} color={Signal.inkMuted} />
                    <Text style={styles.recentText} numberOfLines={1}>{r}</Text>
                  </Pressable>
                  <Pressable onPress={() => forget(r)} hitSlop={10} accessibilityRole="button" accessibilityLabel={`Remove ${r}`}>
                    <Ionicons name="close" size={18} color={Signal.inkFaint} />
                  </Pressable>
                </View>
              ))}
            </View>
          </>
        ) : null}

        <SectionHeading title="Browse by mood" subtitle="Streams from the catalog" />
        <View style={styles.moodGrid}>
          {MOODS.map((m, i) => (
            <Tactile
              key={m.label}
              onPress={() => searchFor(m.query, 'Online')}
              pressScale={0.96}
              accessibilityRole="button"
              accessibilityLabel={`${m.label} music`}
              wrapperStyle={styles.moodCell}
              style={styles.mood}
            >
              <LinearGradient
                colors={MOOD_TONES[i % MOOD_TONES.length]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
              />
              <Ionicons name={m.icon} size={22} color={Signal.ink} />
              <Text style={styles.moodLabel}>{m.label}</Text>
            </Tactile>
          ))}
        </View>
      </RiseIn>
    );
  } else {
    const showPhone = scope !== 'Online';
    const showOnline = scope !== 'On this phone';
    const phoneSongs = scope === 'All' ? local.slice(0, PREVIEW) : local;
    const onlineSongs = scope === 'All' ? onlineFresh.slice(0, PREVIEW * 2) : onlineFresh;
    const nothingLocal = local.length === 0 && matchingPlaylists.length === 0;

    body = (
      <View>
        {showPhone && matchingPlaylists.length > 0 ? (
          <>
            <SectionHeading title="Playlists" subtitle={`${matchingPlaylists.length} on this phone`} />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.shelf} keyboardShouldPersistTaps="handled">
              {matchingPlaylists.map(p => (
                <Tactile key={p.id} onPress={() => openPlaylist(p)} pressScale={0.96} accessibilityRole="button" accessibilityLabel={`Playlist ${p.name}`} style={styles.playlistCard}>
                  <View style={styles.playlistArt}>
                    <Artwork uri={p.coverImageUri} title={p.name} size={120} style={StyleSheet.absoluteFill} />
                  </View>
                  <Text style={styles.cardTitle} numberOfLines={1}>{p.name}</Text>
                  <Text style={styles.cardSub} numberOfLines={1}>{p.songCount ?? 0} {p.songCount === 1 ? 'song' : 'songs'}</Text>
                </Tactile>
              ))}
            </ScrollView>
          </>
        ) : null}

        {showPhone ? (
          <>
            <SectionHeading
              title="On this phone"
              subtitle={local.length ? `${local.length} ${local.length === 1 ? 'song' : 'songs'} · plays offline` : undefined}
              action={scope === 'All' && local.length > PREVIEW ? 'See all' : undefined}
              onAction={() => setScope('On this phone')}
            />
            {local.length === 0 ? (
              <Text style={styles.empty}>
                {nothingLocal ? 'Nothing downloaded matches. Online results are below.' : 'No songs match, only playlists.'}
              </Text>
            ) : (
              <View style={styles.list}>
                {phoneSongs.map((s, i) => (
                  <SongRow key={s.id} item={localTrack(s)} onPress={() => playLocal(phoneSongs, i)} />
                ))}
              </View>
            )}
          </>
        ) : null}

        {showOnline && artists.length > 0 ? (
          <>
            <SectionHeading title="Artists" />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.shelf} keyboardShouldPersistTaps="handled">
              {artists.map(a => (
                <Tactile
                  key={a.browseId}
                  onPress={() => { commit(); Keyboard.dismiss(); navigation.navigate('Browse', { screen: 'Artist', params: { name: a.title, browseId: a.browseId } }); }}
                  pressScale={0.96}
                  accessibilityRole="button"
                  accessibilityLabel={`Artist ${a.title}`}
                  style={styles.personCard}
                >
                  <View style={styles.personArt}>
                    <Artwork uri={a.thumbnail} title={a.title} size={96} style={StyleSheet.absoluteFill} />
                  </View>
                  <Text style={[styles.cardTitle, styles.center]} numberOfLines={1}>{a.title}</Text>
                </Tactile>
              ))}
            </ScrollView>
          </>
        ) : null}

        {showOnline ? (
          <>
            <SectionHeading
              title="Online"
              subtitle={onlineBusy ? 'Searching the catalog…' : online ? `${onlineFresh.length} to stream` : undefined}
              action={scope === 'All' && onlineFresh.length > PREVIEW * 2 ? 'See all' : undefined}
              onAction={() => setScope('Online')}
            />
            {onlineBusy && onlineFresh.length === 0 ? (
              <ActivityIndicator color={Signal.wave} style={styles.spinner} />
            ) : null}
            {!onlineBusy && online && onlineFresh.length === 0 ? (
              <Text style={styles.empty}>Nothing streamable for that. Try the artist name or another spelling — or check your connection.</Text>
            ) : null}
            <View style={styles.list}>
              {onlineSongs.map((s, i) => (
                <SongRow
                  key={streamIdFor(s)}
                  item={onlineTrack(s)}
                  onPress={() => playOnline(onlineSongs, i)}
                  onLongPress={() => queueNext(s)}
                  onSave={() => save(s)}
                />
              ))}
            </View>
          </>
        ) : null}
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <DynamicAura palette={palette} playing={isPlaying} active={isFocused} mood="chill" dim={0.14} />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={{ paddingTop: insets.top + Space.xs, paddingBottom: bottomClearance }}
      >
        <View style={styles.header}>
          <Text style={styles.title} accessibilityRole="header">Search</Text>
        </View>

        <View style={styles.search}>
          <Ionicons name="search" size={18} color={Signal.inkMuted} />
          <TextInput
            ref={inputRef}
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={commit}
            placeholder="Songs, artists, playlists"
            placeholderTextColor={Signal.inkFaint}
            returnKeyType="search"
            autoCorrect={false}
            style={styles.searchInput}
            accessibilityLabel="Search your phone and the catalog"
          />
          {query.length > 0 ? (
            <Pressable onPress={clearField} hitSlop={10} accessibilityRole="button" accessibilityLabel="Clear search">
              <Ionicons name="close-circle" size={18} color={Signal.inkMuted} />
            </Pressable>
          ) : null}
        </View>

        {q ? (
          <View style={styles.chips}>
            <MoodChips moods={SCOPES} selected={scope} onSelect={s => setScope((s as Scope | null) ?? 'All')} />
          </View>
        ) : null}

        {body}
      </ScrollView>
      <LinearGradient
        pointerEvents="none"
        colors={['rgba(10, 11, 14, 0.92)', 'rgba(10, 11, 14, 0)']}
        style={[styles.statusScrim, { height: insets.top + 16 }]}
      />
      {toast ? <Toast visible message={toast} type="info" duration={2200} onDismiss={() => setToast(null)} /> : null}
    </View>
  );
};

/** Quiet duotones for the mood tiles — Allegra's warm/cool support colours. */
const MOOD_TONES: readonly [string, string][] = [
  ['#2c4a5e', '#16202a'],
  ['#6a5c1c', '#24220f'],
  ['#6b2f38', '#241217'],
  ['#2f5a45', '#122019'],
  ['#4b2f6b', '#1a1224'],
  ['#3a4660', '#141820'],
];

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Signal.bg },
  header: { height: 52, justifyContent: 'center', paddingHorizontal: GUTTER },
  title: { fontSize: 28, fontWeight: '700', color: Signal.ink },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    marginHorizontal: GUTTER,
    marginTop: Space.xs,
    height: 46,
    paddingHorizontal: Space.sm,
    borderRadius: Radius.pill,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.14)',
  },
  searchInput: { flex: 1, color: Signal.ink, fontSize: 16, paddingVertical: 0 },
  chips: { marginTop: Space.sm },
  list: { paddingHorizontal: GUTTER },
  spinner: { marginTop: Space.md },
  empty: { color: Signal.inkMuted, fontSize: 14, paddingHorizontal: GUTTER, marginBottom: Space.xs },
  pressed: { opacity: 0.6 },
  recentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 48,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  recentMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Space.sm, paddingVertical: Space.sm },
  recentText: { flex: 1, color: Signal.ink, fontSize: 16 },
  moodGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    paddingHorizontal: GUTTER,
    rowGap: Space.sm,
  },
  moodCell: { width: '48.5%' },
  mood: {
    height: 84,
    borderRadius: Radius.well,
    overflow: 'hidden',
    padding: Space.sm,
    justifyContent: 'space-between',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  moodLabel: { color: Signal.ink, fontSize: 16, fontWeight: '700' },
  shelf: { paddingHorizontal: GUTTER, gap: Space.sm },
  playlistCard: { width: 120 },
  personCard: { width: 96 },
  personArt: { width: 96, height: 96, borderRadius: 48, overflow: 'hidden', backgroundColor: Signal.bgSubtle },
  center: { textAlign: 'center' },
  playlistArt: { width: 120, height: 120, borderRadius: Radius.art, overflow: 'hidden', backgroundColor: Signal.bgSubtle },
  cardTitle: { color: Signal.ink, fontSize: 14, fontWeight: '600', marginTop: Space.xs },
  cardSub: { color: Signal.inkMuted, fontSize: 12, marginTop: 1 },
  statusScrim: { position: 'absolute', top: 0, left: 0, right: 0 },
});

export default SearchScreen;
