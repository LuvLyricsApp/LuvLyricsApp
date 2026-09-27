/**
 * Full-bleed looping motion artwork (the "canvas") behind the player.
 *
 * Decorative only: muted, never takes audio focus from the music player,
 * pointer-transparent, and cross-fades in on its first rendered frame so a
 * slow network never shows a black rectangle. When the song is paused the loop
 * pauses too; with Reduce Motion on it holds the first frame instead of moving.
 */
import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { requireOptionalNativeModule } from 'expo';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { CanvasArtwork } from '../services/canvas/types';
import { Motion, Signal } from '../constants/allegraTheme';

// expo-video needs its native module, which Android only gets if it is listed
// in android/app/src/main/java/expo/modules/ExpoModulesPackageList.kt. A build
// without it used to throw at import time and leave the whole app on a grey
// screen; the canvas is decoration, so it now switches itself off instead.
type ExpoVideo = typeof import('expo-video');
const video: ExpoVideo | null = requireOptionalNativeModule('ExpoVideo')
  ? (require('expo-video') as ExpoVideo)
  : null;

interface CanvasVideoLayerProps {
  canvas: CanvasArtwork | null;
  playing: boolean;
  /** Extra darkening for text contrast. 0 = none, 1 = heavy. */
  scrimStrength?: number;
  onVisibleChange?: (visible: boolean) => void;
}

const CanvasVideo: React.FC<CanvasVideoLayerProps & { lib: ExpoVideo }> = ({
  lib,
  canvas,
  playing,
  scrimStrength = 0.6,
  onVisibleChange,
}) => {
  const reduceMotion = useReducedMotion();
  const opacity = useSharedValue(0);

  const source = canvas ? { uri: canvas.url, contentType: canvas.isHls ? ('hls' as const) : ('auto' as const) } : null;
  const player = lib.useVideoPlayer(source, p => {
    p.loop = true;
    p.muted = true;
    // The canvas must never duck, pause or steal focus from the music.
    p.audioMixingMode = 'mixWithOthers';
    p.showNowPlayingNotification = false;
    p.staysActiveInBackground = false;
  });

  // New canvas: hide until its first frame lands.
  useEffect(() => {
    opacity.value = 0;
    onVisibleChange?.(false);
  }, [canvas?.url, opacity, onVisibleChange]);

  useEffect(() => {
    if (!canvas) return;
    if (playing && !reduceMotion) player.play();
    else player.pause();
  }, [canvas, playing, reduceMotion, player]);

  const fadeStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  if (!canvas) return null;

  const scrimTop = `rgba(7, 8, 11, ${0.25 * scrimStrength})`;
  const scrimBottom = `rgba(7, 8, 11, ${0.9 * scrimStrength})`;

  return (
    <Animated.View style={[StyleSheet.absoluteFill, fadeStyle]} pointerEvents="none">
      <View style={[StyleSheet.absoluteFill, { backgroundColor: Signal.bgDeep }]} />
      <lib.VideoView
        player={player}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        nativeControls={false}
        allowsFullscreen={false}
        allowsPictureInPicture={false}
        onFirstFrameRender={() => {
          opacity.value = withTiming(1, {
            duration: reduceMotion ? Motion.duration.fast : Motion.duration.crossfade,
            easing: Motion.ease.decelerate,
          });
          onVisibleChange?.(true);
        }}
      />
      <LinearGradient
        colors={[scrimTop, 'rgba(7, 8, 11, 0)', scrimBottom]}
        locations={[0, 0.35, 1]}
        style={StyleSheet.absoluteFill}
      />
    </Animated.View>
  );
};

export const CanvasVideoLayer: React.FC<CanvasVideoLayerProps> = props =>
  (video ? <CanvasVideo {...props} lib={video} /> : null);

export default React.memo(CanvasVideoLayer);
