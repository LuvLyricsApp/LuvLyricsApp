/**
 * YouTube Music metadata over InnerTube, the same WEB_REMIX client Echo Music
 * uses for search, "up next" and related. This is the music.youtube.com web
 * client's own request shape — no login, no client spoofing, no stream URLs.
 * Audio is always resolved to a catalog provider (see resolver.ts).
 */
import { cacheKey, postJson, TtlCache } from '../net/fetchWithTimeout';
import { NextPage, parseNext, parseRelatedSongs, parseSearchSongs, YTSong } from './parsers';
import {
  ArtistPage, CollectionPage, HomePage, PlayEndpoint, YTPageItem,
  leadArtist, parseArtistPage, parseArtistSearch, parseCollectionPage, parseHomePage,
} from './browse';

const API = 'https://music.youtube.com/youtubei/v1/';
const CLIENT_NAME = 'WEB_REMIX';
const CLIENT_ID = '67'; // X-YouTube-Client-Name carries the numeric id
const CLIENT_VERSION = '1.20260213.01.00';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0';

/** Songs-only search filter (YouTube.SearchFilter.FILTER_SONG). */
export const FILTER_SONG = 'EgWKAQIIAWoKEAkQBRAKEAMQBA==';
/** Artists-only search filter (YouTube.SearchFilter.FILTER_ARTIST). */
export const FILTER_ARTIST = 'EgWKAQIgAWoKEAkQBRAKEAMQBA==';

export interface Locale { hl: string; gl: string }
let locale: Locale = { hl: 'en', gl: 'IN' };
export const setYTMusicLocale = (next: Locale): void => { locale = next; };

const call = <T>(endpoint: string, body: Record<string, unknown>): Promise<T | null> =>
  postJson<T>(
    `${API}${endpoint}${endpoint.includes('?') ? '&' : '?'}prettyPrint=false`,
    { context: { client: { clientName: CLIENT_NAME, clientVersion: CLIENT_VERSION, hl: locale.hl, gl: locale.gl } }, ...body },
    {
      timeoutMs: 10_000,
      headers: {
        'User-Agent': USER_AGENT,
        'Accept-Language': `${locale.hl},${locale.gl};q=0.9,en;q=0.8`,
        'X-Goog-Api-Format-Version': '1',
        'X-YouTube-Client-Name': CLIENT_ID,
        'X-YouTube-Client-Version': CLIENT_VERSION,
        'X-Origin': 'https://music.youtube.com',
        Referer: 'https://music.youtube.com/',
        Origin: 'https://music.youtube.com',
      },
    },
  );

const cache = new TtlCache<YTSong[]>(30 * 60 * 1000);

const cached = async (key: string, load: () => Promise<YTSong[]>): Promise<YTSong[]> => {
  const hit = cache.get(key);
  if (hit) return hit;
  const value = await load();
  if (value.length > 0) cache.set(key, value);
  return value;
};

const pages = new TtlCache<unknown>(20 * 60 * 1000, 60);
const artistIds = new TtlCache<string | null>(7 * 24 * 60 * 60 * 1000, 500);

const pageCached = async <T>(key: string, load: () => Promise<T | null>): Promise<T | null> => {
  const hit = pages.get(key) as T | undefined;
  if (hit) return hit;
  const value = await load().catch(() => null);
  if (value) pages.set(key, value);
  return value;
};

const postContinuation = (token: string): Promise<unknown> =>
  call<unknown>(`browse?ctoken=${encodeURIComponent(token)}&continuation=${encodeURIComponent(token)}&type=next`, {});

export const YTMusicClient = {
  searchSongs(query: string): Promise<YTSong[]> {
    const q = query.trim();
    if (!q) return Promise.resolve([]);
    return cached(cacheKey('search', q, locale.gl), async () =>
      parseSearchSongs(await call<unknown>('search', { query: q, params: FILTER_SONG })));
  },

  async next(videoId: string, playlistId?: string, params?: string): Promise<NextPage> {
    const json = await call<unknown>('next', {
      videoId,
      playlistId,
      params,
      isAudioOnly: true,
      enablePersistentPlaylistPanel: true,
      tunerSettingValue: 'AUTOMIX_SETTING_NORMAL',
    });
    return parseNext(json);
  },

  /**
   * Endless radio for a song: `next` returns the song plus an automix
   * endpoint; following it yields the actual mix (YouTube.next's automix branch).
   */
  radio(videoId: string): Promise<YTSong[]> {
    return cached(cacheKey('radio', videoId), async () => {
      const first = await YTMusicClient.next(videoId);
      let songs = first.songs;
      if (first.automix) {
        const mix = await YTMusicClient.next(first.automix.videoId ?? videoId, first.automix.playlistId, first.automix.params);
        songs = [...songs, ...mix.songs];
      } else if (songs.length <= 1) {
        // No automix offered: the RDAMVM radio playlist is the same mix.
        songs = [...songs, ...(await YTMusicClient.next(videoId, `RDAMVM${videoId}`)).songs];
      }
      const seen = new Set<string>([videoId]);
      return songs.filter(s => !seen.has(s.videoId) && seen.add(s.videoId));
    });
  },

  /** "You might also like" and friends from the Related tab. */
  related(videoId: string): Promise<YTSong[]> {
    return cached(cacheKey('related', videoId), async () => {
      const page = await YTMusicClient.next(videoId);
      if (!page.relatedBrowseId) return [];
      return parseRelatedSongs(await call<unknown>('browse', { browseId: page.relatedBrowseId }));
    });
  },

  /** Artist channel page: header, top songs, albums, singles, similar artists. */
  artist(browseId: string): Promise<ArtistPage | null> {
    return pageCached(cacheKey('artist', browseId, locale.gl), async () =>
      parseArtistPage(await call<unknown>('browse', { browseId }), browseId));
  },

  /** Finds an artist's channel by name (for a song's artist line). */
  async findArtist(name: string): Promise<string | null> {
    const lead = leadArtist(name);
    if (!lead) return null;
    const key = cacheKey('artist-id', lead.toLowerCase(), locale.gl);
    const hit = artistIds.get(key);
    if (hit !== undefined) return hit;
    const rows = parseArtistSearch(await call<unknown>('search', { query: lead, params: FILTER_ARTIST }));
    const exact = rows.find(r => r.title.trim().toLowerCase() === lead.toLowerCase());
    const id = (exact ?? rows[0])?.browseId ?? null;
    artistIds.set(key, id);
    return id;
  },

  /** Artist rows for a search (shown above the songs on Stream). */
  async searchArtists(query: string): Promise<YTPageItem<'artist'>[]> {
    const q = query.trim();
    if (!q) return [];
    return parseArtistSearch(await call<unknown>('search', { query: q, params: FILTER_ARTIST })).slice(0, 8);
  },

  /** YouTube Music's home: mood chips and shelves. A chip's browse gives its own shelves. */
  home(browse?: { browseId: string; params?: string }): Promise<HomePage> {
    const browseId = browse?.browseId ?? 'FEmusic_home';
    return pageCached(cacheKey('home', browseId, browse?.params ?? '', locale.gl), async () =>
      parseHomePage(await call<unknown>('browse', { browseId, params: browse?.params })),
    ).then(page => page ?? { chips: [], shelves: [] });
  },

  /** More home shelves. */
  async homeMore(continuation: string): Promise<HomePage> {
    const json = await postContinuation(continuation);
    const page = parseHomePage(json);
    return { chips: [], shelves: page.shelves, continuation: page.continuation };
  },

  /** An album or playlist with its tracks. */
  collection(browseId: string): Promise<CollectionPage | null> {
    return pageCached(cacheKey('collection', browseId, locale.gl), async () =>
      parseCollectionPage(await call<unknown>('browse', { browseId })));
  },

  /** The songs behind a play / shuffle / radio endpoint (a watch playlist). */
  async endpointSongs(e: PlayEndpoint): Promise<YTSong[]> {
    const page = await YTMusicClient.next(e.videoId ?? '', e.playlistId, e.params);
    return page.songs;
  },

  clearCache(): void {
    cache.clear();
    pages.clear();
    artistIds.clear();
  },
};
