import { buildHomeFeed, FeedSources, pickForgottenFavorites, seedScore } from './homeFeed';
import { dedupeStreamable, isOnDevice, isStreamSongId, parseStreamId, streamIdFor, toStreamSong } from './streamSong';
import { hookOffsetSeconds } from '../luvsHook';
import { Song, UnifiedSong } from '../../types/song';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse('2026-09-27T12:00:00Z');

const track = (id: string, title = `Song ${id}`, artist = 'Artist A'): UnifiedSong => ({
  id,
  title,
  artist,
  highResArt: `https://img/${id}.jpg`,
  downloadUrl: `https://cdn/${id}.mp4`,
  source: 'Saavn',
  duration: 200,
});

const local = (id: string, extra: Partial<Song> = {}): Song => ({
  id,
  title: `Local ${id}`,
  artist: 'Local Artist',
  gradientId: 'dynamic',
  duration: 180,
  dateCreated: '2026-01-01T00:00:00Z',
  dateModified: '2026-01-01T00:00:00Z',
  playCount: 0,
  lyrics: [],
  audioUri: `file:///music/${id}.mp3`,
  ...extra,
});

/** Deterministic "shuffle": always swap with itself. */
const noShuffle = () => 0.999999;

describe('streamSong', () => {
  it('round-trips stream ids', () => {
    const id = streamIdFor(track('abc'));
    expect(id).toBe('stream:saavn:abc');
    expect(isStreamSongId(id)).toBe(true);
    expect(isStreamSongId('42')).toBe(false);
    expect(parseStreamId(id)).toEqual({ source: 'saavn', providerId: 'abc' });
    expect(parseStreamId('stream:broken')).toBeNull();
  });

  it('maps a catalog track to a transient player Song', () => {
    const song = toStreamSong(track('abc'), '2026-09-27T00:00:00Z');
    expect(song).toEqual(expect.objectContaining({
      id: 'stream:saavn:abc',
      audioUri: 'https://cdn/abc.mp4',
      coverImageUri: 'https://img/abc.jpg',
      lyrics: [],
      duration: 200,
    }));
  });

  it('dedupes by id and by title+artist, and drops unplayable tracks', () => {
    const reupload = { ...track('zzz', 'Song a'), artist: 'Artist A' };
    const noUrl = { ...track('nourl'), downloadUrl: '' };
    const out = dedupeStreamable([track('a', 'Song a'), track('a', 'Song a'), reupload, noUrl, track('b')], ['stream:saavn:b']);
    expect(out.map(s => s.id)).toEqual(['a']);
  });

  it('tells device files from streams', () => {
    expect(isOnDevice('file:///x.mp3')).toBe(true);
    expect(isOnDevice('content://media/1')).toBe(true);
    expect(isOnDevice('https://cdn/x.mp4')).toBe(false);
    expect(isOnDevice(undefined)).toBe(false);
  });
});

describe('hookOffsetSeconds', () => {
  it('starts short clips from the top', () => {
    expect(hookOffsetSeconds(undefined)).toBe(0);
    expect(hookOffsetSeconds(60)).toBe(0);
    expect(hookOffsetSeconds('bad')).toBe(0);
  });

  it('lands around 30% in, clamped to 25–70s', () => {
    expect(hookOffsetSeconds(100)).toBe(30);
    expect(hookOffsetSeconds(90)).toBe(27);
    expect(hookOffsetSeconds(200)).toBe(60);
    expect(hookOffsetSeconds(600)).toBe(70);
    expect(hookOffsetSeconds('200')).toBe(60);
  });
});

describe('seedScore', () => {
  it('favours songs played often and lately', () => {
    const fresh = seedScore({ song: track('a'), plays: 3, playedAt: NOW }, NOW);
    const stale = seedScore({ song: track('b'), plays: 3, playedAt: NOW - 30 * DAY }, NOW);
    expect(fresh).toBeGreaterThan(stale);
  });
});

describe('pickForgottenFavorites', () => {
  it('keeps liked or replayed downloads untouched for two weeks', () => {
    const songs = [
      local('liked-old', { isLiked: true, lastPlayed: new Date(NOW - 20 * DAY).toISOString() }),
      local('liked-recent', { isLiked: true, lastPlayed: new Date(NOW - 2 * DAY).toISOString() }),
      local('replayed-never', { playCount: 5 }),
      local('meh', { playCount: 1 }),
      local('streamed', { isLiked: true, audioUri: 'https://cdn/x.mp4' }),
    ];
    expect(pickForgottenFavorites(songs, NOW).map(s => s.id)).toEqual(['replayed-never', 'liked-old']);
  });
});

describe('buildHomeFeed', () => {
  const radio: Record<string, UnifiedSong[]> = {
    seed1: [track('r1'), track('r2'), track('seed2')],
    seed2: [track('r3'), track('r1'), track('r4')],
  };
  const sources = (overrides: Partial<FeedSources> = {}): FeedSources => ({
    searchMusic: jest.fn(async (q: string) => (q === 'Artist A' ? [track('s1'), track('s2'), track('s3'), track('x', 'X', 'Other')] : [])),
    getRecommendations: jest.fn(async (id: string) => radio[id] ?? []),
    ...overrides,
  });

  it('builds radio-based quick picks without replaying history', async () => {
    const history = [
      { song: track('seed1'), plays: 5, playedAt: NOW - DAY },
      { song: track('seed2'), plays: 2, playedAt: NOW - 2 * DAY },
    ];
    const feed = await buildHomeFeed({ localSongs: [], history, now: NOW, random: noShuffle }, sources());

    expect(feed.coldStart).toBe(false);
    const ids = feed.quickPicks.map(s => s.id);
    expect(ids.sort()).toEqual(['r1', 'r2', 'r3', 'r4']); // seed2 was already played; r1 deduped
    expect(feed.keepListening.map(s => s.id)).toEqual(['seed1', 'seed2']);
    expect(feed.dailyDiscover.map(d => [d.seed.id, d.recommendation.id])).toEqual([
      ['seed1', 'r1'],
      ['seed2', 'r3'],
    ]);
    expect(feed.similar).toEqual([{ artist: 'Artist A', songs: [track('s1'), track('s2'), track('s3')] }]);
  });

  it('seeds from the most-played downloads when nothing was streamed', async () => {
    const src = sources({
      searchMusic: jest.fn(async (q: string) => (q.startsWith('Local hit') ? [track('seed1', 'Local hit')] : [])),
    });
    const feed = await buildHomeFeed(
      { localSongs: [local('1', { title: 'Local hit', playCount: 9 })], history: [], now: NOW, random: noShuffle },
      src,
    );
    expect(src.getRecommendations).toHaveBeenCalledWith('seed1');
    expect(feed.quickPicks.length).toBeGreaterThan(0);
  });

  it('falls back to charts in the preferred languages on a cold start', async () => {
    const src = sources({ searchMusic: jest.fn(async (q: string) => [track(q.replace(/\s/g, '-'), q)]) });
    const feed = await buildHomeFeed({ localSongs: [], history: [], languages: ['Tamil'], now: NOW, random: noShuffle }, src);
    expect(feed.coldStart).toBe(true);
    expect(src.searchMusic).toHaveBeenCalledWith('Tamil top hits');
    expect(feed.quickPicks.map(s => s.title)).toEqual(['Tamil top hits']);
  });

  it('survives every provider failing', async () => {
    const failing: FeedSources = {
      searchMusic: jest.fn(async () => { throw new Error('offline'); }),
      getRecommendations: jest.fn(async () => { throw new Error('offline'); }),
    };
    const feed = await buildHomeFeed(
      { localSongs: [], history: [{ song: track('seed1'), plays: 1, playedAt: NOW }], now: NOW, random: noShuffle },
      failing,
    );
    expect(feed.quickPicks).toEqual([]);
    expect(feed.keepListening.map(s => s.id)).toEqual(['seed1']);
  });
});
