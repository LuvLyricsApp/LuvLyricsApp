/**
 * Luvs — a map of your tastes, not a feed.
 *
 *   Across   lanes of taste: For you, one per artist you love, then your
 *            chill and energy mixes. The neighbouring lanes peek at the edges.
 *   Deeper   swipe up and the next song in the same taste rises from the
 *            stack behind the card; the lane keeps growing from the radio of
 *            the song you're on, so going down drifts deeper into that taste.
 *
 * Each lane remembers how deep you went. Tap the card to pause. Under the map:
 * the song, its clip scrubber, and Luv · Save · Full song · Share.
 *
 * Luvs runs its own audio pool (LuvsBufferManager), addressed by URL so any
 * lane can play next; the songs a swipe can reach are kept warm. The mini
 * player is hidden here (RootNavigator), and the library player yields.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Share, StatusBar, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeOut, useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useIsFocused, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as Haptics from '../utils/haptics';
import { useLuvsFeedStore } from '../store/luvsFeedStore';
import { useLuvsLanesStore } from '../store/luvsLanesStore';
import { useLuvsPreferencesStore } from '../store/luvsPreferencesStore';
import { useStreamHistoryStore } from '../store/streamHistoryStore';
import { useSongsStore } from '../store/songsStore';
import { usePlayerStore } from '../store/playerStore';
import { useSettingsStore } from '../store/settingsStore';
import { useDownloadQueueStore } from '../store/downloadQueueStore';
import { useDownloadState } from '../hooks/useDownloadState';
import { luvsBufferManager } from '../services/LuvsBufferManager';
import { luvsEngine } from '../services/luvsEngine';
import { hookOffsetSeconds } from '../services/luvsHook';
import { tasteSeeds } from '../services/luvsTaste';
import { FOR_YOU, LaneSources, deepenLane, laneSpecs, loadLane, needsDeepening, warmAround } from '../services/luvsLanes';
import { recommendFor, defaultDeps } from '../services/stream/recommend';
import { personalMoodMix } from '../services/stream/moodMix';
import { resolveMany } from '../services/ytmusic/resolver';
import { YTMusicClient } from '../services/ytmusic/YTMusicClient';
import { StreamService } from '../services/stream/StreamService';
import { streamIdFor } from '../services/stream/streamSong';
import TasteExplorer from '../components/luvs/TasteExplorer';
import TasteCard from '../components/luvs/TasteCard';
import LaneRail from '../components/luvs/LaneRail';
import { LuvAction, LuvScrubber } from '../components/luvs/LuvControls';
import { LuvsVaultModal } from '../components/LuvsVaultModal';
import { SwapText, Tactile } from '../components/allegra/motion';
import { Glass, Signal } from '../constants/allegraTheme';
import { TAB_BAR_CLEARANCE } from '../navigation/tabs';
import type { RootStackParamList } from '../types/navigation';
import type { UnifiedSong } from '../types/song';

// Stands in for "no song yet" so the download hook always has something to read.
const NO_SONG = { id: '', title: '' };

/** Under this many seconds on a card counts as a skip for the recommender. */
const SKIP_THRESHOLD_SECONDS = 3;
let hintSeen = false;

const leadOf = (artist: string | undefined) => (artist ?? '').split(/,|&| feat\.? /i)[0]?.trim() ?? '';

/** A stand-in card while a lane is still finding its songs (or found none). */
const placeholder = (laneId: string, title: string, empty: boolean): UnifiedSong => ({
  id: `${empty ? 'empty' : 'loading'}:${laneId}`,
  title,
  artist: '',
  highResArt: '',
  downloadUrl: '',
  source: 'Saavn',
});
const isPlaceholder = (song: UnifiedSong | undefined) => !song || /^(loading|empty):/.test(song.id);

const LuvsScreen: React.FC = () => {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const isFocused = useIsFocused();
  const insets = useSafeAreaInsets();
  const { width: screenW, height: screenH } = useWindowDimensions();

  const feedSongs = useLuvsFeedStore(s => s.feedSongs);
  const feedLoading = useLuvsFeedStore(s => s.isLoading);
  const vault = useLuvsFeedStore(s => s.vault);
  const isInVault = useLuvsFeedStore(s => s.isInVault);
  const addToVault = useLuvsFeedStore(s => s.addToVault);
  const removeFromVault = useLuvsFeedStore(s => s.removeFromVault);
  const loadPrefs = useLuvsPreferencesStore(s => s.loadFromStorage);
  const languages = useLuvsPreferencesStore(s => s.preferredLanguages);

  const lanes = useLuvsLanesStore(s => s.lanes);
  const laneIndex = useLuvsLanesStore(s => s.laneIndex);
  const depths = useLuvsLanesStore(s => s.depths);

  const [playing, setPlaying] = useState(true);
  const [showVault, setShowVault] = useState(false);
  const [burst, setBurst] = useState(0);
  const [hint, setHint] = useState(!hintSeen);
  const [lastDir, setLastDir] = useState(1);
  const camX = useSharedValue(laneIndex);

  // ── Layout: the card fills what the header, rail, controls and bar leave ──
  // Title and artist (50), scrubber or hint (46), actions (12 + 84), and the 8
  // over the tab bar clearance: short of this, the controls overflow up into the card.
  const controlsH = 50 + 46 + 12 + 84 + 8;
  const available = screenH - insets.top - 58 - 52 - controlsH - (TAB_BAR_CLEARANCE + insets.bottom) - 34;
  // A short screen narrows the card rather than letting it run into the title.
  const cardW = Math.round(Math.min(screenW * 0.8, 440, Math.max(160, available / 0.9)));
  const cardH = Math.round(Math.max(cardW * 0.9, Math.min(cardW * 1.3, available)));

  // ── Lanes ────────────────────────────────────────────────────────────────
  const sources = useMemo<LaneSources>(() => {
    const preferred = [...languages].filter(l => l.weight > 0).sort((a, b) => b.weight - a.weight).map(l => l.language);
    return {
      recommend: (seed, limit) => recommendFor(seed, limit),
      moodMix: async (mood, limit) => {
        const seeds = tasteSeeds(useStreamHistoryStore.getState().plays, useSongsStore.getState().songs, Date.now(), 6);
        const yt = await personalMoodMix(mood, { artists: seeds.map(s => leadOf(s.artist)).filter(Boolean), languages: preferred }, q => YTMusicClient.searchSongs(q), limit * 2);
        return resolveMany(yt, defaultDeps.searchCatalog, limit);
      },
    };
  }, [languages]);

  // The lanes come from what you play; For you follows the engine's feed.
  useEffect(() => {
    const seeds = tasteSeeds(useStreamHistoryStore.getState().plays, useSongsStore.getState().songs);
    useLuvsLanesStore.getState().setSpecs(laneSpecs(seeds));
  }, []);
  useEffect(() => {
    useLuvsLanesStore.getState().setLaneSongs(FOR_YOU.id, feedSongs, feedSongs.length > 0 ? 'ready' : feedLoading ? 'loading' : 'idle');
  }, [feedSongs, feedLoading]);

  // A lane loads when it's next to you, so the swipe into it is instant.
  useEffect(() => {
    for (const i of [laneIndex - 1, laneIndex, laneIndex + 1]) {
      const lane = lanes[i];
      if (!lane || lane.id === FOR_YOU.id || lane.status !== 'idle') continue;
      const store = useLuvsLanesStore.getState();
      store.setLaneStatus(lane.id, 'loading');
      loadLane(lane, sources)
        .then(songs => useLuvsLanesStore.getState().setLaneSongs(lane.id, songs))
        .catch(() => useLuvsLanesStore.getState().setLaneStatus(lane.id, 'empty'));
    }
  }, [lanes, laneIndex, sources]);

  const explorerLanes = useMemo(() => lanes.map(l => ({
    id: l.id,
    songs: l.songs.length > 0 ? l.songs : [placeholder(l.id, l.subtitle, l.status === 'empty')],
  })), [lanes]);

  const lane = lanes[laneIndex];
  const depth = depths[laneIndex] ?? 0;
  const song = explorerLanes[laneIndex]?.songs[depth];

  // ── Audio ────────────────────────────────────────────────────────────────
  useEffect(() => {
    let alive = true;
    loadPrefs().then(async () => {
      await luvsBufferManager.enterLuvsMode();
      if (alive && useLuvsFeedStore.getState().feedSongs.length === 0) await luvsEngine.refresh();
    }).catch(() => {});
    return () => {
      alive = false;
      luvsBufferManager.exitLuvsMode();
    };
  }, [loadPrefs]);

  useFocusEffect(useCallback(() => {
    StatusBar.setHidden(true);
    setPlaying(true);
    // The library song stops as Luvs opens, not ducked under it until the
    // first card's audio arrives.
    if (usePlayerStore.getState().isPlaying) usePlayerStore.getState().requestPlayback(false);
    return () => {
      StatusBar.setHidden(false);
      luvsBufferManager.stopAll();
      luvsEngine.flush();
    };
  }, []));

  // The library player yields while Luvs plays.
  const silenceMain = useCallback(() => {
    if (usePlayerStore.getState().isPlaying) usePlayerStore.getState().requestPlayback(false);
  }, []);

  // Watch time of the song we're leaving, for the recommender.
  const watching = useRef<{ song: UnifiedSong; since: number } | null>(null);
  const recordLeaving = useCallback(() => {
    const w = watching.current;
    if (!w || isPlaceholder(w.song)) return;
    const seconds = (Date.now() - w.since) / 1000;
    luvsEngine.recordInteraction({
      songId: w.song.id,
      title: w.song.title,
      artist: w.song.artist || 'Unknown',
      timestamp: Date.now(),
      watchDuration: seconds,
      totalDuration: w.song.duration || 180,
      liked: isInVault(w.song.id),
      skipped: seconds < SKIP_THRESHOLD_SECONDS,
    });
  }, [isInVault]);

  // A new song under the finger: play it (from the hook), warm what's next.
  const songId = song?.id;
  useEffect(() => {
    if (!isFocused || !song || isPlaceholder(song)) return;
    recordLeaving();
    watching.current = { song, since: Date.now() };
    silenceMain();
    setPlaying(true);
    const warm = warmAround(explorerLanes, laneIndex, depths).filter(s => !isPlaceholder(s));
    const atHook = useSettingsStore.getState().luvsStartAtHook;
    luvsBufferManager.activate(song, warm, true, atHook)
      .then(() => {
        // Android opens the clip on its hook inside the player (it knows the real
        // length). Elsewhere it seeks from the catalogue's duration, when it has one.
        if (!atHook || Platform.OS === 'android') return;
        if (watching.current?.song.id !== song.id) return;
        const offset = hookOffsetSeconds(song.duration);
        if (offset > 0) luvsBufferManager.seekTo(offset * 1000);
      })
      .catch(() => {});
  // Only a different song (or coming back to the screen) restarts audio.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [songId, isFocused]);

  useEffect(() => {
    luvsBufferManager.setSuspended(!isFocused);
    if (!isFocused) luvsBufferManager.pause();
  }, [isFocused]);

  // The lane grows before you reach its end.
  useEffect(() => {
    if (!lane || !needsDeepening(depth, lane.songs.length, lane.growing || lane.status === 'loading')) return;
    if (lane.id === FOR_YOU.id) {
      if (!feedLoading) luvsEngine.loadMore();
      return;
    }
    useLuvsLanesStore.getState().setGrowing(lane.id, true);
    deepenLane(lane.songs, depth, sources)
      .then(more => useLuvsLanesStore.getState().appendLaneSongs(lane.id, more))
      .catch(() => useLuvsLanesStore.getState().setGrowing(lane.id, false));
  }, [lane, depth, sources, feedLoading]);

  // ── Moves ────────────────────────────────────────────────────────────────
  const onCommit = useCallback((nextLane: number, nextDepth: number) => {
    const { laneIndex: fromLane, depths: fromDepths } = useLuvsLanesStore.getState();
    setLastDir(nextLane !== fromLane ? (nextLane > fromLane ? 1 : -1) : nextDepth >= (fromDepths[fromLane] ?? 0) ? 1 : -1);
    Haptics.selectionAsync().catch(() => {});
    useLuvsLanesStore.getState().moveTo(nextLane, nextDepth);
  }, []);

  const pickLane = useCallback((i: number) => {
    if (i === useLuvsLanesStore.getState().laneIndex) return;
    Haptics.selectionAsync().catch(() => {});
    const { laneIndex: from, depths: d } = useLuvsLanesStore.getState();
    setLastDir(i > from ? 1 : -1);
    useLuvsLanesStore.getState().moveTo(i, d[i] ?? 0);
  }, []);

  const togglePlay = useCallback(() => {
    if (isPlaceholder(song)) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    if (playing) {
      luvsBufferManager.pause();
      setPlaying(false);
    } else {
      silenceMain();
      luvsBufferManager.resume();
      setPlaying(true);
    }
  }, [playing, song, silenceMain]);

  const retireHint = useCallback(() => {
    hintSeen = true;
    setHint(false);
  }, []);

  // ── Actions ──────────────────────────────────────────────────────────────
  const liked = !!song && isInVault(song.id);
  const onLuv = useCallback(() => {
    if (!song || isPlaceholder(song)) return;
    if (isInVault(song.id)) {
      removeFromVault(song.id);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    } else {
      addToVault(song);
      setBurst(b => b + 1);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    }
  }, [song, isInVault, addToVault, removeFromVault]);

  // The same download state every song row shows: saving, the percentage, saved.
  const download = useDownloadState(song ?? NO_SONG);
  const onSave = useCallback(() => {
    if (!song || isPlaceholder(song) || download.phase !== 'idle') return;
    StreamService.save(song);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  }, [song, download.phase]);
  const saveLabel = download.phase === 'saved' ? 'Saved'
    : download.phase === 'downloading' ? `${Math.round(download.progress * 100)}%`
    : download.phase === 'queued' || download.phase === 'paused' ? 'Waiting'
    : download.phase === 'failed' ? 'Retry' : 'Save';

  const onFull = useCallback(async () => {
    if (!song || isPlaceholder(song)) return;
    const list = lane?.songs ?? [song];
    const at = Math.max(0, list.findIndex(s => s.id === song.id));
    await luvsBufferManager.pause();
    setPlaying(false);
    StreamService.play(list.slice(at), 0);
    navigation.navigate('NowPlaying', { songId: streamIdFor(song) });
  }, [song, lane, navigation]);

  const onShare = useCallback(() => {
    if (!song || isPlaceholder(song)) return;
    Share.share({ message: song.artist ? `${song.title} by ${song.artist}` : song.title }).catch(() => {});
  }, [song]);

  const onReload = useCallback(async () => {
    Haptics.selectionAsync().catch(() => {});
    await luvsBufferManager.stopAll();
    const seeds = tasteSeeds(useStreamHistoryStore.getState().plays, useSongsStore.getState().songs);
    const store = useLuvsLanesStore.getState();
    store.setSpecs([]);
    store.setSpecs(laneSpecs(seeds));
    await luvsEngine.refresh();
  }, []);

  const renderCard = useCallback((s: UnifiedSong, active: boolean) => {
    if (isPlaceholder(s)) {
      const empty = s.id.startsWith('empty:');
      return (
        <View style={styles.placeholder}>
          {empty ? <Ionicons name="cloud-offline-outline" size={30} color={Signal.inkMuted} /> : <ActivityIndicator color={Signal.inkSoft} />}
          <Text style={styles.placeholderText}>{empty ? 'Nothing found for this taste right now' : `Finding songs — ${s.title.toLowerCase()}`}</Text>
        </View>
      );
    }
    return <TasteCard song={s} size={cardW} active={active} playing={active && playing} />;
  }, [cardW, playing]);

  const ready = lanes.length > 0;
  const depthLabel = lane ? `${lane.subtitle}${depth > 0 ? ` · ${depth + 1} deep` : ''}` : '';

  return (
    <View style={styles.screen}>
      {/* The room: the playing cover, blurred small and scaled up (instant on any phone). */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        {song && !isPlaceholder(song) ? (
          <Image
            source={{ uri: song.highResArt || song.thumbnail }}
            style={[styles.backdrop, { transform: [{ scale: Math.max(screenW, screenH) / 40 }] }]}
            blurRadius={4}
            contentFit="cover"
            transition={500}
          />
        ) : null}
        <LinearGradient colors={['rgba(7,8,11,0.55)', 'rgba(7,8,11,0.72)', 'rgba(7,8,11,0.92)']} style={StyleSheet.absoluteFill} />
      </View>

      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <Text style={styles.title} accessibilityRole="header">Luvs</Text>
        <View style={styles.headerActions}>
          <Tactile onPress={onReload} pressScale={0.9} hitSlop={8} accessibilityRole="button" accessibilityLabel="Fresh lanes" style={styles.round}>
            <Ionicons name="refresh" size={19} color={Signal.ink} />
          </Tactile>
          <Tactile onPress={() => setShowVault(true)} pressScale={0.9} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Your luvs, ${vault.length}`} style={styles.round}>
            <MaterialCommunityIcons name="heart-multiple" size={19} color={Signal.ink} />
            {vault.length > 0 ? <View style={styles.badge}><Text style={styles.badgeText}>{vault.length}</Text></View> : null}
          </Tactile>
        </View>
      </View>

      {ready ? (
        <>
          <LaneRail titles={lanes.map(l => l.title)} subtitle={depthLabel} cam={camX} width={screenW} onPick={pickLane} />
          <View style={[styles.mapArea, { height: cardH + 36 }]}>
            <TasteExplorer
              lanes={explorerLanes}
              laneIndex={laneIndex}
              depths={depths}
              width={cardW}
              height={cardH}
              renderCard={renderCard}
              onCommit={onCommit}
              onTap={togglePlay}
              onFirstMove={retireHint}
              camX={camX}
            />
          </View>

          <View style={[styles.controls, { paddingBottom: TAB_BAR_CLEARANCE + insets.bottom + 8 }]}>
            <View style={styles.meta}>
              <SwapText style={styles.songTitle} numberOfLines={1} direction={lastDir}>{song && !isPlaceholder(song) ? song.title : ' '}</SwapText>
              <SwapText style={styles.songArtist} numberOfLines={1} direction={lastDir}>{song && !isPlaceholder(song) ? song.artist || ' ' : ' '}</SwapText>
            </View>
            {hint ? (
              <Animated.Text entering={FadeIn.duration(400)} exiting={FadeOut.duration(300)} style={styles.hint}>
                Swipe across for another taste · up to go deeper
              </Animated.Text>
            ) : (
              <LuvScrubber />
            )}
            <View style={styles.actions}>
              <LuvAction icon={liked ? 'heart' : 'heart-outline'} label={liked ? 'Luved' : 'Luv'} onPress={onLuv} on={liked} tint={Signal.accent} burst={burst} />
              <LuvAction
                icon={download.phase === 'saved' ? 'checkmark' : download.phase === 'failed' ? 'refresh' : 'arrow-down'}
                label={saveLabel}
                onPress={download.phase === 'failed' && song ? () => useDownloadQueueStore.getState().retryItem(song.id) : onSave}
                on={download.phase !== 'idle' && download.phase !== 'failed'}
              />
              <LuvAction icon="play" label="Full song" onPress={onFull} on tint={Signal.wave} />
              <LuvAction icon="share-outline" label="Share" onPress={onShare} />
            </View>
          </View>
        </>
      ) : (
        <View style={styles.loading}><ActivityIndicator color={Signal.inkSoft} /></View>
      )}

      <LuvsVaultModal visible={showVault} onClose={() => setShowVault(false)} />
    </View>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Signal.bgDeep },
  backdrop: { position: 'absolute', left: '50%', top: '50%', width: 40, height: 40, marginLeft: -20, marginTop: -20 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 8 },
  title: { color: Signal.ink, fontSize: 28, fontWeight: '700' },
  headerActions: { flexDirection: 'row', gap: 10 },
  round: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Glass.fillLight,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Glass.hairlineStrong,
  },
  badge: { position: 'absolute', top: -2, right: -2, minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center', backgroundColor: Signal.accent },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  mapArea: { justifyContent: 'flex-end', marginTop: 10 },
  controls: { flex: 1, justifyContent: 'flex-end', paddingHorizontal: 24 },
  meta: { alignItems: 'center', minHeight: 50 },
  songTitle: { color: Signal.ink, fontSize: 21, fontWeight: '700' },
  songArtist: { color: Signal.inkMuted, fontSize: 14, marginTop: 2 },
  hint: { height: 46, textAlignVertical: 'center', textAlign: 'center', lineHeight: 46, color: Signal.inkSoft, fontSize: 13 },
  actions: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 },
  placeholder: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24, backgroundColor: Signal.bgSubtle },
  placeholderText: { color: Signal.inkSoft, fontSize: 14, textAlign: 'center' },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});

export default LuvsScreen;
