import React, { useEffect, useRef, useCallback, useMemo, forwardRef, useImperativeHandle, useState } from 'react';
import { View, Dimensions, Text, Pressable, StyleSheet, LayoutChangeEvent } from 'react-native';
import { FlashList as FlashListRaw, FlashListRef } from '@shopify/flash-list';
const FlashList = FlashListRaw as any;
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  interpolateColor,
  interpolate,
  Extrapolation,
  useDerivedValue,
  useAnimatedReaction,
  runOnJS,
  SharedValue
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import MaskedView from '@react-native-masked-view/masked-view';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const LYRIC_LINE_HEIGHT = 68; // fontSize 28 + marginVertical 16*2
import { useSettingsStore } from '../store/settingsStore';

// ------------------------------------------------------------------
// Step 1: The Animated <LyricLine> Component
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

const LyricLine = React.memo(({ text, activeIndexSV, timestamp, index, onLyricPress, onMeasured, textStyle, songTitle, highlightColor = '#FFD700' }: LyricLineProps) => {
  const handlePress = useCallback(() => onLyricPress(timestamp), [onLyricPress, timestamp]);
  
  // Debounce layout measurement to avoid thrashing during scroll
  const lastHeightRef = useRef<number>(0);
  const handleLayout = useCallback((e: LayoutChangeEvent) => {
    const height = e.nativeEvent.layout.height;
    if (Math.abs(lastHeightRef.current - height) > 1) {
      lastHeightRef.current = height;
      onMeasured(index, height);
    }
  }, [onMeasured, index]);

  const activeValue = useDerivedValue(() =>
    withTiming(activeIndexSV.value === index ? 1 : 0, { duration: 200 })
  );

  const animatedStyle = useAnimatedStyle(() => {
    const scale = interpolate(activeValue.value, [0, 1], [1.0, 1.05], Extrapolation.CLAMP);
    const targetOpacity = activeIndexSV.value > index ? 0.5 : 0.3;
    const opacity = interpolate(activeValue.value, [0, 1], [targetOpacity, 1.0], Extrapolation.CLAMP);
    const color = interpolateColor(
        activeValue.value,
        [0, 1],
        ['rgba(255,255,255,0.6)', '#FFFFFF']
    );
    return {
      transform: [{ scale }],
      opacity,
      color,
    };
  });

  // Phrase Matching Logic - memoized to avoid recalculation on every frame
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
              <Text style={{
                  backgroundColor: highlightColor || 'rgba(255,255,255,0.3)',
                  color: '#FFFFFF',
                  fontWeight: '900',
              }}>
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
// Step 2: The Synchronized FlashList
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
  activeLinePosition?: number; // 0.0 to 1.0 (default 0.5)
  songTitle?: string;
  highlightColor?: string;
  topSpacerHeight?: number;
  bottomSpacerHeight?: number;
  expandedAt?: number; // timestamp (Date.now()) when panel opened — resets initial scroll
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
}, ref) => {
  const flashListRef = useRef<FlashListRef<{ timestamp: number; text: string }>>(null);

  useImperativeHandle(ref, () => ({
    scrollToIndex: (params) => {
      flashListRef.current?.scrollToIndex(params);
    },
  }));
  const [isLayoutReady, setIsLayoutReady] = React.useState(false);
  const hasInitialScrolled = useRef(false);
  const prevExpandedAt = useRef(expandedAt);

  // Per-item measured heights and precomputed offsets
  const itemHeights = useRef<number[]>([]);
  const itemOffsets = useRef<number[]>([]);

  const recomputeOffsets = useCallback(() => {
    let offset = topSpacerHeight;
    const offsets: number[] = [];
    for (let i = 0; i < lyrics.length; i++) {
      offsets.push(offset);
      offset += itemHeights.current[i] ?? LYRIC_LINE_HEIGHT;
    }
    itemOffsets.current = offsets;
  }, [topSpacerHeight, lyrics.length]);

  // Initialise offset table when lyrics or spacer changes
  useEffect(() => {
    recomputeOffsets();
  }, [recomputeOffsets]);

  const handleItemMeasured = useCallback((idx: number, height: number) => {
    if (Math.abs((itemHeights.current[idx] ?? LYRIC_LINE_HEIGHT) - height) > 1) {
      itemHeights.current[idx] = height;
      recomputeOffsets();
    }
  }, [recomputeOffsets]);

  const { lyricsDelay } = useSettingsStore();

  // Support both number and SharedValue<number> for currentTime
  const currentTimeNumberSV = useSharedValue(typeof currentTime === 'number' ? currentTime : 0);
  const currentTimeSV = typeof currentTime === 'number' ? currentTimeNumberSV : currentTime;

  useEffect(() => {
    if (typeof currentTime === 'number') {
      currentTimeNumberSV.value = currentTime;
    }
  }, [currentTime, currentTimeNumberSV]);

  // Active index computed on UI thread — no JS re-render on every position tick
  const activeIndexDV = useDerivedValue(() => {
    const et = currentTimeSV.value + lyricsDelay;
    if (lyrics.length === 0) return -1;
    // Binary search for the active line
    let left = 0;
    let right = lyrics.length - 1;
    let result = -1;
    while (left <= right) {
      const mid = (left + right) >>> 1;
      const nextTs = lyrics[mid + 1]?.timestamp;
      if (et >= lyrics[mid].timestamp && (nextTs === undefined || et < nextTs)) {
        result = mid;
        break;
      }
      if (et < lyrics[mid].timestamp) {
        right = mid - 1;
      } else {
        left = mid + 1;
      }
    }
    return result;
  });

  // JS-side activeIndex state — only updates (and re-renders) when the line changes
  const [activeIndex, setActiveIndex] = useState(-1);
  const activeIndexSV = useSharedValue(-1);
  useAnimatedReaction(
    () => activeIndexDV.value,
    (next, prev) => {
      if (next !== prev) {
        activeIndexSV.value = next;
        runOnJS(setActiveIndex)(next);
      }
    }
  );

  const containerOpacity = useSharedValue(1);

  const containerStyle = useAnimatedStyle(() => ({
    opacity: withTiming(containerOpacity.value, { duration: 200 })
  }));

  // ⚡ SCROLL CONTROL
  useEffect(() => {
    // Reset initial-scroll flag when the panel is re-opened (expandedAt changed)
    if (expandedAt !== prevExpandedAt.current) {
      hasInitialScrolled.current = false;
      prevExpandedAt.current = expandedAt;
    }

    if (!isLayoutReady || isUserScrolling || !flashListRef.current) return;
    if (activeIndex < 0 || activeIndex >= lyrics.length) return;

    const performScroll = (isInitial = false) => {
      if (!flashListRef.current) return;
      try {
        flashListRef.current.scrollToIndex({
          index: activeIndex,
          animated: !isInitial,
          viewPosition: activeLinePosition,
        });
        if (isInitial) hasInitialScrolled.current = true;
      } catch (e) {
        if (__DEV__) console.log('[SynchronizedLyrics] Scroll failed:', e);
      }
    };

    if (!hasInitialScrolled.current) {
      const timers = [
        setTimeout(() => performScroll(true), 50),
        setTimeout(() => performScroll(true), 250),
        setTimeout(() => performScroll(true), 500),
      ];
      return () => timers.forEach(t => clearTimeout(t));
    } else {
      performScroll(false);
    }
  }, [activeIndex, isLayoutReady, isUserScrolling, lyrics.length, activeLinePosition, expandedAt]);

  // Stable renderItem - active state is derived on the UI thread per row
  const renderItem = useCallback(({ item, index }: { item: { timestamp: number; text: string }; index: number }) => {
    return (
      <LyricLine
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
    );
  }, [activeIndexSV, onLyricPress, handleItemMeasured, textStyle, songTitle, highlightColor]);

  return (
    <Animated.View style={[styles.container, containerStyle]}>
      <MaskedView
        style={styles.maskedView}
        maskElement={
          <LinearGradient
            colors={['transparent', 'black', 'black', 'transparent']}
            locations={[0, 0.12, 0.88, 1]}
            style={StyleSheet.absoluteFill}
          />
        }
      >
        <FlashList
          ref={flashListRef}
          onLayout={() => setIsLayoutReady(true)}
          data={lyrics}
          keyExtractor={(item, idx) => `lyric_${idx}`}
          renderItem={renderItem}
          scrollEnabled={scrollEnabled}
          estimatedItemSize={LYRIC_LINE_HEIGHT}
          ListHeaderComponent={
            <View>
              <View style={{ height: topSpacerHeight }} />
              {headerContent}
            </View>
          }
          ListFooterComponent={<View style={{ height: bottomSpacerHeight }} />}
          onScrollBeginDrag={() => onScrollStateChange?.(true)}
          onMomentumScrollEnd={() => onScrollStateChange?.(false)}
          onScrollEndDrag={() => {
            setTimeout(() => onScrollStateChange?.(false), 2000);
          }}
          showsVerticalScrollIndicator={false}
        />
      </MaskedView>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
  },
  maskedView: {
    flex: 1,
    height: '100%',
    width: '100%',
  },
  lyricText: {
    fontSize: 28,
    fontWeight: '800',
    textAlign: 'left',
    marginVertical: 16,
    paddingHorizontal: 32,
    // Soft white glow for professional blurred text look
    textShadowColor: 'rgba(255,255,255,0.12)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 12,
  }
});

export default SynchronizedLyrics;
