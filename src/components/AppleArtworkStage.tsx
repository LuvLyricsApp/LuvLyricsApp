/**
 * The Apple Music artwork stage: a large square cover that settles smaller
 * when paused and springs back to full size on play. Transform-only motion;
 * Reduce Motion swaps the spring for an instant change.
 */
import React, { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Glass, Motion, Radius, Signal } from '../constants/allegraTheme';

interface AppleArtworkStageProps {
  uri?: string;
  size: number;
  playing: boolean;
  onLongPress?: () => void;
}

const PAUSED_SCALE = 0.82;

export const AppleArtworkStage: React.FC<AppleArtworkStageProps> = ({ uri, size, playing, onLongPress }) => {
  const reduceMotion = useReducedMotion();
  const scale = useSharedValue(playing ? 1 : PAUSED_SCALE);

  useEffect(() => {
    const target = playing ? 1 : PAUSED_SCALE;
    scale.value = reduceMotion
      ? withTiming(target, { duration: Motion.duration.instant })
      : withSpring(target, Motion.spring.hero);
  }, [playing, reduceMotion, scale]);

  const scaleStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Pressable onLongPress={onLongPress} accessibilityRole="image" accessibilityLabel="Album artwork">
      <Animated.View style={[styles.frame, { width: size, height: size }, scaleStyle]}>
        {uri ? (
          <Image source={{ uri }} style={styles.image} contentFit="cover" transition={Motion.duration.base} />
        ) : (
          <View style={[styles.image, styles.placeholder]}>
            <Ionicons name="musical-note" size={size * 0.24} color={Signal.inkFaint} />
          </View>
        )}
      </Animated.View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  frame: {
    borderRadius: Radius.art,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Glass.hairline,
    backgroundColor: Signal.bgSubtle,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  placeholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default React.memo(AppleArtworkStage);
