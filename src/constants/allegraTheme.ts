/**
 * Allegra "Soft Signal" design tokens, ported to React Native.
 *
 * The listening-room look: album art supplies the atmosphere, frosted glass
 * separates content without flattening it, one stable chartreuse action color
 * stays legible over any artwork. Import these instead of hardcoding values so
 * a single edit restyles every player surface.
 */
import { Easing } from 'react-native-reanimated';
import { Fonts } from './fonts';

/** Stable product colors. Artwork tints the ambient layer, never these. */
export const Signal = {
  wave: '#d9e66a', // primary action: play, progress, selected, focus
  waveInk: '#17180d', // text/icon on a wave fill
  accent: '#ee6b5f', // secondary warmth (liked, song-state)
  accentBright: '#ffaaa0',
  accentDeep: '#783e44',
  vibeBlue: '#7bafd4',
  ink: '#f4f1ea',
  inkSoft: '#d1d0c9',
  inkMuted: '#8e9498',
  inkFaint: '#626b70',
  bg: '#0a0b0e',
  bgDeep: '#07080b',
  bgSubtle: '#12141a',
} as const;

/** Frosted material recipe: translucent fill + hairline + inset highlight. */
export const Glass = {
  fill: 'rgba(24, 29, 32, 0.62)',
  fillHeavy: 'rgba(18, 21, 23, 0.86)',
  fillLight: 'rgba(255, 255, 255, 0.08)',
  fillPressed: 'rgba(255, 255, 255, 0.14)',
  hairline: 'rgba(255, 255, 255, 0.10)',
  hairlineStrong: 'rgba(255, 255, 255, 0.18)',
  highlight: 'rgba(255, 255, 255, 0.12)',
  scrim: 'rgba(7, 8, 11, 0.55)',
  scrimHeavy: 'rgba(7, 8, 11, 0.78)',
} as const;

/** expo-blur intensities that approximate the web blur tokens (8/16/24/40px). */
export const BlurIntensity = {
  control: 20,
  compact: 35,
  panel: 55,
  sheet: 80,
} as const;

/** One corner family everywhere. Artwork is never over-rounded. */
export const Radius = {
  pill: 999,
  panel: 24,
  sheet: 30,
  well: 16,
  art: 16,
  thumb: 10,
} as const;

export const Space = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

/** Apple-Music-style type ramp for the player. */
// Inter faces carry their weight in the family name, so no fontWeight here
// (Android would otherwise synthesise a second, faux-bold pass).
export const PlayerType = {
  title: { fontFamily: Fonts.interBold, fontSize: 22, letterSpacing: -0.5 },
  artist: { fontFamily: Fonts.interMedium, fontSize: 18, letterSpacing: -0.2 },
  meta: { fontFamily: Fonts.interSemiBold, fontSize: 11, letterSpacing: 0.9 },
  time: { fontFamily: Fonts.interSemiBold, fontSize: 12, fontVariant: ['tabular-nums' as const] },
} as const;

/**
 * Motion vocabulary. Motion communicates state, it does not decorate. Animate
 * transform and opacity only — never width/height/top.
 */
export const Motion = {
  duration: {
    instant: 100,
    fast: 160,
    base: 240,
    slow: 400,
    cinematic: 700,
    crossfade: 900, // canvas video <-> artwork swap
  },
  ease: {
    standard: Easing.bezier(0.4, 0, 0.2, 1),
    decelerate: Easing.bezier(0, 0, 0.2, 1),
    accelerate: Easing.bezier(0.4, 0, 1, 1),
    emphasis: Easing.bezier(0.2, 0, 0, 1),
  },
  spring: {
    tactile: { stiffness: 400, damping: 30, mass: 1 },
    sheet: { stiffness: 300, damping: 34, mass: 1 },
    hero: { stiffness: 220, damping: 30, mass: 1 },
    lyrics: { stiffness: 260, damping: 38, mass: 0.85 },
    breathe: { stiffness: 120, damping: 28, mass: 1 },
  },
  /** A tapped control confirms within this window, independent of any IO. */
  ackMs: 120,
  pressScale: 0.94,
} as const;
