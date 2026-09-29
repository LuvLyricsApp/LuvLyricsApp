/**
 * Now Playing's backdrop, following Echo Music's player background styles
 * (Settings → Appearance → Player background style):
 *
 *   apple  — Echo's APPLE_MUSIC: the cover blurred across the screen, the
 *            sharp cover over the top 65% dissolving into it, and the motion
 *            canvas playing inside that same dissolving hero (Canvas on).
 *   blend  — "Apple + glow": apple while the cover is on show, gliding into
 *            Echo's drifting glow when lyrics open (the two cross-fade).
 *   youtube — YouTube Music: the cover's colour washing down into black, the
 *            artwork as a card (NowPlayingLyricsArea), no canvas.
 *   aura   — ours: that wash with the live shader pouring through the top half
 *            in the cover's colours (AuraBackdrop), no canvas.
 *
 * With "Apple Music inspired" off, the sharp hero is left out and the player
 * shows a floating artwork card instead (NowPlayingLyricsArea).
 */
import React, { useCallback, useEffect, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import Animated, { SharedValue, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import AppleBackdrop, { heroHeight, usePlayerFrame } from './player/AppleBackdrop';
import GlowBackground from './player/GlowBackground';
import YouTubeBackdrop from './player/YouTubeBackdrop';
import AuraBackdrop from './player/AuraBackdrop';
import { useGlowColors } from './player/useGlowColors';
import { useArtworkPalette } from './allegra/useArtworkPalette';
import CanvasVideoLayer from './CanvasVideoLayer';
import { CanvasArtwork } from '../services/canvas/types';
import { isCardPlayerBackground, useSettingsStore } from '../store/settingsStore';
import { diag } from '../utils/diag';

interface NowPlayingBackgroundProps {
  coverImageUri?: string;
  gradientColors: string[];
  /** Lyrics on screen. */
  showLyrics: boolean;
  canvas?: CanvasArtwork | null;
  playing?: boolean;
  onCanvasVisibleChange?: (visible: boolean) => void;
  /** The artwork is a record: the full-bleed cover (and its canvas) step aside. */
  vinyl?: boolean;
  /** A sideways swipe on the cover moves the hero with the finger. */
  shift?: SharedValue<number>;
}

const CROSSFADE_MS = 600;

const NowPlayingBackground: React.FC<NowPlayingBackgroundProps> = ({
  coverImageUri,
  gradientColors,
  showLyrics,
  canvas = null,
  playing = false,
  onCanvasVisibleChange,
  vinyl = false,
  shift,
}) => {
  const { frame, onLayout } = usePlayerFrame();
  // The shader only draws while this screen is the one in front.
  const focused = useIsFocused();
  const { width, height } = frame;
  const style = useSettingsStore(s => s.playerBackground);
  const appleInspired = useSettingsStore(s => s.appleMusicInspired);
  const palette = useArtworkPalette(coverImageUri, gradientColors);

  const glowOn = style === 'blend' && showLyrics;
  const glowColors = useGlowColors(style === 'blend' ? coverImageUri : null);

  // Apple <-> glow cross-fade.
  const glowOpacity = useSharedValue(glowOn ? 1 : 0);
  useEffect(() => {
    glowOpacity.value = withTiming(glowOn ? 1 : 0, { duration: CROSSFADE_MS });
  }, [glowOn, glowOpacity]);
  const glowStyle = useAnimatedStyle(() => ({ opacity: glowOpacity.value }));

  // Echo shows the sharp cover (and the canvas inside it) only on the cover
  // view of the Apple Music player.
  const heroOn = appleInspired && !isCardPlayerBackground(style) && !showLyrics && !glowOn && !vinyl;
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
  const heroFollow = useAnimatedStyle(() => {
    const x = shift ? shift.value : 0;
    return { opacity: 1 - 0.6 * Math.min(1, Math.abs(x) / Math.max(1, width)), transform: [{ translateX: x }] as const };
  });

  useEffect(() => {
    diag('player', `background ${style}, apple inspired ${appleInspired}, lyrics ${showLyrics}, glow ${glowOn}, hero ${heroOn}, canvas ${canvas ? canvas.source : 'none'}`);
  }, [style, appleInspired, showLyrics, glowOn, heroOn, canvas]);

  if (style === 'youtube') {
    return (
      <View style={StyleSheet.absoluteFill} pointerEvents="none" onLayout={onLayout}>
        <YouTubeBackdrop palette={palette} />
      </View>
    );
  }

  if (style === 'aura') {
    return (
      <View style={StyleSheet.absoluteFill} pointerEvents="none" onLayout={onLayout}>
        <AuraBackdrop palette={palette} width={width} height={height} playing={playing} active={focused} quiet={showLyrics} />
      </View>
    );
  }

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none" onLayout={onLayout}>
      {/* The cover stays under the canvas: the canvas fades in over it, and
          when it fades out (song change) the cover is what shows through —
          never an empty gap. */}
      <AppleBackdrop uri={coverImageUri} palette={palette} showHero={heroOn} frame={frame} shift={shift} />

      {canvas || canvasShown ? (
        // The canvas plays across the hero. Its veil paints the blurred room
        // back in through the hero's dissolve, so the video melts like the
        // cover; it rides inside the canvas's own fade, so cover -> video is a
        // single cross-dissolve with the shade applied exactly once. It stays
        // mounted while leaving, so CanvasVideoLayer can fade it out (lyrics
        // opened, song changed) instead of cutting it.
        <Animated.View style={[styles.hero, { height: heroH }, heroFollow]}>
          <CanvasVideoLayer
            canvas={canvasAllowed ? canvas : null}
            playing={playing && canvasAllowed}
            onVisibleChange={onVisibleChange}
            scrimStrength={0}
            overlay={<AppleBackdrop uri={coverImageUri} palette={palette} showHero={heroOn} frame={frame} veil />}
          />
        </Animated.View>
      ) : null}

      {style === 'blend' ? (
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
