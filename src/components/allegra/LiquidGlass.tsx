/**
 * Apple's Liquid Glass (iOS 26), as close as a live React Native surface can
 * get. Apple describes the material as layers that sit over a blurred
 * backdrop, each quiet on its own:
 *
 *   backdrop  the scene behind, blurred, under a thin neutral smoke — clear
 *             enough that colour from what is behind reads through
 *   sheen     a soft light across the top of the pane, fading by the middle
 *   lens      edge refraction: the pane bends light most near its rim, a thin
 *             bright band just inside the edge, strongest along the top
 *   rim       a crisp specular edge, brightest where it faces the light (top
 *             left) and again at the opposite corner, nearly gone between
 *   shadow    a soft, wide shadow under it (GlassShadow), so it floats
 *
 * No colour fringes or glowing outlines: Apple's glass is defined by light,
 * not by a border. It cannot bend the exact pixels behind it (that needs a
 * per-frame snapshot of the page), so the blur stands in for the refracted
 * backdrop and the optics are drawn. Drawn once at its size with Skia:
 * nothing here animates.
 *
 * Fills its parent, like Frosted. Low-end phones get a deeper smoke instead
 * of the live blur (Frosted's rule), keeping the drawn optics.
 */
import React, { useMemo, useState } from 'react';
import { LayoutChangeEvent, Platform, StyleSheet, View } from 'react-native';
import { BlurView } from 'expo-blur';
import {
  Blur,
  Canvas,
  Group,
  LinearGradient,
  RoundedRect,
  Skia,
  vec,
} from '@shopify/react-native-skia';
import { AuraPalette, hexToRgb } from './palette';
import { isLowEndDevice } from '../../utils/performanceTier';

const LIVE_BLUR = !isLowEndDevice();

const rgba = (hex: string, alpha: number): string => {
  const [r, g, b] = hexToRgb(hex).map(c => Math.round(c * 255));
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const useSize = () => {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (Math.round(width) !== Math.round(size.width) || Math.round(height) !== Math.round(size.height)) setSize({ width, height });
  };
  return { ...size, onLayout };
};

interface LiquidGlassProps {
  /** Corner radius of the pane; a pill passes half its height. */
  radius: number;
  /** The playing cover's colours: only the faintest trace reaches the glass. */
  palette?: AuraPalette;
  /** Blur behind the glass. */
  intensity?: number;
}

const LiquidGlass: React.FC<LiquidGlassProps> = ({ radius, palette, intensity = 46 }) => {
  const { width: w, height: h, onLayout } = useSize();

  const clip = useMemo(() => {
    const path = Skia.Path.Make();
    if (w > 0 && h > 0) path.addRRect({ rect: { x: 0, y: 0, width: w, height: h }, rx: radius, ry: radius });
    return path;
  }, [w, h, radius]);

  const lens = Math.max(2, h * 0.05);

  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: radius, overflow: 'hidden' }]} onLayout={onLayout}>
      {LIVE_BLUR ? (
        <BlurView
          intensity={intensity}
          // Neutral: the "dark" tint adds its own heavy overlay (on Android it all but hides what is behind); the smoke below does the darkening.
          tint="default"
          experimentalBlurMethod={Platform.OS === 'android' ? 'dimezisBlurView' : undefined}
          style={StyleSheet.absoluteFill}
        />
      ) : null}
      {/* A thin neutral smoke, so white text holds over anything. */}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: LIVE_BLUR ? 'rgba(28, 28, 30, 0.36)' : 'rgba(28, 28, 30, 0.86)' }]} />
      {palette ? <View style={[StyleSheet.absoluteFill, { backgroundColor: rgba(palette.primary, 0.06) }]} /> : null}

      {w > 0 && h > 0 ? (
        <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
          <Group clip={clip}>
            {/* Sheen: light across the top of the pane. */}
            <RoundedRect x={0} y={0} width={w} height={h} r={radius}>
              <LinearGradient start={vec(0, 0)} end={vec(0, h)} colors={['rgba(255,255,255,0.11)', 'rgba(255,255,255,0.025)', 'rgba(255,255,255,0)']} positions={[0, 0.5, 1]} />
            </RoundedRect>
            {/* Lens: a thin band of bent light just inside the edge, strongest on top. */}
            <RoundedRect x={0} y={0} width={w} height={h} r={radius} style="stroke" strokeWidth={lens * 2}>
              <LinearGradient start={vec(0, 0)} end={vec(0, h)} colors={['rgba(255,255,255,0.24)', 'rgba(255,255,255,0.05)', 'rgba(255,255,255,0.12)']} positions={[0, 0.55, 1]} />
              <Blur blur={lens * 0.6} />
            </RoundedRect>
          </Group>
          {/* Rim: the specular edge, lit top left and at the opposite corner. */}
          <RoundedRect x={0.5} y={0.5} width={w - 1} height={h - 1} r={radius - 0.5} style="stroke" strokeWidth={1}>
            <LinearGradient
              start={vec(0, 0)}
              end={vec(w, h)}
              colors={['rgba(255,255,255,0.6)', 'rgba(255,255,255,0.1)', 'rgba(255,255,255,0.04)', 'rgba(255,255,255,0.3)']}
              positions={[0, 0.3, 0.6, 1]}
            />
          </RoundedRect>
        </Canvas>
      ) : null}
    </View>
  );
};

/**
 * The soft shadow under a pane of glass. Place it as the pane's first child,
 * in a parent that does not clip: it draws past the pane's edges.
 */
export const GlassShadow: React.FC<{ radius: number }> = React.memo(({ radius }) => {
  const { width: w, height: h, onLayout } = useSize();
  const pad = 28;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} onLayout={onLayout}>
      {w > 0 && h > 0 ? (
        <Canvas style={{ position: 'absolute', left: -pad, top: -pad, width: w + pad * 2, height: h + pad * 2 }} pointerEvents="none">
          <RoundedRect x={pad + 4} y={pad + 8} width={w - 8} height={h - 4} r={radius} color="rgba(0,0,0,0.42)">
            <Blur blur={14} />
          </RoundedRect>
        </Canvas>
      ) : null}
    </View>
  );
});

export default React.memo(LiquidGlass);
