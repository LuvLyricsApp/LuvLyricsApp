/**
 * Now Playing's backdrop, following Echo Music's player background styles
 * (Settings → Appearance → Player background style):
 *
 *   apple  — Echo's APPLE_MUSIC: the cover blurred across the screen, the
 *            sharp cover over the top 65% dissolving into it, and the motion
 *            canvas playing inside that same dissolving hero (Canvas on).
 *   glow   — Echo's GLOW_ANIMATED: six drifting glows of the cover's palette.
 *   blend  — apple while the cover is on show, gliding into glow when lyrics
 *            open (the two cross-fade).
 *
 * With "Apple Music inspired" off, the sharp hero is left out and the player
 * shows a floating artwork card instead (NowPlayingLyricsArea).
 */
import React, { useCallback, useEffect, useState } from 'react';
import { View, StyleSheet, useWindowDimensions } from 'react-native';
import MaskedView from '@react-native-masked-view/masked-view';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import AppleBackdrop, { heroHeight } from './player/AppleBackdrop';
import GlowBackground from './player/GlowBackground';
import { useGlowColors } from './player/useGlowColors';
import { useArtworkPalette } from './allegra/useArtworkPalette';
import CanvasVideoLayer from './CanvasVideoLayer';
import { CanvasArtwork } from '../services/canvas/types';
import { useSettingsStore } from '../store/settingsStore';
import { diag } from '../utils/diag';

interface NowPlayingBackgroundProps {
  coverImageUri?: string;
  gradientColors: string[];
  /** Lyrics on screen. */
  showLyrics: boolean;
  canvas?: CanvasArtwork | null;
  playing?: boolean;
  onCanvasVisibleChange?: (visible: boolean) => void;
}

const CROSSFADE_MS = 600;
// Echo's hero mask (AppleBackdrop's HERO_MASK_*), as alpha for MaskedView.
const MASK_COLORS = ['rgba(0,0,0,1)', 'rgba(0,0,0,1)', 'rgba(0,0,0,0.4)', 'rgba(0,0,0,0)'] as const;
const MASK_LOCATIONS = [0, 0.75, 0.92, 1] as const;

const NowPlayingBackground: React.FC<NowPlayingBackgroundProps> = ({
  coverImageUri,
  gradientColors,
  showLyrics,
  canvas = null,
  playing = false,
  onCanvasVisibleChange,
}) => {
  const { width, height } = useWindowDimensions();
  const style = useSettingsStore(s => s.playerBackground);
  const appleInspired = useSettingsStore(s => s.appleMusicInspired);
  const palette = useArtworkPalette(coverImageUri, gradientColors);

  const glowOn = style === 'glow' || (style === 'blend' && showLyrics);
  const glowColors = useGlowColors(style === 'apple' ? null : coverImageUri);

  // Apple <-> glow cross-fade.
  const glowOpacity = useSharedValue(glowOn ? 1 : 0);
  useEffect(() => {
    glowOpacity.value = withTiming(glowOn ? 1 : 0, { duration: CROSSFADE_MS });
  }, [glowOn, glowOpacity]);
  const glowStyle = useAnimatedStyle(() => ({ opacity: glowOpacity.value }));

  // Echo shows the sharp cover (and the canvas inside it) only on the cover
  // view of the Apple Music player.
  const heroOn = appleInspired && !showLyrics && !glowOn;
  const canvasAllowed = heroOn;

  const [canvasShown, setCanvasShown] = useState(false);
  const onVisibleChange = useCallback((visible: boolean) => {
    setCanvasShown(visible);
    onCanvasVisibleChange?.(visible);
  }, [onCanvasVisibleChange]);
  useEffect(() => {
    if (!canvasAllowed) onCanvasVisibleChange?.(false);
  }, [canvasAllowed, onCanvasVisibleChange]);

  const heroH = heroHeight(width, height);
  useEffect(() => {
    diag('player', `background ${style}, apple inspired ${appleInspired}, lyrics ${showLyrics}, glow ${glowOn}, hero ${heroOn}, canvas ${canvas ? canvas.source : 'none'}`);
  }, [style, appleInspired, showLyrics, glowOn, heroOn, canvas]);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {style !== 'glow' ? (
        // The cover stays under the canvas: the canvas fades in over it, and
        // when the canvas fades out (song change, loop seam) the cover is what
        // shows through — never an empty gap.
        <AppleBackdrop uri={coverImageUri} palette={palette} showHero={heroOn} />
      ) : null}

      {canvas || canvasShown ? (
        // The canvas plays inside the hero and dissolves exactly like the cover.
        // It stays mounted while leaving, so CanvasVideoLayer can fade it out
        // (lyrics opened, song changed) instead of cutting it.
        <MaskedView
          style={[styles.hero, { height: heroH }]}
          maskElement={
            <LinearGradient
              colors={MASK_COLORS}
              locations={MASK_LOCATIONS}
              style={StyleSheet.absoluteFill}
            />
          }
        >
          <CanvasVideoLayer canvas={canvasAllowed ? canvas : null} playing={playing && canvasAllowed} onVisibleChange={onVisibleChange} scrimStrength={0} />
        </MaskedView>
      ) : null}

      {style !== 'apple' ? (
        <Animated.View style={[StyleSheet.absoluteFill, glowStyle]}>
          <GlowBackground colors={glowColors} variant="player" active={glowOn} />
        </Animated.View>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  hero: { position: 'absolute', top: 0, left: 0, right: 0 },
});

export default React.memo(NowPlayingBackground);
