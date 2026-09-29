/**
 * The lite app background: dark tinted glass instead of the live shader.
 * The playing cover's colours sit behind it as two soft glows and a wash from
 * the top, dimmed as if seen through smoked glass, with a faint sheen across
 * the upper left where light would catch it. No song: plain dark glass.
 *
 * Nothing runs per frame. A new song's colours settle in over the last ones
 * (a slow fade with a small spring as the glass "refocuses"), so moving
 * between songs is a cross-dissolve, never a cut.
 */
import React, { useEffect, useState } from 'react';
import { Dimensions, LayoutChangeEvent, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import Animated, { FadeIn, useReducedMotion, withSpring, withTiming } from 'react-native-reanimated';
import { AuraPalette, shadePalette } from './palette';

const SETTLE_MS = 900;

/** The new colour fades in while the glass settles from a hair too close. */
const settleIn = () => {
  'worklet';
  return {
    initialValues: { opacity: 0, transform: [{ scale: 1.04 }] },
    animations: {
      opacity: withTiming(1, { duration: SETTLE_MS }),
      transform: [{ scale: withSpring(1, { damping: 26, stiffness: 90, mass: 1 }) }],
    },
  };
};

interface Tint {
  key: string;
  palette: AuraPalette | null;
}

const withAlpha = (hex: string, alpha: number): string =>
  `${hex}${Math.round(Math.max(0, Math.min(1, alpha)) * 255).toString(16).padStart(2, '0')}`;

const Colour: React.FC<{ palette: AuraPalette; width: number; height: number; id: string }> = ({ palette, width, height, id }) => {
  const smoked = shadePalette(palette, 0.55);
  return (
    <>
      <LinearGradient
        colors={[withAlpha(smoked.primary, 0.55), withAlpha(smoked.primary, 0.12), 'transparent']}
        locations={[0, 0.45, 0.8]}
        style={StyleSheet.absoluteFill}
      />
      <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
        <Defs>
          <RadialGradient id={`${id}a`} cx="18%" cy="12%" rx="80%" ry="55%">
            <Stop offset="0" stopColor={palette.primary} stopOpacity={0.3} />
            <Stop offset="1" stopColor={palette.primary} stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id={`${id}b`} cx="88%" cy="72%" rx="70%" ry="50%">
            <Stop offset="0" stopColor={palette.secondary} stopOpacity={0.2} />
            <Stop offset="1" stopColor={palette.secondary} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect width={width} height={height} fill={`url(#${id}a)`} />
        <Rect width={width} height={height} fill={`url(#${id}b)`} />
      </Svg>
    </>
  );
};

export const GlassRoom: React.FC<{ palette: AuraPalette | null; dim?: number }> = ({ palette, dim = 0 }) => {
  const reduce = useReducedMotion();
  const [{ width, height }, setSize] = useState(() => Dimensions.get('screen'));
  const onLayout = (e: LayoutChangeEvent) => {
    const { width: w, height: h } = e.nativeEvent.layout;
    if (w > 0 && h > 0 && (Math.round(w) !== Math.round(width) || Math.round(h) !== Math.round(height))) {
      setSize({ width: w, height: h, scale: 1, fontScale: 1 });
    }
  };

  const key = palette ? `${palette.primary}${palette.secondary}` : 'none';
  const [tints, setTints] = useState<Tint[]>([{ key, palette }]);
  useEffect(() => {
    setTints(prev => (prev[prev.length - 1]?.key === key ? prev : [...prev.slice(-1), { key, palette }]));
    // palette is what key is made from.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const settle = reduce ? FadeIn.duration(SETTLE_MS) : settleIn;

  return (
    <View style={[StyleSheet.absoluteFill, styles.base]} pointerEvents="none" onLayout={onLayout}>
      {tints.map((tint, i) => (
        <Animated.View key={tint.key} style={StyleSheet.absoluteFill} entering={i > 0 ? settle : undefined}>
          {tint.palette ? <Colour palette={tint.palette} width={width} height={height} id={`g${i}${tint.key.replace(/#/g, '')}`} /> : null}
        </Animated.View>
      ))}
      {/* The glass: a sheen where light catches the top-left, a lit top edge, then the smoke. */}
      <LinearGradient
        colors={['rgba(255,255,255,0.07)', 'rgba(255,255,255,0.015)', 'transparent']}
        locations={[0, 0.3, 0.6]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.9, y: 0.7 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.edge} />
      <LinearGradient
        colors={[`rgba(8, 9, 12, ${0.18 + dim * 0.4})`, `rgba(8, 9, 12, ${0.46 + dim * 0.4})`]}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  base: { backgroundColor: '#0b0d11' },
  edge: { position: 'absolute', top: 0, left: 0, right: 0, height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(255,255,255,0.12)' },
});

export default React.memo(GlassRoom);
