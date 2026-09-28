/**
 * Time-synced lyrics, YouTube Music's way: every line set in the same bold
 * weight, the sung one bright and full size, the rest dimmed and a touch
 * smaller, and the list gliding up to the next line on one decelerating curve.
 *
 * What keeps it smooth:
 *   - A line never changes its layout when it becomes the sung one — only
 *     opacity and scale move — so the measured offsets never shift under the
 *     scroll (swapping to a bold face used to re-wrap the line and jolt it).
 *   - The scroll is our own animation on the UI thread (`followY`, Material's
 *     emphasized decelerate) fed to `scrollTo` frame by frame, instead of the
 *     platform's fixed smooth-scroll, so a new target mid-glide carries on
 *     from where it is rather than restarting.
 *   - Spacing is padding on each line's row, the same for every line, and the
 *     first guess at a line's height comes from the text style.
 *
 * Scroll by hand and the lines stay put; they glide back to the sung line a
 * few seconds after you let go (or at once from the pill, or when you scroll
 * back to it yourself).
 */
import React, { useEffect, useRef, useCallback, useMemo, useState, forwardRef, useImperativeHandle } from 'react';
import { View, Dimensions, Text, Pressable, StyleSheet, LayoutChangeEvent, TextStyle, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  cancelAnimation,
  Easing,
  useSharedValue,
  useAnimatedStyle,
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
/** Hands off for this long after a manual scroll, then the lines glide back. */
const AUTO_RESUME_MS = 3500;
/** One line to the next: long enough to read as a glide, short enough to keep up with fast verses. */
const GLIDE_MS = 620;
const GLIDE_EASE = Easing.bezier(0.2, 0, 0, 1);
/** Further than this many lines (a seek) cuts instead of gliding through the song. */
const JUMP_LINES = 4;

const DEFAULT_TEXT: TextStyle = { fontSize: 28, lineHeight: 34, textAlign: 'left' };
const DEFAULT_GAP = 16;

// ------------------------------------------------------------------
// LyricLine
// ------------------------------------------------------------------

interface LyricLineProps {
  text: string;
  activeIndexSV: SharedValue<number>;
  timestamp: number;
  index: number;
  onLyricPress: (timestamp: number) => void;
  onMeasured: (index: number, height: number) => void;
  textStyle: TextStyle;
  gap: number;
  songTitle?: string;
}

const LINE_SPRING = { damping: 24, stiffness: 190, mass: 0.8 } as const;

const LyricLine = React.memo(({
  text,
  activeIndexSV,
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

  // 0 = waiting / sung, 1 = being sung. Everything below is opacity and scale.
  const activeValue = useDerivedValue(() =>
    withSpring(activeIndexSV.value === index ? 1 : 0, LINE_SPRING),
  );

  const align = textStyle.textAlign ?? 'left';
  const origin = align === 'center' ? 'center' : align === 'right' ? 'right' : 'left';
  const animatedStyle = useAnimatedStyle((): ViewStyle => {
    const rest = activeIndexSV.value > index ? 0.36 : 0.5;
    return {
      opacity: interpolate(activeValue.value, [0, 1], [rest, 1], Extrapolation.CLAMP),
      transform: [{ scale: interpolate(activeValue.value, [0, 1], [0.955, 1], Extrapolation.CLAMP) }],
    };
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
    <Pressable onPress={handlePress} onLayout={handleLayout} style={[styles.linePressable, { paddingVertical: gap }]}>
      {isInstrumental ? (
        <InstrumentalLine activeIndexSV={activeIndexSV} index={index} activeValue={activeValue} />
      ) : (
        <Animated.View style={[animatedStyle, { transformOrigin: origin }]}>
          <Text style={[styles.lyricText, textStyle]}>{renderedText}</Text>
        </Animated.View>
      )}
    </Pressable>
  );
});

/** A music break: the waveform instead of a blank line. */
const InstrumentalLine: React.FC<{ activeIndexSV: SharedValue<number>; index: number; activeValue: SharedValue<number> }> = ({ activeIndexSV, index, activeValue }) => {
  const isActiveLine = useIsActiveLine(activeIndexSV, index);
  const style = useAnimatedStyle((): ViewStyle => {
    const rest = activeIndexSV.value > index ? 0.36 : 0.5;
    return {
      opacity: interpolate(activeValue.value, [0, 1], [rest, 1], Extrapolation.CLAMP),
      transform: [{ scale: interpolate(activeValue.value, [0, 1], [0.92, 1], Extrapolation.CLAMP) }],
    };
  });
  return (
    <Animated.View style={[styles.instrumentalWrap, style]}>
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
  activeLinePosition = 0.5,
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

  // Line offsets, mirrored to the UI thread for the scroll worklets.
  const itemHeights = useRef<number[]>([]);
  const itemOffsets = useRef<number[]>([]);
  const itemOffsetsSV = useSharedValue<number[]>([]);
  const containerHeightSV = useSharedValue(SCREEN_HEIGHT);
  const isUserScrollingSV = useSharedValue(false);
  useEffect(() => { isUserScrollingSV.value = isUserScrolling; }, [isUserScrolling, isUserScrollingSV]);

  const recomputeOffsets = useCallback(() => {
    let offset = topSpacerHeight;
    const offsets: number[] = [];
    for (let i = 0; i < lyrics.length; i++) {
      offsets.push(offset);
      offset += itemHeights.current[i] ?? estimate;
    }
    itemOffsets.current = offsets;
    itemOffsetsSV.value = offsets;
  }, [topSpacerHeight, lyrics.length, itemOffsetsSV, estimate]);

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

  /** Where the sung line wants the list to be. */
  const activeTargetYSV = useDerivedValue(() => {
    const idx = activeIndexDV.value;
    const offsets = itemOffsetsSV.value;
    if (idx < 0 || idx >= offsets.length) return -1;
    return Math.max(0, offsets[idx] - containerHeightSV.value * activeLinePosition);
  });

  // ─── The glide ───────────────────────────────────────────────────
  const scrollYSV = useSharedValue(0);
  const followY = useSharedValue(0);
  const lastIndexSV = useSharedValue(-1);

  useAnimatedReaction(
    () => ({ target: activeTargetYSV.value, user: isUserScrollingSV.value, idx: activeIndexDV.value }),
    (now, prev) => {
      if (now.user || now.target < 0) return;
      if (prev && prev.target === now.target && prev.user === now.user) return;
      const resuming = !!prev && prev.user && !now.user;
      // A seek (or the first frame) cuts; a reader coming back glides from
      // where they are; everything else glides on from the current position.
      const jump = !prev || (!resuming && Math.abs(now.idx - lastIndexSV.value) > JUMP_LINES);
      lastIndexSV.value = now.idx;
      if (resuming) followY.value = scrollYSV.value;
      if (jump) {
        cancelAnimation(followY);
        followY.value = now.target;
      } else {
        followY.value = withTiming(now.target, { duration: GLIDE_MS, easing: GLIDE_EASE });
      }
    },
  );
  useAnimatedReaction(
    () => followY.value,
    y => {
      if (!isUserScrollingSV.value) scrollTo(scrollRef, 0, y, false);
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
      cancelAnimation(followY);
      runOnJS(clearResume)();
      if (isUserScrollingSV.value) return;
      isUserScrollingSV.value = true;
      runOnJS(notifyScrollState)(true);
    },
    onEndDrag: () => {
      // Always arm the resume here: on Android a slow release that isn't a
      // fling fires no momentum events, and the list stayed detached for good.
      runOnJS(scheduleResume)();
    },
    onMomentumBegin: () => {
      // A fling: wait until it settles instead.
      runOnJS(clearResume)();
    },
    onMomentumEnd: () => {
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
      text={item.text}
      timestamp={item.timestamp}
      index={index}
      onLyricPress={onLyricPress}
      onMeasured={handleItemMeasured}
      textStyle={textStyle}
      gap={gap}
      songTitle={songTitle}
    />
  ), [activeIndexSV, onLyricPress, handleItemMeasured, textStyle, gap, songTitle]);

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
