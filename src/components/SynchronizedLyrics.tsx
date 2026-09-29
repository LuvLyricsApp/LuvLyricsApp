/**
 * Time-synced lyrics, the way YouTube Music moves them: every line in the same
 * bold weight, the sung one bright, the rest dimmed — and the whole page
 * gliding up as one piece, with no springs, no stagger and no bounce.
 *
 * How a line change moves:
 *   - The list jumps to its new offset in one frame and the block of lines is
 *     pushed back by the same distance (`glide`, one transform on one view),
 *     so nothing moves on screen yet. The block then eases home on a single
 *     decelerating curve. A new line mid-flight adds to what is left of the
 *     glide, so motion carries on instead of restarting.
 *   - A seek slides the same way, from at most 60% of the height away.
 *   - The sung line changes only its opacity (a short fade), never its size
 *     or layout, so the measured offsets never shift under the list.
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
  withTiming,
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
import { Motion, Signal } from '../constants/allegraTheme';

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
const DEFAULT_TEXT: TextStyle = { fontSize: 28, lineHeight: 34, textAlign: 'left' };
const DEFAULT_GAP = 16;

/**
 * The glide: one decelerating curve, no overshoot. Long enough to read as a
 * flow rather than a step, short enough to land well before the next line.
 */
const GLIDE_MS = 520;
const GLIDE_EASE = Motion.ease.emphasis;
/** The sung line brightens (and the last one dims) on a short fade alongside the glide. */
const DIM_MS = 360;
const DIM_EASE = Motion.ease.standard;

// ------------------------------------------------------------------
// LyricLine
// ------------------------------------------------------------------

interface LyricLineProps {
  text: string;
  activeIndexSV: SharedValue<number>;
  readingSV: SharedValue<boolean>;
  timestamp: number;
  index: number;
  onLyricPress: (timestamp: number) => void;
  onMeasured: (index: number, height: number) => void;
  textStyle: TextStyle;
  gap: number;
  songTitle?: string;
}

/** How bright a line is when it isn't being sung: YouTube Music's one even dim, a little brighter while you read. */
const restOpacity = (reading: boolean): number => {
  'worklet';
  return reading ? 0.62 : 0.42;
};

const LyricLine = React.memo(({
  text,
  activeIndexSV,
  readingSV,
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

  // ── How it looks: dimmed at rest, bright while sung ─────────────────────
  // Only opacity moves on a line; where it sits is the block's glide.
  const dimStyle = useAnimatedStyle((): ViewStyle => {
    const active = activeIndexSV.value;
    const target = active === index ? 1 : restOpacity(readingSV.value);
    // Far from the sung line: plain values, no animation to run.
    const far = active >= 0 && Math.abs(index - active) > 6;
    return { opacity: far ? target : withTiming(target, { duration: DIM_MS, easing: DIM_EASE }) };
  });

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
    <View onLayout={handleLayout} style={{ paddingVertical: gap }}>
      <Animated.View style={dimStyle}>
        <Pressable onPress={handlePress} style={styles.linePressable}>
          {isInstrumental ? (
            <InstrumentalLine activeIndexSV={activeIndexSV} index={index} />
          ) : (
            <Text style={[styles.lyricText, textStyle]}>{renderedText}</Text>
          )}
        </Pressable>
      </Animated.View>
    </View>
  );
});

/** A music break: the waveform instead of a blank line. */
const InstrumentalLine: React.FC<{ activeIndexSV: SharedValue<number>; index: number }> = ({ activeIndexSV, index }) => {
  const isActiveLine = useIsActiveLine(activeIndexSV, index);
  return (
    <Animated.View style={styles.instrumentalWrap}>
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
  /** What is left of the block's glide: the lines sit this far below where the list has already jumped to. */
  const glideSV = useSharedValue(0);
  const glideStyle = useAnimatedStyle((): ViewStyle => ({ transform: [{ translateY: glideSV.value }] }));

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
      const firstFrame = !prev || lastIndexSV.value < 0;
      const sameLine = !(prev && prev.user) && now.idx === lastIndexSV.value;
      lastIndexSV.value = now.idx;
      scrollTo(scrollRef, 0, toY, false);
      scrollYSV.value = toY;
      if (firstFrame || Math.abs(delta) < 0.5) {
        cancelAnimation(glideSV);
        glideSV.value = 0;
        return;
      }
      // A line re-measured by a pixel or two: not worth a motion.
      if (sameLine && Math.abs(delta) < 2) {
        glideSV.value = glideSV.value + delta;
        glideSV.value = withTiming(0, { duration: DIM_MS, easing: GLIDE_EASE });
        return;
      }
      // The block starts where it was on screen (what was left of the last
      // glide plus this jump) and eases home. A seek comes in from at most
      // 60% of the height away instead of racing across the song.
      const cap = containerHeightSV.value * 0.6;
      glideSV.value = Math.max(-cap, Math.min(cap, glideSV.value + delta));
      glideSV.value = withTiming(0, { duration: GLIDE_MS, easing: GLIDE_EASE });
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
      // Grabbed mid-glide: the list takes over from where the lines are on
      // screen, so nothing jumps under the finger.
      if (glideSV.value !== 0) {
        const left = glideSV.value;
        cancelAnimation(glideSV);
        glideSV.value = 0;
        scrollTo(scrollRef, 0, Math.max(0, scrollYSV.value - left), false);
      }
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
      text={item.text}
      timestamp={item.timestamp}
      index={index}
      onLyricPress={onLyricPress}
      onMeasured={handleItemMeasured}
      textStyle={textStyle}
      gap={gap}
      songTitle={songTitle}
    />
  ), [activeIndexSV, isUserScrollingSV, onLyricPress, handleItemMeasured, textStyle, gap, songTitle]);

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
        <Animated.View style={glideStyle}>{lyrics.map(renderLyricLine)}</Animated.View>
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
