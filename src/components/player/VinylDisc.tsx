/**
 * The record on the platter: what the cover becomes on a double tap.
 *
 * It is built the way a real record looks under a lamp, in layers that turn
 * and layers that do not:
 *
 *   turns   — the black body with its fine grooves and glossy track gaps, and
 *             the cover as the paper label
 *   stays   — the light: two opposite lobes of reflection (tinted with the
 *             cover's own colours, like a record catching a coloured lamp), a
 *             lit rim, the curve of the disc, the label's bevel, the spindle.
 *             Because the light holds still while the grooves turn under it,
 *             the disc reads as a solid, curved thing rather than a picture.
 *
 * A tonearm swings onto the outer groove when the music plays and lifts off
 * when it pauses; the platter spins up behind it and coasts to a stop.
 *
 * The turning is one native rotation of a view that is drawn once — no
 * per-frame redraw — driven by a UI-thread frame loop that only runs while the
 * disc is moving. Reduce Motion keeps it still. No shadow or elevation styles:
 * depth comes from the light.
 */
import React, { useCallback, useEffect, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient as ExpoGradient } from 'expo-linear-gradient';
import {
  Blur,
  Canvas,
  Circle,
  Group,
  LinearGradient,
  Path,
  RadialGradient,
  Skia,
  SweepGradient,
  vec,
} from '@shopify/react-native-skia';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useFrameCallback,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Artwork from '../allegra/Artwork';
import { AuraPalette } from '../allegra/palette';
import { ARM_PLAY, ARM_REST, LABEL, VINYL_SPIN_DEG_PER_S, lobeStops, unit } from './vinylMath';

/** The grooves as two paths, so their brightness can alternate; track gaps are left bare. */
const buildGrooves = (size: number) => {
  const c = size / 2;
  const inner = c * LABEL * 1.06;
  const outer = c * 0.972;
  const gaps = [0.6, 0.76, 0.88].map(f => f * c);
  const bright = Skia.Path.Make();
  const dim = Skia.Path.Make();
  const gapBands = Skia.Path.Make();
  const step = Math.max(1.3, size / 190);
  let i = 0;
  for (let r = inner; r <= outer; r += step, i++) {
    if (gaps.some(g => Math.abs(r - g) < step * 1.6)) continue;
    (unit(i) > 0.55 ? bright : dim).addCircle(c, c, r);
  }
  for (const g of gaps) gapBands.addCircle(c, c, g);
  return { bright, dim, gapBands };
};

/** The ring between the label and the rim: where the lobes of light land. */
const buildAnnulus = (size: number) => {
  const c = size / 2;
  const path = Skia.Path.Make();
  path.addCircle(c, c, c * 0.985);
  path.addCircle(c, c, c * LABEL);
  return path;
};


interface DiscProps {
  size: number;
  uri?: string | null;
  title: string;
  artist?: string;
  palette: AuraPalette;
}

/** The record itself, drawn once. `turning` is what the parent rotates. */
const Record: React.FC<DiscProps & { turning: 'body' | 'light' }> = React.memo(({ size, uri, title, artist, palette, turning }) => {
  const c = size / 2;
  const labelD = Math.round(size * LABEL);
  const grooves = useMemo(() => buildGrooves(size), [size]);
  const annulus = useMemo(() => buildAnnulus(size), [size]);
  const stops = useMemo(() => lobeStops(palette), [palette]);

  if (turning === 'body') {
    return (
      <View style={StyleSheet.absoluteFill}>
        <Canvas style={StyleSheet.absoluteFill}>
          <Circle cx={c} cy={c} r={c}>
            <RadialGradient c={vec(c, c)} r={c} colors={['#1c1c22', '#0d0d10', '#060607']} positions={[0.32, 0.78, 1]} />
          </Circle>
          <Path path={grooves.dim} style="stroke" strokeWidth={0.6} color="rgba(255,255,255,0.045)" />
          <Path path={grooves.bright} style="stroke" strokeWidth={0.7} color="rgba(255,255,255,0.095)" />
          {/* The glossy bands between tracks: smooth, so they catch the light differently. */}
          <Path path={grooves.gapBands} style="stroke" strokeWidth={Math.max(2, size * 0.012)} color="rgba(0,0,0,0.6)" />
          <Circle cx={c} cy={c} r={c * 0.988} style="stroke" strokeWidth={c * 0.02} color="rgba(255,255,255,0.05)" />
          <Circle cx={c} cy={c} r={c * LABEL + 1} color="#0e0e11" />
        </Canvas>
        <Artwork
          uri={uri}
          title={title}
          artist={artist}
          size={labelD}
          priority="high"
          continuous
          style={{ position: 'absolute', left: c - labelD / 2, top: c - labelD / 2, width: labelD, height: labelD, borderRadius: labelD / 2, overflow: 'hidden' }}
        />
      </View>
    );
  }

  // The light: it does not turn with the grooves.
  return (
    <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
      <Path path={annulus} fillType="evenOdd" blendMode="screen">
        <SweepGradient c={vec(c, c)} colors={stops.map(s => s.color)} positions={stops.map(s => s.at)} />
      </Path>
      {/* The curve of the disc: light from the top left, falling off to the bottom right. */}
      <Circle cx={c} cy={c} r={c}>
        <LinearGradient start={vec(0, 0)} end={vec(size, size)} colors={['rgba(255,255,255,0.11)', 'rgba(255,255,255,0)', 'rgba(0,0,0,0.2)']} positions={[0, 0.5, 1]} />
      </Circle>
      {/* A lit rim: bright where the light meets it, dim where it turns away. */}
      <Circle cx={c} cy={c} r={c - 0.7} style="stroke" strokeWidth={1.4}>
        <LinearGradient start={vec(0, 0)} end={vec(size, size)} colors={['rgba(255,255,255,0.5)', 'rgba(255,255,255,0.06)', 'rgba(255,255,255,0.2)']} positions={[0, 0.55, 1]} />
      </Circle>
      {/* The label's bevel. */}
      <Circle cx={c} cy={c} r={c * LABEL + 0.6} style="stroke" strokeWidth={1.6} color="rgba(0,0,0,0.55)" />
      <Circle cx={c} cy={c} r={c * LABEL + 2} style="stroke" strokeWidth={0.7} color="rgba(255,255,255,0.14)" />
      {/* The spindle. */}
      <Circle cx={c} cy={c} r={size * 0.021} color="#040405" />
      <Circle cx={c} cy={c} r={size * 0.021} style="stroke" strokeWidth={1} color="rgba(255,255,255,0.42)" />
    </Canvas>
  );
});

/** A soft pool of darkness under the record, so it sits on the room instead of floating. */
const Contact: React.FC<{ size: number }> = React.memo(({ size }) => {
  const pad = Math.round(size * 0.08);
  const full = size + pad * 2;
  return (
    <Canvas style={{ position: 'absolute', left: -pad, top: -pad, width: full, height: full }} pointerEvents="none">
      <Group>
        <Circle cx={full / 2} cy={full / 2 + size * 0.018} r={size / 2 - 1} color="rgba(0,0,0,0.42)">
          <Blur blur={pad * 0.55} />
        </Circle>
      </Group>
    </Canvas>
  );
});

const Tonearm: React.FC<{ size: number; playing: boolean }> = React.memo(({ size, playing }) => {
  const reduce = useReducedMotion();
  const angle = useSharedValue(ARM_REST);
  useEffect(() => {
    const target = playing ? ARM_PLAY : ARM_REST;
    angle.value = reduce ? withTiming(target, { duration: 120 }) : withSpring(target, { stiffness: 90, damping: 15, mass: 1 });
  }, [playing, reduce, angle]);

  const length = Math.round(size * 0.78);
  const tail = Math.round(size * 0.1);
  const pivotSize = Math.round(size * 0.125);
  const armStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${angle.value}deg` }] }));

  // The pivot sits just off the top right of the record.
  const px = size * 1.05;
  const py = size * 0.02;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Animated.View
        style={[
          {
            position: 'absolute',
            left: px - 4,
            top: py - tail,
            width: 8,
            height: length + tail,
            transformOrigin: `4px ${tail}px`,
          },
          armStyle,
        ]}
      >
        {/* Counterweight behind the pivot. */}
        <View style={[styles.counterweight, { height: tail + 4, width: 16, left: -4, borderRadius: 4 }]} />
        {/* The arm. */}
        <ExpoGradient
          colors={['#f1f1f4', '#a5a7ae', '#e6e7eb']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[styles.arm, { top: tail, height: length, borderRadius: 4 }]}
        />
        {/* The headshell and stylus. */}
        <View style={[styles.headshell, { top: tail + length - 8 }]}>
          <View style={styles.stylus} />
        </View>
      </Animated.View>
      {/* The pivot cap. */}
      <View style={[styles.pivot, { left: px - pivotSize / 2, top: py - pivotSize / 2, width: pivotSize, height: pivotSize, borderRadius: pivotSize / 2 }]}>
        <ExpoGradient colors={['#d9dade', '#6f7178']} start={{ x: 0.2, y: 0 }} end={{ x: 0.8, y: 1 }} style={StyleSheet.absoluteFill} />
        <View style={[styles.pivotCore, { width: pivotSize * 0.42, height: pivotSize * 0.42, borderRadius: pivotSize * 0.21 }]} />
      </View>
    </View>
  );
});

interface VinylDiscProps extends DiscProps {
  playing: boolean;
  /** Screen in front and the app awake; false lets the platter rest. */
  active?: boolean;
  /** Draw the tonearm (it needs a little room to the right of the record). */
  tonearm?: boolean;
}

export const VinylDisc: React.FC<VinylDiscProps> = ({ size, uri, title, artist, palette, playing, active = true, tonearm = true }) => {
  const reduce = useReducedMotion();
  const spinning = playing && active && !reduce;
  const angle = useSharedValue(0);
  const speed = useSharedValue(0);

  const loop = useFrameCallback(frame => {
    'worklet';
    // Clamped, so a stalled frame never makes the disc lurch.
    const dt = Math.min(frame.timeSincePreviousFrame ?? 16, 50) / 1000;
    angle.value = (angle.value + speed.value * dt) % 360;
  }, false);

  const rest = useCallback(() => loop.setActive(false), [loop]);
  useEffect(() => {
    if (spinning) {
      loop.setActive(true);
      // The arm lands first, then the platter comes up to speed.
      speed.value = withDelay(220, withTiming(VINYL_SPIN_DEG_PER_S, { duration: 1100, easing: Easing.out(Easing.quad) }));
    } else {
      speed.value = withTiming(0, { duration: 900, easing: Easing.out(Easing.cubic) }, done => {
        if (done) runOnJS(rest)();
      });
    }
  }, [spinning, loop, speed, rest]);

  const turn = useAnimatedStyle(() => ({ transform: [{ rotate: `${angle.value}deg` }] }));

  return (
    <View style={{ width: size, height: size }} accessibilityRole="image" accessibilityLabel={`Record: ${title}`}>
      <Contact size={size} />
      <Animated.View style={[StyleSheet.absoluteFill, turn]}>
        <Record size={size} uri={uri} title={title} artist={artist} palette={palette} turning="body" />
      </Animated.View>
      <Record size={size} uri={uri} title={title} artist={artist} palette={palette} turning="light" />
      {tonearm ? <Tonearm size={size} playing={playing && active} /> : null}
    </View>
  );
};

const styles = StyleSheet.create({
  counterweight: { position: 'absolute', top: 0, backgroundColor: '#3a3b41', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.3)' },
  arm: { position: 'absolute', left: 1, width: 6 },
  headshell: {
    position: 'absolute',
    left: -4,
    width: 16,
    height: 22,
    borderRadius: 4,
    backgroundColor: '#1a1b1f',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.38)',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  stylus: { width: 2, height: 5, backgroundColor: '#d9dade' },
  pivot: { position: 'absolute', overflow: 'hidden', alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.4)' },
  pivotCore: { backgroundColor: '#25262b' },
});

export default React.memo(VinylDisc);
