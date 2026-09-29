/**
 * Up next — YouTube Music's queue under the player, in our glass.
 *
 * Swipe up on Now Playing and this panel rises from the bottom while the
 * player's title, scrubber and transport ride up above it (NowPlayingScreen
 * owns `progress`, 0 closed .. 1 open, so a finger can drive both). It reads:
 *
 *   Playing from                                   ( ⤮ Shuffle )
 *   Mayakama mix
 *   ( All ) ( Familiar ) ( Discover )
 *   [art] Title                                              ═
 *         Artist · 3:30
 *
 * Tap a row to play it, drag its handle to move it, swipe the panel down (with
 * the list at its top) to go back to the cover.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, NativeScrollEvent, NativeSyntheticEvent, Pressable, StyleSheet, Text, View, ViewProps } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as GestureHandler from 'react-native-gesture-handler';
import Animated, { runOnJS, SharedValue, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Frosted from '../allegra/Frosted';
import Artwork from '../allegra/Artwork';
import { Tactile } from '../allegra/motion';
import { Motion, Signal } from '../../constants/allegraTheme';
import { prepareNextInQueue, usePlayerStore } from '../../store/playerStore';
import { usePlaylistStore } from '../../store/playlistStore';
import { useSongsStore } from '../../store/songsStore';
import { isStreamSongId } from '../../services/stream/streamSong';
import { shuffleUpcoming } from '../../services/player/playerMenuActions';
import { libraryKeys, matchKey } from '../../utils/downloadState';
import { shouldCloseSheet } from '../../navigation/sheetClose';
import * as Haptics from '../../utils/haptics';
import { diag } from '../../utils/diag';
import { Song } from '../../types/song';
import { dropIndex, filterQueue, moveItem, playingFromLabel, rowShift, UpNextFilter } from './coverStage';

const { Gesture, GestureDetector } = GestureHandler;

const ROW_H = 64;
/** The drag handle's column: a touch there moves the row, never the panel. */
const HANDLE_W = 52;
const FILTERS: { value: UpNextFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'familiar', label: 'Familiar' },
  { value: 'discover', label: 'Discover' },
];

const clock = (s?: number): string => {
  if (!s || !Number.isFinite(s) || s <= 0) return '';
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${r < 10 ? '0' : ''}${r}`;
};

/**
 * The row being dragged, handed to every row so the others can step aside.
 * Each row pulls out the pieces it needs before building worklets: a worklet
 * that captured this whole object would copy the list's gesture object onto
 * the UI thread.
 */
interface DragState {
  from: SharedValue<number>;
  to: SharedValue<number>;
  dy: SharedValue<number>;
  count: number;
  list: GestureHandler.NativeGesture;
  onDrop: (from: number, to: number) => void;
  onLift: (index: number) => void;
}

/** The playing row's mark: three still bars over its cover. */
const NowMark: React.FC = () => (
  <View style={styles.nowMark} pointerEvents="none">
    <View style={[styles.bar, { height: 10 }]} />
    <View style={[styles.bar, { height: 16 }]} />
    <View style={[styles.bar, { height: 8 }]} />
  </View>
);

const Row: React.FC<{
  song: Song;
  index: number;
  current: boolean;
  movable: boolean;
  drag: DragState;
  onPick: (index: number) => void;
}> = ({ song, index, current, movable, drag, onPick }) => {
  const { from, to, dy, count, list, onDrop, onLift } = drag;
  const lifted = useSharedValue(0);
  const style = useAnimatedStyle(() => {
    let y = 0;
    let scale = 1;
    if (from.value === index) {
      y = dy.value;
      scale = 1 + 0.03 * lifted.value;
    } else if (from.value >= 0) {
      y = withSpring(rowShift(index, from.value, to.value, ROW_H), Motion.spring.tactile);
    }
    return { transform: [{ translateY: y }, { scale }] as const };
  });
  const lift = useAnimatedStyle(() => ({ opacity: lifted.value }));

  const handle = useMemo(() => {
    if (!movable) return null;
    return Gesture.Pan()
      .minDistance(1)
      .blocksExternalGesture(list)
      .onStart(() => {
        'worklet';
        from.value = index;
        to.value = index;
        dy.value = 0;
        lifted.value = withSpring(1, Motion.spring.tactile);
        runOnJS(onLift)(index);
      })
      .onUpdate(e => {
        'worklet';
        dy.value = e.translationY;
        to.value = dropIndex(index, e.translationY, ROW_H, count);
      })
      .onEnd(() => {
        'worklet';
        const target = to.value;
        // Land exactly in the gap before the list re-orders under it.
        dy.value = withSpring((target - index) * ROW_H, Motion.spring.tactile, done => {
          'worklet';
          if (done) runOnJS(onDrop)(index, target);
        });
      })
      .onFinalize(() => {
        'worklet';
        lifted.value = withSpring(0, Motion.spring.tactile);
      });
  }, [movable, index, lifted, from, to, dy, count, list, onDrop, onLift]);

  return (
    <Animated.View style={[styles.rowWrap, style]}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.lifted, lift]} pointerEvents="none" />
      <View style={[styles.row, current && styles.rowCurrent]}>
        <Pressable
          style={({ pressed }) => [styles.rowMain, pressed && styles.pressed]}
          onPress={() => onPick(index)}
          accessibilityRole="button"
          accessibilityLabel={current ? `Now playing: ${song.title}` : `Play ${song.title}`}
        >
          <View>
            <Artwork uri={song.coverImageUri} title={song.title} artist={song.artist} size={48} style={styles.art} />
            {current ? <NowMark /> : null}
          </View>
          <View style={styles.rowText}>
            <Text style={styles.rowTitle} numberOfLines={1}>{song.title}</Text>
            <Text style={styles.rowSub} numberOfLines={1}>
              {[song.artist || 'Unknown artist', clock(song.duration)].filter(Boolean).join(' · ')}
            </Text>
          </View>
        </Pressable>
        {handle ? (
          <GestureDetector gesture={handle}>
            <View style={styles.handle} accessibilityLabel={`Move ${song.title}`} accessible>
              <Ionicons name="reorder-two" size={24} color="rgba(255,255,255,0.62)" />
            </View>
          </GestureDetector>
        ) : null}
      </View>
    </Animated.View>
  );
};

interface UpNextPanelProps {
  /** 0 closed .. 1 open; the player's swipe up drives it too. */
  progress: SharedValue<number>;
  /** Where the panel's top edge sits when open, in the player's frame. */
  top: number;
  /** The player's height. */
  frameH: number;
  open: boolean;
  /** Swiped down or tapped away: the player animates it shut. */
  onClose: (velocity: number) => void;
  onNotice: (text: string) => void;
}

const UpNextPanel: React.FC<UpNextPanelProps> = ({ progress, top, frameH, open, onClose, onNotice }) => {
  const insets = useSafeAreaInsets();
  const panelH = Math.max(1, frameH - top);
  const queue = usePlayerStore(s => s.playlistQueue);
  const index = usePlayerStore(s => s.currentQueueIndex);
  const playlistId = usePlayerStore(s => s.currentPlaylistId);
  const playlistName = usePlaylistStore(s => s.playlists.find(p => p.id === playlistId)?.name);
  const keys = useSongsStore(s => libraryKeys(s.songs));
  const [filter, setFilter] = useState<UpNextFilter>('all');

  const songs = useMemo(() => queue ?? [], [queue]);
  const familiar = useMemo(
    () => songs.map(s => !isStreamSongId(s.id) || keys.has(matchKey(s.title, s.artist))),
    [songs, keys],
  );
  const shown = useMemo(() => filterQueue(familiar, filter), [familiar, filter]);
  const movable = filter === 'all';
  const label = playingFromLabel(playlistId, songs[0]?.title, playlistName);

  // ── The panel's own swipe down, alongside the list's scroll ─────────────
  const scrolled = useSharedValue(0);
  const dragging = useSharedValue(false);
  const list = useMemo(() => Gesture.Native(), []);
  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    scrolled.value = e.nativeEvent.contentOffset.y;
  }, [scrolled]);
  const panelW = useSharedValue(0);
  const pan = Gesture.Pan()
    .enabled(open)
    .activeOffsetY(10)
    .failOffsetY(-8)
    .failOffsetX([-22, 22])
    .simultaneousWithExternalGesture(list)
    .onTouchesDown((e, state) => {
      'worklet';
      const t = e.allTouches[0];
      // The list is scrolled (the drag scrolls it back), or the finger is on a handle.
      if (scrolled.value > 2 || (t && panelW.value > 0 && t.x > panelW.value - HANDLE_W)) state.fail();
    })
    .onStart(() => {
      'worklet';
      dragging.value = true;
    })
    .onUpdate(e => {
      'worklet';
      progress.value = Math.min(1, Math.max(0, 1 - Math.max(0, e.translationY) / panelH));
    })
    .onEnd(e => {
      'worklet';
      dragging.value = false;
      const close = shouldCloseSheet(e.translationY, e.velocityY);
      runOnJS(diag)('upnext', `pan end dy ${e.translationY.toFixed(0)} vy ${e.velocityY.toFixed(0)} -> ${close ? 'close' : 'settle'}`);
      if (close) runOnJS(onClose)(e.velocityY);
      else progress.value = withSpring(1, Motion.spring.sheet);
    })
    .onFinalize((_e, success) => {
      'worklet';
      if (success || !dragging.value) return;
      dragging.value = false;
      progress.value = withSpring(1, Motion.spring.sheet);
    });

  const slide = useAnimatedStyle(() => ({ transform: [{ translateY: (1 - progress.value) * panelH }] }));

  // ── Moving a row ─────────────────────────────────────────────────────────
  const from = useSharedValue(-1);
  const to = useSharedValue(-1);
  const dy = useSharedValue(0);
  const [lifting, setLifting] = useState(-1);
  const onLift = useCallback((i: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setLifting(i);
  }, []);
  const settled = useRef(false);
  const onDrop = useCallback((a: number, b: number) => {
    const q = usePlayerStore.getState().playlistQueue;
    if (q && a !== b) {
      diag('upnext', `moved ${a} -> ${b}`);
      Haptics.selectionAsync().catch(() => {});
      usePlayerStore.getState().updateQueue(moveItem(q, a, b));
      // Media3 may have staged the old "next".
      prepareNextInQueue();
      settled.current = true;
    } else {
      from.value = -1;
      dy.value = 0;
      setLifting(-1);
    }
  }, [from, dy]);
  // The rows let go of their offsets only once the list has re-ordered, so
  // nothing jumps back for a frame.
  useEffect(() => {
    if (!settled.current) return;
    settled.current = false;
    from.value = -1;
    to.value = -1;
    dy.value = 0;
    setLifting(-1);
  }, [queue, from, to, dy]);
  const drag = useMemo<DragState>(() => ({ from, to, dy, count: songs.length, list, onDrop, onLift }), [from, to, dy, songs.length, list, onDrop, onLift]);

  const pick = useCallback((i: number) => {
    const s = usePlayerStore.getState();
    if (!s.playlistQueue || i === s.currentQueueIndex) return;
    Haptics.selectionAsync().catch(() => {});
    diag('upnext', `play row ${i}`);
    s.setPlaylistQueue(s.currentPlaylistId ?? 'queue', s.playlistQueue, i);
  }, []);

  const shuffle = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onNotice(shuffleUpcoming() > 0 ? 'Shuffled what plays next' : 'Nothing queued to shuffle');
  }, [onNotice]);

  // Opens on the song that's playing, one row of history above it.
  const listRef = useRef<FlatList<number>>(null);
  const startAt = movable ? Math.max(0, Math.min(index - 1, shown.length - 1)) : 0;
  useEffect(() => {
    if (!open || shown.length === 0) return;
    listRef.current?.scrollToOffset({ offset: startAt * ROW_H, animated: false });
    // Only when it opens or the filter changes, not on every queue change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, filter]);

  // The dragged row draws over its neighbours.
  const Cell = useCallback(({ index: cellIndex, style, ...rest }: ViewProps & { index: number }) => (
    <View {...rest} style={[style, { zIndex: cellIndex === lifting ? 2 : 0, elevation: cellIndex === lifting ? 2 : 0 }]} />
  ), [lifting]);

  return (
    <GestureDetector gesture={pan}>
      <Animated.View
        style={[styles.panel, { top, height: panelH }, slide]}
        pointerEvents={open ? 'auto' : 'none'}
        onLayout={e => { panelW.value = e.nativeEvent.layout.width; }}
      >
        <Frosted radius={28} intensity={70} tint={0.55} />
        <View style={styles.grabber} />
        <View style={styles.head}>
          <View style={styles.headText}>
            <Text style={styles.from}>Playing from</Text>
            <Text style={styles.source} numberOfLines={1}>{label}</Text>
          </View>
          <Tactile onPress={shuffle} style={styles.pill} accessibilityRole="button" accessibilityLabel="Shuffle what plays next">
            <Ionicons name="shuffle" size={18} color={Signal.ink} />
            <Text style={styles.pillText}>Shuffle</Text>
          </Tactile>
        </View>
        <View style={styles.chips}>
          {FILTERS.map(f => {
            const on = filter === f.value;
            return (
              <Pressable
                key={f.value}
                onPress={() => { Haptics.selectionAsync().catch(() => {}); setFilter(f.value); }}
                style={[styles.chip, on && styles.chipOn]}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
              >
                <Text style={[styles.chipText, on && styles.chipTextOn]}>{f.label}</Text>
              </Pressable>
            );
          })}
        </View>
        {shown.length === 0 ? (
          <Text style={styles.empty}>{songs.length === 0 ? 'Nothing queued after this song.' : filter === 'familiar' ? 'None of these are on your phone yet.' : 'Everything here is already on your phone.'}</Text>
        ) : (
          <GestureDetector gesture={list}>
              <FlatList
                ref={listRef}
                data={shown}
                keyExtractor={i => `${songs[i]?.id ?? i}-${i}`}
                getItemLayout={(_d, i) => ({ length: ROW_H, offset: ROW_H * i, index: i })}
                initialScrollIndex={startAt}
                onScroll={onScroll}
                scrollEventThrottle={16}
                scrollEnabled={lifting < 0}
                CellRendererComponent={Cell}
                removeClippedSubviews={false}
                contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
                renderItem={({ item }) => (
                  <Row song={songs[item]} index={item} current={item === index} movable={movable && songs.length > 1} drag={drag} onPick={pick} />
                )}
              />
          </GestureDetector>
        )}
      </Animated.View>
    </GestureDetector>
  );
};

const styles = StyleSheet.create({
  panel: {
    position: 'absolute',
    left: 0,
    right: 0,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: 'hidden',
    zIndex: 30,
    elevation: 30,
  },
  grabber: { alignSelf: 'center', width: 36, height: 5, borderRadius: 3, marginTop: 10, backgroundColor: 'rgba(255,255,255,0.35)' },
  head: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, marginTop: 14 },
  headText: { flex: 1, marginRight: 12 },
  from: { color: Signal.inkMuted, fontSize: 13 },
  source: { color: Signal.ink, fontSize: 17, fontWeight: '700', marginTop: 2 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 40,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  pillText: { color: Signal.ink, fontSize: 15, fontWeight: '600' },
  chips: { flexDirection: 'row', gap: 8, paddingHorizontal: 20, marginTop: 14, marginBottom: 8 },
  chip: { height: 34, paddingHorizontal: 14, borderRadius: 17, justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.1)' },
  chipOn: { backgroundColor: Signal.wave },
  chipText: { color: Signal.ink, fontSize: 14, fontWeight: '600' },
  chipTextOn: { color: Signal.waveInk },
  empty: { color: 'rgba(255,255,255,0.6)', fontSize: 15, paddingVertical: 28, textAlign: 'center' },
  rowWrap: { height: ROW_H, paddingHorizontal: 8 },
  lifted: { marginHorizontal: 8, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.12)' },
  row: { flex: 1, flexDirection: 'row', alignItems: 'center', borderRadius: 14, overflow: 'hidden' },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch', paddingLeft: 12 },
  rowCurrent: { backgroundColor: 'rgba(255,255,255,0.08)' },
  pressed: { backgroundColor: 'rgba(255,255,255,0.1)' },
  art: { width: 48, height: 48, borderRadius: 8 },
  nowMark: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.45)',
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 3,
    paddingBottom: 15,
  },
  bar: { width: 3, borderRadius: 1.5, backgroundColor: Signal.wave },
  rowText: { flex: 1, marginLeft: 14 },
  rowTitle: { color: '#fff', fontSize: 15, fontWeight: '600' },
  rowSub: { color: 'rgba(255,255,255,0.6)', fontSize: 13, marginTop: 3 },
  handle: { width: HANDLE_W, height: ROW_H, alignItems: 'center', justifyContent: 'center' },
});

export default React.memo(UpNextPanel);
