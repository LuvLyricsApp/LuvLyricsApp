/**
 * The blur on the page beneath the player sheet while it moves.
 *
 * It has to live in the page's screen, not the player's: on Android expo-blur
 * captures only the nearest react-native-screens Screen, so a BlurView inside
 * the (transparent) player route blurred nothing and read as a flat tint.
 * Mounted in the tab navigator, it blurs the page and the tab bar; the player's
 * own route still draws the dim on top.
 *
 * A live Android blur re-renders every frame, so it only exists while the sheet
 * is between the pill and full screen, and low-end phones skip it.
 */
import React, { useState } from 'react';
import { Platform, StyleSheet } from 'react-native';
import Animated, { runOnJS, useAnimatedReaction, useAnimatedStyle } from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { playerSheetProgress } from '../navigation/sheetProgress';
import { isLowEndDevice } from '../utils/performanceTier';

const LIVE_BLUR = !isLowEndDevice();

export const PlayerSheetBackdrop: React.FC = () => {
  const [moving, setMoving] = useState(false);
  useAnimatedReaction(
    () => playerSheetProgress.value > 0.001 && playerSheetProgress.value < 0.999,
    (now, before) => {
      if (now !== before) runOnJS(setMoving)(now);
    },
  );
  // Opacity carries the change, so the blur is drawn once at one strength.
  const style = useAnimatedStyle(() => ({ opacity: playerSheetProgress.value }));

  if (!LIVE_BLUR || !moving) return null;
  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, style]}>
      <BlurView
        intensity={60}
        tint="dark"
        experimentalBlurMethod={Platform.OS === 'android' ? 'dimezisBlurView' : undefined}
        style={StyleSheet.absoluteFill}
      />
    </Animated.View>
  );
};

export default PlayerSheetBackdrop;
