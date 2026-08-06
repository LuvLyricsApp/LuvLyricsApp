/**
 * 🌌 LyricFlow - Aurora Header (Clean Aurora Effect)
 * -----------------------------------------------------------
 * - REFINED COLORS: Slightly Brighter & More Saturated
 * - Adjusted Bleanding: "Semi-Blend" (distinct but soft)
 * - Removed Texture/Noise (Clean look)
 * - Smooth fade without hard lines
 */

import React, { useRef } from 'react';
import { View, StyleSheet, Dimensions, Image as RNImage, Animated } from 'react-native';
import { Canvas, Rect, Oval, BlurMask, vec, Group } from '@shopify/react-native-skia';
import { LinearGradient } from 'expo-linear-gradient';
import { useSharedValue, withRepeat, withTiming, useDerivedValue, Easing } from 'react-native-reanimated';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Extended height for smooth fade
const AURORA_HEIGHT = SCREEN_HEIGHT * 1.0; // Increased to full height per user request

// REFINED COLORS: Brighter & Saturated
const COLOR_1 = '#EA7980'; // Saturated but slightly softer Peach/Rose
const COLOR_2 = '#1D728F'; // Saturated Deep Teal Blue
const COLOR_3 = '#155252'; // Richer Dark Evergreen
const BASE_DARK = '#020A16';

export type AuroraPalette = 'library' | 'search' | 'settings' | 'nowPlaying';

interface AuroraBackgroundProps {
  palette?: AuroraPalette;
  colors?: string[]; // Custom colors override palette
  imageUri?: string | null; // Optional blurred image background
  animated?: boolean; // Toggle animation
  isSolid?: boolean; // Toggle solid rendering with no gradients/blobs
}

const AuroraCanvas: React.FC<{
  c1: string; c2: string; c3: string;
  t1: any; t2: any; t3: any;
  baseColor: string;
}> = ({ c1, c2, c3, t1, t2, t3, baseColor }) => (
  <Canvas style={StyleSheet.absoluteFill}>
    <Rect x={0} y={0} width={SCREEN_WIDTH} height={AURORA_HEIGHT} color={baseColor} />

    <Group transform={t2} origin={vec(SCREEN_WIDTH * 0.2, AURORA_HEIGHT * 0.3)}>
      <Oval
        x={-SCREEN_WIDTH * 0.2}
        y={-AURORA_HEIGHT * 0.2}
        width={SCREEN_WIDTH * 0.8}
        height={AURORA_HEIGHT * 0.8}
        color={c2}
        opacity={0.4}
      >
        <BlurMask blur={70} style="normal" />
      </Oval>
    </Group>

    <Group transform={t1} origin={vec(SCREEN_WIDTH * 0.8, AURORA_HEIGHT * 0.3)}>
      <Oval
        x={SCREEN_WIDTH * 0.5}
        y={-AURORA_HEIGHT * 0.1}
        width={SCREEN_WIDTH * 0.6}
        height={AURORA_HEIGHT * 0.7}
        color={c1}
        opacity={0.3}
      >
        <BlurMask blur={70} style="normal" />
      </Oval>
    </Group>

    <Group transform={t3} origin={vec(SCREEN_WIDTH * 0.5, AURORA_HEIGHT * 0.6)}>
      <Oval
        x={SCREEN_WIDTH * 0.2}
        y={AURORA_HEIGHT * 0.2}
        width={SCREEN_WIDTH * 0.6}
        height={AURORA_HEIGHT * 0.8}
        color={c3}
        opacity={0.5}
      >
        <BlurMask blur={90} style="normal" />
      </Oval>
    </Group>
  </Canvas>
);

export const AuroraHeader: React.FC<AuroraBackgroundProps> = ({
  colors,
  imageUri,
  animated = false,
  isSolid = false,
}) => {
  const rotation = useSharedValue(0);
  const scale = useSharedValue(1);

  React.useEffect(() => {
    if (animated) {
      rotation.value = withRepeat(withTiming(360, { duration: 90000, easing: Easing.linear }), -1);
      scale.value = withRepeat(withTiming(1.15, { duration: 20000, easing: Easing.inOut(Easing.ease) }), -1, true);
    } else {
      rotation.value = 0;
      scale.value = 1;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animated]);

  const t1 = useDerivedValue(() => [{ rotate: 25 + (rotation.value * 0.5) }, { scale: scale.value }]);
  const t2 = useDerivedValue(() => [{ rotate: -25 - (rotation.value * 0.3) }, { scale: scale.value }]);
  const t3 = useDerivedValue(() => [{ rotate: rotation.value * 0.2 }, { scale: scale.value * 0.9 }]);

  const activeColors = colors && colors.length >= 2
    ? [colors[0], colors[1], colors[2] || colors[0]]
    : [COLOR_1, COLOR_2, COLOR_3];

  // Cover-art mode: an artwork image with no explicit palette. Callers leave
  // `colors` undefined here, which would otherwise fall back to the default
  // aurora blobs (teal COLOR_2) over BASE_DARK (navy) — showing as a blue band
  // between the artwork and the black list background while scrolling.
  // In this mode the artwork blends straight into black instead.
  const isCoverArtMode = !!imageUri && !(colors && colors.length >= 1);

  // Base color: use the first custom color as backing when colors are provided,
  // so solid modes (Spotify Grey, purest black, dark navy, etc.) don't bleed BASE_DARK's blue tint.
  // Falls back to BASE_DARK only for the default aurora palette with no artwork.
  const baseColor = isCoverArtMode
    ? '#000000'
    : (colors && colors.length >= 1) ? colors[0] : BASE_DARK;

  // Cross-fade between previous and new colors
  const prevColorsRef = useRef<string[]>(activeColors);
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const colorsKey = activeColors.join(',');
  const prevKeyRef = useRef(colorsKey);

  React.useLayoutEffect(() => {
    if (prevKeyRef.current !== colorsKey) {
      prevKeyRef.current = colorsKey;
      fadeAnim.stopAnimation();
      fadeAnim.setValue(0);
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 700,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) {
          prevColorsRef.current = [...activeColors];
        }
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colorsKey]);

  const [pc1, pc2, pc3] = prevColorsRef.current;
  const [c1, c2, c3] = activeColors;

  if (isSolid) {
    return (
      <View style={[styles.container, { backgroundColor: baseColor }]} pointerEvents="none" />
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: baseColor }]} pointerEvents="none">
      <View style={[styles.auroraArea, { backgroundColor: baseColor }]}>
        {/* Aurora blobs are skipped in cover-art mode — their colours are what
            produced the blue band under the artwork. */}
        {!isCoverArtMode && (
          <>
            {/* Previous colors layer — always underneath */}
            <AuroraCanvas c1={pc1} c2={pc2} c3={pc3} t1={t1} t2={t2} t3={t3} baseColor={baseColor} />

            {/* New colors layer — fades in on top */}
            <Animated.View style={[StyleSheet.absoluteFill, { opacity: fadeAnim }]}>
              <AuroraCanvas c1={c1} c2={c2} c3={c3} t1={t1} t2={t2} t3={t3} baseColor={baseColor} />
            </Animated.View>
          </>
        )}

        {imageUri && (
          <RNImage
            source={{ uri: imageUri }}
            style={[StyleSheet.absoluteFill, { height: AURORA_HEIGHT, opacity: 0.6, transform: [{ scale: 1.2 }] }]}
            blurRadius={90}
            resizeMode="cover"
          />
        )}

        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.05)', 'rgba(0,0,0,0.6)', baseColor]}
          locations={[0.1, 0.45, 0.8, 1]}
          style={styles.fadeToBlack}
        />
      </View>

      <View style={[styles.darkArea, { backgroundColor: baseColor }]} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  auroraArea: {
    height: AURORA_HEIGHT,
    backgroundColor: BASE_DARK,
    overflow: 'hidden',
  },
  canvas: {
    flex: 1,
  },
  fadeToBlack: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: AURORA_HEIGHT, // Full height for smooth transition
  },
  darkArea: {
    flex: 1,
    backgroundColor: BASE_DARK,
  },
});

export default AuroraHeader;
