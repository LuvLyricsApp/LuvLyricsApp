import React from 'react';
import { View, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { AuroraHeader } from './AuroraHeader';
import ArtworkFlowBackground from './ArtworkFlowBackground';

interface NowPlayingBackgroundProps {
  isDynamicTheme: boolean;
  coverImageUri?: string;
  gradientColors: string[];
  animateBackground: boolean;
  isDark: boolean;
}

const NowPlayingBackground: React.FC<NowPlayingBackgroundProps> = ({
  isDynamicTheme,
  coverImageUri,
  gradientColors,
  animateBackground,
  isDark,
}) => {
  if (isDynamicTheme && coverImageUri) {
    return (
      <ArtworkFlowBackground
        coverImageUri={coverImageUri}
        fallbackColors={gradientColors}
        animated={animateBackground}
      />
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
