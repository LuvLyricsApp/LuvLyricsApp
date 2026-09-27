/**
 * Apple Music's Now Playing backdrop, drawn once with Skia.
 *
 *   - The cover, heavily blurred, fills the screen: the room takes the
 *     song's colours.
 *   - The sharp cover runs full-bleed across the top and dissolves into that
 *     blur through a real alpha mask — no hard edge, no dark band.
 *   - A new song cross-fades over the old one.
 *
 * Nothing here animates per frame except those fades, so it costs nothing
 * while a song plays.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Dimensions, LayoutChangeEvent, StyleSheet, useWindowDimensions, View } from 'react-native';
import {
  Blur,
  Canvas,
  Fill,
  Group,
  Image as SkiaImage,
  LinearGradient,
  Rect,
  SkImage,
  useImage,
  vec,
} from '@shopify/react-native-skia';
import { DerivedValue, useDerivedValue, useSharedValue, withTiming } from 'react-native-reanimated';
import { Motion } from '../../constants/allegraTheme';
import { AuraPalette } from '../allegra/palette';

interface AppleBackdropProps {
  uri?: string | null;
  /** The player's real size. On Android edge-to-edge the window height leaves
   *  out the navigation bar, so drawing to it left a dark strip at the bottom. */
  frame?: { width: number; height: number };
  /**
   * Veil mode: drawn *over* the canvas video, across the hero only. It paints
   * the blurred room back in through the inverse of the hero mask, so the
   * video dissolves exactly like the still cover. (MaskedView can't mask a
   * hardware video texture on Android — the video ended in a hard edge.)
   */
  veil?: boolean;
  palette: AuraPalette;
  /** The full-bleed cover at the top (hidden behind lyrics or a canvas video). */
  showHero: boolean;
}

// Echo's APPLE_MUSIC background: the cover blurred (150dp on a 128px decode)
// fills the screen; the sharp cover takes the top 65% of the height.
const BLUR = 70;
const BLEED = 120;
export const HERO_SHARE = 0.65;

/** Hero height: 65% of the screen, as in Echo's fillMaxHeight(0.65f). */
export const heroHeight = (_width: number, height: number): number => Math.round(height * HERO_SHARE);

/** Echo's DstIn mask: solid to 75%, 40% at 92%, gone at the bottom edge. */
export const HERO_MASK_POSITIONS = [0, 0.75, 0.92, 1];
export const HERO_MASK_ALPHAS = [1, 1, 0.4, 0];

/** The inverse of the hero mask: where the veil lets the room back in. */
const VEIL_ALPHAS = HERO_MASK_ALPHAS.map(a => 1 - a);

/**
 * Echo's dissolve: drawn last inside a `<Group layer>`, a DstIn gradient keeps
 * each pixel of what's already in the layer by the gradient's alpha. (Skia's
 * <Mask> dropped children that paint with their own shader — gradients, the
 * blurred image — so the dissolve silently did nothing.)
 */
const DissolveRect: React.FC<{ width: number; heroH: number; alphas: readonly number[] }> = ({ width, heroH, alphas }) => (
  <Rect x={0} y={0} width={width} height={heroH} blendMode="dstIn">
    <LinearGradient start={vec(0, 0)} end={vec(0, heroH)} positions={HERO_MASK_POSITIONS} colors={alphas.map(a => `rgba(0,0,0,${a})`)} />
  </Rect>
);

const Layer: React.FC<{
  image: SkImage;
  width: number;
  height: number;
  heroH: number;
  hero: DerivedValue<number>;
  /** Just the blurred room, no sharp hero (the veil). */
  roomOnly?: boolean;
}> = ({ image, width, height, heroH, hero, roomOnly = false }) => (
  <Group>
    <SkiaImage image={image} x={-BLEED} y={-BLEED} width={width + BLEED * 2} height={height + BLEED * 2} fit="cover">
      {/* clamp: a decal blur fades to transparent near the image's edges. */}
      <Blur blur={BLUR} mode="clamp" />
    </SkiaImage>
    {roomOnly ? null : (
      <Group opacity={hero}>
        <Group layer>
          <SkiaImage image={image} x={0} y={0} width={width} height={heroH} fit="cover" />
          <DissolveRect width={width} heroH={heroH} alphas={HERO_MASK_ALPHAS} />
        </Group>
      </Group>
    )}
  </Group>
);

/** The player's full size: the screen, not the window (see `frame`). */
export const usePlayerFrame = () => {
  const win = useWindowDimensions();
  const [frame, setFrame] = useState(() => ({
    width: win.width,
    height: Math.max(win.height, Dimensions.get('screen').height),
  }));
  const onLayout = React.useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width > 0 && height > 0) setFrame(f => (f.width === width && f.height === height ? f : { width, height }));
  }, []);
  return { frame, onLayout };
};

const AppleBackdrop: React.FC<AppleBackdropProps> = ({ uri, palette, showHero, frame, veil = false }) => {
  const win = useWindowDimensions();
  const width = frame?.width ?? win.width;
  const height = frame?.height ?? win.height;
  const heroH = heroHeight(width, height);
  const image = useImage(uri ?? undefined);

  // Keep the previous cover underneath while the new one fades in.
  const [layers, setLayers] = useState<{ prev: SkImage | null; next: SkImage | null }>({ prev: null, next: null });
  const lastUri = useRef<string | null | undefined>(undefined);
  const fade = useSharedValue(1);
  useEffect(() => {
    if (!image || lastUri.current === uri) return;
    lastUri.current = uri;
    setLayers(l => ({ prev: l.next, next: image }));
    fade.value = 0;
    fade.value = withTiming(1, { duration: 1200, easing: Motion.ease.standard });
  }, [image, uri, fade]);

  const hero = useSharedValue(showHero ? 1 : 0);
  useEffect(() => {
    hero.value = withTiming(showHero ? 1 : 0, { duration: 500, easing: Motion.ease.standard });
  }, [showHero, hero]);
  const heroOpacity = useDerivedValue(() => hero.value);
  const fadeOpacity = useDerivedValue(() => fade.value);

  const room = (
    <>
      {/* Until the cover decodes (or if it can't), the song's own colours. */}
      <Rect x={0} y={0} width={width} height={height}>
        <LinearGradient start={vec(0, 0)} end={vec(width, height)} colors={[palette.primary, palette.secondary, palette.tertiary]} />
      </Rect>
      <Fill color="rgba(0,0,0,0.35)" />
      {layers.prev ? <Layer image={layers.prev} width={width} height={height} heroH={heroH} hero={heroOpacity} roomOnly={veil} /> : null}
      {layers.next ? (
        <Group opacity={fadeOpacity}>
          <Layer image={layers.next} width={width} height={height} heroH={heroH} hero={heroOpacity} roomOnly={veil} />
        </Group>
      ) : null}
    </>
  );
  // Echo: black 5% at the top to 40% at the bottom, so white text reads.
  const shade = (
    <Rect x={0} y={0} width={width} height={height}>
      <LinearGradient start={vec(0, 0)} end={vec(0, height)} colors={['rgba(0,0,0,0.05)', 'rgba(0,0,0,0.4)']} />
    </Rect>
  );

  if (veil) {
    return (
      <View style={[styles.veil, { height: heroH }]} pointerEvents="none">
        <Canvas style={StyleSheet.absoluteFill}>
          <Group layer>
            {room}
            <DissolveRect width={width} heroH={heroH} alphas={VEIL_ALPHAS} />
          </Group>
          {/* The same shade the still cover sits under, over the video too. */}
          {shade}
        </Canvas>
      </View>
    );
  }

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Canvas style={StyleSheet.absoluteFill}>
        {room}
        {shade}
      </Canvas>
    </View>
  );
};

const styles = StyleSheet.create({
  veil: { position: 'absolute', top: 0, left: 0, right: 0 },
});

export default React.memo(AppleBackdrop);
