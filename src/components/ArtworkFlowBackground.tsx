import React, { useEffect, useMemo, useRef, useState } from 'react';
import { LayoutChangeEvent, StyleSheet, View } from 'react-native';
import {
  Blur,
  Canvas,
  Fill,
  Group,
  Paint,
  Shader,
  Skia,
  useClock,
  vec,
} from '@shopify/react-native-skia';
import {
  Easing,
  runOnJS,
  useDerivedValue,
  useReducedMotion,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { extractAlbumColors } from '../services/NativePalette';

interface ArtworkFlowBackgroundProps {
  coverImageUri: string;
  fallbackColors: string[];
  animated: boolean;
}

type ColorVector = [number, number, number, number];
type FlowPalette = [ColorVector, ColorVector, ColorVector, ColorVector];
type PaletteCandidate = {
  color: string;
  population?: number;
  role?: string;
};

const TRACK_CHANGE_MS = 950;
const FLOW_BLUR = 30;
const easeInOutSine = Easing.bezier(0.445, 0.05, 0.55, 0.95);

const hexToVector = (color: string | undefined, fallback: ColorVector): ColorVector => {
  if (!color) return fallback;
  const hex = color.replace('#', '').trim();
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) return fallback;

  return [
    parseInt(hex.slice(0, 2), 16) / 255,
    parseInt(hex.slice(2, 4), 16) / 255,
    parseInt(hex.slice(4, 6), 16) / 255,
    1,
  ];
};

const darken = ([red, green, blue]: ColorVector, amount: number): ColorVector => [
  red * amount,
  green * amount,
  blue * amount,
  1,
];

const boostChroma = ([red, green, blue]: ColorVector, amount: number): ColorVector => {
  const luminance = red * 0.2126 + green * 0.7152 + blue * 0.0722;
  const boost = (channel: number) => Math.min(1, Math.max(0, luminance + (channel - luminance) * amount));
  return [boost(red), boost(green), boost(blue), 1];
};

const colourInterest = (color: string): { saturation: number; luminance: number } => {
  const [red, green, blue] = hexToVector(color, [0, 0, 0, 1]);
  const maximum = Math.max(red, green, blue);
  const minimum = Math.min(red, green, blue);
  const saturation = maximum === 0 ? 0 : (maximum - minimum) / maximum;
  const luminance = red * 0.2126 + green * 0.7152 + blue * 0.0722;
  return { saturation, luminance };
};

const blend = (from: ColorVector, to: ColorVector, amount: number): ColorVector => [
  from[0] + (to[0] - from[0]) * amount,
  from[1] + (to[1] - from[1]) * amount,
  from[2] + (to[2] - from[2]) * amount,
  1,
];

const colorDistance = (left: ColorVector, right: ColorVector): number => Math.hypot(
  left[0] - right[0],
  left[1] - right[1],
  left[2] - right[2],
);

const normaliseCandidates = (colors: readonly (string | PaletteCandidate)[]): PaletteCandidate[] => {
  const unique = new Map<string, PaletteCandidate>();

  colors.forEach((item) => {
    const candidate = typeof item === 'string' ? { color: item } : item;
    const color = candidate.color.trim();
    if (!/^#?[0-9a-fA-F]{6}$/.test(color)) return;

    const key = color.startsWith('#') ? color.toUpperCase() : `#${color.toUpperCase()}`;
    const existing = unique.get(key);
    if (!existing || (candidate.population ?? 0) > (existing.population ?? 0)) {
      unique.set(key, { ...candidate, color: key });
    }
  });

  return [...unique.values()];
};

/**
 * Palette's named swatches describe different targets, not equal-weight colours.
 * Preserve their sampled pixel population so a small neon logo cannot outweigh
 * the cover's actual colour field. When a cover has one colour family, derived
 * tonal neighbours keep the flow alive without introducing an unrelated hue.
 */
const createFlowPalette = (colors: readonly (string | PaletteCandidate)[]): FlowPalette => {
  const candidates = normaliseCandidates(colors);
  const maxPopulation = Math.max(...candidates.map((candidate) => candidate.population ?? 0), 1);
  const hasMeaningfulColor = candidates.some((candidate) => {
    const { saturation } = colourInterest(candidate.color);
    return saturation >= 0.22 && (candidate.population ?? maxPopulation * 0.56) / maxPopulation >= 0.18;
  });

  const ranked = [...candidates].sort((left, right) => {
    const score = (candidate: PaletteCandidate) => {
      const { saturation, luminance } = colourInterest(candidate.color);
      const population = Math.sqrt((candidate.population ?? maxPopulation * 0.56) / maxPopulation);
      const neutralPenalty = hasMeaningfulColor && saturation < 0.12 ? 0.36 : 0;
      const readableLightness = luminance >= 0.06 && luminance <= 0.88 ? 0.08 : 0;
      const dominantBias = candidate.role === 'dominant' ? 0.06 : 0;
      return population * 1.1 + saturation * 0.32 + readableLightness + dominantBias - neutralPenalty;
    };
    return score(right) - score(left);
  });

  const fallbackBase: ColorVector = [0.06, 0.07, 0.11, 1];
  const base = hexToVector(ranked[0]?.color, fallbackBase);
  const alternatives = ranked
    .slice(1)
    .map((candidate) => hexToVector(candidate.color, base))
    .filter((candidate) => colorDistance(base, candidate) > 0.11);

  const accentA = alternatives[0] ?? blend(base, [1, 1, 1, 1], 0.18);
  const accentB = alternatives[1] ?? blend(base, [0, 0, 0, 1], 0.28);
  const accentC = alternatives[2] ?? blend(base, [1, 1, 1, 1], 0.08);
  const vividBase = boostChroma(base, 1.34);

  // Keep every moving field visually tied to the winning main colour. The
  // surface reads as one artwork-led atmosphere, rather than four competing
  // palette swatches.
  return [
    darken(vividBase, 0.82),
    darken(boostChroma(blend(vividBase, accentA, 0.80), 1.48), 1.12),
    darken(boostChroma(blend(vividBase, accentB, 0.70), 1.36), 1.06),
    darken(boostChroma(blend(vividBase, accentC, 0.62), 1.28), 1.08),
  ];
};

/**
 * GPU mesh-like colour field. Each anchor follows a different continuous phase;
 * there is no timer-driven React render and no ping-pong reversal.
 */
const colorFieldShader = Skia.RuntimeEffect.Make(`
  uniform float2 size;
  uniform float time;
  uniform float4 baseColor;
  uniform float4 fieldA;
  uniform float4 fieldB;
  uniform float4 fieldC;

  float field(float2 point, float2 center, float radius) {
    float distanceToCenter = length(point - center);
    return smoothstep(radius, radius * 0.10, distanceToCenter);
  }

  half4 main(float2 position) {
    float2 uv = position / size;
    float t = time;

    // Domain warping makes each colour field bend and merge rather than look
    // like a translated circle. Frequencies are deliberately incommensurate.
    float2 flow = float2(
      sin(uv.y * 5.1 + t * 0.16) + cos((uv.x + uv.y) * 3.7 - t * 0.11),
      cos(uv.x * 4.3 - t * 0.13) + sin((uv.x - uv.y) * 4.9 + t * 0.18)
    ) * 0.10;
    float2 warped = uv + flow;

    float2 anchorA = float2(
      0.24 + sin(t * 0.14) * 0.24 + cos(t * 0.05) * 0.07,
      0.26 + cos(t * 0.11) * 0.21
    );
    float2 anchorB = float2(
      0.76 + cos(t * 0.09 + 1.7) * 0.22,
      0.36 + sin(t * 0.16 + 0.8) * 0.25
    );
    float2 anchorC = float2(
      0.50 + sin(t * 0.12 + 3.1) * 0.30,
      0.78 + cos(t * 0.08 + 2.2) * 0.19
    );

    float weightA = field(warped, anchorA, 0.62);
    float weightB = field(warped, anchorB, 0.58);
    float weightC = field(warped, anchorC, 0.64);

    float3 colour = baseColor.rgb;
    colour = mix(colour, fieldA.rgb, weightA * 0.90);
    colour = mix(colour, fieldB.rgb, weightB * 0.84);
    colour = mix(colour, fieldC.rgb, weightC * 0.80);

    // Edge falloff and final grade protect large white lyric text.
    float edge = smoothstep(0.28, 0.78, length(uv - float2(0.5)));
    colour *= mix(1.0, 0.88, edge);
    return half4(clamp(colour, float3(0.0), float3(1.0)), 1.0);
  }
`);

interface FlowLayerProps {
  palette: FlowPalette;
  opacity: SharedValue<number>;
  width: number;
  height: number;
  time: SharedValue<number>;
}

const FlowLayer: React.FC<FlowLayerProps> = ({ palette, opacity, width, height, time }) => {
  const uniforms = useDerivedValue(() => ({
    size: vec(width, height),
    time: time.value,
    baseColor: palette[0],
    fieldA: palette[1],
    fieldB: palette[2],
    fieldC: palette[3],
  }), [height, palette, time, width]);

  if (!colorFieldShader) return null;

  // A 30px blur is gorgeous on a lyric sheet but turns a 50px Island into a
  // single flat swatch. Scale it to the actual canvas so compact surfaces keep
  // visible moving colour shapes.
  const blurRadius = Math.min(FLOW_BLUR, Math.max(6, height * 0.16));

  return (
    <Group opacity={opacity} layer={<Paint><Blur blur={blurRadius} mode="mirror" /></Paint>}>
      <Fill>
        <Shader source={colorFieldShader} uniforms={uniforms} />
      </Fill>
    </Group>
  );
};

const ArtworkFlowBackground: React.FC<ArtworkFlowBackgroundProps> = ({
  coverImageUri,
  fallbackColors,
  animated,
}) => {
  const reduceMotion = useReducedMotion();
  const clock = useClock();
  const transition = useSharedValue(1);
  const [canvasSize, setCanvasSize] = useState({ width: 1, height: 1 });
  const [nativeColors, setNativeColors] = useState<PaletteCandidate[] | null>(null);
  const fallbackPalette = useMemo(() => createFlowPalette(fallbackColors), [fallbackColors]);
  const palette = useMemo(
    () => createFlowPalette(nativeColors?.length ? nativeColors : fallbackColors),
    [fallbackColors, nativeColors],
  );
  const paletteKey = useMemo(() => palette.flat().join(','), [palette]);
  const [frontPalette, setFrontPalette] = useState<FlowPalette>(fallbackPalette);
  const [backPalette, setBackPalette] = useState<FlowPalette | null>(null);
  const frontPaletteRef = useRef<FlowPalette>(fallbackPalette);
  const paletteKeyRef = useRef(paletteKey);

  useEffect(() => {
    let cancelled = false;

    extractAlbumColors(coverImageUri).then((albumPalette) => {
      if (cancelled || !albumPalette) return;
      const extracted = albumPalette.swatches?.length
        ? albumPalette.swatches
        : [
          albumPalette.dominant && { ...albumPalette.dominant, role: 'dominant' },
          albumPalette.vibrant && { ...albumPalette.vibrant, role: 'vibrant' },
          albumPalette.darkVibrant && { ...albumPalette.darkVibrant, role: 'darkVibrant' },
          albumPalette.muted && { ...albumPalette.muted, role: 'muted' },
          albumPalette.lightVibrant && { ...albumPalette.lightVibrant, role: 'lightVibrant' },
          albumPalette.darkMuted && { ...albumPalette.darkMuted, role: 'darkMuted' },
        ].filter(Boolean) as PaletteCandidate[];
      // Keep the outgoing artwork palette alive while this new cover is being
      // read. Clearing it first briefly fell back to the song's generic (often
      // blue) gradient, creating a visible flash between two real palettes.
      if (extracted.length) setNativeColors(extracted);
    });

    return () => { cancelled = true; };
  }, [coverImageUri]);

  useEffect(() => {
    if (paletteKey === paletteKeyRef.current) return;

    const previousPalette = frontPaletteRef.current;
    paletteKeyRef.current = paletteKey;
    frontPaletteRef.current = palette;
    setFrontPalette(palette);

    if (reduceMotion) {
      setBackPalette(null);
      transition.value = 1;
      return;
    }

    setBackPalette(previousPalette);
    transition.value = 0;
    transition.value = withTiming(1, { duration: TRACK_CHANGE_MS, easing: easeInOutSine }, (finished) => {
      if (finished) runOnJS(setBackPalette)(null);
    });
  }, [palette, paletteKey, reduceMotion, transition]);

  const frontOpacity = useDerivedValue(() => transition.value);
  const backOpacity = useDerivedValue(() => 1 - transition.value);
  // Slightly quicker than a screen-sized lyric backdrop. In a compact Island
  // this keeps the colour drift perceptible while remaining calm.
  const flowTime = useDerivedValue(() => (animated && !reduceMotion ? clock.value / 285 : 0));

  const handleLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setCanvasSize((previous) => (
      previous.width === width && previous.height === height ? previous : { width, height }
    ));
  };

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} onLayout={handleLayout}>
      <Canvas style={StyleSheet.absoluteFill}>
        {backPalette && (
          <FlowLayer
            palette={backPalette}
            opacity={backOpacity}
            width={canvasSize.width}
            height={canvasSize.height}
            time={flowTime}
          />
        )}
        <FlowLayer
          palette={frontPalette}
          opacity={frontOpacity}
          width={canvasSize.width}
          height={canvasSize.height}
          time={flowTime}
        />
      </Canvas>
    </View>
  );
};

export default React.memo(ArtworkFlowBackground);
