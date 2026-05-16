import React, { useEffect, useRef, useCallback, useMemo, forwardRef, useImperativeHandle } from 'react';
import { View, Dimensions, Text, Pressable, StyleSheet, LayoutChangeEvent } from 'react-native';
import { FlashList as FlashListRaw, FlashListRef } from '@shopify/flash-list';
const FlashList = FlashListRaw as any;
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  interpolateColor,
  interpolate,
  Extrapolation
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
  isActive: boolean;
  isPassed: boolean;
  timestamp: number;
  index: number;
  onLyricPress: (timestamp: number) => void;
  onMeasured: (index: number, height: number) => void;
  textStyle?: any;
  songTitle?: string;
  highlightColor?: string;
}

const LyricLine = React.memo(({ text, isActive, isPassed, timestamp, index, onLyricPress, onMeasured, textStyle, songTitle, highlightColor = '#FFD700' }: LyricLineProps) => {
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

  // Shared value to drive animations (0 = inactive, 1 = active)
  const activeValue = useSharedValue(isActive ? 1 : 0);

  useEffect(() => {
    // Use timing instead of spring for smoother, lighter animations
    activeValue.value = withTiming(isActive ? 1 : 0, { duration: 200 });
  }, [isActive, activeValue]);

  const animatedStyle = useAnimatedStyle(() => {
    const scale = interpolate(activeValue.value, [0, 1], [1.0, 1.05], Extrapolation.CLAMP);
    const targetOpacity = isPassed ? 0.5 : 0.3;
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
  currentTime: number;
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

  const effectiveTime = currentTime + lyricsDelay;

  // Optimized active index: forward scan from current instead of full findIndex
  const activeIndexRef = useRef(-1);
  const activeIndex = useMemo(() => {
    const prev = activeIndexRef.current;
    // If we have a valid previous index, try to step forward
    if (prev >= 0 && prev < lyrics.length) {
      const nextLine = lyrics[prev + 1];
      if (nextLine && effectiveTime >= nextLine.timestamp) {
        activeIndexRef.current = prev + 1;
        return prev + 1;
      }
      if (effectiveTime >= lyrics[prev].timestamp) {
        return prev;
      }
    }
    // Fallback: binary search since timestamps are sorted
    let left = 0;
    let right = lyrics.length - 1;
    let result = -1;
    while (left <= right) {
      const mid = Math.floor((left + right) / 2);
      const nextLine = lyrics[mid + 1];
      if (effectiveTime >= lyrics[mid].timestamp && (!nextLine || effectiveTime < nextLine.timestamp)) {
        result = mid;
        break;
      }
      if (effectiveTime < lyrics[mid].timestamp) {
        right = mid - 1;
      } else {
        left = mid + 1;
      }
    }
    activeIndexRef.current = result;
    return result;
  }, [effectiveTime, lyrics]);

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

  // Stable ref for activeIndex so renderItem doesn't need it in deps
  const activeIndexLiveRef = useRef(activeIndex);
  activeIndexLiveRef.current = activeIndex;

  // Stable renderItem - does NOT depend on activeIndex
  const renderItem = useCallback(({ item, index }: { item: { timestamp: number; text: string }; index: number }) => {
    const currentActive = activeIndexLiveRef.current;
    return (
      <LyricLine
        text={item.text}
        isActive={index === currentActive}
        isPassed={index < currentActive}
        timestamp={item.timestamp}
        index={index}
        onLyricPress={onLyricPress}
        onMeasured={handleItemMeasured}
        textStyle={textStyle}
        songTitle={songTitle}
        highlightColor={highlightColor}
      />
    );
  }, [onLyricPress, handleItemMeasured, textStyle, songTitle, highlightColor]);

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
          extraData={activeIndex}
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
