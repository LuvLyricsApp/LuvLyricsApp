import React, { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
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

const createFlowPalette = (colors: string[]): FlowPalette => {
  const fallbackBase = hexToVector(colors[0], [0.06, 0.07, 0.11, 1]);
  const fallbackAccent = hexToVector(colors[1], [0.18, 0.22, 0.36, 1]);
  const fallbackLight = hexToVector(colors[2], fallbackAccent);
  const fallbackMuted = hexToVector(colors[3], fallbackBase);

  // The first swatch becomes an intentional, stable base. The remaining three
  // colours become moving fields, so the surface has a clear dominant colour
  // instead of a washed-out blend of the whole cover image.
  return [
    darken(fallbackBase, 0.48),
    darken(fallbackAccent, 0.88),
    darken(fallbackLight, 0.78),
    darken(fallbackMuted, 0.82),
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
      sin(uv.y * 5.1 + t * 0.071) + cos((uv.x + uv.y) * 3.7 - t * 0.047),
      cos(uv.x * 4.3 - t * 0.059) + sin((uv.x - uv.y) * 4.9 + t * 0.083)
    ) * 0.075;
    float2 warped = uv + flow;

    float2 anchorA = float2(
      0.24 + sin(t * 0.067) * 0.20 + cos(t * 0.021) * 0.06,
      0.26 + cos(t * 0.053) * 0.18
    );
    float2 anchorB = float2(
      0.76 + cos(t * 0.041 + 1.7) * 0.19,
      0.36 + sin(t * 0.079 + 0.8) * 0.22
    );
    float2 anchorC = float2(
      0.50 + sin(t * 0.058 + 3.1) * 0.27,
      0.78 + cos(t * 0.037 + 2.2) * 0.16
    );

    float weightA = field(warped, anchorA, 0.62);
    float weightB = field(warped, anchorB, 0.58);
    float weightC = field(warped, anchorC, 0.64);

    float3 colour = baseColor.rgb;
    colour = mix(colour, fieldA.rgb, weightA * 0.84);
    colour = mix(colour, fieldB.rgb, weightB * 0.76);
    colour = mix(colour, fieldC.rgb, weightC * 0.72);

    // Edge falloff and final grade protect large white lyric text.
    float edge = smoothstep(0.28, 0.78, length(uv - float2(0.5)));
    colour *= mix(0.92, 0.54, edge);
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

  return (
    <Group opacity={opacity} layer={<Paint><Blur blur={FLOW_BLUR} mode="mirror" /></Paint>}>
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
  const { width, height } = useWindowDimensions();
  const reduceMotion = useReducedMotion();
  const clock = useClock();
  const transition = useSharedValue(1);
  const [nativeColors, setNativeColors] = useState<string[] | null>(null);
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
    setNativeColors(null);

    extractAlbumColors(coverImageUri).then((albumPalette) => {
      if (cancelled || !albumPalette) return;
      const extracted = [
        albumPalette.darkVibrant?.color,
        albumPalette.dominant?.color,
        albumPalette.vibrant?.color,
        albumPalette.muted?.color,
        albumPalette.lightVibrant?.color,
        albumPalette.darkMuted?.color,
      ].filter((color): color is string => Boolean(color));
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
  const flowTime = useDerivedValue(() => (animated && !reduceMotion ? clock.value / 1000 : 0));

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Canvas style={StyleSheet.absoluteFill}>
        {backPalette && (
          <FlowLayer
            palette={backPalette}
            opacity={backOpacity}
            width={width}
            height={height}
            time={flowTime}
          />
        )}
        <FlowLayer
          palette={frontPalette}
          opacity={frontOpacity}
          width={width}
          height={height}
          time={flowTime}
        />
      </Canvas>
    </View>
  );
};

export default React.memo(ArtworkFlowBackground);
