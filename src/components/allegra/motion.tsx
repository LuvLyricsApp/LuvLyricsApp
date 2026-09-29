/**
 * Allegra's spatial grammar for React Native.
 *
 *   Things that arrive RISE OUT of the light (riseIn: opacity 0 → 1,
 *   y 18 → 0, scale 0.97 → 1, 400ms decelerate), staggered 40ms apart.
 *   Every tappable thing answers the finger with a tactile spring.
 *
 * Transform and opacity only. Reduce Motion collapses to a plain fade.
 */
import React, { useEffect } from 'react';
import { Pressable, PressableProps, StyleProp, StyleSheet, TextProps, TextStyle, View, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  EntryAnimationsValues,
  ExitAnimationsValues,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Motion } from '../../constants/allegraTheme';
import { isLowEndDevice } from '../../utils/performanceTier';

const STAGGER_MS = 40;
const LOW_END = isLowEndDevice();

const riseIn = (delay: number) => (_values: EntryAnimationsValues) => {
  'worklet';
  const timing = { duration: Motion.duration.slow, easing: Motion.ease.decelerate };
  return {
    initialValues: { opacity: 0, transform: [{ translateY: 18 }, { scale: 0.97 }] },
    animations: {
      opacity: withDelay(delay, withTiming(1, timing)),
      transform: [{ translateY: withDelay(delay, withTiming(0, timing)) }, { scale: withDelay(delay, withTiming(1, timing)) }],
    },
  };
};

const fadeIn = (delay: number) => (_values: EntryAnimationsValues) => {
  'worklet';
  return {
    initialValues: { opacity: 0 },
    animations: { opacity: withDelay(delay, withTiming(1, { duration: Motion.duration.fast })) },
  };
};

/** Wrap a section so it rises out of the light when it first appears. */
export const RiseIn: React.FC<{ index?: number; style?: StyleProp<ViewStyle>; children: React.ReactNode }> = ({ index = 0, style, children }) => {
  const reduce = useReducedMotion();
  // Low-end phones fade, with a shorter cascade: one cheap animation per item.
  const delay = Math.min(index, LOW_END ? 4 : 10) * STAGGER_MS;
  return (
    <Animated.View entering={reduce || LOW_END ? fadeIn(delay) : riseIn(delay)} style={style}>
      {children}
    </Animated.View>
  );
};

interface TactileProps extends Omit<PressableProps, 'style'> {
  style?: StyleProp<ViewStyle>;
  /** Layout for the touch target itself (e.g. flex: 1 so a row fills its line). */
  wrapperStyle?: StyleProp<ViewStyle>;
  /** How far the control sinks under the finger. */
  pressScale?: number;
  children: React.ReactNode;
}

/** Pressable with Allegra's tactile spring (stiffness 400, damping 30). */
export const Tactile: React.FC<TactileProps> = ({ style, wrapperStyle, pressScale = Motion.pressScale, children, onPressIn, onPressOut, ...rest }) => {
  const scale = useSharedValue(1);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <Pressable
      {...rest}
      style={wrapperStyle}
      onPressIn={e => {
        scale.value = withSpring(pressScale, Motion.spring.tactile);
        onPressIn?.(e);
      }}
      onPressOut={e => {
        scale.value = withSpring(1, Motion.spring.tactile);
        onPressOut?.(e);
      }}
    >
      <Animated.View style={[style, animated]}>{children}</Animated.View>
    </Pressable>
  );
};

// ─── Swaps and morphs ──────────────────────────────────────────────────────

const swapEnter = (_v: EntryAnimationsValues) => {
  'worklet';
  const t = { duration: Motion.duration.base, easing: Motion.ease.decelerate };
  return {
    initialValues: { opacity: 0, transform: [{ translateY: 10 }] },
    animations: { opacity: withTiming(1, t), transform: [{ translateY: withTiming(0, t) }] },
  };
};

const swapExit = (_v: ExitAnimationsValues) => {
  'worklet';
  const t = { duration: Motion.duration.fast, easing: Motion.ease.accelerate };
  return {
    initialValues: { opacity: 1, transform: [{ translateY: 0 }] },
    animations: { opacity: withTiming(0, t), transform: [{ translateY: withTiming(-8, t) }] },
  };
};

// Song changes move sideways with the skip: next comes in from the right and
// the old line leaves to the left, previous the other way — the same
// direction the finger (or the button) went, so the change reads as travel.
const sideEnter = (direction: number) => (_v: EntryAnimationsValues) => {
  'worklet';
  const t = { duration: Motion.duration.slow, easing: Motion.ease.decelerate };
  return {
    initialValues: { opacity: 0, transform: [{ translateX: 28 * direction }] },
    animations: { opacity: withTiming(1, t), transform: [{ translateX: withTiming(0, t) }] },
  };
};

const sideExit = (direction: number) => (_v: ExitAnimationsValues) => {
  'worklet';
  const t = { duration: Motion.duration.base, easing: Motion.ease.accelerate };
  return {
    initialValues: { opacity: 1, transform: [{ translateX: 0 }] },
    animations: { opacity: withTiming(0, t), transform: [{ translateX: withTiming(-22 * direction, t) }] },
  };
};

/** The enter and exit a changing line uses; `direction` is a song change (1 forward, -1 back, 0 in place). */
export const useSwapAnimations = (direction = 0) => {
  const reduce = useReducedMotion();
  const sideways = direction === 1 || direction === -1;
  return {
    entering: reduce ? undefined : sideways ? sideEnter(direction) : swapEnter,
    exiting: reduce ? undefined : sideways ? sideExit(direction) : swapExit,
  };
};

/**
 * Text that changes in place (song title, artist): the old line lifts away,
 * the new one rises in — Allegra's swapVariants. Keyed by the text itself.
 */
export const SwapText: React.FC<TextProps & {
  children: string;
  /** A song change: 1 = forward, -1 = back (moves sideways), 0 or unset = rises in place. */
  direction?: number;
}> = ({ children, direction = 0, ...rest }) => {
  const { entering, exiting } = useSwapAnimations(direction);
  return (
    <Animated.Text key={children} entering={entering} exiting={exiting} {...rest}>
      {children}
    </Animated.Text>
  );
};

type IconName = React.ComponentProps<typeof Ionicons>['name'];

/**
 * Two-state glyph (play ↔ pause, heart ↔ heart-outline) that morphs instead of
 * snapping: the outgoing glyph shrinks and turns away as the incoming one
 * springs up. One shared value, so rapid toggles retarget mid-flight.
 */
export const MorphIcon: React.FC<{
  on: boolean;
  onIcon: IconName;
  offIcon: IconName;
  size: number;
  color: string;
  offStyle?: StyleProp<TextStyle>;
}> = ({ on, onIcon, offIcon, size, color, offStyle }) => {
  const reduce = useReducedMotion();
  const progress = useSharedValue(on ? 1 : 0);
  useEffect(() => {
    progress.value = reduce ? withTiming(on ? 1 : 0, { duration: Motion.duration.instant }) : withSpring(on ? 1 : 0, Motion.spring.tactile);
  }, [on, reduce, progress]);
  const onStyle = useAnimatedStyle((): ViewStyle => ({
    opacity: progress.value,
    transform: [{ rotate: `${(1 - progress.value) * -45}deg` }, { scale: 0.6 + 0.4 * progress.value }],
  }));
  const offAnimated = useAnimatedStyle((): ViewStyle => ({
    opacity: 1 - progress.value,
    transform: [{ rotate: `${progress.value * 45}deg` }, { scale: 1 - 0.4 * progress.value }],
  }));
  return (
    <View style={{ width: size, height: size }}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.center, offAnimated]}>
        <Ionicons name={offIcon} size={size} color={color} style={offStyle} />
      </Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, styles.center, onStyle]}>
        <Ionicons name={onIcon} size={size} color={color} />
      </Animated.View>
    </View>
  );
};

/** A glyph that leans in its direction of travel when tapped (skip ◀ ▶). */
export const NudgeIcon: React.FC<{ name: IconName; size: number; color: string; direction: 1 | -1; trigger: number }> = ({ name, size, color, direction, trigger }) => {
  const x = useSharedValue(0);
  useEffect(() => {
    if (trigger === 0) return;
    x.value = withSequence(
      withTiming(direction * 9, { duration: Motion.duration.instant, easing: Motion.ease.decelerate }),
      withSpring(0, Motion.spring.tactile),
    );
  }, [trigger, direction, x]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  return (
    <Animated.View style={style}>
      <Ionicons name={name} size={size} color={color} />
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
});
