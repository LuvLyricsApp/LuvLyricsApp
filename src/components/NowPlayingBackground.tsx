import React from 'react';
import { View, StyleSheet, Image, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated from 'react-native-reanimated';
import { AuroraHeader } from './AuroraHeader';

interface NowPlayingBackgroundProps {
  isDynamicTheme: boolean;
  coverImageUri?: string;
  gradientColors: string[];
  animateBackground: boolean;
  blob1Style: any;
  blob2Style: any;
  blob3Style: any;
  isDark: boolean;
}

const { width } = Dimensions.get('window');

const NowPlayingBackground: React.FC<NowPlayingBackgroundProps> = ({
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
        <LinearGradient
          colors={['rgba(0,0,0,0.1)', 'rgba(0,0,0,0.5)', '#000']}
          locations={[0.2, 0.7, 1.0]}
          style={StyleSheet.absoluteFill}
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

export default React.memo(NowPlayingBackground);
