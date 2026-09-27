/**
 * The live shader as a header band rather than a full-screen backdrop: the
 * music field plays across the top of a screen and melts into the page colour
 * below, so content lower down sits on calm black.
 *
 * `fade` (0–1, usually scroll-driven) dims the whole band — pass it so the
 * shader bows out as the list scrolls up under the header. Frames stop when
 * `active` is false (screen not focused), like DynamicAura itself.
 */
import React from 'react';
import { StyleSheet } from 'react-native';
import Animated, { SharedValue, useAnimatedStyle } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import DynamicAura from './DynamicAura';
import { AuraPalette } from './palette';

interface AuraBandProps {
  palette: AuraPalette;
  playing: boolean;
  active: boolean;
  /** Band height in points (include the status bar inset). */
  height: number;
  /** Page colour the band melts into. */
  base?: string;
  fade?: SharedValue<number>;
}

export const AuraBand: React.FC<AuraBandProps> = ({ palette, playing, active, height, base = '#000000', fade }) => {
  const fadeStyle = useAnimatedStyle(() => ({ opacity: fade ? fade.value : 1 }));
  return (
    <Animated.View pointerEvents="none" style={[styles.band, { height }, fadeStyle]}>
      <DynamicAura palette={palette} playing={playing} active={active} dim={0.05} />
      {/* Melt into the page: clear for the top half, then down to the base colour. */}
      <LinearGradient
        colors={[`${base}00`, `${base}00`, `${base}b3`, base]}
        locations={[0, 0.45, 0.8, 1]}
        style={StyleSheet.absoluteFill}
      />
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  band: { position: 'absolute', top: 0, left: 0, right: 0, overflow: 'hidden' },
});

export default AuraBand;
