import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, StyleSheet, LayoutChangeEvent, ViewStyle, Text } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  runOnJS,
  withTiming,
  useDerivedValue,
  useAnimatedReaction,
  SharedValue,
} from 'react-native-reanimated';
import { formatTimeSV } from '../playback/positionBus';

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
  // ---------------------------------------------------------------------------
  // trackWidthSV: store track width as a SharedValue so the gesture worklet can
  // read it without a JS-thread closure capture (closures in worklets capture
  // stale values from render). A SharedValue is always fresh on the UI thread.
  // ---------------------------------------------------------------------------
  const trackWidthSV = useSharedValue(0);
  const isScrubbing = useSharedValue(false);
  const isSettling = useSharedValue(false);
  const settleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ---------------------------------------------------------------------------
  // Normalise props: both raw numbers and SharedValues are accepted.
  // We create stable internal shared values for the number case and sync them
  // via useEffect — no conditional hook calls.
  // ---------------------------------------------------------------------------
  const currentTimeNumberSV = useSharedValue(
    typeof currentTime === 'number' ? currentTime : 0,
  );
  const durationNumberSV = useSharedValue(
    typeof duration === 'number' ? duration : 0,
  );

  const currentTimeSV: SharedValue<number> =
    typeof currentTime === 'number' ? currentTimeNumberSV : currentTime;
  const durationSV: SharedValue<number> =
    typeof duration === 'number' ? durationNumberSV : duration;

  useEffect(() => {
    if (typeof currentTime === 'number') {
      currentTimeNumberSV.value = currentTime;
    }
  }, [currentTime, currentTimeNumberSV]);

  useEffect(() => {
    if (typeof duration === 'number') {
      durationNumberSV.value = duration;
    }
  }, [duration, durationNumberSV]);

  // ---------------------------------------------------------------------------
  // Derived values — run entirely on the UI thread.
  // ---------------------------------------------------------------------------

  /** Playback progress in [0, 1]. */
  const scrubProgress = useDerivedValue(() => {
    'worklet';
    if (durationSV.value <= 0) return 0;
    return currentTimeSV.value / durationSV.value;
  });

  /** The progress value that drives visual fill/thumb position. */
  const dragProgress = useSharedValue(0);

  /** While scrubbing/settling, show drag position; otherwise playback position. */
  const displayProgress = useDerivedValue(() => {
    'worklet';
    return isScrubbing.value || isSettling.value
      ? dragProgress.value
      : scrubProgress.value;
  });

  // ---------------------------------------------------------------------------
  // Time label text — computed on UI thread, sent to JS only when the
  // formatted string changes (not on every sub-second tick). This limits
  // React re-renders to at most ~1/sec under normal playback.
  // ---------------------------------------------------------------------------
  const [currentTimeLabel, setCurrentTimeLabel] = useState('0:00');
  const [durationLabel, setDurationLabel] = useState('0:00');

  // Derived value: formatted current time string (computed in worklet)
  const currentTimeLabelDV = useDerivedValue(() => {
    'worklet';
    const t = isScrubbing.value
      ? displayProgress.value * durationSV.value
      : currentTimeSV.value;
    return formatTimeSV(t);
  });

  const durationLabelDV = useDerivedValue(() => {
    'worklet';
    return formatTimeSV(durationSV.value);
  });

  // Only push to JS state when the formatted string actually changes
  // (i.e. when the displayed second flips — at most once per second).
  useAnimatedReaction(
    () => currentTimeLabelDV.value,
    (next, prev) => {
      if (next !== prev) {
        runOnJS(setCurrentTimeLabel)(next);
      }
    },
  );

  useAnimatedReaction(
    () => durationLabelDV.value,
    (next, prev) => {
      if (next !== prev) {
        runOnJS(setDurationLabel)(next);
      }
    },
  );

  // ---------------------------------------------------------------------------
  // Layout callback — writes to shared value directly, no setState.
  // ---------------------------------------------------------------------------
  const onLayout = useCallback(
    (e: LayoutChangeEvent) => {
      trackWidthSV.value = e.nativeEvent.layout.width;
    },
    [trackWidthSV],
  );

  // ---------------------------------------------------------------------------
  // JS-thread callbacks (called via runOnJS from gesture handlers).
  // ---------------------------------------------------------------------------
  const handleSeekCommit = useCallback(
    (progress: number) => {
      const dur =
        typeof duration === 'number' ? duration : duration.value;
      onSeek(progress * dur);
    },
    [duration, onSeek],
  );

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

  // ---------------------------------------------------------------------------
  // Gesture handlers — all hot-path math runs as worklets on the UI thread.
  // runOnJS is only called at gesture end to commit the seek to the player.
  // ---------------------------------------------------------------------------
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
      if (trackWidthSV.value > 0) {
        dragProgress.value = Math.max(0, Math.min(1, e.x / trackWidthSV.value));
      }
    })
    .onEnd(() => {
      'worklet';
      const finalProgress = dragProgress.value;
      isScrubbing.value = false;
      runOnJS(handleSeekCommit)(finalProgress);
      runOnJS(startSettleWindow)();
      runOnJS(handleScrubEnd)();
    });

  const tapGesture = Gesture.Tap()
    .enabled(!disabled)
    .onEnd((e) => {
      'worklet';
      if (trackWidthSV.value > 0) {
        const newProgress = Math.max(0, Math.min(1, e.x / trackWidthSV.value));
        dragProgress.value = newProgress;
        runOnJS(handleSeekCommit)(newProgress);
        runOnJS(startSettleWindow)();
      }
    });

  const composedGesture = Gesture.Race(panGesture, tapGesture);

  // ---------------------------------------------------------------------------
  // Animated styles — UI thread only.
  // ---------------------------------------------------------------------------
  const trackHeightStyle = useAnimatedStyle(() => {
    'worklet';
    return {
      height: withTiming(isScrubbing.value ? 10 : 4, { duration: 200 }),
      borderRadius: withTiming(isScrubbing.value ? 5 : 2, { duration: 200 }),
    };
  });

  const fillStyle = useAnimatedStyle(() => {
    'worklet';
    return {
      width: `${Math.max(0, Math.min(1, displayProgress.value)) * 100}%`,
    };
  });

  const thumbStyle = useAnimatedStyle(() => {
    'worklet';
    return {
      left: `${Math.max(0, Math.min(1, displayProgress.value)) * 100}%`,
      opacity: withTiming(isScrubbing.value ? 0 : 1, { duration: 200 }),
      transform: [
        { scale: withTiming(isScrubbing.value ? 0.5 : 1, { duration: 200 }) },
      ],
    };
  });

  const isIsland = variant === 'island';

  return (
    <View
      style={[
        styles.container,
        isIsland ? styles.islandContainer : styles.classicContainer,
        style,
      ]}
    >
      <GestureDetector gesture={composedGesture}>
        {/* Hit Area — larger than the visible track */}
        <View
          style={styles.hitArea}
          onLayout={onLayout}
          hitSlop={{ top: 20, bottom: isIsland ? 20 : 6, left: 10, right: 10 }}
        >
          {/* Track Wrapper for vertical centering */}
          <View style={styles.trackWrapper}>
            {/* Background Track */}
            <Animated.View
              style={[
                styles.trackBase,
                isIsland ? styles.islandTrackBg : styles.classicTrackBg,
                trackHeightStyle,
              ]}
            >
              {/* Filled Part */}
              <Animated.View
                style={[
                  styles.fillBase,
                  isIsland ? styles.islandFill : styles.classicFill,
                  fillStyle,
                ]}
              />
            </Animated.View>

            {/* Thumb — absolute, sits over the track */}
            <Animated.View
              style={[
                styles.thumbBase,
                isIsland ? styles.islandThumb : styles.classicThumb,
                thumbStyle,
              ]}
            />
          </View>
        </View>
      </GestureDetector>

      {/* Time Labels — Classic only.
          Text updates via useAnimatedReaction: the worklet formats the string
          on the UI thread and only calls runOnJS when the second boundary
          flips — so at most ~1 re-render/sec instead of every tick. */}
      {!isIsland && showTimeLabels && (
        <View style={styles.timeContainer}>
          <Text style={styles.timeText}>{currentTimeLabel}</Text>
          <Text style={styles.timeText}>{durationLabel}</Text>
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
    height: 30,
    justifyContent: 'center',
  },
  trackWrapper: {
    height: 10,
    justifyContent: 'center',
  },
  trackBase: {
    width: '100%',
    overflow: 'hidden',
    position: 'absolute',
    alignSelf: 'center',
  },
  fillBase: {
    height: '100%',
    width: '100%',
  },
  thumbBase: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderRadius: 6,
    top: '50%',
    marginTop: -6,
    marginLeft: -6,
  },
  // Classic Visuals
  classicTrackBg: {
    backgroundColor: '#2A2A2A',
  },
  classicFill: {
    backgroundColor: '#fff',
  },
  classicThumb: {
    backgroundColor: '#fff',
    shadowColor: '#000',
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
    shadowColor: '#000',
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
