/**
 * Now Playing's backdrop: Apple Music's full-bleed cover over its own blur
 * (AppleBackdrop), with the motion canvas video on top when one exists.
 */
import React, { useCallback, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import AppleBackdrop from './player/AppleBackdrop';
import { useArtworkPalette } from './allegra/useArtworkPalette';
import CanvasVideoLayer from './CanvasVideoLayer';
import { CanvasArtwork } from '../services/canvas/types';

interface NowPlayingBackgroundProps {
  coverImageUri?: string;
  gradientColors: string[];
  /** Lyrics on screen: the room stays, the sharp cover steps back. */
  showLyrics: boolean;
  /** Motion canvas; drawn over the backdrop once its first frame lands. */
  canvas?: CanvasArtwork | null;
  playing?: boolean;
  onCanvasVisibleChange?: (visible: boolean) => void;
}

const NowPlayingBackground: React.FC<NowPlayingBackgroundProps> = ({
  coverImageUri,
  gradientColors,
  showLyrics,
  canvas = null,
  playing = false,
  onCanvasVisibleChange,
}) => {
  const palette = useArtworkPalette(coverImageUri, gradientColors);
  const [canvasShown, setCanvasShown] = useState(false);
  const onVisibleChange = useCallback((visible: boolean) => {
    setCanvasShown(visible);
    onCanvasVisibleChange?.(visible);
  }, [onCanvasVisibleChange]);
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <AppleBackdrop uri={coverImageUri} palette={palette} showHero={!showLyrics && !canvasShown} />
      <CanvasVideoLayer canvas={canvas} playing={playing} onVisibleChange={onVisibleChange} />
    </View>
  );
};

export default React.memo(NowPlayingBackground);
