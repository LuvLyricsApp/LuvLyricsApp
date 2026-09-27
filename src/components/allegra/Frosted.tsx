/**
 * Frosted glass that actually frosts, on both platforms.
 *
 * expo-blur does not blur on Android unless `experimentalBlurMethod` is set —
 * without it a BlurView is a flat translucent tint, which is why sheets looked
 * like grey panels there. This turns the real blur on, then builds the material
 * the way iOS does: a thin tint (so the blur shows through), an optional wash of
 * the playing cover's colours, a specular sheen across the top, and an edge that
 * is lit from above (brighter hairline at the top than at the bottom).
 *
 * Use it as the background of a floating surface; it fills its parent.
 */
import React from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { AuraPalette, hexToRgb } from './palette';
import { isLowEndDevice } from '../../utils/performanceTier';

const rgba = (hex: string, alpha: number): string => {
  const [r, g, b] = hexToRgb(hex).map(c => Math.round(c * 255));
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

interface FrostedProps {
  /** Corner radius of the surface, so the sheen and edge follow it. */
  radius: number;
  /** Blur strength; ~60 for sheets and menus, ~25 for full-screen backdrops. */
  intensity?: number;
  /** Tints the glass with the playing cover — the material feels alive. */
  palette?: AuraPalette;
  /** Base darkness under the colour (0–1). Lower shows more of the blur. */
  tint?: number;
  /** Draw the lit edge. Off for backdrops. */
  edge?: boolean;
}

// A live Android blur re-renders whatever moves underneath it every frame. On
// low-end phones the glass is a deeper tint instead — same material, no blur.
const LIVE_BLUR = !isLowEndDevice();

export const Frosted: React.FC<FrostedProps> = ({ radius, intensity = 60, palette, tint = 0.42, edge = true }) => (
  <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: radius, overflow: 'hidden' }]}>
    {LIVE_BLUR ? (
      <BlurView
        intensity={intensity}
        tint="dark"
        experimentalBlurMethod={Platform.OS === 'android' ? 'dimezisBlurView' : undefined}
        style={StyleSheet.absoluteFill}
      />
    ) : null}
    <View style={[StyleSheet.absoluteFill, { backgroundColor: `rgba(14, 16, 20, ${LIVE_BLUR ? tint : Math.min(0.9, tint + 0.4)})` }]} />
    {palette ? (
      <LinearGradient
        colors={[rgba(palette.primary, 0.2), rgba(palette.secondary, 0.08), rgba(palette.tertiary, 0.14)]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
    ) : null}
    {/* Specular sheen: light falling on the top of the pane. */}
    <LinearGradient
      colors={['rgba(255, 255, 255, 0.11)', 'rgba(255, 255, 255, 0.02)', 'rgba(255, 255, 255, 0)']}
      locations={[0, 0.35, 0.7]}
      style={StyleSheet.absoluteFill}
    />
    {edge ? (
      <View style={[StyleSheet.absoluteFill, styles.edge, { borderRadius: radius }]}>
        <View style={[styles.topLight, { height: radius, borderTopLeftRadius: radius, borderTopRightRadius: radius }]} />
      </View>
    ) : null}
  </View>
);

const styles = StyleSheet.create({
  edge: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  // Brighter top rim — the edge catching the light. Exactly as tall as the
  // corner radius, so the bright line runs across the top and around both
  // corners, then hands over to the dimmer side edge.
  topLight: {
    position: 'absolute',
    top: -StyleSheet.hairlineWidth,
    left: -StyleSheet.hairlineWidth,
    right: -StyleSheet.hairlineWidth,
    borderTopWidth: 1,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.24)',
  },
});

export default Frosted;
