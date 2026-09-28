/**
 * Time-synced lyrics, the way Apple Music moves them (after AMLL, the open
 * Apple Music-like lyrics player): every line in the same bold weight, the
 * sung one bright and full size, the rest dimmed and a touch smaller.
 *
 * How a line change moves:
 *   - The list jumps to its new offset in one frame and every visible line is
 *     pushed back by the same distance (`shift`), so nothing moves on screen
 *     yet. Each line then springs home on its own, a few tens of ms after the
 *     one above it — the cascade that makes Apple's lyrics read as a wave
 *     rather than a scrolling page. A new line mid-flight adds to the shift,
 *     so motion never restarts from rest.
 *   - The spring follows the song: lines that come quickly get a stiffer
 *     spring, slow ones a softer one (AMLL's policy: stiffness 170–220,
 *     damping 2.2·√k). A seek slides without the cascade on a gentle spring.
 *   - A line never changes its layout when it is sung — only opacity and
 *     scale move — so the measured offsets never shift under the list.
 *   - The sung line's centre sits at `activeLinePosition` of the height, so a
 *     wrapped line is balanced around the same point as a short one.
 *
 * Scroll by hand and the lines stay put, every line bright enough to read.
 * Following resumes on the next line change once you've let go for half a
 * second and the sung line is on screen (Apple's rule), after 3.5 s
 * regardless, at once from the pill, or when you scroll back to it yourself.
 */
import React, { useEffect, useRef, useCallback, useMemo, useState, forwardRef, useImperativeHandle } from 'react';
import { View, Dimensions, Text, Pressable, StyleSheet, LayoutChangeEvent, TextStyle, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  cancelAnimation,
  useSharedValue,
  useAnimatedStyle,
  withDelay,
  withSpring,
  withTiming,
  interpolate,
  Extrapolation,
  useDerivedValue,
  useAnimatedReaction,
  useAnimatedRef,
  useAnimatedScrollHandler,
  scrollTo,
  runOnJS,
  SharedValue,
} from 'react-native-reanimated';
import { useSettingsStore } from '../store/settingsStore';
import InstrumentalWaveform, { isInstrumentalLyric, useIsActiveLine } from './InstrumentalWaveform';
import { Frosted } from './allegra/Frosted';
import { Signal } from '../constants/allegraTheme';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

/**
 * How close to the playing line counts as "back where you started" — scroll
 * within this many px of it and auto-follow re-attaches without a tap.
 */
const RESUME_SNAP_PX = 72;
/** Hands off for at most this long after a manual scroll. */
const AUTO_RESUME_MS = 3500;
/** Apple's rule: the next line change re-attaches once the list has been still this long. */
const EARLY_RESUME_MS = 500;
/** Further than this many lines (a seek) slides without the cascade. */
const JUMP_LINES = 4;
/** Lines further than this from the sung one skip the animation (off screen). */
const FAR_LINES = 14;

const DEFAULT_TEXT: TextStyle = { fontSize: 28, lineHeight: 34, textAlign: 'left' };
const DEFAULT_GAP = 16;

/** Inactive lines sit at 97% (AMLL), the sung one grows to full size on a soft spring. */
const REST_SCALE = 0.97;
const SCALE_SPRING = { mass: 2, damping: 25, stiffness: 100 } as const;
/** A seek or a layout change: a gentle spring, no cascade. */
const SLIDE_SPRING = { mass: 0.9, stiffness: 90, damping: 15 } as const;
/** Opacity is a state change: a short tween. */
const DIM_MS = 280;

type WaveKind = 0 | 1 | 2; // 0 = line change (cascade), 1 = seek, 2 = layout
interface Wave {
  seq: number;
  /** How far the list jumped; every line starts pushed back by this much. */
  delta: number;
  /** The sung line the list now centres on. */
  idx: number;
  /** First line on screen after the jump: the cascade starts there. */
  first: number;
  kind: WaveKind;
  stiffness: number;
  damping: number;
  /** Largest push, so a seek slides in from nearby instead of across the song. */
  cap: number;
}

/**
 * AMLL's spring policy for the list following the sung line: the shorter the
 * gap to the previous line, the stiffer the spring.
 */
const followSpring = (intervalMs: number): { stiffness: number; damping: number } => {
  'worklet';
  const clamped = Math.min(Math.max(intervalMs, 100), 800);
  const ratio = Math.pow(1 - (clamped - 100) / 700, 0.2);
  const stiffness = 170 + ratio * 50;
  return { stiffness, damping: Math.sqrt(stiffness) * 2.2 };
};

/**
 * When line `i` starts moving: 50 ms after the line above it from the first
 * line on screen, the gaps shrinking by 5% per line past the sung one (AMLL).
 */
const cascadeDelay = (i: number, first: number, idx: number): number => {
  'worklet';
  if (i <= first) return 0;
  let delay = 0;
  let step = 50;
  for (let j = first; j < i; j++) {
    delay += step;
    if (j >= idx) step /= 1.05;
  }
  return Math.min(delay, 700);
};

// ------------------------------------------------------------------
// LyricLine
// ------------------------------------------------------------------

interface LyricLineProps {
  text: string;
  activeIndexSV: SharedValue<number>;
  readingSV: SharedValue<boolean>;
  waveSV: SharedValue<Wave>;
  timestamp: number;
  index: number;
  onLyricPress: (timestamp: number) => void;
  onMeasured: (index: number, height: number) => void;
  textStyle: TextStyle;
  gap: number;
  songTitle?: string;
}

/** How bright a line is when it isn't being sung. */
const restOpacity = (index: number, active: number, reading: boolean): number => {
  'worklet';
  if (reading) return 0.62;
  if (active < 0) return 0.5;
  if (index < active) return 0.34;
  // Upcoming lines fade a little with distance — depth without a blur.
  return Math.max(0.3, 0.56 - 0.06 * (index - active - 1));
};

const LyricLine = React.memo(({
  text,
  activeIndexSV,
  readingSV,
  waveSV,
  timestamp,
  index,
  onLyricPress,
  onMeasured,
  textStyle,
  gap,
  songTitle,
}: LyricLineProps) => {
  const handlePress = useCallback(() => onLyricPress(timestamp), [onLyricPress, timestamp]);
  const isInstrumental = useMemo(() => isInstrumentalLyric(text), [text]);

  const lastHeightRef = useRef<number>(0);
  const handleLayout = useCallback((e: LayoutChangeEvent) => {
    const h = e.nativeEvent.layout.height;
    if (Math.abs(lastHeightRef.current - h) > 1) {
      lastHeightRef.current = h;
      onMeasured(index, h);
    }
  }, [onMeasured, index]);

  // ── Where the line is: pushed back by each jump, springing home ─────────
  const shift = useSharedValue(0);
  useAnimatedReaction(
    () => waveSV.value.seq,
    (seq, prev) => {
      if (prev === null || seq === prev) return;
      const w = waveSV.value;
      if (Math.abs(index - w.idx) > FAR_LINES) {
        cancelAnimation(shift);
        shift.value = 0;
        return;
      }
      const from = Math.max(-w.cap, Math.min(w.cap, shift.value + w.delta));
      shift.value = from;
      const spring = { mass: 0.9, stiffness: w.stiffness, damping: w.damping };
      shift.value = w.kind === 0
        ? withDelay(cascadeDelay(index, w.first, w.idx), withSpring(0, spring))
        : withSpring(0, spring);
    },
  );

  // ── How it looks: dimmed at rest, bright while sung ─────────────────────
  // Position and brightness are separate styles: the shift changes every
  // frame of a cascade, and sharing a style would restart the dim tween with it.
  const moveStyle = useAnimatedStyle((): ViewStyle => ({ transform: [{ translateY: shift.value }] }));
  const dimStyle = useAnimatedStyle((): ViewStyle => {
    const active = activeIndexSV.value;
    const target = active === index ? 1 : restOpacity(index, active, readingSV.value);
    // Far from the sung line: plain values, no animation to run.
    const far = active >= 0 && Math.abs(index - active) > 6;
    return { opacity: far ? target : withTiming(target, { duration: DIM_MS }) };
  });
  const emphasis = useDerivedValue(() =>
    withSpring(activeIndexSV.value === index ? 1 : 0, SCALE_SPRING),
  );
  const align = textStyle.textAlign ?? 'left';
  const origin = align === 'center' ? 'center' : align === 'right' ? 'right' : 'left';
  const scaleStyle = useAnimatedStyle((): ViewStyle => ({
    transform: [{ scale: interpolate(emphasis.value, [0, 1], [REST_SCALE, 1], Extrapolation.CLAMP) }],
  }));

  const renderedText = useMemo(() => {
    if (!songTitle) return text;
    const cleanText = text.replace(/\s+/g, ' ');
    const lowerTitle = songTitle.toLowerCase().trim();
    if (lowerTitle.length < 2) return text;
    const idx = cleanText.toLowerCase().indexOf(lowerTitle);
    if (idx === -1) return text;
    return (
      <Text>
        {cleanText.substring(0, idx)}
        <Text style={styles.titleGlow}>{cleanText.substring(idx, idx + lowerTitle.length)}</Text>
        {cleanText.substring(idx + lowerTitle.length)}
      </Text>
    );
  }, [text, songTitle]);

  return (
    <Animated.View onLayout={handleLayout} style={[{ paddingVertical: gap }, moveStyle]}>
      <Animated.View style={dimStyle}>
        <Pressable onPress={handlePress} style={styles.linePressable}>
          {isInstrumental ? (
            <InstrumentalLine activeIndexSV={activeIndexSV} index={index} scaleStyle={scaleStyle} />
          ) : (
            <Animated.View style={[scaleStyle, { transformOrigin: origin }]}>
              <Text style={[styles.lyricText, textStyle]}>{renderedText}</Text>
            </Animated.View>
          )}
        </Pressable>
      </Animated.View>
    </Animated.View>
  );
});

/** A music break: the waveform instead of a blank line. */
const InstrumentalLine: React.FC<{ activeIndexSV: SharedValue<number>; index: number; scaleStyle: ViewStyle }> = ({ activeIndexSV, index, scaleStyle }) => {
  const isActiveLine = useIsActiveLine(activeIndexSV, index);
  return (
    <Animated.View style={[styles.instrumentalWrap, scaleStyle]}>
      <InstrumentalWaveform active={isActiveLine} size="lg" />
    </Animated.View>
  );
};

// ------------------------------------------------------------------
// SynchronizedLyrics
// ------------------------------------------------------------------

interface SynchronizedLyricsProps {
  lyrics: { timestamp: number; text: string }[];
  currentTime: number | SharedValue<number>;
  onLyricPress: (timestamp: number) => void;
  isUserScrolling?: boolean;
  onScrollStateChange?: (isScrolling: boolean) => void;
  headerContent?: React.ReactNode;
  /** Text size, line height, alignment and `marginVertical` (the gap around each line). */
  textStyle?: TextStyle;
  scrollEnabled?: boolean;
  activeLinePosition?: number;
  songTitle?: string;
  topSpacerHeight?: number;
  bottomSpacerHeight?: number;
  expandedAt?: number;
  fadeColor?: string;
  /** Android-only: soft-dissolve lyric text at the top/bottom edges (px). */
  edgeFade?: number;
  /** Mirrors the list's scroll offset, so the player sheet knows when the lines sit at the top. */
  scrollOffset?: SharedValue<number>;
}

export interface SynchronizedLyricsRef {
  scrollToIndex: (params: { index: number; animated?: boolean; viewPosition?: number }) => void;
}

const SynchronizedLyrics = forwardRef<SynchronizedLyricsRef, SynchronizedLyricsProps>(({
  lyrics,
  currentTime,
  onLyricPress,
  isUserScrolling = false,
  onScrollStateChange,
  headerContent,
  textStyle: textStyleProp,
  scrollEnabled = true,
  activeLinePosition = 0.35,
  songTitle,
  topSpacerHeight = SCREEN_HEIGHT * 0.4,
  bottomSpacerHeight = SCREEN_HEIGHT * 0.4,
  edgeFade = 0,
  scrollOffset,
}, ref) => {
  // The gap is padding on each row (the same for every line); the text itself
  // carries no margin, so a row's height is exactly text + 2 × gap.
  const { textStyle, gap } = useMemo(() => {
    const flat = StyleSheet.flatten([DEFAULT_TEXT, textStyleProp]) ?? DEFAULT_TEXT;
    const { marginVertical, margin } = flat;
    const g = typeof marginVertical === 'number' ? marginVertical : typeof margin === 'number' ? margin : DEFAULT_GAP;
    const rest: TextStyle = { ...flat };
    delete rest.marginVertical; delete rest.margin; delete rest.marginTop; delete rest.marginBottom;
    return { textStyle: rest, gap: g };
  }, [textStyleProp]);
  const estimate = (textStyle.lineHeight ?? Math.round((textStyle.fontSize ?? 28) * 1.22)) + gap * 2;

  const scrollRef = useAnimatedRef<Animated.ScrollView>();

  // Line offsets and heights, mirrored to the UI thread for the worklets.
  const itemHeights = useRef<number[]>([]);
  const itemOffsets = useRef<number[]>([]);
  const itemOffsetsSV = useSharedValue<number[]>([]);
  const itemHeightsSV = useSharedValue<number[]>([]);
  const containerHeightSV = useSharedValue(SCREEN_HEIGHT);
  const contentHeightSV = useSharedValue(0);
  const isUserScrollingSV = useSharedValue(false);
  useEffect(() => { isUserScrollingSV.value = isUserScrolling; }, [isUserScrolling, isUserScrollingSV]);

  const recomputeOffsets = useCallback(() => {
    let offset = topSpacerHeight;
    const offsets: number[] = [];
    const heights: number[] = [];
    for (let i = 0; i < lyrics.length; i++) {
      const h = itemHeights.current[i] ?? estimate;
      offsets.push(offset);
      heights.push(h);
      offset += h;
    }
    itemOffsets.current = offsets;
    itemOffsetsSV.value = offsets;
    itemHeightsSV.value = heights;
  }, [topSpacerHeight, lyrics.length, itemOffsetsSV, itemHeightsSV, estimate]);

  // New lyrics (another song) or a new text size: forget the old measurements.
  useEffect(() => { itemHeights.current = []; }, [lyrics, gap, textStyle.fontSize]);
  useEffect(() => { recomputeOffsets(); }, [recomputeOffsets, lyrics]);

  // Heights arrive a line at a time as they lay out; batch them into one
  // offsets update per frame instead of one per line.
  const pendingFrame = useRef<number | null>(null);
  const handleItemMeasured = useCallback((idx: number, height: number) => {
    if (Math.abs((itemHeights.current[idx] ?? estimate) - height) <= 1) return;
    itemHeights.current[idx] = height;
    if (pendingFrame.current != null) return;
    pendingFrame.current = requestAnimationFrame(() => {
      pendingFrame.current = null;
      recomputeOffsets();
    });
  }, [recomputeOffsets, estimate]);
  useEffect(() => () => { if (pendingFrame.current != null) cancelAnimationFrame(pendingFrame.current); }, []);

  // Selector, not the whole store: this component re-renders while lyrics scroll.
  const lyricsDelay = useSettingsStore(s => s.lyricsDelay);

  // currentTime may be a number or a shared value.
  const currentTimeNumberSV = useSharedValue(typeof currentTime === 'number' ? currentTime : 0);
  const currentTimeSV: SharedValue<number> =
    typeof currentTime === 'number' ? currentTimeNumberSV : currentTime as SharedValue<number>;
  useEffect(() => {
    if (typeof currentTime === 'number') currentTimeNumberSV.value = currentTime;
  }, [currentTime, currentTimeNumberSV]);

  // The sung line — a binary search on the UI thread.
  const activeIndexDV = useDerivedValue(() => {
    const et = currentTimeSV.value + lyricsDelay;
    if (lyrics.length === 0) return -1;
    let left = 0, right = lyrics.length - 1, result = -1;
    while (left <= right) {
      // eslint-disable-next-line no-bitwise
      const mid = (left + right) >>> 1;
      const nextTs = lyrics[mid + 1]?.timestamp;
      if (et >= lyrics[mid].timestamp && (nextTs === undefined || et < nextTs)) {
        result = mid;
        break;
      }
      if (et < lyrics[mid].timestamp) right = mid - 1;
      else left = mid + 1;
    }
    return result;
  });

  const activeIndexSV = useSharedValue(-1);
  useAnimatedReaction(
    () => activeIndexDV.value,
    (next, prev) => {
      if (next !== prev) activeIndexSV.value = next;
    },
  );

  /** Where the list wants to be: the sung line's centre at `activeLinePosition`. */
  const activeTargetYSV = useDerivedValue(() => {
    const idx = activeIndexDV.value;
    const offsets = itemOffsetsSV.value;
    const heights = itemHeightsSV.value;
    if (idx < 0 || idx >= offsets.length) return -1;
    const centre = offsets[idx] + (heights[idx] ?? 0) / 2;
    return Math.max(0, centre - containerHeightSV.value * activeLinePosition);
  });

  // ─── Following the sung line ─────────────────────────────────────
  const scrollYSV = useSharedValue(0);
  const lastIndexSV = useSharedValue(-1);
  const waveSV = useSharedValue<Wave>({ seq: 0, delta: 0, idx: -1, first: 0, kind: 0, stiffness: 200, damping: 31, cap: SCREEN_HEIGHT });

  // Reading on your own: dragging, flinging, and when the list came to rest.
  const draggingSV = useSharedValue(false);
  const flingingSV = useSharedValue(false);
  const scrollEndAtSV = useSharedValue(0);

  const resumeFollowingRef = useRef<() => void>(() => {});
  const requestResume = useCallback(() => resumeFollowingRef.current(), []);

  useAnimatedReaction(
    () => ({ target: activeTargetYSV.value, user: isUserScrollingSV.value, idx: activeIndexDV.value }),
    (now, prev) => {
      if (now.target < 0) return;
      if (now.user) {
        // Apple's rule: the next line re-attaches the list once it has been
        // still for a moment and the sung line is on screen.
        if (prev && now.idx !== prev.idx && !draggingSV.value && !flingingSV.value
          && Date.now() - scrollEndAtSV.value >= EARLY_RESUME_MS) {
          const top = itemOffsetsSV.value[now.idx] ?? -1;
          const bottom = top + (itemHeightsSV.value[now.idx] ?? 0);
          const viewTop = scrollYSV.value;
          if (top >= viewTop && bottom <= viewTop + containerHeightSV.value) runOnJS(requestResume)();
        }
        return;
      }
      if (prev && prev.target === now.target && prev.user === now.user) return;
      const maxY = Math.max(0, contentHeightSV.value - containerHeightSV.value);
      const toY = contentHeightSV.value > 0 ? Math.min(now.target, maxY) : now.target;
      const fromY = scrollYSV.value;
      const delta = toY - fromY;
      const resuming = !!prev && prev.user;
      const firstFrame = !prev || lastIndexSV.value < 0;
      const jumped = !resuming && Math.abs(now.idx - lastIndexSV.value) > JUMP_LINES;
      const sameLine = !resuming && now.idx === lastIndexSV.value;
      lastIndexSV.value = now.idx;
      scrollTo(scrollRef, 0, toY, false);
      scrollYSV.value = toY;
      if (firstFrame || Math.abs(delta) < 0.5) return;

      // The first line on screen after the jump starts the cascade.
      const offsets = itemOffsetsSV.value;
      const heights = itemHeightsSV.value;
      let first = 0;
      while (first < offsets.length - 1 && offsets[first] + (heights[first] ?? 0) < toY) first++;

      const kind: WaveKind = jumped ? 1 : sameLine ? 2 : 0;
      // A line re-measured by a pixel or two: not worth a motion.
      if (kind === 2 && Math.abs(delta) < 2) return;
      let spring: { stiffness: number; damping: number } = SLIDE_SPRING;
      if (kind === 0) {
        const prevTs = lyrics[now.idx - 1]?.timestamp;
        const ts = lyrics[now.idx]?.timestamp;
        spring = followSpring(prevTs === undefined || ts === undefined ? 800 : (ts - prevTs) * 1000);
      }
      waveSV.value = {
        seq: waveSV.value.seq + 1,
        delta,
        idx: now.idx,
        first,
        kind,
        stiffness: spring.stiffness,
        damping: spring.damping,
        cap: containerHeightSV.value * 0.6,
      };
    },
  );

  const notifyScrollState = useCallback((scrolling: boolean) => {
    onScrollStateChange?.(scrolling);
  }, [onScrollStateChange]);

  // ─── Reading on your own ─────────────────────────────────────────
  /** -1 = playing line is above the viewport, 1 = below, 0 = pill hidden. */
  const [pillDirection, setPillDirection] = useState(0);
  const resumeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearResume = useCallback(() => {
    if (resumeTimer.current) clearTimeout(resumeTimer.current);
    resumeTimer.current = null;
  }, []);
  useEffect(() => clearResume, [clearResume]);

  const resumeFollowing = useCallback(() => {
    clearResume();
    isUserScrollingSV.value = false;
    notifyScrollState(false);
  }, [clearResume, isUserScrollingSV, notifyScrollState]);
  resumeFollowingRef.current = resumeFollowing;

  const scheduleResume = useCallback(() => {
    clearResume();
    resumeTimer.current = setTimeout(resumeFollowing, AUTO_RESUME_MS);
  }, [clearResume, resumeFollowing]);

  // Scrolling back to the playing line re-attaches on its own — no tap needed.
  useAnimatedReaction(
    () => {
      if (!isUserScrollingSV.value) return 0;
      const target = activeTargetYSV.value;
      if (target < 0) return 0;
      const delta = target - scrollYSV.value;
      if (Math.abs(delta) < RESUME_SNAP_PX) return 0;
      return delta > 0 ? 1 : -1;
    },
    (next, prev) => {
      if (next === prev) return;
      runOnJS(setPillDirection)(next);
    },
  );

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: e => {
      scrollYSV.value = e.contentOffset.y;
      if (scrollOffset) scrollOffset.value = e.contentOffset.y;
    },
    onBeginDrag: () => {
      draggingSV.value = true;
      runOnJS(clearResume)();
      if (isUserScrollingSV.value) return;
      isUserScrollingSV.value = true;
      runOnJS(notifyScrollState)(true);
    },
    onEndDrag: () => {
      draggingSV.value = false;
      scrollEndAtSV.value = Date.now();
      // Always arm the resume here: on Android a slow release that isn't a
      // fling fires no momentum events, and the list stayed detached for good.
      runOnJS(scheduleResume)();
    },
    onMomentumBegin: () => {
      // A fling: wait until it settles instead.
      flingingSV.value = true;
      runOnJS(clearResume)();
    },
    onMomentumEnd: () => {
      flingingSV.value = false;
      scrollEndAtSV.value = Date.now();
      if (isUserScrollingSV.value) runOnJS(scheduleResume)();
    },
  });

  useImperativeHandle(ref, () => ({
    scrollToIndex: ({ index, animated = true, viewPosition = activeLinePosition }) => {
      const offsets = itemOffsets.current;
      if (index < offsets.length) {
        const targetY = Math.max(0, offsets[index] - containerHeightSV.value * viewPosition);
        scrollRef.current?.scrollTo({ y: targetY, animated });
      }
    },
  }));

  const renderLyricLine = useCallback((item: { timestamp: number; text: string }, index: number) => (
    <LyricLine
      key={`lyric_${index}`}
      activeIndexSV={activeIndexSV}
      readingSV={isUserScrollingSV}
      waveSV={waveSV}
      text={item.text}
      timestamp={item.timestamp}
      index={index}
      onLyricPress={onLyricPress}
      onMeasured={handleItemMeasured}
      textStyle={textStyle}
      gap={gap}
      songTitle={songTitle}
    />
  ), [activeIndexSV, isUserScrollingSV, waveSV, onLyricPress, handleItemMeasured, textStyle, gap, songTitle]);

  return (
    <View style={styles.container}>
      <Animated.ScrollView
        ref={scrollRef}
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        scrollEnabled={scrollEnabled}
        showsVerticalScrollIndicator={false}
        // Native alpha dissolve of children at the clip edges — no MaskedView.
        // Android only; iOS ignores this prop.
        fadingEdgeLength={edgeFade > 0 ? edgeFade : undefined}
        onLayout={e => {
          containerHeightSV.value = e.nativeEvent.layout.height;
        }}
        onContentSizeChange={(_w, h) => {
          contentHeightSV.value = h;
        }}
      >
        <View style={{ height: topSpacerHeight }} />
        {headerContent}
        {lyrics.map(renderLyricLine)}
        <View style={{ height: bottomSpacerHeight }} />
      </Animated.ScrollView>

      {pillDirection !== 0 && (
        <Pressable
          style={styles.resumePill}
          onPress={resumeFollowing}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Back to the playing line"
        >
          <Frosted radius={18} intensity={50} tint={0.35} />
          <Ionicons name={pillDirection > 0 ? 'arrow-down' : 'arrow-up'} size={14} color={Signal.wave} />
          <Text style={styles.resumePillText}>Now playing</Text>
        </Pressable>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  // Floating over the lyrics, clear of the transport row below.
  resumePill: {
    position: 'absolute',
    alignSelf: 'center',
    bottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 18,
    overflow: 'hidden',
  },
  resumePillText: {
    color: Signal.ink,
    fontSize: 13,
    fontWeight: '600',
  },
  container: {
    flex: 1,
    width: '100%',
  },
  // Full width, so alignment is the text's own (a short left-aligned line
  // used to sit centred as a block).
  linePressable: {
    alignSelf: 'stretch',
    paddingHorizontal: 28,
  },
  instrumentalWrap: {
    alignItems: 'flex-start',
    justifyContent: 'center',
    minHeight: 40,
  },
  lyricText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  // Title words inside a lyric: a soft glow, same weight so nothing re-wraps.
  titleGlow: {
    color: '#FFFFFF',
    textShadowColor: 'rgba(255,255,255,0.75)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 10,
  },
});

export default SynchronizedLyrics;
