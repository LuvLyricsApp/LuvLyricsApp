import React from 'react';
import { View, StyleSheet, Image, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated from 'react-native-reanimated';
import { AuroraHeader } from './AuroraHeader';
import CanvasVideoLayer from './CanvasVideoLayer';
import { CanvasArtwork } from '../services/canvas/types';

interface NowPlayingBackgroundProps {
  isDynamicTheme: boolean;
  coverImageUri?: string;
  gradientColors: string[];
  animateBackground: boolean;
  blob1Style: any;
  blob2Style: any;
  blob3Style: any;
  isDark: boolean;
  /** Motion canvas; drawn over the ambient layer once its first frame lands. */
  canvas?: CanvasArtwork | null;
  playing?: boolean;
  onCanvasVisibleChange?: (visible: boolean) => void;
}

const { width } = Dimensions.get('window');

type AmbientProps = Omit<NowPlayingBackgroundProps, 'canvas' | 'playing' | 'onCanvasVisibleChange'>;

/** Artwork-aware ambient field. It stays underneath as the canvas's fallback. */
const Ambient: React.FC<AmbientProps> = ({
  isDynamicTheme,
  coverImageUri,
  gradientColors,
  animateBackground,
  blob1Style,
  blob2Style,
  blob3Style,
  isDark,
}) => {
  if (isDynamicTheme && coverImageUri) {
    // One blurred base image + three tinted Animated.Views (no extra URI loads/blurs).
    // Blobs use gradientColors for tint so they still react to album art palette.
    const blobColor0 = gradientColors[0] ?? 'rgba(80,40,120,0.5)';
    const blobColor1 = gradientColors[1] ?? gradientColors[0] ?? 'rgba(40,80,160,0.45)';

    return (
      <View style={[StyleSheet.absoluteFill, { overflow: 'hidden' }]}>
        <Image
          source={{ uri: coverImageUri }}
          style={[StyleSheet.absoluteFill, { opacity: 0.35 }]}
          blurRadius={120}
          resizeMode="cover"
        />
        <Animated.View
          style={[
            { position: 'absolute', top: -width * 0.5, left: -width * 0.5, width: width * 2, height: width * 2, borderRadius: width, backgroundColor: blobColor0, opacity: 0.45 },
            blob1Style,
          ]}
        />
        <Animated.View
          style={[
            { position: 'absolute', bottom: -width * 0.5, right: -width * 0.5, width: width * 2, height: width * 2, borderRadius: width, backgroundColor: blobColor1, opacity: 0.4 },
            blob2Style,
          ]}
        />
        <Animated.View
          style={[
            { position: 'absolute', top: 0, left: 0, width: width * 1.8, height: width * 1.8, borderRadius: width, backgroundColor: blobColor0, opacity: 0.3 },
            blob3Style,
          ]}
        />
      </View>
    );
  }

  if (isDark) {
    return <AuroraHeader colors={gradientColors} animated={animateBackground} />;
  }

  /* Light mode fallback: soft gradient so the screen never looks empty */
  return (
    <View style={StyleSheet.absoluteFill}>
      <LinearGradient
        colors={gradientColors.length >= 2 ? [gradientColors[0], gradientColors[1]] : ['#f0f0f5', '#e0e0ea']}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
};

const NowPlayingBackground: React.FC<NowPlayingBackgroundProps> = ({
  canvas = null,
  playing = false,
  onCanvasVisibleChange,
  ...ambientProps
}) => (
  <View style={StyleSheet.absoluteFill} pointerEvents="none">
    <Ambient {...ambientProps} />
    <CanvasVideoLayer canvas={canvas} playing={playing} onVisibleChange={onCanvasVisibleChange} />
  </View>
);

export default React.memo(NowPlayingBackground);
