import React, { useState, useCallback, useEffect, useRef } from 'react';
import { View, StyleSheet, LayoutChangeEvent, Text, ViewStyle } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { 
  useSharedValue, 
  useAnimatedStyle, 
  runOnJS,
  withTiming,
  useDerivedValue,
  SharedValue
} from 'react-native-reanimated';

export interface TimelineScrubberProps {
  currentTime: number | SharedValue<number>;
  duration: number | SharedValue<number>;
  onSeek: (time: number) => void;
  onScrubStart?: () => void;
  onScrubEnd?: () => void;
  variant?: 'classic' | 'island';
  style?: ViewStyle;
  showTimeLabels?: boolean;
  disabled?: boolean;
}

const TimelineScrubber: React.FC<TimelineScrubberProps> = ({
  currentTime,
  duration,
  onSeek,
  onScrubStart,
  onScrubEnd,
  variant = 'classic',
  style,
  showTimeLabels = true,
  disabled = false,
}) => {
  const [trackWidth, setTrackWidth] = useState(0);
  const isScrubbing = useSharedValue(false);
  const isSettling = useSharedValue(false);
  const currentTimeNumberSV = useSharedValue(typeof currentTime === 'number' ? currentTime : 0);
  const durationNumberSV = useSharedValue(typeof duration === 'number' ? duration : 0);
  const settleTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Convert primitive props to stable shared values without calling hooks conditionally.
  const currentTimeSV = typeof currentTime === 'number' ? currentTimeNumberSV : currentTime;
  const durationSV = typeof duration === 'number' ? durationNumberSV : duration;

  // Sync when props change (if they are numbers)
  useEffect(() => {
    if (typeof currentTime === 'number') {
      (currentTimeSV as SharedValue<number>).value = currentTime;
    }
  }, [currentTime, currentTimeSV]);

  useEffect(() => {
    if (typeof duration === 'number') {
      (durationSV as SharedValue<number>).value = duration;
    }
  }, [duration, durationSV]);
  
  // UI thread progress calculation
  const scrubProgress = useDerivedValue(() => {
    'worklet';
    if (durationSV.value <= 0) return 0;
    return currentTimeSV.value / durationSV.value;
  }, [currentTimeSV, durationSV]);
  
  // DRAG progress for immediate visual feedback during scrubbing
  const dragProgress = useSharedValue(0);

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    setTrackWidth(e.nativeEvent.layout.width);
  }, []);

  const formatTime = (seconds: number): string => {
    'worklet';
    if (!seconds || isNaN(seconds) || seconds < 0) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const secsStr = secs < 10 ? `0${secs}` : `${secs}`;
    return `${mins}:${secsStr}`;
  };

  const handleSeekCommit = useCallback((progress: number) => {
    const finalTime = progress * (typeof duration === 'number' ? duration : duration.value);
    onSeek(finalTime);
  }, [duration, onSeek]);

  const handleScrubStart = useCallback(() => {
    if (onScrubStart) onScrubStart();
  }, [onScrubStart]);

  const handleScrubEnd = useCallback(() => {
    if (onScrubEnd) onScrubEnd();
  }, [onScrubEnd]);

  const startSettleWindow = useCallback(() => {
    isSettling.value = true;
    if (settleTimeoutRef.current) clearTimeout(settleTimeoutRef.current);
    settleTimeoutRef.current = setTimeout(() => {
      isSettling.value = false;
    }, 350);
  }, [isSettling]);

  useEffect(() => {
    return () => {
      if (settleTimeoutRef.current) clearTimeout(settleTimeoutRef.current);
    };
  }, []);

  const panGesture = Gesture.Pan()
    .enabled(!disabled)
    .onStart(() => {
      'worklet';
      isScrubbing.value = true;
      dragProgress.value = scrubProgress.value;
      runOnJS(handleScrubStart)();
    })
    .onUpdate((e) => {
      'worklet';
      if (trackWidth > 0) {
        const newProgress = Math.max(0, Math.min(1, e.x / trackWidth));
        dragProgress.value = newProgress;
      }
    })
    .onEnd(() => {
      'worklet';
      const finalProgress = dragProgress.value;
      runOnJS(handleSeekCommit)(finalProgress);
      runOnJS(startSettleWindow)();
      runOnJS(handleScrubEnd)();
      isScrubbing.value = false;
    });

  const tapGesture = Gesture.Tap()
    .enabled(!disabled)
    .onEnd((e) => {
      'worklet';
      if (trackWidth > 0) {
        const newProgress = Math.max(0, Math.min(1, e.x / trackWidth));
        dragProgress.value = newProgress;
        runOnJS(handleSeekCommit)(newProgress);
        runOnJS(startSettleWindow)();
      }
    });

  const composedGesture = Gesture.Race(panGesture, tapGesture);

  // Common animated styles
  const trackHeightStyle = useAnimatedStyle(() => {
    return {
      height: withTiming(isScrubbing.value ? 10 : 4, { duration: 200 }),
      borderRadius: withTiming(isScrubbing.value ? 5 : 2, { duration: 200 }),
    };
  });

  const fillStyle = useAnimatedStyle(() => {
    'worklet';
    const displayProgress = (isScrubbing.value || isSettling.value) ? dragProgress.value : scrubProgress.value;
    return {
      width: `${Math.max(0, Math.min(1, displayProgress)) * 100}%`,
    };
  });

  const thumbStyle = useAnimatedStyle(() => {
    'worklet';
    const displayProgress = (isScrubbing.value || isSettling.value) ? dragProgress.value : scrubProgress.value;
    return {
      left: `${Math.max(0, Math.min(1, displayProgress)) * 100}%`,
      opacity: withTiming(isScrubbing.value ? 0 : 1, { duration: 200 }),
      transform: [{ scale: withTiming(isScrubbing.value ? 0.5 : 1, { duration: 200 }) }]
    };
  });

  const isIsland = variant === 'island';
  
  return (
    <View style={[styles.container, isIsland ? styles.islandContainer : styles.classicContainer, style]}>
      <GestureDetector gesture={composedGesture}>
        {/* Hit Area - Larger than visible track */}
        <View 
          style={styles.hitArea} 
          onLayout={onLayout}
          hitSlop={{ top: 20, bottom: 20, left: 10, right: 10 }}
        >
          {/* Track Wrapper for vertical centering */}
          <View style={styles.trackWrapper}>
            {/* Background Track */}
            <Animated.View style={[
              styles.trackBase, 
              isIsland ? styles.islandTrackBg : styles.classicTrackBg,
              trackHeightStyle
            ]}>
               {/* Filled Part */}
               <Animated.View style={[
                 styles.fillBase, 
                 isIsland ? styles.islandFill : styles.classicFill,
                 fillStyle
               ]} />
            </Animated.View>

            {/* Thumb - Absolute positioned over the track */}
            <Animated.View style={[
              styles.thumbBase,
              isIsland ? styles.islandThumb : styles.classicThumb,
              thumbStyle
            ]} />
          </View>
        </View>
      </GestureDetector>

      {/* Time Labels - Classic only, below the track */}
      {!isIsland && showTimeLabels && (
        <View style={styles.timeContainer}>
          <Text style={styles.timeText}>{formatTime(typeof currentTime === 'number' ? currentTime : currentTime.value)}</Text>
          <Text style={styles.timeText}>{formatTime(typeof duration === 'number' ? duration : duration.value)}</Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    justifyContent: 'center',
  },
  classicContainer: {
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  islandContainer: {
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  hitArea: {
    height: 30, // Taller hit area
    justifyContent: 'center',
  },
  trackWrapper: {
    height: 10, // Max height of expanded track
    justifyContent: 'center', // Vertically center content
  },
  trackBase: {
    width: '100%',
    overflow: 'hidden',
    position: 'absolute', // Center in wrapper
    alignSelf: 'center',
  },
  fillBase: {
    height: '100%',
    width: '100%',
  },
  thumbBase: {
    position: 'absolute',
    width: 12, // Reduced from 12? No 12 is fine. 
    height: 12, 
    borderRadius: 6,
    top: '50%', // Center vertically relative to wrapper
    marginTop: -6, // Half height
    marginLeft: -6, // Half width
  },
  // Classic Visuals
  classicTrackBg: {
    backgroundColor: '#2A2A2A', // Solid background to prevent text bleed-through
  },
  classicFill: {
    backgroundColor: '#fff',
  },
  classicThumb: {
    backgroundColor: '#fff',
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
    elevation: 3,
  },
  // Island Visuals (Darker/Glass)
  islandTrackBg: {
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
  },
  islandFill: {
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
  },
  islandThumb: {
    backgroundColor: '#fff',
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
    elevation: 2,
  },
  // Text
  timeContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4, 
  },
  timeText: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
    fontVariant: ['tabular-nums'],
    fontWeight: '500',
  },
});

export default React.memo(TimelineScrubber);
