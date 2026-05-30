import React, { useEffect, useRef, useCallback, useMemo, forwardRef, useImperativeHandle } from 'react';
import { View, Dimensions, Text, Pressable, StyleSheet, LayoutChangeEvent } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  interpolateColor,
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

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const LYRIC_LINE_HEIGHT = 68;

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
  highlightColor?: string;
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
  highlightColor = '#FFD700',
}: LyricLineProps) => {
  const handlePress = useCallback(() => onLyricPress(timestamp), [onLyricPress, timestamp]);

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
      damping: 20,
      stiffness: 260,
      mass: 0.7,
    }),
  );

  const animatedStyle = useAnimatedStyle(() => {
    const basOpacity = activeIndexSV.value > index ? 0.45 : 0.28;
    const opacity = interpolate(activeValue.value, [0, 1], [basOpacity, 1.0], Extrapolation.CLAMP);
    // Inactive lines sit 5px below; active line rises up to its natural position
    const translateY = interpolate(activeValue.value, [0, 1], [5, 0], Extrapolation.CLAMP);
    const color = interpolateColor(activeValue.value, [0, 1], ['rgba(255,255,255,0.5)', '#FFFFFF']);
    return { transform: [{ translateY }], opacity, color };
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
        <Text style={{ backgroundColor: highlightColor || 'rgba(255,255,255,0.3)', color: '#FFFFFF', fontWeight: '900' }}>
          {` ${match} `}
        </Text>
        {suffix}
      </Text>
    );
  }, [text, songTitle, highlightColor]);

  return (
    <Pressable onPress={handlePress} onLayout={handleLayout}>
      <Animated.Text style={[styles.lyricText, textStyle, animatedStyle]}>
        {renderedText}
      </Animated.Text>
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
  highlightColor?: string;
  topSpacerHeight?: number;
  bottomSpacerHeight?: number;
  expandedAt?: number;
  fadeColor?: string;
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
  highlightColor,
  topSpacerHeight = SCREEN_HEIGHT * 0.4,
  bottomSpacerHeight = SCREEN_HEIGHT * 0.4,
  expandedAt = 0,
  fadeColor = '#000000',
}, ref) => {
  // Animated ref — required for the scrollTo worklet
  const scrollRef = useAnimatedRef<Animated.ScrollView>();

  // Precomputed item offsets — kept as both a JS ref and a SharedValue
  // so the scroll worklet can read them without touching the JS thread.
  const itemHeights = useRef<number[]>([]);
  const itemOffsets = useRef<number[]>([]);
  const itemOffsetsSV = useSharedValue<number[]>([]);
  const containerHeightSV = useSharedValue(SCREEN_HEIGHT);

  // SharedValue mirror of the isUserScrolling prop so worklets can read it
  const isUserScrollingSV = useSharedValue(false);
  useEffect(() => { isUserScrollingSV.value = isUserScrolling; }, [isUserScrolling, isUserScrollingSV]);

  // Track previous active index to distinguish normal advance from large seek jump
  const prevScrollIndexSV = useSharedValue(-1);

  const recomputeOffsets = useCallback(() => {
    let offset = topSpacerHeight;
    const offsets: number[] = [];
    for (let i = 0; i < lyrics.length; i++) {
      offsets.push(offset);
      offset += itemHeights.current[i] ?? LYRIC_LINE_HEIGHT;
    }
    itemOffsets.current = offsets;
    itemOffsetsSV.value = offsets.slice(); // push to UI thread
  }, [topSpacerHeight, lyrics.length, itemOffsetsSV]);

  useEffect(() => { recomputeOffsets(); }, [recomputeOffsets]);

  const handleItemMeasured = useCallback((idx: number, height: number) => {
    if (Math.abs((itemHeights.current[idx] ?? LYRIC_LINE_HEIGHT) - height) > 1) {
      itemHeights.current[idx] = height;
      recomputeOffsets();
    }
  }, [recomputeOffsets]);

  const { lyricsDelay } = useSettingsStore();

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
  useDerivedValue(() => {
    if (isUserScrollingSV.value) return;
    const idx = activeIndexDV.value;
    if (idx < 0) return;
    const offsets = itemOffsetsSV.value;
    if (idx >= offsets.length) return;
    const targetY = offsets[idx] - containerHeightSV.value * activeLinePosition;
    // Animate for normal line-by-line advance; instant jump for large seeks
    const shouldAnimate = Math.abs(idx - prevScrollIndexSV.value) <= 3;
    prevScrollIndexSV.value = idx;
    scrollTo(scrollRef, 0, Math.max(0, targetY), shouldAnimate);
  });

  // activeIndexSV is written on the UI thread and read by every LyricLine
  const activeIndexSV = useSharedValue(-1);
  useAnimatedReaction(
    () => activeIndexDV.value,
    (next, prev) => {
      if (next !== prev) activeIndexSV.value = next;
    },
  );

  // Scroll event handler — detects user drag to pause auto-scroll
  const notifyScrollState = useCallback((scrolling: boolean) => {
    onScrollStateChange?.(scrolling);
  }, [onScrollStateChange]);

  const scrollHandler = useAnimatedScrollHandler({
    onBeginDrag: () => {
      'worklet';
      isUserScrollingSV.value = true;
      runOnJS(notifyScrollState)(true);
    },
    onMomentumEnd: () => {
      'worklet';
      isUserScrollingSV.value = false;
      runOnJS(notifyScrollState)(false);
    },
  });

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
      highlightColor={highlightColor}
    />
  ), [activeIndexSV, onLyricPress, handleItemMeasured, textStyle, songTitle, highlightColor]);

  return (
    <View style={styles.container}>
      <Animated.ScrollView
        ref={scrollRef}
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        scrollEnabled={scrollEnabled}
        showsVerticalScrollIndicator={false}
        removeClippedSubviews
        onLayout={(e) => {
          containerHeightSV.value = e.nativeEvent.layout.height;
        }}
        onScrollEndDrag={() => {
          // Fallback resume for drag-without-momentum (no onMomentumEnd fires)
          setTimeout(() => {
            isUserScrollingSV.value = false;
            notifyScrollState(false);
          }, 2000);
        }}
      >
        <View style={{ height: topSpacerHeight }} />
        {headerContent}
        {lyrics.map(renderLyricLine)}
        <View style={{ height: bottomSpacerHeight }} />
      </Animated.ScrollView>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
  },
  lyricText: {
    fontSize: 28,
    fontWeight: '800',
    textAlign: 'left',
    marginVertical: 16,
    paddingHorizontal: 32,
  },
});

export default SynchronizedLyrics;
