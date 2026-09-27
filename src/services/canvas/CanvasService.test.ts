import { CanvasService, cleanTitleForLookup } from './CanvasService';
import {
  extractEditorialVideoUrl,
  fetchAppleMusicCanvas,
  fetchEchoCanvas,
  fetchTidalCanvas,
  resetEchoManifestCache,
  tidalVideoUrl,
} from './providers';
import { artistsOverlap, isBlacklistedCollection, scoreResult } from './matching';
import { mockFetch } from '../testing/mockFetch';

const ECHO = 'https://canvas.echomusic.fun/canvas.json';
const ARTIST_VIDEO = 'https://artwork-archivetune.koiiverse.cloud/';
const TIDAL = 'https://api.tidal.com/v1/search';
const APPLE = 'https://api.music.apple.com/v1/catalog';

afterEach(() => {
  CanvasService.clearCache();
  resetEchoManifestCache();
});

describe('matching', () => {
  it('splits featured artists before comparing', () => {
    expect(artistsOverlap('Dua Lipa feat. DaBaby', 'DaBaby')).toBe(true);
    expect(artistsOverlap('Arijit Singh & Shreya Ghoshal', 'Shreya Ghoshal')).toBe(true);
    expect(artistsOverlap('Taylor Swift', 'Drake')).toBe(false);
  });

  it('rejects compilations and sessions', () => {
    expect(isBlacklistedCollection('Today\'s Hits')).toBe(true);
    expect(isBlacklistedCollection('Live Session', 'x')).toBe(true);
    expect(isBlacklistedCollection('Future Nostalgia')).toBe(false);
  });

  it('prefers the exact studio album over an unexpected deluxe', () => {
    const base = { term: 'Levitating', artist: 'Dua Lipa', album: 'Future Nostalgia', resultArtist: 'Dua Lipa' };
    const studio = scoreResult({ ...base, resultName: 'Levitating', resultCollection: 'Future Nostalgia' });
    const deluxe = scoreResult({ ...base, resultName: 'Levitating (Deluxe)', resultCollection: 'Future Nostalgia (Deluxe)' });
    expect(studio).not.toBeNull();
    expect(deluxe).not.toBeNull();
    expect(studio!).toBeGreaterThan(deluxe!);
    expect(scoreResult({ ...base, resultName: 'Levitating', resultArtist: 'Someone Else' })).toBeNull();
  });
});

describe('cleanTitleForLookup', () => {
  it('strips video/lyrics tags, features and extensions', () => {
    expect(cleanTitleForLookup('Blinding Lights (Official Video)')).toBe('Blinding Lights');
    expect(cleanTitleForLookup('Song [Lyrics] (feat. Someone).mp3')).toBe('Song');
    expect(cleanTitleForLookup('Marandhaye (From "Teddy")')).toBe('Marandhaye');
  });
});

describe('provider helpers', () => {
  it('builds Tidal video paths from the cover uuid', () => {
    expect(tidalVideoUrl('aa-bb-cc-dd-ee')).toBe('https://resources.tidal.com/videos/aa/bb/cc/dd/ee/1280x1280.mp4');
    expect(tidalVideoUrl('not-a-uuid')).toBeNull();
  });

  it('prefers square motion over tall', () => {
    expect(extractEditorialVideoUrl({
      motionDetailTall: { video: 'tall.m3u8' },
      motionDetailSquare: { video: 'square.m3u8' },
    })).toBe('square.m3u8');
    expect(extractEditorialVideoUrl(undefined)).toBeNull();
  });
});

describe('fetchEchoCanvas', () => {
  it('matches manifest entries loosely by song and artist', async () => {
    const f = mockFetch([[ECHO, { items: [{ song: 'Starboy', artist: 'The Weeknd', url: 'https://x/starboy.mp4' }] }]]);
    const hit = await fetchEchoCanvas({ title: 'Starboy', artist: 'The Weeknd, Daft Punk' });
    f.restore();
    expect(hit).toEqual(expect.objectContaining({ url: 'https://x/starboy.mp4', source: 'EchoCanvas', isHls: false }));
  });
});

describe('token-gated providers', () => {
  it('skip the network entirely without a user token', async () => {
    const f = mockFetch([]);
    expect(await fetchTidalCanvas({ title: 'a', artist: 'b' }, {})).toBeNull();
    expect(await fetchAppleMusicCanvas({ title: 'a', artist: 'b' }, {})).toBeNull();
    f.restore();
    expect(f.calls).toHaveLength(0);
  });

  it('Tidal: validates artist and returns the video cover', async () => {
    const f = mockFetch([[TIDAL, {
      tracks: {
        items: [
          { title: 'Starboy', artist: { name: 'Someone Else' }, album: { videoCover: '1-2-3-4-5' } },
          { title: 'Starboy', artist: { name: 'The Weeknd' }, album: { title: 'Starboy', videoCover: 'a-b-c-d-e' } },
        ],
      },
    }]]);
    const hit = await fetchTidalCanvas({ title: 'Starboy', artist: 'The Weeknd' }, { tidalToken: 'tok' });
    f.restore();
    expect(hit?.url).toBe('https://resources.tidal.com/videos/a/b/c/d/e/1280x1280.mp4');
  });

  it('Apple: resolves song -> album -> editorial motion with the user token', async () => {
    const f = mockFetch([
      [`${APPLE}/us/search`, {
        results: {
          songs: {
            data: [{
              id: '1',
              type: 'songs',
              attributes: { name: 'Levitating', artistName: 'Dua Lipa', albumName: 'Future Nostalgia' },
              relationships: { albums: { data: [{ id: '1500' }] } },
            }],
          },
        },
      }],
      [`${APPLE}/us/albums/1500`, {
        data: [{ attributes: { name: 'Future Nostalgia', editorialVideo: { motionDetailSquare: { video: 'https://mvod/x.m3u8' } } } }],
      }],
    ]);
    const hit = await fetchAppleMusicCanvas({ title: 'Levitating', artist: 'Dua Lipa', album: 'Future Nostalgia' }, { appleMusicToken: 'dev-token' });
    f.restore();
    expect(hit).toEqual(expect.objectContaining({ url: 'https://mvod/x.m3u8', source: 'AppleMusic', isHls: true, albumName: 'Future Nostalgia' }));
  });
});

describe('CanvasService.resolve', () => {
  it('walks the cascade in order and falls through dead providers', async () => {
    const f = mockFetch([
      [ECHO, null], // manifest down
      [ARTIST_VIDEO, { artist: 'Arijit Singh', animated: 'https://cdn/loop.mp4' }],
    ]);
    const hit = await CanvasService.resolve({ title: 'Tum Hi Ho', artist: 'Arijit Singh' });
    f.restore();
    expect(hit?.source).toBe('ArtistVideo');
    expect(f.calls[0]).toBe(ECHO);
  });

  it('caches hits so a re-open never refetches', async () => {
    const f = mockFetch([[ECHO, { items: [{ song: 'A', artist: 'B', url: 'https://x/a.mp4' }] }]]);
    await CanvasService.resolve({ title: 'A', artist: 'B' });
    const callsAfterFirst = f.calls.length;
    const again = await CanvasService.resolve({ title: 'A', artist: 'B' });
    f.restore();
    expect(again?.url).toBe('https://x/a.mp4');
    expect(f.calls.length).toBe(callsAfterFirst);
  });

  it('retries the free sources with the lead artist and without the film tag', async () => {
    const f = mockFetch([
      [ECHO, { items: [] }],
      // The archive files the song under its lead artist only.
      [ARTIST_VIDEO, (url: string) => (url.endsWith('a=D.%20Imman')
        ? { artist: 'D. Imman', animated: 'https://cdn/marandhaye.mp4' }
        : null)],
    ]);
    const hit = await CanvasService.resolve({ title: 'Marandhaye (From "Teddy")', artist: 'D. Imman, Pradeep Kumar, Jonita Gandhi' });
    f.restore();
    expect(hit?.url).toBe('https://cdn/marandhaye.mp4');
    expect(f.calls.every(u => !u.includes('Teddy'))).toBe(true);
  });

  it('returns null for unknown artists without calling anything', async () => {
    const f = mockFetch([]);
    expect(await CanvasService.resolve({ title: 'Song', artist: 'Unknown Artist' })).toBeNull();
    f.restore();
    expect(f.calls).toHaveLength(0);
  });
});
