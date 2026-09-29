import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View, Platform, ViewStyle } from 'react-native';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  interpolate,
  Extrapolation,
  runOnJS,
  SharedValue,
  cancelAnimation,
  useAnimatedReaction,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { Song } from '../types/song';
import { Image } from 'expo-image';
import Artwork from './allegra/Artwork';
import { Signal } from '../constants/allegraTheme';

const COVER_SIZE = 200;
const PEEK = 34;
/**
 * Virtualisation radius — only this many virtual indices either side of the
 * playhead are mounted. All mounted slots always bind their bitmap.
 */
const WINDOW_RADIUS = 2;
/** Prefetch neighbours so fling never shows empty gradients. */
const PREFETCH_RADIUS = 6;
const TOUCH_W = COVER_SIZE + PEEK * WINDOW_RADIUS * 2 + 48;
const TOUCH_H = COVER_SIZE + 28;
const CARD_LEFT = (TOUCH_W - COVER_SIZE) / 2;
const CARD_TOP = 14;

const SNAP_SPRING = {
  mass: 0.4,
  damping: 28,
  stiffness: 320,
  overshootClamping: false as const,
};

export interface CoverFlowProps {
  songs: Song[];
  playingIndex?: number;
  defaultGradientColors: string[];
  isEditMode?: boolean;
  onFocusedIndexChange?: (index: number) => void;
  onSelectSong?: (index: number, song: Song) => void;
  onEditPress?: (e: { absoluteX: number; absoluteY: number }) => void;
}

function modJS(i: number, n: number): number {
  if (n <= 0) return 0;
  return ((i % n) + n) % n;
}

function urisAround(songs: Song[], center: number, radius: number): string[] {
  const uris: string[] = [];
  const seen = new Set<string>();
  const n = songs.length;
  if (n === 0) return uris;
  for (let o = -radius; o <= radius; o++) {
    const uri = songs[modJS(center + o, n)]?.coverImageUri;
    if (uri && !seen.has(uri)) {
      seen.add(uri);
      uris.push(uri);
    }
  }
  return uris;
}

// ─── Virtualised card ────────────────────────────────────────────────────────

interface CoverCardProps {
  song: Song;
  virtualIndex: number;
  progress: SharedValue<number>;
  isEditMode: boolean;
  isPlaying: boolean;
  defaultGradientColors: string[];
}

const CoverCard = memo(function CoverCard({
    song,
    virtualIndex,
    progress,
    isEditMode,
    isPlaying,
  }: CoverCardProps) {
    const animatedStyle = useAnimatedStyle(() => {
      const slot = virtualIndex - progress.value;
      const abs = Math.abs(slot);
      return {
        opacity: interpolate(abs, [0, 0.9, 1.8, 2.4], [1, 0.94, 0.68, 0], Extrapolation.CLAMP),
        zIndex: Math.round(40 - abs * 8),
        transform: [
          { translateX: slot * PEEK },
          { translateY: interpolate(abs, [0, 1, 2], [0, 4, 8], Extrapolation.CLAMP) },
          { scale: interpolate(abs, [0, 1, 2], [1, 0.92, 0.86], Extrapolation.CLAMP) },
          {
            rotateZ: `${interpolate(slot, [-2, -1, 0, 1, 2], [-7, -3.5, 0, 3.5, 7], Extrapolation.CLAMP)}deg`,
          },
        ],
      } as ViewStyle;
    }, [virtualIndex]);

    const dimStyle = useAnimatedStyle(() => {
      const abs = Math.abs(virtualIndex - progress.value);
      return {
        opacity: interpolate(abs, [0, 0.45, 1.3, 2], [0, 0.14, 0.38, 0.52], Extrapolation.CLAMP),
      };
    }, [virtualIndex]);

    const imageUri = song.coverImageUri;

    return (
      <Animated.View collapsable={false} style={[styles.card, animatedStyle]} pointerEvents="none">
        <View style={[styles.shadow, isPlaying && styles.playingRing]}>
          {/* Fallback only when song has no art — never as a scroll placeholder */}
          <Artwork uri={imageUri} title={song.title} artist={song.artist} size={COVER_SIZE} style={StyleSheet.absoluteFill} transition={0} />

          <Animated.View style={[styles.backDim, dimStyle]} pointerEvents="none" />

          {isEditMode && (
            <View style={styles.editOverlay}>
              <Ionicons name="camera" size={28} color="#fff" />
            </View>
          )}

          {isPlaying && (
            <View style={styles.playingDot}>
              <Ionicons name="musical-note" size={12} color={Signal.waveInk} />
            </View>
          )}
        </View>
      </Animated.View>
    );
});

// ─── CoverFlow ───────────────────────────────────────────────────────────────

export const CoverFlow: React.FC<CoverFlowProps> = ({
  songs,
  playingIndex = -1,
  defaultGradientColors,
  isEditMode = false,
  onFocusedIndexChange,
  onSelectSong,
  onEditPress,
}) => {
  const n = songs.length;
  const loopEnabled = n > 1;

  const progress = useSharedValue(loopEnabled && n > 0 ? n : 0);
  const dragStart = useSharedValue(0);
  const isDragging = useSharedValue(false);

  const userScrollingRef = useRef(false);
  const lastPlayingSync = useRef<number | null>(null);
  const lastReportedFocus = useRef(-1);

  const [windowBase, setWindowBase] = useState(() => (loopEnabled && n > 0 ? n : 0));
  const [focusIndex, setFocusIndex] = useState(() => (loopEnabled && n > 0 ? n : 0));

  const setUserScrolling = useCallback((v: boolean) => {
    userScrollingRef.current = v;
  }, []);

  /** Warm neighbours so a fling never lands on an unloaded cover. */
  const prefetchAround = useCallback(
    (real: number) => {
      const uris = urisAround(songs, real, PREFETCH_RADIUS);
      if (uris.length) Image.prefetch(uris, 'memory-disk').catch(() => {});
    },
    [songs],
  );

  const reportFocus = useCallback(
    (rounded: number) => {
      if (n <= 0) return;
      const real = modJS(rounded, n);
      setFocusIndex(rounded);
      if (lastReportedFocus.current === real) return;
      lastReportedFocus.current = real;
      onFocusedIndexChange?.(real);
      prefetchAround(real);
    },
    [n, onFocusedIndexChange, prefetchAround],
  );

  // Seed
  useEffect(() => {
    if (n === 0) return;
    cancelAnimation(progress);
    const real = playingIndex >= 0 ? playingIndex : 0;
    const seed = loopEnabled ? n + real : real;
    progress.value = seed;
    setWindowBase(Math.floor(seed));
    setFocusIndex(seed);
    lastReportedFocus.current = real;
    onFocusedIndexChange?.(real);
    lastPlayingSync.current = playingIndex;
    prefetchAround(real);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [n, songs[0]?.id]);

  // External skip
  useEffect(() => {
    if (playingIndex < 0 || n === 0) return;
    if (lastPlayingSync.current === playingIndex) return;
    lastPlayingSync.current = playingIndex;
    if (userScrollingRef.current) {
      reportFocus(Math.round(progress.value));
      return;
    }
    cancelAnimation(progress);
    const current = progress.value;
    const currentReal = modJS(Math.round(current), n);
    let delta = playingIndex - currentReal;
    if (loopEnabled) {
      if (delta > n / 2) delta -= n;
      if (delta < -n / 2) delta += n;
    }
    const target = current + delta;
    progress.value = withSpring(target, SNAP_SPRING);
    setWindowBase(Math.floor(target));
    reportFocus(playingIndex);
  }, [playingIndex, n, loopEnabled, reportFocus, progress]);

  // Virtual window slides with floor(progress) — only edge mount/unmount.
  useAnimatedReaction(
    () => Math.floor(progress.value),
    (next, prev) => {
      if (next !== prev) runOnJS(setWindowBase)(next);
    },
    [],
  );

  useAnimatedReaction(
    () => Math.round(progress.value),
    (next, prev) => {
      if (next !== prev) runOnJS(reportFocus)(next);
    },
    [reportFocus],
  );

  const onSettleDone = useCallback(
    (rounded: number) => {
      userScrollingRef.current = false;
      reportFocus(rounded);
    },
    [reportFocus],
  );

  const snapToNearest = useCallback(() => {
    'worklet';
    const target = Math.round(progress.value);
    progress.value = withSpring(target, SNAP_SPRING, (finished) => {
      if (finished) runOnJS(onSettleDone)(Math.round(progress.value));
      else runOnJS(setUserScrolling)(false);
    });
  }, [progress, onSettleDone, setUserScrolling]);

  const flingToTarget = useCallback(
    (velocityX: number) => {
      'worklet';
      const vSteps = -velocityX / PEEK;
      const projected = progress.value + vSteps * 0.18;
      let target = Math.round(projected);
      if (!loopEnabled) {
        target = Math.max(0, Math.min(n - 1, target));
      }
      const current = Math.round(progress.value);
      if (Math.abs(vSteps) > 2.5 && target === current) {
        target = current + (vSteps > 0 ? 1 : -1);
        if (!loopEnabled) target = Math.max(0, Math.min(n - 1, target));
      }
      progress.value = withSpring(target, SNAP_SPRING, (finished) => {
        if (finished) runOnJS(onSettleDone)(Math.round(progress.value));
        else runOnJS(setUserScrolling)(false);
      });
    },
    [loopEnabled, n, progress, onSettleDone, setUserScrolling],
  );

  const handleTapAtX = useCallback(
    (x: number) => {
      if (n <= 0) return;
      const local = x - TOUCH_W / 2;
      // The front cover owns the whole ±COVER_SIZE/2 band; neighbours are only
      // reachable in the peeking strips beyond it. Rounding local/PEEK meant a
      // tap on the middle of the front cover selected the next song.
      const dist = Math.abs(local);
      const slot =
        dist <= COVER_SIZE / 2
          ? 0
          : Math.sign(local) *
            Math.min(WINDOW_RADIUS, 1 + Math.floor((dist - COVER_SIZE / 2) / PEEK));
      const virtual = Math.round(progress.value) + slot;
      const real = modJS(virtual, n);
      const song = songs[real];
      if (!song) return;
      if (isEditMode) {
        onEditPress?.({ absoluteX: x, absoluteY: 160 });
        return;
      }
      cancelAnimation(progress);
      const currentReal = modJS(Math.round(progress.value), n);
      let delta = real - currentReal;
      if (loopEnabled) {
        if (delta > n / 2) delta -= n;
        if (delta < -n / 2) delta += n;
      }
      progress.value = withSpring(progress.value + delta, SNAP_SPRING, (finished) => {
        if (finished) runOnJS(onSettleDone)(Math.round(progress.value));
      });
      lastReportedFocus.current = real;
      onFocusedIndexChange?.(real);
      onSelectSong?.(real, song);
    },
    [n, songs, isEditMode, onEditPress, onSelectSong, onFocusedIndexChange, progress, loopEnabled, onSettleDone],
  );

  const panGesture = Gesture.Pan()
    .activeOffsetX([-10, 10])
    .onStart(() => {
      cancelAnimation(progress);
      dragStart.value = progress.value;
      isDragging.value = true;
      runOnJS(setUserScrolling)(true);
    })
    .onUpdate((e) => {
      progress.value = dragStart.value - e.translationX / PEEK;
    })
    .onEnd((e) => {
      isDragging.value = false;
      if (Math.abs(e.velocityX) > 400) flingToTarget(e.velocityX);
      else snapToNearest();
    })
    .onFinalize((_e, success) => {
      if (!success && isDragging.value) {
        isDragging.value = false;
        snapToNearest();
      }
    });

  const tapGesture = Gesture.Tap().onEnd((e) => {
    runOnJS(handleTapAtX)(e.x);
  });

  const composed = Gesture.Race(panGesture, tapGesture);

  /** Virtual window (~5 cards). Every mounted card always loads real cover art. */
  const virtualCards = useMemo(() => {
    type Card = { virtualIndex: number; song: Song; realIndex: number; isEditFront: boolean };
    if (n === 0) return [] as Card[];

    // Without looping there is nothing either side to fan out — clamping stops
    // a single-song playlist rendering the same cover six times in the deck.
    const lo = loopEnabled ? windowBase - WINDOW_RADIUS : Math.max(0, windowBase - WINDOW_RADIUS);
    const hi = loopEnabled
      ? windowBase + WINDOW_RADIUS + 1
      : Math.min(n - 1, windowBase + WINDOW_RADIUS + 1);
    const cards: Card[] = [];

    for (let vi = lo; vi <= hi; vi++) {
      const realIndex = modJS(vi, n);
      cards.push({
        virtualIndex: vi,
        song: songs[realIndex],
        realIndex,
        isEditFront: isEditMode && vi === focusIndex,
      });
    }

    const mid = windowBase + 0.5;
    cards.sort((a, b) => Math.abs(b.virtualIndex - mid) - Math.abs(a.virtualIndex - mid));
    return cards;
  }, [songs, n, windowBase, focusIndex, isEditMode, loopEnabled]);

  if (n === 0) {
    return <View style={styles.container} />;
  }

  return (
    <View style={styles.container} collapsable={false}>
      <GestureDetector gesture={composed}>
        <Animated.View style={styles.touchArea} collapsable={false}>
          {virtualCards.map(({ virtualIndex, song, realIndex, isEditFront }) => (
            <CoverCard
              key={virtualIndex}
              song={song}
              virtualIndex={virtualIndex}
              progress={progress}
              isEditMode={isEditFront}
              isPlaying={realIndex === playingIndex}
              defaultGradientColors={defaultGradientColors}
            />
          ))}
        </Animated.View>
      </GestureDetector>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    height: TOUCH_H,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
    marginTop: 4,
    overflow: 'visible',
  },
  touchArea: {
    width: TOUCH_W,
    height: TOUCH_H,
    alignSelf: 'center',
    overflow: 'visible',
  },
  card: {
    position: 'absolute',
    left: CARD_LEFT,
    top: CARD_TOP,
    width: COVER_SIZE,
    height: COVER_SIZE,
  },
  shadow: {
    width: COVER_SIZE,
    height: COVER_SIZE,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#1a1a1a',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.35,
        shadowRadius: 8,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  playingRing: {
    borderWidth: 2,
    borderColor: 'rgba(29,185,84,0.9)',
  },
  coverArt: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 16,
  },
  fallbackIcon: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backDim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000',
    borderRadius: 16,
  },
  editOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 16,
  },
  playingDot: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Signal.wave,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default CoverFlow;
