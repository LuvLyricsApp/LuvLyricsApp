import { deepenLane, freshSongs, laneSpecs, loadLane, MAX_ARTIST_LANES, needsDeepening, warmAround } from './luvsLanes';
import type { UnifiedSong } from '../types/song';

const s = (id: string, title: string, artist: string, url = `https://cdn/${id}`): UnifiedSong => ({
  id, title, artist, highResArt: '', downloadUrl: url, source: 'Saavn',
});

describe('laneSpecs', () => {
  it('puts For you first, one lane per artist, then the moods', () => {
    const lanes = laneSpecs([s('1', 'Hukum', 'Anirudh Ravichander, Subu'), s('2', 'Kaavaalaa', 'Anirudh Ravichander'), s('3', 'Levitating', 'Dua Lipa')]);
    expect(lanes.map(l => l.title)).toEqual(['For you', 'Anirudh Ravichander', 'Dua Lipa', 'Chill', 'Energy']);
    expect(lanes[1].subtitle).toBe('More like Anirudh Ravichander');
  });

  it('caps the artist lanes', () => {
    const seeds = Array.from({ length: 9 }, (_, i) => s(`${i}`, `T${i}`, `Artist ${i}`));
    expect(laneSpecs(seeds).filter(l => l.kind === 'artist')).toHaveLength(MAX_ARTIST_LANES);
  });
});

describe('freshSongs', () => {
  it('drops songs already in the lane, by id or by title and artist, and unplayable ones', () => {
    const lane = [s('a', 'Hukum', 'Anirudh')];
    const incoming = [s('a', 'X', 'Y'), s('b', 'hukum ', 'anirudh'), s('c', 'New', 'Z', ''), s('d', 'Fresh', 'Z')];
    expect(freshSongs(lane, incoming).map(x => x.id)).toEqual(['d']);
  });
});

describe('deepening', () => {
  it('grows a lane three songs before its end', () => {
    expect(needsDeepening(6, 10, false)).toBe(false);
    expect(needsDeepening(7, 10, false)).toBe(true);
    expect(needsDeepening(7, 10, true)).toBe(false);
  });

  it('follows the radio of the song the listener is on', async () => {
    const recommend = jest.fn(async () => [s('x', 'Next', 'A'), s('a', 'Dup', 'A')]);
    const songs = [s('a', 'One', 'A'), s('b', 'Two', 'A')];
    const more = await deepenLane(songs, 1, { recommend, moodMix: jest.fn() });
    expect(recommend).toHaveBeenCalledWith(songs[1], 12);
    expect(more.map(x => x.id)).toEqual(['x']);
  });

  it('loads an artist lane from its seed radio without the seed', async () => {
    const seed = s('seed', 'Hukum', 'Anirudh');
    const recommend = jest.fn(async () => [s('seed', 'Hukum', 'Anirudh'), s('n', 'Kaavaalaa', 'Anirudh')]);
    const songs = await loadLane({ id: 'artist:anirudh', kind: 'artist', title: 'Anirudh', subtitle: '', seed }, { recommend, moodMix: jest.fn() });
    expect(songs.map(x => x.id)).toEqual(['n']);
  });
});

describe('warmAround', () => {
  it('keeps the next two, the previous one and the neighbouring lanes warm', () => {
    const lanes = [
      { songs: [s('l0a', 'a', 'x'), s('l0b', 'b', 'x')] },
      { songs: [s('l1a', 'a', 'y'), s('l1b', 'b', 'y'), s('l1c', 'c', 'y'), s('l1d', 'd', 'y')] },
      { songs: [s('l2a', 'a', 'z')] },
    ];
    expect(warmAround(lanes, 1, [1, 1, 0]).map(x => x.id)).toEqual(['l1c', 'l1d', 'l1a', 'l0b', 'l2a']);
  });
});
