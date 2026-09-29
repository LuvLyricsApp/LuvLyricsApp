// browsePlay's defaults reach the player and catalog; the tests inject their own.
jest.mock('../stream/StreamService', () => ({ StreamService: { play: jest.fn(), append: jest.fn() } }));
jest.mock('../MultiSourceSearchService', () => ({ searchMusic: jest.fn(async () => []) }));

import { countOf, leadArtist, parseArtistPage, parseArtistSearch, parseCollectionPage, parseHomePage } from './browse';
import { playYTSongs } from '../stream/browsePlay';
import { UnifiedSong } from '../../types/song';
import { YTSong } from './parsers';

// ─── Fixture builders (InnerTube WEB_REMIX renderers, as Echo parses them) ──

const thumbs = (id: string) => ({ musicThumbnailRenderer: { thumbnail: { thumbnails: [{ url: `https://lh3.googleusercontent.com/${id}=w60-h60-l90-rj` }, { url: `https://lh3.googleusercontent.com/${id}=w226-h226-l90-rj` }] } } });
const page = (type: string, browseId: string) => ({ browseEndpoint: { browseId, browseEndpointContextSupportedConfigs: { browseEndpointContextMusicConfig: { pageType: type } } } });
const artistRun = (name: string) => ({ text: name, navigationEndpoint: page('MUSIC_PAGE_TYPE_ARTIST', `UC_${name}`) });
const SEP = { text: ' • ' };

const songRow = (videoId: string, title: string, artists: string[]) => ({
  musicResponsiveListItemRenderer: {
    flexColumns: [
      { musicResponsiveListItemFlexColumnRenderer: { text: { runs: [{ text: title, navigationEndpoint: { watchEndpoint: { videoId } } }] } } },
      { musicResponsiveListItemFlexColumnRenderer: { text: { runs: artists.flatMap((a, i) => (i === 0 ? [artistRun(a)] : [{ text: ' & ' }, artistRun(a)])) } } },
    ],
    playlistItemData: { videoId },
    thumbnail: thumbs(videoId),
  },
});

const twoRow = (title: string, subtitle: string, nav: object) => ({
  musicTwoRowItemRenderer: { title: { runs: [{ text: title }] }, subtitle: { runs: [{ text: subtitle }] }, thumbnailRenderer: thumbs(title), navigationEndpoint: nav },
});

const carousel = (title: string, contents: object[], strapline?: string) => ({
  musicCarouselShelfRenderer: {
    header: { musicCarouselShelfBasicHeaderRenderer: { title: { runs: [{ text: title }] }, ...(strapline ? { strapline: { runs: [{ text: strapline }] } } : {}) } },
    contents,
  },
});

const browseResponse = (contents: object[], header?: object) => ({
  ...(header ? { header } : {}),
  contents: { singleColumnBrowseResultsRenderer: { tabs: [{ tabRenderer: { content: { sectionListRenderer: { contents } } } }] } },
});

// ─── Artist page ───────────────────────────────────────────────────────────

describe('parseArtistPage', () => {
  const json = browseResponse(
    [
      { musicShelfRenderer: { title: { runs: [{ text: 'Top songs', navigationEndpoint: page('MUSIC_PAGE_TYPE_PLAYLIST', 'VLOLAK5') }] }, contents: [songRow('v1', 'Man I Need', ['Olivia Dean']), songRow('v2', 'So Easy', ['Olivia Dean'])] } },
      carousel('Albums', [twoRow('The Art of Loving', '2025', page('MUSIC_PAGE_TYPE_ALBUM', 'MPREb_1'))]),
      carousel('Fans might also like', [twoRow('Raye', '2M subscribers', page('MUSIC_PAGE_TYPE_ARTIST', 'UC_raye'))]),
      { musicDescriptionShelfRenderer: { description: { runs: [{ text: "'the art of loving' out now!" }] } } },
    ],
    {
      musicImmersiveHeaderRenderer: {
        title: { runs: [{ text: 'Olivia Dean' }] },
        thumbnail: thumbs('olivia'),
        subscriptionButton: { subscribeButtonRenderer: { longSubscriberCountText: { runs: [{ text: '1.13M subscribers' }] } } },
        monthlyListenerCount: { runs: [{ text: '116M monthly audience' }] },
        startRadioButton: { buttonRenderer: { navigationEndpoint: { watchPlaylistEndpoint: { playlistId: 'RDEMolivia', params: 'wAEB' } } } },
      },
    },
  );

  it('reads the header: name, big photo, subscribers, monthly audience, about, radio', () => {
    const artist = parseArtistPage(json, 'UC_olivia');
    expect(artist?.name).toBe('Olivia Dean');
    expect(artist?.thumbnail).toBe('https://lh3.googleusercontent.com/olivia=w1080-h1080-p-l90-rj');
    expect(artist?.subscribers).toBe('1.13M');
    expect(artist?.monthlyListeners).toBe('116M');
    expect(artist?.description).toBe("'the art of loving' out now!");
    expect(artist?.radio).toEqual({ playlistId: 'RDEMolivia', params: 'wAEB', videoId: undefined });
  });

  it('keeps top songs as songs and sorts carousel items by page type', () => {
    const artist = parseArtistPage(json, 'UC_olivia');
    expect(artist?.sections.map(s => s.title)).toEqual(['Top songs', 'Albums', 'Fans might also like']);
    const [top, albums, fans] = artist!.sections;
    expect(top.items.map(i => (i.kind === 'song' ? i.song.title : ''))).toEqual(['Man I Need', 'So Easy']);
    expect(top.more).toEqual({ browseId: 'VLOLAK5', params: undefined });
    expect(albums.items[0]).toMatchObject({ kind: 'album', browseId: 'MPREb_1', title: 'The Art of Loving', subtitle: '2025' });
    expect(fans.items[0]).toMatchObject({ kind: 'artist', browseId: 'UC_raye', title: 'Raye' });
  });

  it('returns null without a name', () => {
    expect(parseArtistPage({}, 'UC_x')).toBeNull();
  });
});

// ─── Home ──────────────────────────────────────────────────────────────────

describe('parseHomePage', () => {
  it('reads mood chips, straplines, playlist cards and the continuation', () => {
    const json = {
      contents: {
        singleColumnBrowseResultsRenderer: {
          tabs: [{
            tabRenderer: {
              content: {
                sectionListRenderer: {
                  header: { chipCloudRenderer: { chips: [
                    { chipCloudChipRenderer: { text: { runs: [{ text: 'Feel good' }] }, navigationEndpoint: { browseEndpoint: { browseId: 'FEmusic_home', params: 'ggMP' } } } },
                    { chipCloudChipRenderer: { text: { runs: [{ text: 'Romance' }] }, navigationEndpoint: { browseEndpoint: { browseId: 'FEmusic_home', params: 'ggMR' } } } },
                  ] } },
                  contents: [
                    carousel('Dancing on your own', [twoRow('Bollywood Fire', 'Playlist', page('MUSIC_PAGE_TYPE_PLAYLIST', 'VLPL1'))], 'Dance your stress away'),
                    carousel('Quick picks', [songRow('q1', 'Marandhaye', ['D. Imman'])]),
                  ],
                  continuations: [{ nextContinuationData: { continuation: 'CONT_1' } }],
                },
              },
            },
          }],
        },
      },
    };
    const home = parseHomePage(json);
    expect(home.chips).toEqual([
      { title: 'Feel good', browse: { browseId: 'FEmusic_home', params: 'ggMP' } },
      { title: 'Romance', browse: { browseId: 'FEmusic_home', params: 'ggMR' } },
    ]);
    expect(home.shelves[0]).toMatchObject({ title: 'Dancing on your own', strapline: 'Dance your stress away' });
    expect(home.shelves[0].items[0]).toMatchObject({ kind: 'playlist', browseId: 'VLPL1' });
    expect(home.shelves[1].items[0]).toMatchObject({ kind: 'song' });
    expect(home.continuation).toBe('CONT_1');
  });
});

// ─── Album / playlist ──────────────────────────────────────────────────────

describe('parseCollectionPage', () => {
  it('fills album tracks that omit the artist from the page header', () => {
    const bareTrack = {
      musicResponsiveListItemRenderer: {
        flexColumns: [
          { musicResponsiveListItemFlexColumnRenderer: { text: { runs: [{ text: 'Nice to Each Other', navigationEndpoint: { watchEndpoint: { videoId: 't1' } } }] } } },
          { musicResponsiveListItemFlexColumnRenderer: { text: {} } },
        ],
        playlistItemData: { videoId: 't1' },
      },
    };
    const json = {
      contents: {
        twoColumnBrowseResultsRenderer: {
          tabs: [{ tabRenderer: { content: { sectionListRenderer: { contents: [{
            musicResponsiveHeaderRenderer: {
              title: { runs: [{ text: 'The Art of Loving' }] },
              straplineTextOne: { runs: [artistRun('Olivia Dean')] },
              subtitle: { runs: [{ text: 'Album' }, SEP, { text: '2025' }] },
              thumbnail: thumbs('aol'),
            },
          }] } } } }],
          secondaryContents: { sectionListRenderer: { contents: [{ musicShelfRenderer: { contents: [bareTrack, songRow('t2', 'Man I Need', ['Olivia Dean'])] } }] } },
        },
      },
    };
    const album = parseCollectionPage(json);
    expect(album?.title).toBe('The Art of Loving');
    expect(album?.artists).toEqual(['Olivia Dean']);
    expect(album?.subtitle).toBe('Album • 2025');
    expect(album?.songs.map(s => [s.videoId, s.artists[0], !!s.thumbnail])).toEqual([
      ['t1', 'Olivia Dean', true],
      ['t2', 'Olivia Dean', true],
    ]);
  });
});

describe('artist search and helpers', () => {
  it('keeps only artist rows', () => {
    const artistRow = {
      musicResponsiveListItemRenderer: {
        flexColumns: [
          { musicResponsiveListItemFlexColumnRenderer: { text: { runs: [{ text: 'Olivia Dean' }] } } },
          { musicResponsiveListItemFlexColumnRenderer: { text: { runs: [{ text: 'Artist' }, SEP, { text: '1.13M subscribers' }] } } },
        ],
        navigationEndpoint: page('MUSIC_PAGE_TYPE_ARTIST', 'UC_olivia'),
        thumbnail: thumbs('olivia'),
      },
    };
    const json = { contents: { musicShelfRenderer: { contents: [artistRow, songRow('s', 'Song', ['X'])] } } };
    expect(parseArtistSearch(json)).toEqual([expect.objectContaining({ kind: 'artist', browseId: 'UC_olivia', title: 'Olivia Dean' })]);
  });

  it('shortens counts and picks the lead artist', () => {
    expect(countOf('1.13M subscribers')).toBe('1.13M');
    expect(countOf(undefined)).toBeUndefined();
    expect(leadArtist('D. Imman, Pradeep Kumar & Jonita')).toBe('D. Imman');
    expect(leadArtist('Calvin Harris feat. Dua Lipa')).toBe('Calvin Harris');
  });
});

// ─── Playing a YouTube Music list ──────────────────────────────────────────

describe('playYTSongs', () => {
  const yt = (id: string): YTSong => ({ videoId: id, title: id, artists: ['A'] });
  const catalog = (id: string): UnifiedSong => ({ id, title: id, artist: 'A', highResArt: '', downloadUrl: `https://cdn/${id}.mp4`, source: 'Saavn' });

  it('starts the first song that has catalog audio, then queues the rest', async () => {
    const played: string[][] = [];
    const appended: string[][] = [];
    const ok = await playYTSongs([yt('a'), yt('b'), yt('c'), yt('d')], 0, {}, {
      resolveOne: async s => (s.videoId === 'a' ? null : catalog(s.videoId)),
      resolveRest: async songs => songs.map(s => catalog(s.videoId)),
      play: songs => played.push(songs.map(s => s.id)),
      append: songs => appended.push(songs.map(s => s.id)),
    });
    await new Promise(r => setTimeout(r, 0));
    expect(ok).toBe(true);
    expect(played).toEqual([['b']]);
    expect(appended).toEqual([['c', 'd']]);
  });

  it('gives up when nothing near the start resolves', async () => {
    const ok = await playYTSongs([yt('a')], 0, {}, {
      resolveOne: async () => null,
      resolveRest: async () => [],
      play: () => { throw new Error('should not play'); },
      append: () => {},
    });
    expect(ok).toBe(false);
  });
});
