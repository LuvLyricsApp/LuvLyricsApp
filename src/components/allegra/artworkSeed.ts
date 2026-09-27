/**
 * Pure, deterministic inputs for GeneratedArtwork (colour pair + monogram), kept
 * free of React Native imports so they are unit-testable.
 */

/**
 * Duotones drawn from Allegra's palette family — deep base + luminous lift.
 * Each reads as intentional artwork on the dark room, never as an error state.
 */
const DUOTONES: [string, string, string][] = [
  ['#2a1b3d', '#ee6b5f', '#ffaaa0'], // plum → coral
  ['#0f2a3a', '#7bafd4', '#d9e66a'], // ink → sky, lime spark
  ['#1f2a14', '#9cc15a', '#e8f2a6'], // moss → lime
  ['#2d1030', '#c15fb6', '#ffc6f2'], // aubergine → orchid
  ['#12243b', '#4b6cff', '#9fd3ff'], // navy → cobalt
  ['#3a1a10', '#ff8a4c', '#ffd29c'], // rust → amber
  ['#0e2b2a', '#2bb5a0', '#a6f0e0'], // deep teal → mint
  ['#291d0c', '#e0a43a', '#ffe7a8'], // umber → gold
  ['#1d1433', '#8e7bff', '#d5ceff'], // indigo → lavender
  ['#33101c', '#e0457b', '#ffb3cc'], // wine → rose
];

/* eslint-disable no-bitwise -- FNV-1a is defined in terms of xor and 32-bit wrap. */
/** FNV-1a — stable across sessions and platforms. */
export const hashString = (value: string): number => {
  let h = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
};
/* eslint-enable no-bitwise */

/** First letter-ish glyph of the title, skipping quotes, brackets and "The ". */
export const monogramOf = (title: string): string => {
  const cleaned = title.replace(/^(the|a|an)\s+/i, '').replace(/^[^\p{L}\p{N}]+/u, '');
  const glyph = Array.from(cleaned)[0] ?? '♪';
  return glyph.toUpperCase();
};

export const duotoneFor = (seed: string): [string, string, string] => DUOTONES[hashString(seed) % DUOTONES.length];
