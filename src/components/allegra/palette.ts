/**
 * Artwork palette for the ambient field — Allegra's colour rules (lib/palette.ts)
 * applied to the swatches Android's Palette API hands back.
 *
 * Every colour keeps the cover's own hue; saturation and lightness are only
 * nudged into a range that reads on near-black. A monochrome cover gets a quiet
 * neutral instead of an invented colour, and a one-colour cover gets lighter /
 * darker versions of itself instead of drifting off the artwork.
 */

export interface AuraPalette {
  primary: string;
  secondary: string;
  tertiary: string;
}

/** Allegra's "energy" room: coral, sky blue, soft lime. */
export const DEFAULT_AURA: AuraPalette = { primary: '#ee6b5f', secondary: '#7bafd4', tertiary: '#c4dd74' };
export const NEUTRAL_AURA: AuraPalette = { primary: '#7d8087', secondary: '#5f6269', tertiary: '#9a9da4' };

/** "#rrggbb" -> [r, g, b] in 0..1. Bad input gives mid-grey, never NaN. */
export const hexToRgb = (hex: string): number[] => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return [0.5, 0.5, 0.5];
  const h = m[1];
  return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
};

const toHex = (r: number, g: number, b: number): string =>
  `#${[r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`;

interface Hsl { hue: number; sat: number; light: number; chroma: number }

export const hexToHsl = (hex: string): Hsl => {
  const [r, g, b] = hexToRgb(hex);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const chroma = max - min;
  const light = (max + min) / 2;
  let hue = 0;
  if (chroma !== 0) {
    if (max === r) hue = ((g - b) / chroma + 6) % 6;
    else if (max === g) hue = (b - r) / chroma + 2;
    else hue = (r - g) / chroma + 4;
    hue *= 60;
  }
  const sat = light > 0 && light < 1 ? chroma / (1 - Math.abs(2 * light - 1)) : 0;
  return { hue, sat, light, chroma };
};

export const hslToHex = (hue: number, sat: number, light: number): string => {
  const h = ((hue % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * light - 1)) * sat;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = light - c / 2;
  const [r, g, b] =
    h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return toHex((r + m) * 255, (g + m) * 255, (b + m) * 255);
};

/** Push a colour just far enough to read on near-black, keeping its hue. */
export const vivify = (hex: string): string => {
  const { hue, sat, light } = hexToHsl(hex);
  return hslToHex(hue, Math.min(0.85, Math.max(0.45, sat * 1.25)), Math.min(0.62, Math.max(0.42, light * 1.15)));
};

export const shiftLightness = (hex: string, delta: number): string => {
  const { hue, sat, light } = hexToHsl(hex);
  return hslToHex(hue, Math.max(0.4, sat), Math.min(0.68, Math.max(0.3, light + delta)));
};

const hueDistance = (a: number, b: number): number => {
  const gap = Math.abs(a - b) % 360;
  return gap > 180 ? 360 - gap : gap;
};

/** Greys and blown highlights carry no hue worth building a room from. */
const isUsable = (hex: string): boolean => {
  const { chroma, light } = hexToHsl(hex);
  if (chroma < 0.08) return false;
  if (light > 0.78 && chroma < 0.4) return false;
  if (light < 0.16 && chroma < 0.3) return false;
  return light <= 0.94 && light >= 0.06;
};

/**
 * Candidates in priority order (most vivid first). Returns the Allegra
 * three-stop palette: a primary, then distinct hues if the cover has them,
 * otherwise lightness shifts of the primary.
 */
export const paletteFromColors = (candidates: (string | undefined | null)[]): AuraPalette => {
  const usable = candidates.filter((c): c is string => !!c && isUsable(c));
  if (usable.length === 0) return candidates.some(Boolean) ? NEUTRAL_AURA : DEFAULT_AURA;
  const ranked = usable.map(hex => ({ hex: vivify(hex), hue: hexToHsl(hex).hue }));
  const primary = ranked[0];
  const secondary = ranked.find(c => hueDistance(c.hue, primary.hue) > 40);
  const tertiary = ranked.find(
    c => c !== secondary && hueDistance(c.hue, primary.hue) > 40 && (!secondary || hueDistance(c.hue, secondary.hue) > 30),
  );
  return {
    primary: primary.hex,
    secondary: secondary ? secondary.hex : shiftLightness(primary.hex, 0.12),
    tertiary: tertiary ? tertiary.hex : shiftLightness(primary.hex, -0.1),
  };
};

/** Scale every stop toward black — a dark tint of the cover, never a bright one. */
export const shadePalette = (p: AuraPalette, factor: number): AuraPalette => {
  const shade = (hex: string) => {
    const [r, g, b] = hexToRgb(hex);
    return toHex(r * 255 * factor, g * 255 * factor, b * 255 * factor);
  };
  return { primary: shade(p.primary), secondary: shade(p.secondary), tertiary: shade(p.tertiary) };
};

/**
 * Text-safe accent from the cover: Allegra's `color-mix(art-primary 62%, #fff)`.
 * Used for eyebrows — tinted by the song, always readable on the dark room.
 */
export const accentInk = (p: AuraPalette): string => {
  const [r, g, b] = hexToRgb(p.primary);
  const mix = (c: number) => (c * 0.62 + 0.38) * 255;
  return toHex(mix(r), mix(g), mix(b));
};

/**
 * A calm mid-dark tone of the cover for small chrome (the mini player pill):
 * the cover's hue, desaturated, at a fixed lightness so white text always reads.
 */
export const pillTint = (hex: string): string => {
  const { hue, sat } = hexToHsl(hex);
  return hslToHex(hue, Math.min(0.3, Math.max(0.12, sat * 0.45)), 0.3);
};

/**
 * YouTube Music's player background: the cover's colour at the top washing
 * down into near-black, so the controls always read. Returns [top, middle,
 * bottom]; the hue is the cover's, lightness is clamped so a pale cover never
 * glares and a dark one still shows its colour.
 */
export const youtubeWash = (hex: string): [string, string, string] => {
  const { hue, sat, light } = hexToHsl(hex);
  const s = Math.min(0.6, sat);
  const top = hslToHex(hue, s, Math.min(0.34, Math.max(0.2, light * 0.6)));
  const middle = hslToHex(hue, s * 0.8, Math.min(0.16, Math.max(0.09, light * 0.28)));
  return [top, middle, '#0a0a0b'];
};

/** A colour a fraction `t` of the way from `a` to `b` (0 = a, 1 = b). */
export const mixHex = (a: string, b: string, t: number): string => {
  const ra = hexToRgb(a);
  const rb = hexToRgb(b);
  const k = Math.min(1, Math.max(0, t));
  return toHex(...(ra.map((v, i) => (v + (rb[i] - v) * k) * 255) as [number, number, number]));
};

/** Where YouTubeBackdrop's gradient puts the three wash colours (top .. bottom). */
export const WASH_STOPS = [0, 0.5, 0.9] as const;

/** The wash colour at a height (0 top .. 1 bottom), so a layer can hand over to it seamlessly. */
export const washAt = (colors: readonly [string, string, string], at: number): string => {
  if (at <= WASH_STOPS[1]) return mixHex(colors[0], colors[1], (at - WASH_STOPS[0]) / (WASH_STOPS[1] - WASH_STOPS[0]));
  if (at <= WASH_STOPS[2]) return mixHex(colors[1], colors[2], (at - WASH_STOPS[1]) / (WASH_STOPS[2] - WASH_STOPS[1]));
  return colors[2];
};
