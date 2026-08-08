import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, StyleSheet, LayoutChangeEvent, ViewStyle, Text } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  runOnJS,
  withTiming,
  withSequence,
  useDerivedValue,
  useAnimatedReaction,
  SharedValue,
  Easing,
  interpolate,
  Extrapolation,
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

/** One shared morph clock for track + thumb — no desynced withTimings. */
const MORPH_IN_MS = 150;
const MORPH_OUT_MS = 170;
const MORPH_EASE = Easing.bezier(0.25, 0.1, 0.25, 1);

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
  const trackWidthSV = useSharedValue(0);
  const isScrubbing = useSharedValue(false);
  const isSettling = useSharedValue(false);
  /** 0 = idle thin line, 1 = a thicker touch target. */
  const scrubUI = useSharedValue(0);
  const settleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    if (typeof currentTime === 'number') currentTimeNumberSV.value = currentTime;
  }, [currentTime, currentTimeNumberSV]);

  useEffect(() => {
    if (typeof duration === 'number') durationNumberSV.value = duration;
  }, [duration, durationNumberSV]);

  const scrubProgress = useDerivedValue(() => {
    'worklet';
    if (durationSV.value <= 0) return 0;
    return currentTimeSV.value / durationSV.value;
  });

  const dragProgress = useSharedValue(0);

  const displayProgress = useDerivedValue(() => {
    'worklet';
    return isScrubbing.value || isSettling.value
      ? dragProgress.value
      : scrubProgress.value;
  });

  const [currentTimeLabel, setCurrentTimeLabel] = useState('0:00');
  const [durationLabel, setDurationLabel] = useState('0:00');

  const currentTimeLabelDV = useDerivedValue(() => {
    'worklet';
    const t = isScrubbing.value || isSettling.value
      ? displayProgress.value * durationSV.value
      : currentTimeSV.value;
    return formatTimeSV(t);
  });

  const durationLabelDV = useDerivedValue(() => {
    'worklet';
    return formatTimeSV(durationSV.value);
  });

  useAnimatedReaction(
    () => currentTimeLabelDV.value,
    (next, prev) => {
      if (next !== prev) runOnJS(setCurrentTimeLabel)(next);
    },
  );

  useAnimatedReaction(
    () => durationLabelDV.value,
    (next, prev) => {
      if (next !== prev) runOnJS(setDurationLabel)(next);
    },
  );

  const onLayout = useCallback(
    (e: LayoutChangeEvent) => {
      trackWidthSV.value = e.nativeEvent.layout.width;
    },
    [trackWidthSV],
  );

  // Spotify-style: preview on the bar while the finger is down; only jump
  // audio when the gesture commits (release / tap). Live-seeking mid-drag
  // makes the track chase the thumb and breaks the 2:00→scrub-to-1:00 model.
  const handleSeekCommit = useCallback(
    (progress: number) => {
      const dur = typeof duration === 'number' ? duration : duration.value;
      onSeek(progress * dur);
    },
    [duration, onSeek],
  );

  const handleScrubStart = useCallback(() => {
    onScrubStart?.();
  }, [onScrubStart]);

  const handleScrubEnd = useCallback(() => {
    onScrubEnd?.();
  }, [onScrubEnd]);

  const startSettleWindow = useCallback(() => {
    isSettling.value = true;
    if (settleTimeoutRef.current) clearTimeout(settleTimeoutRef.current);
    settleTimeoutRef.current = setTimeout(() => {
      isSettling.value = false;
    }, 200);
  }, [isSettling]);

  useEffect(
    () => () => {
      if (settleTimeoutRef.current) clearTimeout(settleTimeoutRef.current);
    },
    [],
  );

  const morphIn = () => {
    'worklet';
    scrubUI.value = withTiming(1, { duration: MORPH_IN_MS, easing: MORPH_EASE });
  };
  const morphOut = () => {
    'worklet';
    scrubUI.value = withTiming(0, { duration: MORPH_OUT_MS, easing: MORPH_EASE });
  };

  const panGesture = Gesture.Pan()
    .enabled(!disabled)
    .minDistance(0)
    .onStart(() => {
      'worklet';
      isScrubbing.value = true;
      dragProgress.value = scrubProgress.value;
      morphIn();
      runOnJS(handleScrubStart)();
    })
    .onUpdate((e) => {
      'worklet';
      // UI-only preview — do not touch the player until release.
      if (trackWidthSV.value > 0) {
        dragProgress.value = Math.max(0, Math.min(1, e.x / trackWidthSV.value));
      }
    })
    .onEnd(() => {
      'worklet';
      const finalProgress = dragProgress.value;
      isScrubbing.value = false;
      morphOut();
      // Commit seek only when the finger lifts.
      runOnJS(handleSeekCommit)(finalProgress);
      runOnJS(startSettleWindow)();
      runOnJS(handleScrubEnd)();
    })
    .onFinalize(() => {
      'worklet';
      // Cancelled mid-drag (interrupted): abandon scrub, leave audio where it was.
      if (isScrubbing.value) {
        isScrubbing.value = false;
        morphOut();
        runOnJS(handleScrubEnd)();
      }
    });

  const tapGesture = Gesture.Tap()
    .enabled(!disabled)
    .onEnd((e) => {
      'worklet';
      if (trackWidthSV.value <= 0) return;
      const newProgress = Math.max(0, Math.min(1, e.x / trackWidthSV.value));
      dragProgress.value = newProgress;
      // Tap = instant jump (no drag hold). One sequence — calling morphIn() then
      // morphOut() in the same frame just cancels the first, so nothing pulsed.
      scrubUI.value = withSequence(
        withTiming(1, { duration: MORPH_IN_MS, easing: MORPH_EASE }),
        withTiming(0, { duration: MORPH_OUT_MS, easing: MORPH_EASE }),
      );
      runOnJS(handleSeekCommit)(newProgress);
      runOnJS(startSettleWindow)();
    });

  const composedGesture = Gesture.Race(panGesture, tapGesture);

  // Track height + always-pill corners from one scrubUI clock.
  const trackStyle = useAnimatedStyle(() => {
    'worklet';
    const h = interpolate(scrubUI.value, [0, 1], [3.5, 14], Extrapolation.CLAMP);
    return {
      height: h,
      borderRadius: h / 2,
    };
  });

  const fillStyle = useAnimatedStyle(() => {
    'worklet';
    const p = Math.max(0, Math.min(1, displayProgress.value));
    const h = interpolate(scrubUI.value, [0, 1], [3.5, 14], Extrapolation.CLAMP);
    return {
      width: `${p * 100}%`,
      // Leading edge of fill is always a soft cap (reads as curve while scrubbing).
      borderTopRightRadius: h / 2,
      borderBottomRightRadius: h / 2,
    };
  });

  const glowStyle = useAnimatedStyle(() => {
    'worklet';
    return {
      opacity: interpolate(scrubUI.value, [0, 0.4, 1], [0, 0.35, 0.5], Extrapolation.CLAMP),
      transform: [
        {
          scaleY: interpolate(scrubUI.value, [0, 1], [0.6, 1], Extrapolation.CLAMP),
        },
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
        <View
          style={[styles.hitArea, isIsland && styles.islandHitArea]}
          onLayout={onLayout}
          // Classic uses a short layout height (top-of-bar pin); keep fat hitSlop.
          hitSlop={{ top: isIsland ? 16 : 14, bottom: isIsland ? 16 : 14, left: 4, right: 4 }}
        >
          <View style={styles.trackWrapper}>
            {!isIsland && (
              <Animated.View style={[styles.scrubGlow, glowStyle]} pointerEvents="none" />
            )}

            {/* Always-visible pill track — never drops to 0 height/opacity */}
            <Animated.View
              style={[
                styles.trackBase,
                isIsland ? styles.islandTrackBg : styles.classicTrackBg,
                trackStyle,
              ]}
            >
              <Animated.View
                style={[
                  styles.fillBase,
                  isIsland ? styles.islandFill : styles.classicFill,
                  fillStyle,
                ]}
              />
            </Animated.View>

            {/* No floating round thumb: the line itself is the seek affordance. */}
          </View>
        </View>
      </GestureDetector>

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
  // Full-bleed: the track runs screen edge to screen edge with no inset, and takes
  // its width from the measured layout (trackWidthSV via onLayout), so it adapts to
  // whatever the device reports rather than any hardcoded width. The pill's rounded
  // ends therefore run off the screen edges — that is intended, don't re-inset.
  // Zero vertical padding + flex-start so nothing biases the track below y=0;
  // `container` centers, which must not apply here.
  classicContainer: {
    paddingHorizontal: 0,
    paddingVertical: 0,
    justifyContent: 'flex-start',
  },
  islandContainer: {
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  hitArea: {
    height: 18,
    // Classic: the track is welded to y=0 of the hit box, which the MiniPlayer
    // wrapper aligns with the bar's top edge. Zero padding — any inset here reads
    // as the track sitting a pixel or two under the seam. The box stays 18 tall
    // (plus hitSlop) purely as touch target; the visible track is the top 3.5px.
    justifyContent: 'flex-start',
    paddingTop: 0,
  },
  islandHitArea: {
    height: 30,
    justifyContent: 'center',
    paddingTop: 0,
  },
  trackWrapper: {
    height: 14,
    justifyContent: 'flex-start',
  },
  scrubGlow: {
    position: 'absolute',
    left: -2,
    right: -2,
    top: 0,
    height: 16,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  trackBase: {
    width: '100%',
    overflow: 'hidden',
    // Relative in the top-aligned trackWrapper (not absolute center)
  },
  fillBase: {
    height: '100%',
  },
  // Unplayed remainder: low enough that the blurred cover art reads through it and
  // it feels part of the artwork, high enough to still register as a line. The
  // affordance is carried by the contrast against the solid white played portion,
  // not by this being bright in its own right.
  classicTrackBg: {
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  classicFill: {
    backgroundColor: '#FFFFFF',
  },
  islandTrackBg: {
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
  },
  islandFill: {
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
  },
  timeContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
    paddingHorizontal: 2,
  },
  timeText: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
    fontVariant: ['tabular-nums'],
    fontWeight: '500',
  },
});

export default TimelineScrubber;
