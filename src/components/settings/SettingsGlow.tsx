/**
 * Settings' own room: near black, with one soft glow of the playing cover's
 * colour rising behind the title and a quieter one of its second colour off
 * the top right, both gone by the middle of the page so the panels sit on
 * true black. A faint lit edge along the top, like light on the rim of a
 * dark glass. No song: a neutral grey glow.
 *
 * Nothing runs per frame (the page is long and read, not watched). A new
 * song's glow fades in over the last one.
 */
import React, { useEffect, useState } from 'react';
import { Dimensions, LayoutChangeEvent, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import Animated, { FadeIn } from 'react-native-reanimated';
import { AuraPalette, NEUTRAL_AURA } from '../allegra/palette';

const FADE_MS = 900;

const Glow: React.FC<{ palette: AuraPalette; width: number; height: number; id: string }> = ({ palette, width, height, id }) => (
  <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
    <Defs>
      <RadialGradient id={`${id}a`} cx="30%" cy="0%" rx="95%" ry="42%">
        <Stop offset="0" stopColor={palette.primary} stopOpacity={0.42} />
        <Stop offset="0.45" stopColor={palette.primary} stopOpacity={0.14} />
        <Stop offset="1" stopColor={palette.primary} stopOpacity={0} />
      </RadialGradient>
      <RadialGradient id={`${id}b`} cx="96%" cy="6%" rx="60%" ry="28%">
        <Stop offset="0" stopColor={palette.secondary} stopOpacity={0.22} />
        <Stop offset="1" stopColor={palette.secondary} stopOpacity={0} />
      </RadialGradient>
    </Defs>
    <Rect width={width} height={height} fill={`url(#${id}a)`} />
    <Rect width={width} height={height} fill={`url(#${id}b)`} />
  </Svg>
);

interface Layer {
  key: string;
  palette: AuraPalette;
}

const SettingsGlow: React.FC<{ palette: AuraPalette | null }> = ({ palette }) => {
  const [{ width, height }, setSize] = useState(() => Dimensions.get('screen'));
  const onLayout = (e: LayoutChangeEvent) => {
    const { width: w, height: h } = e.nativeEvent.layout;
    if (w > 0 && h > 0 && (Math.round(w) !== Math.round(width) || Math.round(h) !== Math.round(height))) {
      setSize({ width: w, height: h, scale: 1, fontScale: 1 });
    }
  };

  const shown = palette ?? NEUTRAL_AURA;
  const key = `${shown.primary}${shown.secondary}`;
  // The last glow stays underneath while the new one fades in on top.
  const [layers, setLayers] = useState<Layer[]>([{ key, palette: shown }]);
  useEffect(() => {
    setLayers(prev => (prev[prev.length - 1]?.key === key ? prev : [...prev.slice(-1), { key, palette: shown }]));
    // shown is what key is made from.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return (
    <View style={[StyleSheet.absoluteFill, styles.base]} pointerEvents="none" onLayout={onLayout}>
      {layers.map((layer, i) => (
        <Animated.View key={layer.key} style={StyleSheet.absoluteFill} entering={i > 0 ? FadeIn.duration(FADE_MS) : undefined}>
          <Glow palette={layer.palette} width={width} height={height} id={`sg${i}${layer.key.replace(/#/g, '')}`} />
        </Animated.View>
      ))}
      {/* Keeps the glow off the lower page: panels sit on true black. */}
      <LinearGradient colors={['rgba(4,4,5,0)', 'rgba(4,4,5,0.6)', '#040405']} locations={[0.18, 0.46, 0.7]} style={StyleSheet.absoluteFill} />
      <LinearGradient colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.18)', 'rgba(255,255,255,0)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.edge} />
    </View>
  );
};

const styles = StyleSheet.create({
  base: { backgroundColor: '#040405' },
  edge: { position: 'absolute', top: 0, left: 0, right: 0, height: StyleSheet.hairlineWidth },
});

export default React.memo(SettingsGlow);
