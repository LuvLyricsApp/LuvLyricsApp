import React, { useEffect, useRef, useCallback, useMemo, useState, forwardRef, useImperativeHandle } from 'react';
import { View, Dimensions, Text, Pressable, StyleSheet, LayoutChangeEvent, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  interpolateColor,
  interpolate,
  Extrapolation,
  useDerivedValue,
  useAnimatedReaction,
  useAnimatedRef,
  useAnimatedScrollHandler,
  scrollTo,
  runOnJS,
  cancelAnimation,
  Easing,
  SharedValue,
} from 'react-native-reanimated';
import { useSettingsStore } from '../store/settingsStore';
import InstrumentalWaveform, { isInstrumentalLyric, useIsActiveLine } from './InstrumentalWaveform';
import { Fonts } from '../constants/fonts';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const LYRIC_LINE_HEIGHT = 68;
const FOLLOW_GLIDE_MS = 460;
const FOLLOW_GLIDE_EASING = Easing.bezier(0.22, 1, 0.36, 1);

/**
 * How close to the playing line counts as "back where you started" — scroll
 * within this many px of it and auto-follow re-attaches without a tap.
 * Roughly one line, so it triggers on intent rather than on a stray pixel.
 */
const RESUME_SNAP_PX = 72;

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
  textStyle?: any;
  songTitle?: string;
}

const LyricLine = React.memo(({
  text,
  activeIndexSV,
  timestamp,
  index,
  onLyricPress,
  onMeasured,
  textStyle,
  songTitle,
}: LyricLineProps) => {
  const handlePress = useCallback(() => onLyricPress(timestamp), [onLyricPress, timestamp]);
  const isInstrumental = useMemo(() => isInstrumentalLyric(text), [text]);
  const isActiveLine = useIsActiveLine(activeIndexSV, index);

  // Every line renders in one face at one size — the active line is carried by
  // colour and opacity alone. Swapping to a bold face on activation made the
  // current line read as physically larger than its neighbours.

  const lastHeightRef = useRef<number>(0);
  const handleLayout = useCallback((e: LayoutChangeEvent) => {
    const h = e.nativeEvent.layout.height;
    if (Math.abs(lastHeightRef.current - h) > 1) {
      lastHeightRef.current = h;
      onMeasured(index, h);
    }
  }, [onMeasured, index]);

  // Spring-based 0→1 transition — physics easing feels natural, no stiffness of linear timing
  const activeValue = useDerivedValue(() =>
    withSpring(activeIndexSV.value === index ? 1 : 0, {
      damping: 22,
      stiffness: 280,
      mass: 0.68,
    }),
  );

  const animatedStyle = useAnimatedStyle(() => {
    const basOpacity = activeIndexSV.value > index ? 0.45 : 0.28;
    const opacity = interpolate(activeValue.value, [0, 1], [basOpacity, 1.0], Extrapolation.CLAMP);
    // Inactive lines sit 5px below; active line rises up to its natural position
    const translateY = interpolate(activeValue.value, [0, 1], [6, 0], Extrapolation.CLAMP);
    const scale = interpolate(activeValue.value, [0, 1], [0.965, 1.035], Extrapolation.CLAMP);
    const color = interpolateColor(activeValue.value, [0, 1], ['rgba(255,255,255,0.5)', '#FFFFFF']);
    return {
      transform: [{ translateY }, { scale }] as any,
      opacity,
      color,
      fontFamily: activeValue.value > 0.5 ? Fonts.lyricsActive : Fonts.lyrics,
      fontWeight: activeValue.value > 0.5 ? Fonts.lyricsActiveWeight : Fonts.lyricsWeight,
    };
  });

  const instrumentWrapStyle = useAnimatedStyle(() => {
    const basOpacity = activeIndexSV.value > index ? 0.4 : 0.25;
    const opacity = interpolate(activeValue.value, [0, 1], [basOpacity, 1.0], Extrapolation.CLAMP);
    const translateY = interpolate(activeValue.value, [0, 1], [5, 0], Extrapolation.CLAMP);
    const scale = interpolate(activeValue.value, [0, 1], [0.92, 1], Extrapolation.CLAMP);
    return { transform: [{ translateY }, { scale }], opacity } as ViewStyle;
  });

  const renderedText = useMemo(() => {
    if (!songTitle) return text;
    const cleanText = text.replace(/\s+/g, ' ');
    const lowerText = cleanText.toLowerCase();
    const lowerTitle = songTitle.toLowerCase().trim();
    if (lowerTitle.length < 2) return text;
    const idx = lowerText.indexOf(lowerTitle);
    if (idx === -1) return text;
    const prefix = cleanText.substring(0, idx);
    const match = cleanText.substring(idx, idx + lowerTitle.length);
    const suffix = cleanText.substring(idx + lowerTitle.length);
    return (
      <Text>
        {prefix}
        <Text style={styles.titleGlow}>
          {match}
        </Text>
        {suffix}
      </Text>
    );
  }, [text, songTitle]);

  return (
    <Pressable onPress={handlePress} onLayout={handleLayout} style={styles.linePressable}>
      {isInstrumental ? (
        <Animated.View style={[styles.instrumentalWrap, instrumentWrapStyle]}>
          <InstrumentalWaveform active={isActiveLine} size={isActiveLine ? 'lg' : 'md'} />
        </Animated.View>
      ) : (
        <Animated.Text style={[styles.lyricText, textStyle, animatedStyle]}>
          {renderedText}
        </Animated.Text>
      )}
    </Pressable>
  );
});

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
  textStyle?: any;
  scrollEnabled?: boolean;
  activeLinePosition?: number;
  songTitle?: string;
  topSpacerHeight?: number;
  bottomSpacerHeight?: number;
  expandedAt?: number;
  fadeColor?: string;
  /** Android-only: soft-dissolve lyric text at the top/bottom edges (px). */
  edgeFade?: number;
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
  textStyle,
  scrollEnabled = true,
  activeLinePosition = 0.5,
  songTitle,
  topSpacerHeight = SCREEN_HEIGHT * 0.4,
  bottomSpacerHeight = SCREEN_HEIGHT * 0.4,
  edgeFade = 0,
}, ref) => {
  // Animated ref — required for the scrollTo worklet
  const scrollRef = useAnimatedRef<Animated.ScrollView>();

  // Precomputed item offsets — kept as both a JS ref and a SharedValue
  // so the scroll worklet can read them without touching the JS thread.
  const itemHeights = useRef<number[]>([]);
  const itemOffsets = useRef<number[]>([]);
  const itemOffsetsSV = useSharedValue<number[]>([]);
  const itemHeightsSV = useSharedValue<number[]>([]);
  const headerHeight = useRef(0);
  const containerHeightSV = useSharedValue(SCREEN_HEIGHT);
  // SharedValue mirror of the isUserScrolling prop so worklets can read it
  const isUserScrollingSV = useSharedValue(false);
  useEffect(() => { isUserScrollingSV.value = isUserScrolling; }, [isUserScrolling, isUserScrollingSV]);

  // Track previous active index to distinguish normal advance from large seek jump
  const prevScrollIndexSV = useSharedValue(-1);
  const autoFollowYSV = useSharedValue(0);

  const recomputeOffsets = useCallback(() => {
    let offset = topSpacerHeight + headerHeight.current;
    const offsets: number[] = [];
    for (let i = 0; i < lyrics.length; i++) {
      offsets.push(offset);
      offset += itemHeights.current[i] ?? LYRIC_LINE_HEIGHT;
    }
    itemOffsets.current = offsets;
    itemOffsetsSV.value = offsets.slice(); // push to UI thread
    itemHeightsSV.value = lyrics.map((_, index) => itemHeights.current[index] ?? LYRIC_LINE_HEIGHT);
  }, [topSpacerHeight, lyrics, itemOffsetsSV, itemHeightsSV]);

  useEffect(() => { recomputeOffsets(); }, [recomputeOffsets]);

  const handleItemMeasured = useCallback((idx: number, height: number) => {
    if (Math.abs((itemHeights.current[idx] ?? LYRIC_LINE_HEIGHT) - height) > 1) {
      itemHeights.current[idx] = height;
      recomputeOffsets();
    }
  }, [recomputeOffsets]);

  const handleHeaderMeasured = useCallback((e: LayoutChangeEvent) => {
    const nextHeight = e.nativeEvent.layout.height;
    if (Math.abs(headerHeight.current - nextHeight) > 1) {
      headerHeight.current = nextHeight;
      recomputeOffsets();
    }
  }, [recomputeOffsets]);

  // Selector, not the whole store: this component re-renders while lyrics scroll.
  const lyricsDelay = useSettingsStore(s => s.lyricsDelay);

  // Normalise currentTime — accept both raw number and SharedValue<number>
  const currentTimeNumberSV = useSharedValue(typeof currentTime === 'number' ? currentTime : 0);
  const currentTimeSV: SharedValue<number> =
    typeof currentTime === 'number' ? currentTimeNumberSV : currentTime as SharedValue<number>;

  useEffect(() => {
    if (typeof currentTime === 'number') currentTimeNumberSV.value = currentTime;
  }, [currentTime, currentTimeNumberSV]);

  // Binary search for active line — pure UI-thread worklet, no JS bridge
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

  // ─── UI-THREAD SCROLL ────────────────────────────────────────────
  // scrollTo worklet drives the ScrollView directly on the UI thread —
  // zero JS bridge crossings, frame-perfect sync with audio position.
  // activeIndexSV is written on the UI thread and read by every LyricLine
  const activeIndexSV = useSharedValue(-1);
  useAnimatedReaction(
    () => activeIndexDV.value,
    (next, prev) => {
      if (next === prev) return;
      // A jump of more than a few lines is a scrub or a track change, not normal
      // playback advancing. Treat it as an explicit "take me there" and re-attach
      // auto-follow, so scrubbing always lands the lyrics on the new position
      // even if the reader had scrolled away earlier.
      if (prev !== null && Math.abs(next - prev) > 3 && isUserScrollingSV.value) {
        isUserScrollingSV.value = false;
      }
      activeIndexSV.value = next;
    },
  );

  // Scroll event handler — detects user drag to pause auto-scroll
  const notifyScrollState = useCallback((scrolling: boolean) => {
    onScrollStateChange?.(scrolling);
  }, [onScrollStateChange]);

  // ─── DETACHED SCROLL + RESUME PILL ───────────────────────────────
  // Once the reader scrolls, auto-follow stays off indefinitely — it never
  // yanks the lyrics back mid-read. They come back only by tapping the pill,
  // or by scrolling back to the playing line themselves.
  const scrollYSV = useSharedValue(0);
  /** -1 = playing line is above the viewport, 1 = below, 0 = pill hidden. */
  const [pillDirection, setPillDirection] = useState(0);

  /** Where the midpoint of the playing line wants the scroll offset to be. */
  const activeTargetYSV = useDerivedValue(() => {
    const idx = activeIndexDV.value;
    const offsets = itemOffsetsSV.value;
    const heights = itemHeightsSV.value;
    if (idx < 0 || idx >= offsets.length) return -1;
    const lineMidpoint = offsets[idx] + (heights[idx] ?? LYRIC_LINE_HEIGHT) / 2;
    return Math.max(0, lineMidpoint - containerHeightSV.value * activeLinePosition);
  });

  // Only an actual destination change starts a follow animation. The audio
  // ticker can update many times inside one lyric, but it leaves this value
  // untouched, so no repeated native-scroll requests fight the glide.
  useAnimatedReaction(
    () => (isUserScrollingSV.value ? -1 : activeTargetYSV.value),
    (targetY, previousTargetY) => {
      if (targetY < 0) {
        cancelAnimation(autoFollowYSV);
        return;
      }
      if (targetY === previousTargetY) return;

      const idx = activeIndexDV.value;
      const isFirstPosition = prevScrollIndexSV.value < 0;
      const isSeek = !isFirstPosition && Math.abs(idx - prevScrollIndexSV.value) > 3;
      prevScrollIndexSV.value = idx;

      if (isFirstPosition || isSeek) {
        autoFollowYSV.value = targetY;
      } else {
        autoFollowYSV.value = withTiming(targetY, {
          duration: FOLLOW_GLIDE_MS,
          easing: FOLLOW_GLIDE_EASING,
        });
      }
    },
  );

  // Reanimated samples autoFollowYSV on the UI thread and applies it as a
  // native scroll position. No React render or JS-to-native bridge is involved.
  useDerivedValue(() => {
    scrollTo(scrollRef, 0, autoFollowYSV.value, false);
  });

  const resumeFollowing = useCallback(() => {
    isUserScrollingSV.value = false;
    notifyScrollState(false);
  }, [isUserScrollingSV, notifyScrollState]);

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
      if (next === 0 && isUserScrollingSV.value) runOnJS(resumeFollowing)();
      runOnJS(setPillDirection)(next);
    },
  );

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (e) => {
      'worklet';
      scrollYSV.value = e.contentOffset.y;
    },
    onBeginDrag: () => {
      'worklet';
      if (isUserScrollingSV.value) return;
      isUserScrollingSV.value = true;
      runOnJS(notifyScrollState)(true);
    },
  });

  const handleResumePress = useCallback(() => {
    // Clearing the flag lets the existing scrollTo worklet drive it home.
    resumeFollowing();
  }, [resumeFollowing]);

  // Expose scrollToIndex for external callers (e.g. tapping a search result)
  useImperativeHandle(ref, () => ({
    scrollToIndex: ({ index, animated = true, viewPosition = activeLinePosition }) => {
      const offsets = itemOffsets.current;
      if (index < offsets.length) {
        const targetY = Math.max(0, offsets[index] - containerHeightSV.value * viewPosition);
        scrollRef.current?.scrollTo({ y: targetY, animated });
      }
    },
  }));

  // Stable renderItem callback — avoids re-rendering all lines when unrelated state changes
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
      songTitle={songTitle}
    />
  ), [activeIndexSV, onLyricPress, handleItemMeasured, textStyle, songTitle]);

  return (
    <View style={styles.container}>
      <Animated.ScrollView
        ref={scrollRef}
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        scrollEnabled={scrollEnabled}
        showsVerticalScrollIndicator={false}
        removeClippedSubviews
        // Native alpha dissolve of children at the clip edges — no MaskedView.
        // Android only; iOS ignores this prop.
        fadingEdgeLength={edgeFade > 0 ? edgeFade : undefined}
        onLayout={(e) => {
          containerHeightSV.value = e.nativeEvent.layout.height;
        }}
      >
        <View style={{ height: topSpacerHeight }} />
        {headerContent ? <View onLayout={handleHeaderMeasured}>{headerContent}</View> : null}
        {lyrics.map(renderLyricLine)}
        <View style={{ height: bottomSpacerHeight }} />
      </Animated.ScrollView>

      {pillDirection !== 0 && (
        <Pressable
          style={styles.resumePill}
          onPress={handleResumePress}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Back to the playing line"
        >
          {/* Glass, not a white chip — it picks up the blurred cover art behind
              the lyrics instead of punching a bright hole through them. */}
          <BlurView intensity={38} tint="dark" style={StyleSheet.absoluteFill} />
          <Ionicons
            name={pillDirection > 0 ? 'arrow-down' : 'arrow-up'}
            size={14}
            color="#fff"
          />
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
    // BlurView fills this; the tint and hairline rim are what make it read as
    // glass rather than a flat translucent rectangle.
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.28)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 6,
  },
  resumePillText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  container: {
    flex: 1,
    width: '100%',
  },
  linePressable: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  instrumentalWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    paddingVertical: 10,
    marginVertical: 8,
  },
  lyricText: {
    fontFamily: Fonts.lyrics,
    fontSize: 28,
    textAlign: 'left',
    marginVertical: 8,
    paddingHorizontal: 32,
  },
  // Title words inside a lyric: no background block, just a white glow.
  // Always bold — a glow on a regular-weight line reads as a stale highlight.
  titleGlow: {
    fontFamily: Fonts.lyricsActive,
    fontWeight: Fonts.lyricsActiveWeight,
    color: '#FFFFFF',
    textShadowColor: 'rgba(255,255,255,0.9)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 12,
  },
});

export default SynchronizedLyrics;
