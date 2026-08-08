import React, { useCallback } from 'react';
import { Pressable, StyleProp, ViewStyle } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withSequence,
} from 'react-native-reanimated';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type Props = {
  onPress?: () => void;
  disabled?: boolean;
  hitSlop?: number;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
  /** Slightly stronger bounce for the main play control. */
  strong?: boolean;
};

/**
 * Tiny press spring — scale down on press, soft bounce back on release.
 * Keeps transport controls feeling alive without heavy motion.
 */
export const BouncePressable: React.FC<Props> = ({
  onPress,
  disabled,
  hitSlop = 8,
  style,
  children,
  strong = false,
}) => {
  const scale = useSharedValue(1);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const pressIn = useCallback(() => {
    scale.value = withSpring(strong ? 0.88 : 0.9, {
      mass: 0.25,
      damping: 14,
      stiffness: 420,
    });
  }, [scale, strong]);

  const pressOut = useCallback(() => {
    scale.value = withSequence(
      withSpring(strong ? 1.06 : 1.05, { mass: 0.28, damping: 10, stiffness: 380 }),
      withSpring(1, { mass: 0.3, damping: 12, stiffness: 280 }),
    );
  }, [scale, strong]);

  return (
    <AnimatedPressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={hitSlop}
      onPressIn={pressIn}
      onPressOut={pressOut}
      style={[style, animStyle]}
    >
      {children}
    </AnimatedPressable>
  );
};
