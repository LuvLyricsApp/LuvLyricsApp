/**
 * Allegra's MusicFlowShader, ported from WebGL to a Skia runtime shader.
 *
 * Reeded-glass columns of light that breathe with the room's energy, tinted by
 * the current artwork's palette and eased between songs. Same maths as the web
 * field (lightField + flutes + catch-light + grain); the orb stays out, exactly
 * as Allegra leaves it out. Decorative only: pointer-transparent, paused when
 * the screen isn't focused, frozen on one frame under Reduce Motion.
 *
 * Rendered at about one device pixel per point and scaled up — the field is
 * soft by design, and that keeps the fragment cost flat across screen densities.
 */
import React, { useEffect, useMemo } from 'react';
import { PixelRatio, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Canvas, Fill, Shader, Skia } from '@shopify/react-native-skia';
import {
  useDerivedValue,
  useFrameCallback,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { Motion } from '../../constants/allegraTheme';
import { AuraPalette, hexToRgb } from './palette';
import { isLowEndDevice } from '../../utils/performanceTier';

const SKSL = `
uniform float2 uResolution;
uniform float uTime;
uniform float uRibs;
uniform float uEnergy;
uniform float uMood;
uniform float3 uAccent;
uniform float3 uBright;
uniform float3 uSky;
uniform float3 uDeep;

float hash(float2 p) {
  return fract(sin(dot(p, float2(127.1, 311.7))) * 43758.5453123);
}

float bell(float x, float center, float width) {
  float d = (x - center) / width;
  return exp(-d * d);
}

float3 lightField(float2 uv) {
  // Constant tempo. Scaling time by energy (the old uTime * tempo) turned any
  // energy change into a burst of speed, because the phase jump grows with
  // how long the clock has run. Energy now shapes brightness and height only.
  float t = uTime * 0.78;
  float aspect = uResolution.x / uResolution.y;

  float y = uv.y;
  float portrait = 1.0 - smoothstep(0.7, 1.3, aspect);
  float x = mix(uv.x, mix(0.18, 0.82, uv.x), portrait);
  // Slow drift in place of the web pointer.
  x += 0.012 * sin(uTime * 0.21);

  float flow = sin(uv.y * 6.0 - uTime * 2.2 + uMood) * 0.018 * (0.35 + uEnergy);
  x += flow;

  float dome = 0.5 + 0.5 * cos((x - 0.5) * 3.14159265 * 1.05);
  y -= dome * 0.08;

  float columns = 0.0;
  for (int i = 0; i < 9; i++) {
    float fi = float(i);
    float center = fract(0.08 + fi * 0.618034) + 0.025 * sin(t * 0.55 + fi * 1.3);
    float width = 0.035 + 0.05 * hash(float2(fi, 3.0 + uMood));
    float fund = sin(t * (0.7 + 0.18 * fi) + fi * 1.7);
    float harm = sin(t * (1.5 + 0.25 * fi) + fi * 2.4 + uMood);
    float pulse = 0.45 + 0.55 * (0.65 * fund + 0.35 * harm);
    pulse = mix(pulse, abs(pulse), 0.25 + uEnergy * 0.35);
    float heightBoost = 0.7 + 0.55 * uEnergy + 0.15 * sin(t * 2.0 + fi);
    columns += bell(x, center, width) * pulse * heightBoost;
  }

  float drift = bell(x, 0.5 + 0.2 * sin(t * 0.65), 0.44);
  float exposure = 0.45 + 0.95 * drift * (0.7 + uEnergy * 0.45);
  float heightFade = 1.0 - smoothstep(0.02, 1.0, y);
  float light = clamp((0.14 + columns * 0.52) * heightFade * exposure, 0.0, 1.0);

  float3 dark = uDeep * 0.06 + float3(0.004, 0.006, 0.012);
  float3 color = mix(dark, uAccent, smoothstep(0.05, 0.62, light));
  color = mix(color, uBright, smoothstep(0.38, 0.95, light));
  color = mix(color, uSky, smoothstep(0.55, 1.0, light) * (0.2 + uMood * 0.08));

  float poolHeight = 0.10 + 0.14 * dome + 0.06 * drift;
  float pool = 1.0 - smoothstep(poolHeight - 0.08, poolHeight + 0.22, y);
  color = mix(color, mix(uBright, uSky, 0.55), pool * 0.82);
  float core = 1.0 - smoothstep(-0.08, poolHeight * 0.55, y);
  color = mix(color, mix(uSky, float3(1.0), 0.28), core);

  float halo = bell(uv.x, 0.5, 0.32) * bell(y, 0.48, 0.32);
  color += uDeep * 0.06 * halo;
  float vignette = smoothstep(0.0, 0.08, uv.x) * (1.0 - smoothstep(0.96, 1.08, uv.x));
  color *= 0.78 + 0.22 * vignette;
  return color;
}

half4 main(float2 fragCoord) {
  // Skia's y runs down; the field's floor of light sits at uv.y = 0.
  float2 uv = float2(fragCoord.x / uResolution.x, 1.0 - fragCoord.y / uResolution.y);

  float glass = smoothstep(0.02, 0.44, uv.y);
  float phase = fract(uv.x * uRibs);
  float ramp = phase - 0.5;
  float bevel = sin(ramp * 3.14159265);
  float lens = (0.55 * ramp + 0.225 * bevel) * 0.05 * glass;
  lens += 0.004 * sin(uv.y * 18.0 - uTime * 2.4) * glass * uEnergy;
  float2 refracted = uv + float2(lens, ramp * 0.012 * glass);

  float3 color = lightField(refracted);

  float shade = exp(-pow((phase - 0.03) / 0.06, 2.0));
  float catchLight = exp(-pow((phase - 0.94) / 0.05, 2.0));
  float body = 0.9 + 0.2 * phase;
  color *= mix(1.0, body * (1.0 - 0.28 * shade), glass);
  float luminance = dot(color, float3(0.2126, 0.7152, 0.0722));

  float3 rimColor = mix(mix(uSky, uBright, 0.5), uAccent, 0.45 + 0.2 * sin(uTime + uv.x * uRibs));
  color += rimColor * catchLight * (0.03 + luminance * 0.18) * glass;

  float grain = hash(fragCoord + float2(uTime * 0.01, 0.0)) - 0.5;
  color += grain * 0.02 * (0.15 + smoothstep(0.02, 0.35, luminance));

  color += uBright * 0.09 * smoothstep(0.84, 1.0, uv.y) * (0.55 + 0.45 * sin(uv.x * 3.2 + uTime * 0.4));

  return half4(clamp(color, 0.0, 1.0), 1.0);
}
`;

const effect = Skia.RuntimeEffect.Make(SKSL);
if (!effect && __DEV__) console.warn('[MusicFlowField] SkSL failed to compile');

const LOW_END = isLowEndDevice();

/**
 * Canvas renders at this fraction of the view, then scales up. Skia draws at
 * the screen's pixel density, so a fixed fraction cost 2.25x more on a 3x
 * phone than a 2x one. Budget device pixels per point instead: about one
 * (0.6 on low-end phones) — the field is soft, so nobody sees the difference.
 */
const RENDER_SCALE = Math.min(0.5, (LOW_END ? 0.6 : 1) / PixelRatio.get());
/** Low-end phones draw the field at 30fps; the motion is slow enough to hide it. */
const FRAME_S = LOW_END ? 1 / 30 : 0;

export type AuraMood = 'energy' | 'chill' | 'different' | 'surprise';
const MOOD_VALUE: Record<AuraMood, number> = { energy: 0.2, chill: 1.0, different: 2.0, surprise: 3.0 };

interface MusicFlowFieldProps {
  palette: AuraPalette;
  /** 0–1. Playing ≈ 0.72, paused ≈ 0.12 — a steady ambient strength, never beat-synced. */
  energy?: number;
  mood?: AuraMood;
  /** Stops the frame loop (screen blurred / app backgrounded). */
  paused?: boolean;
  width?: number;
  height?: number;
  /** Light pours down from the top edge instead of rising from the bottom one. */
  inverted?: boolean;
}

export const MusicFlowField: React.FC<MusicFlowFieldProps> = ({
  palette,
  energy = 0.72,
  mood = 'energy',
  paused = false,
  width: widthProp,
  height: heightProp,
  inverted = false,
}) => {
  const window = useWindowDimensions();
  const width = widthProp ?? window.width;
  const height = heightProp ?? window.height;
  const reduceMotion = useReducedMotion();

  const clock = useSharedValue(1.6);
  const shownEnergy = useSharedValue(energy);
  const target = useMemo(() => {
    const accent = hexToRgb(palette.primary);
    const secondary = hexToRgb(palette.secondary);
    const sky = hexToRgb(palette.tertiary);
    const lift = (c: number[], amount: number) => c.map(v => v + (1 - v) * amount);
    return [...accent, ...lift(secondary, 0.3), ...sky, ...accent.map(v => v * 0.5)];
  }, [palette.primary, palette.secondary, palette.tertiary]);
  // accent(3) bright(3) sky(3) deep(3), eased per frame so a song change cross-fades.
  const colors = useSharedValue(target);
  const targetColors = useSharedValue(target);

  const running = !paused && !reduceMotion;
  useEffect(() => {
    targetColors.value = target;
    // The per-frame easing only runs while frames do. When the field is
    // resting (paused, off-screen, reduced motion) a new song's colours must
    // still land — otherwise the room keeps the previous cover's tint.
    if (!running) colors.value = target;
  }, [target, targetColors, colors, running]);

  useEffect(() => {
    shownEnergy.value = withTiming(energy, { duration: Motion.duration.cinematic * 2, easing: Motion.ease.standard });
  }, [energy, shownEnergy]);

  const pending = useSharedValue(0);
  const frame = useFrameCallback(info => {
    'worklet';
    // Clamped step: a stall or a trip to the background never makes time leap.
    pending.value += Math.min(info.timeSincePreviousFrame ?? 16, 66) / 1000;
    if (pending.value < FRAME_S) return; // no uniform write = no redraw this frame
    const dt = Math.min(pending.value, 0.066);
    pending.value = 0;
    clock.value += dt;
    // Time-based easing: the colour glides over ~1.5s at 60Hz and 120Hz alike.
    // Once it has arrived, stop rewriting it (no per-frame array churn).
    const goal = targetColors.value;
    const current = colors.value;
    let moving = false;
    for (let i = 0; i < goal.length; i++) {
      if (Math.abs(goal[i] - current[i]) > 0.002) { moving = true; break; }
    }
    if (!moving) return;
    const k = 1 - Math.exp(-dt * 2.2);
    const next = current.slice();
    for (let i = 0; i < next.length; i++) next[i] += (goal[i] - next[i]) * k;
    colors.value = next;
  }, false);

  useEffect(() => {
    frame.setActive(running);
    if (!running) colors.value = targetColors.value;
  }, [running, frame, colors, targetColors]);

  const renderW = Math.max(1, Math.round(width * RENDER_SCALE));
  const renderH = Math.max(1, Math.round(height * RENDER_SCALE));
  const ribs = width / Math.min(64, Math.max(30, width * 0.032));
  const moodValue = MOOD_VALUE[mood];

  const uniforms = useDerivedValue(() => {
    const c = colors.value;
    return {
      uResolution: [renderW, renderH],
      uTime: clock.value,
      uRibs: ribs,
      uEnergy: shownEnergy.value,
      uMood: moodValue,
      uAccent: [c[0], c[1], c[2]],
      uBright: [c[3], c[4], c[5]],
      uSky: [c[6], c[7], c[8]],
      uDeep: [c[9], c[10], c[11]],
    };
  });

  if (!effect) return null;

  return (
    <View style={[StyleSheet.absoluteFill, styles.clip]} pointerEvents="none">
      {/* The transform lives on a wrapper: Skia's Canvas doesn't forward it on every platform. */}
      <View
        style={{
          width: renderW,
          height: renderH,
          transform: [
            { translateX: (width - renderW) / 2 },
            { translateY: (height - renderH) / 2 },
            { scale: 1 / RENDER_SCALE },
            ...(inverted ? [{ scaleY: -1 }] : []),
          ],
        }}
      >
        <Canvas style={{ width: renderW, height: renderH }}>
          <Fill>
            <Shader source={effect} uniforms={uniforms} />
          </Fill>
        </Canvas>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  clip: { overflow: 'hidden' },
});

export default React.memo(MusicFlowField);
