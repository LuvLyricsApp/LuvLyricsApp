/**
 * "Shader wash", the player background that is ours: YouTube Music's wash of
 * the cover's colour sinking into near-black, with Allegra's live light field
 * pouring down through the top half in the cover's own colours.
 *
 * The field is drawn upside down so its pool of light sits at the top edge and
 * its columns hang down behind the artwork card. Its own alpha fades out by
 * about the middle of the screen, so it melts into the wash whatever colour
 * the wash is at that height (even mid-crossfade between songs) and the
 * title, scrubber and transport sit on calm colour, never on moving light.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import MusicFlowField from '../allegra/MusicFlowField';
import { AuraPalette } from '../allegra/palette';
import { Motion } from '../../constants/allegraTheme';
import YouTubeBackdrop from './YouTubeBackdrop';

/** How much of the screen the shader owns before it has melted into the wash. */
export const AURA_REACH = 0.52;
/** Where, within that reach, the light starts to melt away and where it is gone. */
const MELT = [0.3, 1] as const;
interface AuraBackdropProps {
  palette: AuraPalette;
  width: number;
  height: number;
  playing: boolean;
  /** Screen visible; the shader's frame loop stops otherwise. */
  active: boolean;
  /** Lyrics on screen: the light steps back so the lines stay readable. */
  quiet?: boolean;
  /**
   * The full cover is up: the light starts this far down, so it leaks out
   * from under the cover's reeded edge instead of hiding behind the cover.
   */
  lift?: number;
}

const AuraBackdrop: React.FC<AuraBackdropProps> = ({ palette, width, height, playing, active, quiet = false, lift = 0 }) => {
  const reachH = Math.max(1, Math.round(height * AURA_REACH));
  const shown = useSharedValue(quiet ? 0.5 : 1);
  const drop = useSharedValue(lift);
  React.useEffect(() => {
    shown.value = withTiming(quiet ? 0.5 : 1, { duration: Motion.duration.slow, easing: Motion.ease.standard });
  }, [quiet, shown]);
  React.useEffect(() => {
    drop.value = withTiming(lift, { duration: Motion.duration.slow, easing: Motion.ease.standard });
  }, [lift, drop]);
  const fieldStyle = useAnimatedStyle(() => ({ opacity: shown.value, transform: [{ translateY: drop.value }] }));

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <YouTubeBackdrop palette={palette} />
      <Animated.View style={[styles.top, { height: reachH }, fieldStyle]}>
        <MusicFlowField
          palette={palette}
          energy={playing ? 0.72 : 0.16}
          paused={!active}
          width={width}
          height={reachH}
          inverted
          fadeOut={MELT}
        />
        {/* Keeps the artwork card's edge from glaring against the brightest light. */}
        <LinearGradient colors={['rgba(5,5,6,0.18)', 'rgba(5,5,6,0)']} locations={[0, 0.5]} style={StyleSheet.absoluteFill} />
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  top: { position: 'absolute', top: 0, left: 0, right: 0, overflow: 'hidden' },
});

export default React.memo(AuraBackdrop);
