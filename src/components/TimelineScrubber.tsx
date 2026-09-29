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
  /** 0 = idle (thin + dot), 1 = scrubbing (thick capsule, no dot). */
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
    // A full-width bar slid left inside the clipped track: progress moves by
    // transform, so playback never triggers a layout pass (a %-width did,
    // several times a second, which is what made old phones stutter).
    return {
      transform: [{ translateX: (p - 1) * trackWidthSV.value }],
      opacity: trackWidthSV.value > 0 ? 1 : 0, // unmeasured: don't flash a full bar
      // Leading edge of fill is always a soft cap (reads as curve while scrubbing).
      borderTopRightRadius: h / 2,
      borderBottomRightRadius: h / 2,
    };
  });

  /**
   * Thumb / track handoff (no gap where only the dot shows):
   *  expand 0→1: thumb out by 0.35, track already thickening the whole time
   *  collapse 1→0: track thins whole time, thumb returns only after 0.55
   */
  const thumbStyle = useAnimatedStyle(() => {
    'worklet';
    const p = Math.max(0, Math.min(1, displayProgress.value));
    const opacity = interpolate(
      scrubUI.value,
      [0, 0.3, 0.55, 1],
      [1, 0, 0, 0],
      Extrapolation.CLAMP,
    );
    const scale = interpolate(
      scrubUI.value,
      [0, 0.3, 1],
      [1, 0.55, 0.4],
      Extrapolation.CLAMP,
    );
    const x = p * trackWidthSV.value;
    return {
      opacity,
      transform: [{ translateX: x }, { scale }] as const,
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

            {/* Island only. The classic bar is YT-Music style: no dot at rest —
                the track itself thickens under the finger. A dot cannot be both
                concentric with a 3.5px track and flush with the bar's top edge,
                and it was already fading to 0 the moment a scrub began, so it
                was decoration that cost the track its flush position. */}
            {isIsland && (
              <Animated.View
                pointerEvents="none"
                style={[styles.thumbBase, styles.islandThumb, thumbStyle]}
              />
            )}
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
    width: '100%',
    height: '100%',
  },
  thumbBase: {
    position: 'absolute',
    left: 0,
    width: 11,
    height: 11,
    borderRadius: 6,
    marginLeft: -5.5,
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
  islandThumb: {
    top: '50%',
    marginTop: -5.5,
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
    elevation: 2,
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
