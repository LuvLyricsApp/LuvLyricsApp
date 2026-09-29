/**
 * Keeps the library array stable across refetches.
 *
 * Library re-reads every row each time its tab is focused, and until now put
 * the fresh array in the store even when nothing had changed, which re-ran
 * every sort and grouping built on it and re-rendered every mounted screen
 * that reads `songs`. `reconcileSongs` hands back the old array when the rows
 * are the same, and otherwise reuses each unchanged row's object so memoised
 * rows skip their render.
 */
import { Song } from '../types/song';

/** What `getAllSongs` reads from a row. Lyrics are not loaded into the list. */
const ROW_FIELDS = [
  'title',
  'artist',
  'album',
  'gradientId',
  'duration',
  'dateCreated',
  'dateModified',
  'playCount',
  'lastPlayed',
  'scrollSpeed',
  'coverImageUri',
  'lyricsAlign',
  'textCase',
  'audioUri',
  'isLiked',
  'isHidden',
] as const;

export const sameSongRow = (a: Song, b: Song): boolean =>
  ROW_FIELDS.every(field => a[field] === b[field]) && a.lyrics.length === b.lyrics.length;

export const reconcileSongs = (prev: Song[], next: Song[]): Song[] => {
  if (prev === next) return prev;
  const previous = new Map<string, Song>();
  for (const song of prev) previous.set(song.id, song);

  let changed = prev.length !== next.length;
  const merged = next.map((row, index) => {
    const old = previous.get(row.id);
    const kept = old && sameSongRow(old, row) ? old : row;
    if (kept !== prev[index]) changed = true;
    return kept;
  });
  return changed ? merged : prev;
};
