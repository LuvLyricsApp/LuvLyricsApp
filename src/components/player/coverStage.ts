/**
 * The pure rules behind the Now Playing cover stage and the Up next panel:
 * whether the cover is full-bleed, where a double-tap seeks to, what the
 * panel says it is playing from, and how a dragged row moves the queue.
 */
import type { PlayerBackground } from '../../store/settingsStore';

/** YouTube Music's double-tap step. */
export const SEEK_STEP_S = 5;

/**
 * Whether the cover runs full-bleed. The Apple styles use "Apple Music
 * inspired" (off = a floating card); the card styles (YouTube Music, Shader
 * wash) have their own switch, so a tap never changes the background style.
 */
export const isCoverFull = (style: PlayerBackground, appleInspired: boolean, cardFull: boolean): boolean =>
  style === 'youtube' || style === 'aura' ? cardFull : appleInspired;

/** Where a double-tap lands: `delta` seconds on, kept inside the song (never past its last half second). */
export const seekTarget = (position: number, duration: number, delta: number): number => {
  const end = duration > 0 ? Math.max(0, duration - 0.5) : Math.max(0, position + delta);
  return Math.min(end, Math.max(0, position + delta));
};

/** Which half of the cover a tap at `x` hit: -1 = left (back), 1 = right (forward). */
export const seekSide = (x: number, width: number): -1 | 1 => (x < width / 2 ? -1 : 1);

/** The "Playing from" line, like YouTube Music's "MAYAKAMA mix". */
export const playingFromLabel = (
  playlistId: string | null | undefined,
  firstTitle: string | undefined,
  playlistName: string | undefined,
): string => {
  switch (playlistId) {
    case null:
    case undefined:
    case 'queue':
      return 'Your queue';
    case 'library':
      return 'Your library';
    case 'stream':
      return firstTitle ? `${firstTitle} mix` : 'Your mix';
    case 'search':
      return 'Search';
    case 'listen-together':
      return 'Listen together';
    case 'forgotten-favorites':
      return 'Forgotten favourites';
    default:
      return playlistName ?? 'Your queue';
  }
};

export type UpNextFilter = 'all' | 'familiar' | 'discover';

/** Queue positions a filter keeps. Familiar = on the phone already; Discover = everything else. */
export const filterQueue = (familiar: readonly boolean[], filter: UpNextFilter): number[] => {
  const out: number[] = [];
  familiar.forEach((f, i) => {
    if (filter === 'all' || (filter === 'familiar') === f) out.push(i);
  });
  return out;
};

/** The queue with the row at `from` moved to `to`. */
export const moveItem = <T>(items: readonly T[], from: number, to: number): T[] => {
  const out = items.slice();
  if (from < 0 || from >= out.length) return out;
  const target = Math.max(0, Math.min(out.length - 1, to));
  const [item] = out.splice(from, 1);
  out.splice(target, 0, item);
  return out;
};

/** Where a row dragged `dy` points lands, with rows `rowH` tall. */
export const dropIndex = (from: number, dy: number, rowH: number, count: number): number => {
  'worklet';
  return Math.max(0, Math.min(count - 1, from + Math.round(dy / rowH)));
};

/**
 * How far row `i` steps aside while row `from` is dragged over `to`: the rows
 * in between shift one place towards where the dragged row came from.
 */
export const rowShift = (i: number, from: number, to: number, rowH: number): number => {
  'worklet';
  if (from < 0 || i === from) return 0;
  if (from < to && i > from && i <= to) return -rowH;
  if (to < from && i >= to && i < from) return rowH;
  return 0;
};
