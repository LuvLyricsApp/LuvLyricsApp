import { loadTaste, resetTasteCache, tasteRecommendations, tasteSeeds } from './luvsTaste';
import { Song, UnifiedSong } from '../types/song';
import { StreamPlay } from '../store/streamHistoryStore';

const DAY = 24 * 60 * 60 * 1000;
const NOW = 1_800_000_000_000;

const u = (id: string, title: string, artist: string, url = 'https://a/x.mp4'): UnifiedSong => ({
  id, title, artist, highResArt: '', downloadUrl: url, source: 'Saavn',
});
const play = (song: UnifiedSong, plays: number, daysAgo: number): StreamPlay => ({ song, plays, playedAt: NOW - daysAgo * DAY });
const local = (id: string, title: string, artist: string, playCount: number): Song => ({
  id, title, artist, playCount, gradientId: '1', duration: 200, dateCreated: '', dateModified: '', lyrics: [],
});

beforeEach(() => resetTasteCache());

describe('tasteSeeds', () => {
  it('favours recent, repeated plays over old ones', () => {
    const seeds = tasteSeeds([
      play(u('1', 'Old Favourite', 'Artist A'), 10, 30),
      play(u('2', 'This Week', 'Artist B'), 4, 0.5),
    ], [], NOW);
    expect(seeds.map(s => s.id)).toEqual(['2', '1']);
  });

  it('takes one seed per artist, counting the lead artist of a feature', () => {
    const seeds = tasteSeeds([
      play(u('1', 'Kesariya', 'Arijit Singh'), 5, 1),
      play(u('2', 'Tum Hi Ho', 'Arijit Singh'), 5, 1),
      play(u('3', 'Duet', 'Arijit Singh, Shreya Ghoshal'), 5, 1),
      play(u('4', 'Levitating', 'Dua Lipa'), 1, 1),
    ], [], NOW);
    expect(seeds.map(s => s.id)).toEqual(['1', '4']);
  });

  it('falls back to the most-played library songs', () => {
    const seeds = tasteSeeds([], [local('a', 'Rarely', 'X', 1), local('b', 'Often', 'Y', 40), local('c', 'Never', 'Z', 0)], NOW);
    expect(seeds.map(s => s.id)).toEqual(['b', 'a']);
  });
});

describe('tasteRecommendations', () => {
  it('round-robins across seeds, dropping seeds, duplicates and unplayable songs', async () => {
    const seeds = [u('s1', 'Seed One', 'A'), u('s2', 'Seed Two', 'B')];
    const recommend = jest.fn(async (seed: UnifiedSong) =>
      seed.id === 's1'
        ? [u('a1', 'A One', 'P'), u('dup', 'Shared', 'Q'), u('seed', 'Seed Two', 'B')]
        : [u('b1', 'B One', 'R'), u('dup2', 'Shared', 'Q'), u('nourl', 'Silent', 'S', '')]);
    const out = await tasteRecommendations(seeds, recommend);
    expect(out.map(s => s.id)).toEqual(['a1', 'b1', 'dup']);
  });

  it('survives a seed whose radio fails', async () => {
    const recommend = jest.fn(async (seed: UnifiedSong) => {
      if (seed.id === 'bad') throw new Error('offline');
      return [u('ok', 'Fine', 'Z')];
    });
    const out = await tasteRecommendations([u('bad', 'X', 'A'), u('good', 'Y', 'B')], recommend);
    expect(out.map(s => s.id)).toEqual(['ok']);
  });
});

describe('loadTaste', () => {
  it('caches per seed set', async () => {
    const recommend = jest.fn(async () => [u('r', 'Rec', 'Z')]);
    const plays = [play(u('1', 'Song', 'A'), 2, 0)];
    await loadTaste(plays, [], recommend);
    await loadTaste(plays, [], recommend);
    expect(recommend).toHaveBeenCalledTimes(1);
    expect(await loadTaste([], [], recommend)).toEqual([]);
  });
});
