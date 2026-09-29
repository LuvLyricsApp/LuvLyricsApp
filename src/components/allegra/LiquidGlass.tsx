/**
 * Apple's Liquid Glass, as close as a live React Native surface can get.
 *
 * What Apple's material is made of (from how it is described and rebuilt in
 * shader form): the backdrop blurred and lightly tinted, then an optical model
 * of a thick, rounded pane on top of it —
 *
 *   lens      edge refraction: the glass bends the scene most near its rim,
 *             which reads as a bright band curling in from the edge
 *   rim       a Fresnel edge: light where the pane meets the light, dim where
 *             it turns away, so the outline is brightest top-left and
 *             bottom-right and nearly gone on the other diagonal
 *   fringe    a whisper of chromatic dispersion along that edge
 *   echo      the rim reflected once more along the opposite inside edge
 *   specular  a soft hotspot and a thin streak of the light source itself
 *   tint      a thin adaptive wash of the playing cover's colour
 *
 * What it cannot do is capture and bend the exact pixels behind it (that needs
 * a per-frame snapshot of the page, far too costly under a control that is
 * always on screen), so the blur stands in for the refracted backdrop and the
 * rest is drawn. Drawn once at its size with Skia: nothing here animates.
 *
 * Fills its parent, like Frosted. Low-end phones get the deeper tint instead of
 * the live blur (Frosted's rule), keeping the drawn optics.
 */
import React, { useMemo, useState } from 'react';
import { LayoutChangeEvent, Platform, StyleSheet, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient as ExpoGradient } from 'expo-linear-gradient';
import {
  Blur,
  Canvas,
  Group,
  LinearGradient,
  RadialGradient,
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

interface LiquidGlassProps {
  /** Corner radius of the pane; a pill passes half its height. */
  radius: number;
  palette?: AuraPalette;
  /** Blur behind the glass. Light: the glass is clear, not frosted. */
  intensity?: number;
}

const LiquidGlass: React.FC<LiquidGlassProps> = ({ radius, palette, intensity = 34 }) => {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (Math.round(width) !== Math.round(size.width) || Math.round(height) !== Math.round(size.height)) setSize({ width, height });
  };
  const { width: w, height: h } = size;

  const clip = useMemo(() => {
    const path = Skia.Path.Make();
    if (w > 0 && h > 0) path.addRRect({ rect: { x: 0, y: 0, width: w, height: h }, rx: radius, ry: radius });
    return path;
  }, [w, h, radius]);

  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: radius, overflow: 'hidden' }]} onLayout={onLayout}>
      {LIVE_BLUR ? (
        <BlurView
          intensity={intensity}
          tint="dark"
          experimentalBlurMethod={Platform.OS === 'android' ? 'dimezisBlurView' : undefined}
          style={StyleSheet.absoluteFill}
        />
      ) : null}
      {/* Clear glass: a light smoke so white text holds, not the frosted panel's heavy tint. */}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: LIVE_BLUR ? 'rgba(18, 20, 24, 0.22)' : 'rgba(18, 20, 24, 0.78)' }]} />
      {palette ? (
        <ExpoGradient
          colors={[rgba(palette.primary, 0.16), rgba(palette.secondary, 0.05), rgba(palette.tertiary, 0.12)]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      ) : null}

      {w > 0 && h > 0 ? (
        <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
          {/* Lens: the scene bends most near the rim, so the edge glows inward. */}
          <Group clip={clip}>
            <RoundedRect x={0} y={0} width={w} height={h} r={radius} style="stroke" strokeWidth={Math.max(6, h * 0.22)}>
              <LinearGradient
                start={vec(0, 0)}
                end={vec(w, h)}
                colors={['rgba(255,255,255,0.34)', 'rgba(255,255,255,0.05)', 'rgba(255,255,255,0.22)']}
                positions={[0, 0.5, 1]}
              />
              <Blur blur={Math.max(3, h * 0.09)} />
            </RoundedRect>
            {/* Echo: the rim reflected once more on the opposite inside edge. */}
            <RoundedRect x={0} y={h * 0.5} width={w} height={h * 0.5} r={radius} color="rgba(255,255,255,0.045)">
              <LinearGradient start={vec(0, h * 0.5)} end={vec(0, h)} colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.10)']} />
            </RoundedRect>
            {/* Specular hotspot and the thin streak of the light itself. */}
            <RoundedRect x={0} y={0} width={w} height={h} r={radius}>
              <RadialGradient c={vec(w * 0.16, h * 0.16)} r={Math.max(w * 0.34, 40)} colors={['rgba(255,255,255,0.28)', 'rgba(255,255,255,0.06)', 'rgba(255,255,255,0)']} positions={[0, 0.45, 1]} />
            </RoundedRect>
            <RoundedRect x={radius * 0.7} y={1.4} width={Math.max(0, w - radius * 1.4)} height={1.6} r={0.8}>
              <LinearGradient start={vec(0, 0)} end={vec(w, 0)} colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.55)', 'rgba(255,255,255,0)']} positions={[0.05, 0.3, 0.75]} />
            </RoundedRect>
          </Group>

          {/* Dispersion: the faintest colour split along the edge. */}
          <RoundedRect x={0.3} y={0.3} width={w - 0.6} height={h - 0.6} r={radius} style="stroke" strokeWidth={1} color="rgba(120,200,255,0.20)" />
          <RoundedRect x={1.1} y={1.1} width={w - 2.2} height={h - 2.2} r={Math.max(0, radius - 1)} style="stroke" strokeWidth={1} color="rgba(255,140,220,0.13)" />
          {/* Rim: the Fresnel edge, lit at two opposite corners. */}
          <RoundedRect x={0.5} y={0.5} width={w - 1} height={h - 1} r={radius} style="stroke" strokeWidth={1.1}>
            <LinearGradient
              start={vec(0, 0)}
              end={vec(w, h)}
              colors={['rgba(255,255,255,0.75)', 'rgba(255,255,255,0.10)', 'rgba(255,255,255,0.42)']}
              positions={[0, 0.5, 1]}
            />
          </RoundedRect>
        </Canvas>
      ) : null}
    </View>
  );
};

export default React.memo(LiquidGlass);
