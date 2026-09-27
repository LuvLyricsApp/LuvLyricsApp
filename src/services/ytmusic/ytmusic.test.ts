import { oddElements, parseNext, parseRelatedSongs, parseSearchSongs, parseTime, splitBySeparator, YTSong } from './parsers';
import { matchScore, normalizeTitle, resolveMany, resolveToCatalog, clearResolverCache } from './resolver';
import { clearRecommendCache, findSeedVideoId, recommendFor, RecommendDeps } from '../stream/recommend';
import { UnifiedSong } from '../../types/song';

// ─── Fixture builders mirroring InnerTube WEB_REMIX renderers ──────────────

const artistRun = (name: string) => ({ text: name, navigationEndpoint: { browseEndpoint: { browseId: `UC_${name}` } } });
const albumRun = (name: string) => ({ text: name, navigationEndpoint: { browseEndpoint: { browseId: `MPRE_${name}` } } });
const SEP = { text: ' • ' };
const thumbs = (id: string) => ({ thumbnails: [{ url: `https://lh3.googleusercontent.com/${id}=w60-h60-l90-rj`, width: 60 }, { url: `https://lh3.googleusercontent.com/${id}=w120-h120-l90-rj`, width: 120 }] });

const responsiveRow = (videoId: string, title: string, artists: string[], opts: { album?: string; duration?: string; typeLabel?: boolean; videoType?: string } = {}) => {
  const artistRuns = artists.flatMap((a, i) => (i === 0 ? [artistRun(a)] : [{ text: ' & ' }, artistRun(a)]));
  const second = [
    ...(opts.typeLabel ? [{ text: 'Song' }, SEP] : []),
    ...artistRuns,
    ...(opts.album ? [SEP, albumRun(opts.album)] : []),
    ...(opts.duration ? [SEP, { text: opts.duration }] : []),
  ];
  return {
    musicResponsiveListItemRenderer: {
      flexColumns: [
        { musicResponsiveListItemFlexColumnRenderer: { text: { runs: [{ text: title, navigationEndpoint: { watchEndpoint: { videoId } } }] } } },
        { musicResponsiveListItemFlexColumnRenderer: { text: { runs: second } } },
      ],
      playlistItemData: { videoId },
      thumbnail: { musicThumbnailRenderer: { thumbnail: thumbs(videoId) } },
      overlay: {
        musicItemThumbnailOverlayRenderer: {
          content: {
            musicPlayButtonRenderer: {
              playNavigationEndpoint: {
                watchEndpoint: {
                  videoId,
                  watchEndpointMusicSupportedConfigs: { watchEndpointMusicConfig: { musicVideoType: opts.videoType ?? 'MUSIC_VIDEO_TYPE_ATV' } },
                },
              },
            },
          },
        },
      },
    },
  };
};

const panelVideo = (videoId: string, title: string, artist: string, length: string, album?: string) => ({
  playlistPanelVideoRenderer: {
    videoId,
    title: { runs: [{ text: title }] },
    longBylineText: { runs: [artistRun(artist), ...(album ? [SEP, albumRun(album)] : []), SEP, { text: '2021' }] },
    lengthText: { runs: [{ text: length }] },
    thumbnail: thumbs(videoId),
    navigationEndpoint: { watchEndpoint: { videoId } },
  },
});

const nextResponse = (contents: unknown[], relatedBrowseId?: string) => ({
  contents: {
    singleColumnMusicWatchNextResultsRenderer: {
      tabbedRenderer: {
        watchNextTabbedResultsRenderer: {
          tabs: [
            { tabRenderer: { content: { musicQueueRenderer: { content: { playlistPanelRenderer: { contents } } } } } },
            { tabRenderer: { endpoint: { browseEndpoint: { browseId: 'MPLYt_lyrics' } } } },
            { tabRenderer: { endpoint: { browseEndpoint: { browseId: relatedBrowseId } } } },
          ],
        },
      },
    },
  },
});

const catalog = (id: string, title: string, artist: string, duration?: number, source: UnifiedSong['source'] = 'Saavn'): UnifiedSong => ({
  id, title, artist, duration, source, highResArt: '', downloadUrl: `https://cdn/${id}.mp4`,
});

// ─── Parsers ────────────────────────────────────────────────────────────────

describe('run helpers', () => {
  it('splits bylines and keeps artist runs', () => {
    const parts = splitBySeparator([artistRun('A'), { text: ' & ' }, artistRun('B'), SEP, albumRun('X')]);
    expect(parts).toHaveLength(2);
    expect(oddElements(parts[0]).map(r => r.text)).toEqual(['A', 'B']);
  });

  it('parses clock text', () => {
    expect(parseTime('3:45')).toBe(225);
    expect(parseTime('1:02:03')).toBe(3723);
    expect(parseTime('soon')).toBeUndefined();
  });
});

describe('parseSearchSongs', () => {
  it('reads songs from the search shelf, skipping the type label and upscaling art', () => {
    const json = {
      contents: {
        tabbedSearchResultsRenderer: {
          tabs: [{ tabRenderer: { content: { sectionListRenderer: { contents: [{
            musicShelfRenderer: {
              contents: [
                responsiveRow('vid1', 'Blinding Lights', ['The Weeknd'], { album: 'After Hours', duration: '3:20', typeLabel: true }),
                responsiveRow('vid2', 'Save Your Tears', ['The Weeknd', 'Ariana Grande'], { duration: '3:11' }),
                { musicResponsiveListItemRenderer: { navigationEndpoint: { browseEndpoint: { browseId: 'UC_artist' } } } },
              ],
            },
          }] } } } }],
        },
      },
    };
    const songs = parseSearchSongs(json);
    expect(songs).toEqual([
      expect.objectContaining({ videoId: 'vid1', title: 'Blinding Lights', artists: ['The Weeknd'], album: 'After Hours', duration: 200 }),
      expect.objectContaining({ videoId: 'vid2', artists: ['The Weeknd', 'Ariana Grande'], duration: 191 }),
    ]);
    expect(songs[0].thumbnail).toBe('https://lh3.googleusercontent.com/vid1=w544-h544-l90-rj');
  });

  it('returns [] for junk', () => {
    expect(parseSearchSongs(null)).toEqual([]);
    expect(parseSearchSongs({ contents: 42 })).toEqual([]);
  });
});

describe('parseNext', () => {
  it('reads the queue, the automix endpoint and the related tab', () => {
    const json = nextResponse([
      panelVideo('seed', 'Seed', 'Artist', '3:00', 'Album'),
      { automixPreviewVideoRenderer: { content: { automixPlaylistVideoRenderer: { navigationEndpoint: { watchPlaylistEndpoint: { playlistId: 'RDAMVMseed', params: 'wAEB' } } } } } },
    ], 'MPTRt_related');
    const page = parseNext(json);
    expect(page.songs).toEqual([expect.objectContaining({ videoId: 'seed', artists: ['Artist'], album: 'Album', duration: 180 })]);
    expect(page.automix).toEqual({ playlistId: 'RDAMVMseed', params: 'wAEB', videoId: undefined });
    expect(page.relatedBrowseId).toBe('MPTRt_related');
  });

  it('reads continuation panels too', () => {
    const page = parseNext({ continuationContents: { playlistPanelContinuation: { contents: [panelVideo('c1', 'C1', 'X', '2:00')] } } });
    expect(page.songs.map(s => s.videoId)).toEqual(['c1']);
  });
});

describe('parseRelatedSongs', () => {
  it('keeps audio tracks from carousels and drops music videos', () => {
    const json = { contents: { sectionListRenderer: { contents: [
      { musicCarouselShelfRenderer: { contents: [
        responsiveRow('r1', 'Track', ['A']),
        responsiveRow('r2', 'Official MV', ['A'], { videoType: 'MUSIC_VIDEO_TYPE_OMV' }),
      ] } },
    ] } } };
    expect(parseRelatedSongs(json).map(s => s.videoId)).toEqual(['r1']);
  });
});

// ─── Resolver ──────────────────────────────────────────────────────────────

const yt = (videoId: string, title: string, artists: string[], duration?: number): YTSong => ({ videoId, title, artists, duration });

describe('normalizeTitle', () => {
  it('drops video, remaster and film tags', () => {
    expect(normalizeTitle('Kesariya (From "Brahmastra")')).toBe('kesariya');
    expect(normalizeTitle('Levitating [Official Video]')).toBe('levitating');
    expect(normalizeTitle('Heroes - 2017 Remaster')).toBe('heroes - 2017 remaster'); // year-first remasters are left alone
    expect(normalizeTitle('Heroes - Remastered 2017')).toBe('heroes');
  });
});

describe('matchScore', () => {
  it('accepts the same recording and rejects different cuts or artists', () => {
    const song = yt('v', 'Kesariya (From "Brahmastra")', ['Arijit Singh'], 268);
    expect(matchScore(song, catalog('1', 'Kesariya', 'Pritam, Arijit Singh', 268))).toBeGreaterThanOrEqual(30);
    expect(matchScore(song, catalog('2', 'Kesariya', 'Someone Else', 268))).toBeNull();
    expect(matchScore(song, catalog('3', 'Kesariya (Extended)', 'Arijit Singh', 420))).toBeNull();
    expect(matchScore(song, { ...catalog('4', 'Kesariya', 'Arijit Singh', 268), downloadUrl: '' })).toBeNull();
  });
});

describe('resolveToCatalog / resolveMany', () => {
  beforeEach(() => clearResolverCache());

  it('picks the best candidate and caches misses', async () => {
    const search = jest.fn(async (q: string) => (q.startsWith('Kesariya')
      ? [catalog('wrong', 'Kesariya', 'Cover Band', 268), catalog('right', 'Kesariya', 'Arijit Singh', 267)]
      : []));
    expect((await resolveToCatalog(yt('k', 'Kesariya', ['Arijit Singh'], 268), search))?.id).toBe('right');
    expect(await resolveToCatalog(yt('m', 'Missing', ['Nobody']), search)).toBeNull();
    await resolveToCatalog(yt('m', 'Missing', ['Nobody']), search);
    expect(search).toHaveBeenCalledTimes(2);
  });

  it('stops at the limit and keeps radio order', async () => {
    const search = jest.fn(async (q: string) => [catalog(q.split(' ')[0], q.split(' ')[0], 'A', 200)]);
    const mix = ['s1', 's2', 's3', 's4', 's5'].map(id => yt(id, id, ['A'], 200));
    const out = await resolveMany(mix, search, 3, 2);
    expect(out.map(s => s.id)).toEqual(['s1', 's2', 's3']);
    expect(search.mock.calls.length).toBeLessThanOrEqual(4);
  });
});

// ─── recommendFor ──────────────────────────────────────────────────────────

describe('recommendFor', () => {
  beforeEach(() => {
    clearResolverCache();
    clearRecommendCache();
  });

  const seed = catalog('seed', 'Blinding Lights', 'The Weeknd', 200);
  const deps = (overrides: Partial<RecommendDeps> = {}): RecommendDeps => ({
    searchYT: jest.fn(async () => [yt('wrong', 'Blinding Lights (Cover)', ['Covers Inc'], 200), yt('vseed', 'Blinding Lights', ['The Weeknd'], 201)]),
    radioYT: jest.fn(async () => ['Starboy', 'Save Your Tears', 'Die For You', 'Unmatched'].map((t, i) => yt(`r${i}`, t, ['The Weeknd'], 220))),
    relatedYT: jest.fn(async () => []),
    searchCatalog: jest.fn(async (q: string) => (q.startsWith('Unmatched') ? [] : [catalog(q.split(' The')[0], q.split(' The')[0], 'The Weeknd', 221)])),
    catalogRadio: jest.fn(async () => [catalog('saavn-radio', 'Saavn pick', 'X', 200)]),
    ...overrides,
  });

  it('finds the seed on YouTube Music by title, artist and duration', async () => {
    expect(await findSeedVideoId(seed, deps())).toBe('vseed');
  });

  it('plays YouTube Music radio through catalog audio', async () => {
    const d = deps();
    const recs = await recommendFor(seed, 10, d);
    expect(d.radioYT).toHaveBeenCalledWith('vseed');
    expect(recs.map(r => r.title)).toEqual(['Starboy', 'Save Your Tears', 'Die For You']);
    expect(d.catalogRadio).not.toHaveBeenCalled();
  });

  it('falls back to Related, then to Saavn radio when YouTube Music gives too little', async () => {
    const d = deps({ radioYT: jest.fn(async () => []), relatedYT: jest.fn(async () => [yt('x', 'Starboy', ['The Weeknd'], 220)]) });
    const recs = await recommendFor(seed, 10, d);
    expect(d.relatedYT).toHaveBeenCalledWith('vseed');
    expect(d.catalogRadio).toHaveBeenCalledWith('seed');
    expect(recs.map(r => r.id)).toEqual(['Starboy', 'saavn-radio']);
  });

  it('still recommends when YouTube Music is unreachable', async () => {
    const d = deps({ searchYT: jest.fn(async () => { throw new Error('blocked'); }) });
    const recs = await recommendFor(seed, 10, d);
    expect(recs.map(r => r.id)).toEqual(['saavn-radio']);
  });
});
