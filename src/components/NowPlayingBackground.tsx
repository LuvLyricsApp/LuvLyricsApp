import React, { useCallback, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import DynamicAura from './allegra/DynamicAura';
import { useArtworkPalette } from './allegra/useArtworkPalette';
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

type AmbientProps = Omit<NowPlayingBackgroundProps, 'canvas' | 'playing' | 'onCanvasVisibleChange'>;

/**
 * Artwork-aware ambient field. Dark mode runs Allegra's live aura (reeded-glass
 * light columns tinted by the cover); it stays underneath as the canvas's
 * fallback. Light mode keeps a soft gradient.
 */
const Ambient: React.FC<AmbientProps & { playing: boolean }> = ({
  coverImageUri,
  gradientColors,
  animateBackground,
  isDark,
  playing,
}) => {
  const palette = useArtworkPalette(coverImageUri, gradientColors);

  if (isDark) {
    return <DynamicAura palette={palette} playing={playing} active={animateBackground} />;
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
  animateBackground,
  ...ambientProps
}) => {
  // The canvas video covers the whole field; rendering the shader under it
  // doubled the per-frame work for nothing.
  const [canvasShown, setCanvasShown] = useState(false);
  const onVisibleChange = useCallback((visible: boolean) => {
    setCanvasShown(visible);
    onCanvasVisibleChange?.(visible);
  }, [onCanvasVisibleChange]);
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Ambient {...ambientProps} animateBackground={animateBackground && !canvasShown} playing={playing} />
      <CanvasVideoLayer canvas={canvas} playing={playing} onVisibleChange={onVisibleChange} />
    </View>
  );
};

export default React.memo(NowPlayingBackground);
