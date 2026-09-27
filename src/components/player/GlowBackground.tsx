/**
 * Echo Music's "Glow animated" background, ported line for line from
 * Player.kt / MiniPlayer.kt (PlayerBackgroundStyle.GLOW_ANIMATED):
 *
 *   - near-black base (#050505)
 *   - radial glows (six on the player, two on the mini player) whose colours
 *     walk through the cover's palette — rotatedColorAt(i) lerps between
 *     neighbouring palette entries as `progress` runs 0→1 over 20s, linear
 *   - each glow's centre and radius drift on a sine: oscillate(min, max, phase)
 *   - a new song's palette cross-fades in over 1200ms (Echo's AnimatedContent)
 *
 * Drawn with Skia; only the gradient uniforms change per frame. Old phones
 * step it at 30fps (performanceTier), and it stops when `active` is false.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { LayoutChangeEvent, StyleSheet, View } from 'react-native';
import { Canvas, Fill, RadialGradient, Rect, vec } from '@shopify/react-native-skia';
import { Easing, useDerivedValue, useFrameCallback, useSharedValue, withTiming } from 'react-native-reanimated';
import { isLowEndDevice } from '../../utils/performanceTier';

import { Blob, BASE, CYCLE_S, FADE_MS, MINI_BLOBS, oscillate, PLAYER_BLOBS, rgba, rotatedColorAt, toRgb } from './glowMath';

const FRAME_S = isLowEndDevice() ? 1 / 30 : 0;

const GlowBlob: React.FC<{
  blob: Blob;
  index: number;
  width: number;
  height: number;
  progress: { value: number };
  from: { value: number[][] };
  to: { value: number[][] };
  mix: { value: number };
}> = ({ blob, index, width, height, progress, from, to, mix }) => {
  const center = useDerivedValue(() => vec(width * oscillate(blob.ox, progress.value), height * oscillate(blob.oy, progress.value)));
  const radius = useDerivedValue(() => Math.max(1, width * (typeof blob.r === 'number' ? blob.r : oscillate(blob.r, progress.value))));
  const colors = useDerivedValue(() => {
    const p = progress.value;
    const next = rotatedColorAt(to.value, index, p);
    const prev = from.value.length > 0 ? rotatedColorAt(from.value, index, p) : next;
    const m = mix.value;
    const c = [prev[0] + (next[0] - prev[0]) * m, prev[1] + (next[1] - prev[1]) * m, prev[2] + (next[2] - prev[2]) * m];
    return [...blob.alphas.map(a => rgba(c, a)), rgba(c, 0)];
  });
  return (
    <Rect x={0} y={0} width={width} height={height}>
      <RadialGradient c={center} r={radius} colors={colors} />
    </Rect>
  );
};

interface GlowBackgroundProps {
  /** The cover's glow palette (extractGlowColors). Empty = base only. */
  colors: string[];
  variant?: 'player' | 'mini';
  /** Stops the loop when hidden. */
  active?: boolean;
}

const GlowBackground: React.FC<GlowBackgroundProps> = ({ colors, variant = 'player', active = true }) => {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (Math.round(width) !== Math.round(size.width) || Math.round(height) !== Math.round(size.height)) setSize({ width, height });
  };

  const palette = useMemo(() => colors.map(toRgb), [colors]);
  const from = useSharedValue<number[][]>([]);
  const to = useSharedValue<number[][]>(palette);
  const mix = useSharedValue(1);
  useEffect(() => {
    if (palette.length === 0) return;
    from.value = to.value;
    to.value = palette;
    mix.value = 0;
    mix.value = withTiming(1, { duration: FADE_MS, easing: Easing.linear });
  }, [palette, from, to, mix]);

  // progress: 0→1 every 20s, linear, restarting (Echo's infiniteRepeatable tween).
  const progress = useSharedValue(0);
  const pending = useSharedValue(0);
  const frame = useFrameCallback(info => {
    'worklet';
    pending.value += Math.min(info.timeSincePreviousFrame ?? 16, 66) / 1000;
    if (pending.value < FRAME_S) return;
    progress.value = (progress.value + pending.value / CYCLE_S) % 1;
    pending.value = 0;
  }, false);
  useEffect(() => {
    frame.setActive(active);
  }, [active, frame]);

  const blobs = variant === 'mini' ? MINI_BLOBS : PLAYER_BLOBS;
  const { width, height } = size;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none" onLayout={onLayout}>
      {width > 0 && height > 0 ? (
        <Canvas style={StyleSheet.absoluteFill}>
          <Fill color={BASE} />
          {blobs.map((blob, i) => (
            <GlowBlob key={i} blob={blob} index={i} width={width} height={height} progress={progress} from={from} to={to} mix={mix} />
          ))}
        </Canvas>
      ) : null}
    </View>
  );
};

export default React.memo(GlowBackground);
