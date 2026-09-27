/**
 * Allegra's spatial grammar for React Native.
 *
 *   Things that arrive RISE OUT of the light (riseIn: opacity 0 → 1,
 *   y 18 → 0, scale 0.97 → 1, 400ms decelerate), staggered 40ms apart.
 *   Every tappable thing answers the finger with a tactile spring.
 *
 * Transform and opacity only. Reduce Motion collapses to a plain fade.
 */
import React from 'react';
import { Pressable, PressableProps, StyleProp, ViewStyle } from 'react-native';
import Animated, {
  EntryAnimationsValues,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Motion } from '../../constants/allegraTheme';

const STAGGER_MS = 40;

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
  const delay = Math.min(index, 10) * STAGGER_MS;
  return (
    <Animated.View entering={reduce ? fadeIn(delay) : riseIn(delay)} style={style}>
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
