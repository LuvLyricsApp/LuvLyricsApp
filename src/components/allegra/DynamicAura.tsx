/**
 * Allegra's shell-level ambient layer, for React Native.
 *
 *   base    — near-black with two radial glows of the cover's colours
 *   field   — MusicFlowField (reeded-glass light columns), 0.88 opacity; 0.5 paused
 *             (web uses 0.7 with a screen-blended flute layer; RN has no blend
 *             modes, so the field carries a little more of the light itself)
 *   flutes  — faint vertical colour bands
 *   vignette + scrim — keep text readable over whatever the field is doing
 *
 * Fixed behind the content, pointer-transparent, never owns layout.
 */
import React, { useEffect, useState } from 'react';
import { Dimensions, LayoutChangeEvent, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import MusicFlowField, { AuraMood } from './MusicFlowField';
import { AuraPalette } from './palette';
import { Motion } from '../../constants/allegraTheme';
import { useSettingsStore } from '../../store/settingsStore';
import { usePlayerStore } from '../../store/playerStore';
import GlassRoom from './GlassRoom';
import GlowRoom from './GlowRoom';

/** Paused, the field rests but still carries the cover's colour. */
const PAUSED_FIELD = 0.5;

interface DynamicAuraProps {
  palette: AuraPalette;
  /** Music playing: the field breathes at full energy. */
  playing?: boolean;
  /** Screen not visible: stop rendering frames entirely. */
  active?: boolean;
  mood?: AuraMood;
  /** Extra darkening under dense content (0 = Allegra default). */
  dim?: number;
}

const withAlpha = (hex: string, alpha: number): string => {
  const a = Math.round(Math.max(0, Math.min(1, alpha)) * 255).toString(16).padStart(2, '0');
  return `${hex}${a}`;
};

/**
 * Settings → App background picks the room: the live shader, the lite frosted
 * glass (no frame loop at all), or the glow (the mini player's animated glow
 * across the top of the screen, black below).
 */
export const DynamicAura: React.FC<DynamicAuraProps> = props => {
  const background = useSettingsStore(s => s.appBackground);
  const hasSong = usePlayerStore(s => !!s.currentSongId);
  const cover = usePlayerStore(s => s.currentSong?.coverImageUri);
  if (background === 'glass') return <GlassRoom palette={hasSong ? props.palette : null} dim={props.dim} />;
  if (background === 'glow') return <GlowRoom coverUri={cover} active={props.active} dim={props.dim} />;
  return <ShaderRoom {...props} />;
};

const ShaderRoom: React.FC<DynamicAuraProps> = ({ palette, playing = false, active = true, mood = 'energy', dim = 0 }) => {
  // Sized to the space it actually fills, not the window: on edge-to-edge
  // Android the window height leaves out the navigation bar, which left an
  // unpainted strip at the bottom. Start from the full screen until measured.
  const [{ width, height }, setSize] = useState(() => Dimensions.get('screen'));
  const onLayout = (e: LayoutChangeEvent) => {
    const { width: w, height: h } = e.nativeEvent.layout;
    if (w > 0 && h > 0 && (Math.round(w) !== Math.round(width) || Math.round(h) !== Math.round(height))) {
      setSize({ width: w, height: h, scale: 1, fontScale: 1 });
    }
  };
  const fieldOpacity = useSharedValue(playing ? 0.88 : PAUSED_FIELD);

  useEffect(() => {
    fieldOpacity.value = withTiming(playing ? 0.88 : PAUSED_FIELD, { duration: Motion.duration.crossfade, easing: Motion.ease.standard });
  }, [playing, fieldOpacity]);

  const fieldStyle = useAnimatedStyle(() => ({ opacity: fieldOpacity.value }));

  return (
    <View style={[StyleSheet.absoluteFill, styles.base]} pointerEvents="none" onLayout={onLayout}>
      <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
        <Defs>
          <RadialGradient id="glowA" cx="72%" cy="18%" rx="72%" ry="58%">
            <Stop offset="0" stopColor={palette.primary} stopOpacity={0.18} />
            <Stop offset="0.72" stopColor={palette.primary} stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id="glowB" cx="18%" cy="76%" rx="58%" ry="48%">
            <Stop offset="0" stopColor={palette.secondary} stopOpacity={0.12} />
            <Stop offset="0.76" stopColor={palette.secondary} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect width={width} height={height} fill="url(#glowA)" />
        <Rect width={width} height={height} fill="url(#glowB)" />
      </Svg>

      <Animated.View style={[StyleSheet.absoluteFill, fieldStyle]}>
        {/* The visual budget lets the field rest while music is paused on low-end phones and in Battery Saver. */}
        <MusicFlowField palette={palette} energy={playing ? 0.72 : 0.12} mood={mood} paused={!active} width={width} height={height} />
      </Animated.View>

      <LinearGradient
        colors={[
          withAlpha(palette.primary, 0.1),
          'transparent',
          'transparent',
          withAlpha(palette.secondary, 0.1),
          withAlpha(palette.tertiary, 0.17),
          withAlpha(palette.primary, 0.1),
        ]}
        locations={[0, 0.16, 0.42, 0.78, 0.94, 1]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={[StyleSheet.absoluteFill, styles.flutes]}
      />

      <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
        <Defs>
          <RadialGradient id="vignette" cx="60%" cy="45%" rx="80%" ry="85%">
            <Stop offset="0.35" stopColor="#040405" stopOpacity={0} />
            <Stop offset="1" stopColor="#040405" stopOpacity={0.5} />
          </RadialGradient>
        </Defs>
        <Rect width={width} height={height} fill="url(#vignette)" />
      </Svg>

      <LinearGradient
        colors={[`rgba(5, 5, 6, ${0.12 + dim * 0.4})`, `rgba(5, 5, 6, ${0.38 + dim * 0.4})`]}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  base: { backgroundColor: '#0c1014' },
  flutes: { opacity: 0.4 },
});

export default React.memo(DynamicAura);
