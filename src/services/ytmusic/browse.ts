/**
 * YouTube Music browse pages, ported from Echo Music's InnerTube layer
 * (ArtistPage.kt, HomePage.kt, YouTube.artist/home/album). Metadata only:
 * titles, artists, artwork and the endpoints that lead to more. Songs are
 * played by resolving them to catalog audio (resolver.ts), never streamed
 * from YouTube.
 *
 * Every parser tolerates missing fields and returns empty results.
 */
import { bestThumbnail, oddElements, songFromResponsiveItem, YTSong } from './parsers';

// ─── Shapes (only the fields we read) ──────────────────────────────────────

interface Run {
  text?: string;
  navigationEndpoint?: NavEndpoint;
}
interface Runs { runs?: Run[] }
interface Thumbs { thumbnails?: { url?: string; width?: number }[] }
interface ThumbRenderer { musicThumbnailRenderer?: { thumbnail?: Thumbs } }
interface BrowseEndpoint {
  browseId?: string;
  params?: string;
  browseEndpointContextSupportedConfigs?: { browseEndpointContextMusicConfig?: { pageType?: string } };
}
interface WatchEndpoint { videoId?: string; playlistId?: string; params?: string }
interface NavEndpoint {
  browseEndpoint?: BrowseEndpoint;
  watchEndpoint?: WatchEndpoint;
  watchPlaylistEndpoint?: WatchEndpoint;
}
interface TwoRowItem {
  title?: Runs;
  subtitle?: Runs;
  thumbnailRenderer?: ThumbRenderer;
  navigationEndpoint?: NavEndpoint;
  aspectRatio?: string;
}
type ResponsiveItem = Parameters<typeof songFromResponsiveItem>[0] & {
  navigationEndpoint?: NavEndpoint;
  flexColumns?: { musicResponsiveListItemFlexColumnRenderer?: { text?: Runs } }[];
  thumbnail?: ThumbRenderer;
};
interface CarouselShelf {
  header?: {
    musicCarouselShelfBasicHeaderRenderer?: {
      title?: Runs;
      strapline?: Runs;
      moreContentButton?: { buttonRenderer?: { navigationEndpoint?: NavEndpoint } };
    };
  };
  contents?: { musicTwoRowItemRenderer?: TwoRowItem; musicResponsiveListItemRenderer?: ResponsiveItem }[];
}
interface MusicShelf {
  title?: Runs;
  contents?: { musicResponsiveListItemRenderer?: ResponsiveItem }[];
  bottomEndpoint?: NavEndpoint;
}
interface SectionContent {
  musicCarouselShelfRenderer?: CarouselShelf;
  musicShelfRenderer?: MusicShelf;
  musicDescriptionShelfRenderer?: { description?: Runs };
}

// ─── Public model ──────────────────────────────────────────────────────────

export interface BrowseRef { browseId: string; params?: string }
export interface PlayEndpoint { videoId?: string; playlistId?: string; params?: string }

export interface YTPageItem<K extends 'album' | 'playlist' | 'artist' = 'album' | 'playlist' | 'artist'> {
  kind: K;
  browseId: string;
  title: string;
  subtitle?: string;
  thumbnail?: string;
}
export type YTItem = { kind: 'song'; song: YTSong } | YTPageItem<'album'> | YTPageItem<'playlist'> | YTPageItem<'artist'>;

export interface Shelf {
  title: string;
  /** Small line over the title ("Dance your stress away"). */
  strapline?: string;
  items: YTItem[];
  more?: BrowseRef;
}

export interface ArtistPage {
  browseId: string;
  name: string;
  thumbnail?: string;
  subscribers?: string;
  monthlyListeners?: string;
  description?: string;
  radio?: PlayEndpoint;
  shuffle?: PlayEndpoint;
  sections: Shelf[];
}

export interface HomeChip { title: string; browse?: BrowseRef }
export interface HomePage { chips: HomeChip[]; shelves: Shelf[]; continuation?: string }

export interface CollectionPage {
  title: string;
  subtitle?: string;
  artists: string[];
  thumbnail?: string;
  description?: string;
  songs: YTSong[];
}

// ─── Helpers ───────────────────────────────────────────────────────────────

const text = (runs: Runs | undefined): string | undefined => {
  const joined = runs?.runs?.map(r => r.text ?? '').join('').trim();
  return joined || undefined;
};
const first = (runs: Runs | undefined): string | undefined => runs?.runs?.[0]?.text;
const thumb = (t: ThumbRenderer | undefined): string | undefined => bestThumbnail(t?.musicThumbnailRenderer?.thumbnail);

/** Artist headers are wide photos; ask for a large one. */
const largeThumb = (t: ThumbRenderer | undefined): string | undefined => {
  const url = t?.musicThumbnailRenderer?.thumbnail?.thumbnails?.slice(-1)[0]?.url;
  return url?.replace(/[=]w\d+-h\d+.*$/, '=w1080-h1080-p-l90-rj');
};

const collect = <T>(node: unknown, key: string, out: T[] = []): T[] => {
  if (Array.isArray(node)) {
    for (const child of node) collect(child, key, out);
  } else if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if (k === key) out.push(v as T);
      else collect(v, key, out);
    }
  }
  return out;
};

const pageKind = (b: BrowseEndpoint | undefined): 'album' | 'playlist' | 'artist' | null => {
  const type = b?.browseEndpointContextSupportedConfigs?.browseEndpointContextMusicConfig?.pageType;
  if (type === 'MUSIC_PAGE_TYPE_ALBUM' || type === 'MUSIC_PAGE_TYPE_AUDIOBOOK') return 'album';
  if (type === 'MUSIC_PAGE_TYPE_PLAYLIST') return 'playlist';
  if (type === 'MUSIC_PAGE_TYPE_ARTIST' || type === 'MUSIC_PAGE_TYPE_USER_CHANNEL') return 'artist';
  const id = b?.browseId ?? '';
  if (id.startsWith('MPRE')) return 'album';
  if (id.startsWith('VL')) return 'playlist';
  if (id.startsWith('UC')) return 'artist';
  return null;
};

/** "1.13M subscribers" -> "1.13M"; "116M monthly audience" -> "116M". */
export const countOf = (value: string | undefined): string | undefined => value?.trim().split(/\s+/)[0] || undefined;

// ─── Items ─────────────────────────────────────────────────────────────────

/** musicTwoRowItemRenderer -> song / album / playlist / artist (ArtistPage.fromMusicTwoRowItemRenderer). */
export const itemFromTwoRow = (r: TwoRowItem): YTItem | null => {
  const title = first(r.title);
  if (!title) return null;
  const nav = r.navigationEndpoint;
  const thumbnail = thumb(r.thumbnailRenderer);
  if (nav?.watchEndpoint?.videoId) {
    const runs = oddElements(r.subtitle?.runs ?? []);
    const linked = runs.filter(run => run.navigationEndpoint?.browseEndpoint).map(run => run.text ?? '').filter(Boolean);
    const artists = linked.length > 0 ? linked : [runs[0]?.text ?? ''].filter(Boolean);
    return { kind: 'song', song: { videoId: nav.watchEndpoint.videoId, title, artists, thumbnail } };
  }
  const kind = pageKind(nav?.browseEndpoint);
  const browseId = nav?.browseEndpoint?.browseId;
  if (!kind || !browseId) return null;
  return { kind, browseId, title, subtitle: text(r.subtitle), thumbnail } as YTPageItem<typeof kind>;
};

/** musicResponsiveListItemRenderer -> song, or an artist / album / playlist row. */
export const itemFromResponsive = (r: ResponsiveItem): YTItem | null => {
  const song = songFromResponsiveItem(r);
  if (song) return { kind: 'song', song };
  const kind = pageKind(r.navigationEndpoint?.browseEndpoint);
  const browseId = r.navigationEndpoint?.browseEndpoint?.browseId;
  const title = first(r.flexColumns?.[0]?.musicResponsiveListItemFlexColumnRenderer?.text);
  if (!kind || !browseId || !title) return null;
  const subtitle = text(r.flexColumns?.[1]?.musicResponsiveListItemFlexColumnRenderer?.text);
  return { kind, browseId, title, subtitle, thumbnail: thumb(r.thumbnail) } as YTPageItem<typeof kind>;
};

const shelfFromCarousel = (c: CarouselShelf): Shelf | null => {
  const header = c.header?.musicCarouselShelfBasicHeaderRenderer;
  const title = first(header?.title);
  if (!title) return null;
  const items = (c.contents ?? [])
    .map(x => (x.musicTwoRowItemRenderer ? itemFromTwoRow(x.musicTwoRowItemRenderer) : x.musicResponsiveListItemRenderer ? itemFromResponsive(x.musicResponsiveListItemRenderer) : null))
    .filter((x): x is YTItem => x !== null);
  if (items.length === 0) return null;
  const more = header?.moreContentButton?.buttonRenderer?.navigationEndpoint?.browseEndpoint;
  return {
    title,
    strapline: first(header?.strapline),
    items,
    more: more?.browseId ? { browseId: more.browseId, params: more.params } : undefined,
  };
};

const shelfFromMusicShelf = (s: MusicShelf): Shelf | null => {
  const title = first(s.title) ?? '';
  const items = (s.contents ?? [])
    .map(x => (x.musicResponsiveListItemRenderer ? itemFromResponsive(x.musicResponsiveListItemRenderer) : null))
    .filter((x): x is YTItem => x !== null);
  if (items.length === 0) return null;
  const more = s.title?.runs?.[0]?.navigationEndpoint?.browseEndpoint ?? s.bottomEndpoint?.browseEndpoint;
  return { title, items, more: more?.browseId ? { browseId: more.browseId, params: more.params } : undefined };
};

const sectionContents = (json: unknown): SectionContent[] => {
  const lists = collect<{ contents?: SectionContent[] }>(json, 'sectionListRenderer');
  return lists.flatMap(l => l.contents ?? []);
};

// ─── Pages ─────────────────────────────────────────────────────────────────

interface ImmersiveHeader {
  title?: Runs;
  thumbnail?: ThumbRenderer;
  description?: Runs;
  monthlyListenerCount?: Runs;
  subscriptionButton?: { subscribeButtonRenderer?: { subscriberCountText?: Runs; longSubscriberCountText?: Runs; shortSubscriberCountText?: Runs } };
  subscriptionButton2?: { subscribeButtonRenderer?: { subscriberCountWithSubscribeText?: Runs } };
  startRadioButton?: { buttonRenderer?: { navigationEndpoint?: NavEndpoint } };
  playButton?: { buttonRenderer?: { navigationEndpoint?: NavEndpoint } };
}
interface ArtistResponse {
  header?: {
    musicImmersiveHeaderRenderer?: ImmersiveHeader;
    musicVisualHeaderRenderer?: { title?: Runs; foregroundThumbnail?: ThumbRenderer; thumbnail?: ThumbRenderer };
  };
}

const endpointOf = (nav: NavEndpoint | undefined): PlayEndpoint | undefined => {
  const e = nav?.watchPlaylistEndpoint ?? nav?.watchEndpoint;
  return e && (e.playlistId || e.videoId) ? { videoId: e.videoId, playlistId: e.playlistId, params: e.params } : undefined;
};

/** /browse (artist channel) -> ArtistPage (YouTube.artist). */
export const parseArtistPage = (json: unknown, browseId: string): ArtistPage | null => {
  const res = (json ?? {}) as ArtistResponse;
  const immersive = res.header?.musicImmersiveHeaderRenderer;
  const visual = res.header?.musicVisualHeaderRenderer;
  const name = first(immersive?.title) ?? first(visual?.title);
  if (!name) return null;

  const contents = sectionContents(json);
  const description = text(contents.find(c => c.musicDescriptionShelfRenderer)?.musicDescriptionShelfRenderer?.description) ?? text(immersive?.description);
  const sub = immersive?.subscriptionButton?.subscribeButtonRenderer;
  const sections = contents
    .map(c => (c.musicShelfRenderer ? shelfFromMusicShelf(c.musicShelfRenderer) : c.musicCarouselShelfRenderer ? shelfFromCarousel(c.musicCarouselShelfRenderer) : null))
    .filter((s): s is Shelf => s !== null);

  return {
    browseId,
    name,
    thumbnail: largeThumb(immersive?.thumbnail) ?? largeThumb(visual?.foregroundThumbnail ?? visual?.thumbnail),
    subscribers: countOf(first(sub?.longSubscriberCountText) ?? first(sub?.subscriberCountText) ?? first(sub?.shortSubscriberCountText) ?? first(immersive?.subscriptionButton2?.subscribeButtonRenderer?.subscriberCountWithSubscribeText)),
    monthlyListeners: countOf(text(immersive?.monthlyListenerCount)),
    description,
    radio: endpointOf(immersive?.startRadioButton?.buttonRenderer?.navigationEndpoint),
    shuffle: endpointOf(immersive?.playButton?.buttonRenderer?.navigationEndpoint),
    sections,
  };
};

interface Chip {
  chipCloudChipRenderer?: { text?: Runs; navigationEndpoint?: NavEndpoint };
}

/** /browse FEmusic_home -> mood chips + shelves + continuation (YouTube.home). */
export const parseHomePage = (json: unknown): HomePage => {
  const chips = collect<Chip[]>(json, 'chips')
    .flat()
    .map((c): HomeChip | null => {
      const title = first(c.chipCloudChipRenderer?.text);
      const b = c.chipCloudChipRenderer?.navigationEndpoint?.browseEndpoint;
      return title ? { title, browse: b?.browseId ? { browseId: b.browseId, params: b.params } : undefined } : null;
    })
    .filter((c): c is HomeChip => c !== null);
  const shelves = collect<CarouselShelf>(json, 'musicCarouselShelfRenderer')
    .map(shelfFromCarousel)
    .filter((s): s is Shelf => s !== null);
  const continuation = collect<{ continuation?: string }>(json, 'nextContinuationData')[0]?.continuation
    ?? collect<{ token?: string }>(json, 'continuationCommand')[0]?.token;
  return { chips, shelves, continuation };
};

interface CollectionHeader {
  title?: Runs;
  subtitle?: Runs;
  straplineTextOne?: Runs;
  secondSubtitle?: Runs;
  description?: { musicDescriptionShelfRenderer?: { description?: Runs } } & Runs;
  thumbnail?: ThumbRenderer & { croppedSquareThumbnailRenderer?: { thumbnail?: Thumbs } };
}

/** Album / playlist /browse -> tracks with the page's artist and cover as fallbacks. */
export const parseCollectionPage = (json: unknown): CollectionPage | null => {
  const header = collect<CollectionHeader>(json, 'musicResponsiveHeaderRenderer')[0]
    ?? collect<CollectionHeader>(json, 'musicDetailHeaderRenderer')[0];
  const title = first(header?.title);
  if (!title) return null;
  const artists = oddElements(header?.straplineTextOne?.runs ?? []).map(r => r.text ?? '').filter(Boolean);
  const thumbnail = thumb(header?.thumbnail) ?? bestThumbnail(header?.thumbnail?.croppedSquareThumbnailRenderer?.thumbnail);
  const description = text(header?.description?.musicDescriptionShelfRenderer?.description) ?? text(header?.description);

  const rows = [
    ...collect<{ contents?: { musicResponsiveListItemRenderer?: ResponsiveItem }[] }>(json, 'musicShelfRenderer'),
    ...collect<{ contents?: { musicResponsiveListItemRenderer?: ResponsiveItem }[] }>(json, 'musicPlaylistShelfRenderer'),
  ].flatMap(s => s.contents ?? []);

  const songs: YTSong[] = [];
  for (const row of rows) {
    const r = row.musicResponsiveListItemRenderer;
    if (!r) continue;
    const parsed = songFromResponsiveItem(r);
    if (parsed) {
      songs.push({ ...parsed, thumbnail: parsed.thumbnail ?? thumbnail });
      continue;
    }
    // Album tracks often omit the artist line (it's the album artist).
    const t = first(r.flexColumns?.[0]?.musicResponsiveListItemFlexColumnRenderer?.text);
    const videoId = r.playlistItemData?.videoId ?? r.flexColumns?.[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0]?.navigationEndpoint?.watchEndpoint?.videoId;
    if (t && videoId && artists.length > 0) songs.push({ videoId, title: t, artists, album: title, thumbnail });
  }

  return {
    title,
    subtitle: [text(header?.subtitle), text(header?.secondSubtitle)].filter(Boolean).join(' · ') || undefined,
    artists,
    thumbnail,
    description,
    songs,
  };
};

/** /search (artists filter) -> artist rows. */
export const parseArtistSearch = (json: unknown): YTPageItem<'artist'>[] =>
  collect<{ contents?: { musicResponsiveListItemRenderer?: ResponsiveItem }[] }>(json, 'musicShelfRenderer')
    .flatMap(s => s.contents ?? [])
    .map(c => (c.musicResponsiveListItemRenderer ? itemFromResponsive(c.musicResponsiveListItemRenderer) : null))
    .filter((x): x is YTPageItem<'artist'> => x?.kind === 'artist');

/** First artist name of a byline ("A, B & C" -> "A"). */
export const leadArtist = (artist: string): string => artist.split(/,|&| feat\.? | ft\.? | x /i)[0].trim();

