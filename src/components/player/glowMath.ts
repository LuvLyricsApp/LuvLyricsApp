/** Echo Music's GLOW_ANIMATED maths (Player.kt / MiniPlayer.kt), shared by GlowBackground. */

export type Osc = [min: number, max: number, phase: number];
export interface Blob { ox: Osc; oy: Osc; r: Osc | number; alphas: number[] }

/** Player.kt: six glows (centre x/y, radius as a share of width, alpha stops). */
export const PLAYER_BLOBS: Blob[] = [
  { ox: [0.0, 1.0, 0.0], oy: [0.0, 0.5, 0.07], r: [0.8, 1.6, 0.12], alphas: [0.85, 0.5] },
  { ox: [1.0, 0.0, 0.2], oy: [0.5, 1.0, 0.25], r: [0.7, 1.5, 0.18], alphas: [0.8, 0.45] },
  { ox: [0.2, 0.8, 0.33], oy: [0.8, 0.2, 0.36], r: [0.6, 1.4, 0.29], alphas: [0.75, 0.4] },
  { ox: [0.3, 0.7, 0.44], oy: [0.2, 0.8, 0.41], r: [0.9, 1.7, 0.47], alphas: [0.7, 0.35] },
  { ox: [0.4, 0.6, 0.55], oy: [0.0, 1.0, 0.51], r: [0.7, 1.5, 0.58], alphas: [0.65, 0.3] },
  { ox: [0.0, 1.0, 0.66], oy: [0.5, 0.7, 0.62], r: [0.8, 1.8, 0.69], alphas: [0.6, 0.25] },
];

/** MiniPlayer.kt: two glows, fixed radii. */
export const MINI_BLOBS: Blob[] = [
  { ox: [0.0, 1.0, 0.0], oy: [0.0, 0.5, 0.1], r: 1.2, alphas: [0.8] },
  { ox: [1.0, 0.0, 0.2], oy: [0.5, 1.0, 0.3], r: 1.0, alphas: [0.7] },
];

export const CYCLE_S = 20;
export const FADE_MS = 1200;
export const BASE = '#050505';

export const toRgb = (hex: string): number[] => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return [40, 40, 40];
  return [0, 2, 4].map(i => parseInt(m[1].slice(i, i + 2), 16));
};

export const oscillate = (o: Osc, p: number): number => {
  'worklet';
  const v = Math.sin(2 * Math.PI * (p + o[2]));
  return o[0] + (o[1] - o[0]) * ((v + 1) * 0.5);
};

/** Echo's rotatedColorAt: the colour `index` steps round the palette, lerped. */
export const rotatedColorAt = (palette: number[][], index: number, p: number): number[] => {
  'worklet';
  const n = palette.length;
  if (n === 0) return [40, 40, 40];
  const idx = index + p * n;
  const a = Math.floor(idx) % n;
  const b = (a + 1) % n;
  const f = idx - Math.floor(idx);
  const ca = palette[a];
  const cb = palette[b];
  return [ca[0] + (cb[0] - ca[0]) * f, ca[1] + (cb[1] - ca[1]) * f, ca[2] + (cb[2] - ca[2]) * f];
};

export const rgba = (c: number[], a: number): string => {
  'worklet';
  return `rgba(${Math.round(c[0])}, ${Math.round(c[1])}, ${Math.round(c[2])}, ${a})`;
};

