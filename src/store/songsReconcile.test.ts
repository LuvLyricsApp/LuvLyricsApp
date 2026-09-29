import { Song } from '../types/song';
import { reconcileSongs, sameSongRow } from './songsReconcile';

const song = (id: string, over: Partial<Song> = {}): Song => ({
  id,
  title: `Song ${id}`,
  artist: 'Artist',
  gradientId: '1',
  duration: 200,
  dateCreated: '2026-01-01T00:00:00.000Z',
  dateModified: '2026-01-01T00:00:00.000Z',
  playCount: 0,
  lyrics: [],
  isLiked: false,
  isHidden: false,
  ...over,
});

describe('reconcileSongs', () => {
  it('returns the old array when a refetch changed nothing', () => {
    const prev = [song('a'), song('b')];
    const next = [song('a'), song('b')];
    expect(reconcileSongs(prev, next)).toBe(prev);
  });

  it('reuses the objects of rows that did not change and takes the new one that did', () => {
    const prev = [song('a'), song('b'), song('c')];
    const next = [song('a'), song('b', { playCount: 3 }), song('c')];
    const merged = reconcileSongs(prev, next);
    expect(merged).not.toBe(prev);
    expect(merged[0]).toBe(prev[0]);
    expect(merged[1]).toBe(next[1]);
    expect(merged[2]).toBe(prev[2]);
  });

  it('follows the new order and reuses moved rows', () => {
    const prev = [song('a'), song('b')];
    const next = [song('b'), song('a')];
    const merged = reconcileSongs(prev, next);
    expect(merged.map(s => s.id)).toEqual(['b', 'a']);
    expect(merged[0]).toBe(prev[1]);
    expect(merged[1]).toBe(prev[0]);
  });

  it('adds and removes rows', () => {
    const prev = [song('a'), song('b')];
    expect(reconcileSongs(prev, [song('a')])).toHaveLength(1);
    const grown = reconcileSongs(prev, [song('a'), song('b'), song('c')]);
    expect(grown.map(s => s.id)).toEqual(['a', 'b', 'c']);
    expect(grown[0]).toBe(prev[0]);
  });

  it('handles an empty library either way', () => {
    const empty: Song[] = [];
    expect(reconcileSongs(empty, [])).toBe(empty);
    expect(reconcileSongs(empty, [song('a')])).toHaveLength(1);
  });
});

describe('sameSongRow', () => {
  it('sees a new cover, a like and a play as changes', () => {
    expect(sameSongRow(song('a'), song('a', { coverImageUri: 'file://c.jpg' }))).toBe(false);
    expect(sameSongRow(song('a'), song('a', { isLiked: true }))).toBe(false);
    expect(sameSongRow(song('a'), song('a', { lastPlayed: '2026-02-02T00:00:00.000Z' }))).toBe(false);
  });
});
