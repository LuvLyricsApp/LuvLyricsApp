import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import {
  Blur,
  Canvas,
  Fill,
  Group,
  ImageShader,
  LinearGradient,
  Paint,
  Shader,
  Skia,
  useClock,
  useImage,
  vec,
  type SkImage,
} from '@shopify/react-native-skia';
import {
  runOnJS,
  useDerivedValue,
  useReducedMotion,
  useSharedValue,
  withTiming,
  Easing,
  type SharedValue,
} from 'react-native-reanimated';

interface ArtworkFlowBackgroundProps {
  coverImageUri: string;
  fallbackColors: string[];
  animated: boolean;
}

const TRACK_CHANGE_MS = 850;
const FLOW_BLUR = 28;

/**
 * A low-frequency artwork warp. The artwork remains the colour source; the
 * shader only moves its pixels as one continuous field before Skia blurs it.
 * This deliberately avoids the recognisable "three moving circles" look.
 */
const artworkFlowShader = Skia.RuntimeEffect.Make(`
  uniform shader image;
  uniform float2 size;
  uniform float time;
  uniform float phase;

  half4 main(float2 pos) {
    float2 uv = pos / size;
    float t = time * 0.075 + phase;

    float driftX =
      sin((uv.y * 2.0 + t * 0.71) * 6.2831853) +
      cos((uv.x * 1.35 - t * 0.53) * 6.2831853) * 0.72 +
      sin(((uv.x + uv.y) * 0.86 + t * 0.31) * 6.2831853) * 0.46;
    float driftY =
      cos((uv.x * 1.72 + t * 0.64) * 6.2831853) +
      sin((uv.y * 1.18 - t * 0.49) * 6.2831853) * 0.76 +
      cos(((uv.x - uv.y) * 0.73 + t * 0.27) * 6.2831853) * 0.42;

    float amplitude = min(size.x, size.y) * 0.12;
    float2 warpedPos = pos + float2(driftX, driftY) * amplitude;
    half4 sampled = image.eval(warpedPos);

    // The colour grade makes the artwork read as broad pools of colour once
    // blurred, without turning bright covers into unreadable lyric backdrops.
    half luminance = dot(sampled.rgb, half3(0.299, 0.587, 0.114));
    half3 saturated = half3(luminance) + (sampled.rgb - half3(luminance)) * 1.42;
    half3 graded = (saturated - half3(0.5)) * 0.82 + half3(0.5);
    return half4(clamp(graded * 0.76, half3(0.0), half3(1.0)), sampled.a);
  }
`);

const easeInOutSine = Easing.bezier(0.445, 0.05, 0.55, 0.95);

interface FlowLayerProps {
  image: SkImage;
  opacity: SharedValue<number>;
  width: number;
  height: number;
  time: SharedValue<number>;
  phase: number;
}

const FlowLayer: React.FC<FlowLayerProps> = ({ image, opacity, width, height, time, phase }) => {
  const uniforms = useDerivedValue(() => ({
    size: vec(width, height),
    time: time.value,
    phase,
  }), [height, phase, time, width]);

  if (!artworkFlowShader) return null;

  return (
    <Group opacity={opacity} layer={<Paint><Blur blur={FLOW_BLUR} mode="mirror" /></Paint>}>
      <Fill>
        <Shader source={artworkFlowShader} uniforms={uniforms}>
          <ImageShader
            image={image}
            fit="cover"
            rect={{ x: 0, y: 0, width, height }}
            tx="mirror"
            ty="mirror"
          />
        </Shader>
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
  const loadedImage = useImage(coverImageUri);
  const clock = useClock();
  const transition = useSharedValue(1);
  const [frontImage, setFrontImage] = useState<SkImage | null>(null);
  const [backImage, setBackImage] = useState<SkImage | null>(null);
  const frontImageRef = useRef<SkImage | null>(null);

  useEffect(() => {
    if (!loadedImage || loadedImage === frontImageRef.current) return;

    const previousImage = frontImageRef.current;
    frontImageRef.current = loadedImage;
    setFrontImage(loadedImage);

    if (!previousImage || reduceMotion) {
      setBackImage(null);
      transition.value = 1;
      return;
    }

    setBackImage(previousImage);
    transition.value = 0;
    transition.value = withTiming(1, { duration: TRACK_CHANGE_MS, easing: easeInOutSine }, (finished) => {
      if (finished) runOnJS(setBackImage)(null);
    });
  }, [loadedImage, reduceMotion, transition]);

  const frontOpacity = useDerivedValue(() => transition.value);
  const backOpacity = useDerivedValue(() => 1 - transition.value);
  const flowTime = useDerivedValue(() => (animated && !reduceMotion ? clock.value / 1000 : 0));
  const fallback = fallbackColors.length >= 2
    ? fallbackColors
    : ['#181224', '#08070c'];

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Canvas style={StyleSheet.absoluteFill}>
        <Fill>
          <LinearGradient
            start={vec(0, 0)}
            end={vec(width, height)}
            colors={[fallback[0], fallback[1], fallback[2] ?? fallback[0]]}
          />
        </Fill>

        {backImage && (
          <FlowLayer
            image={backImage}
            opacity={backOpacity}
            width={width}
            height={height}
            time={flowTime}
            phase={0.12}
          />
        )}
        {frontImage && (
          <FlowLayer
            image={frontImage}
            opacity={frontOpacity}
            width={width}
            height={height}
            time={flowTime}
            phase={0.47}
          />
        )}

        {/* A quiet top-to-bottom veil keeps large white lyrics legible even on
            nearly-white cover art. */}
        <Fill>
          <LinearGradient
            start={vec(0, 0)}
            end={vec(0, height)}
            colors={['rgba(0,0,0,0.24)', 'rgba(0,0,0,0.36)', 'rgba(0,0,0,0.58)']}
            positions={[0, 0.55, 1]}
          />
        </Fill>
      </Canvas>
    </View>
  );
};

export default React.memo(ArtworkFlowBackground);
