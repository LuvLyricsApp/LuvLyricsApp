/**
 * YouTube Music (InnerTube WEB_REMIX) response parsers, ported from Echo
 * Music's SearchPage / NextPage / RelatedPage. Metadata only — nothing here
 * touches streams. Every parser tolerates missing fields and returns [] / null.
 */

export interface YTSong {
  videoId: string;
  title: string;
  artists: string[];
  album?: string;
  /** Seconds. */
  duration?: number;
  thumbnail?: string;
  /** MUSIC_VIDEO_TYPE_ATV = the audio track; OMV/UGC = music videos. */
  musicVideoType?: string;
}

// ─── Loose renderer shapes (only the fields we read) ───────────────────────

interface Run {
  text?: string;
  navigationEndpoint?: {
    browseEndpoint?: { browseId?: string };
    watchEndpoint?: WatchEndpoint;
  };
}
interface Runs { runs?: Run[] }
interface Thumbs { thumbnails?: { url?: string; width?: number }[] }
interface WatchEndpoint {
  videoId?: string;
  playlistId?: string;
  params?: string;
  watchEndpointMusicSupportedConfigs?: { watchEndpointMusicConfig?: { musicVideoType?: string } };
}
interface ResponsiveItem {
  flexColumns?: { musicResponsiveListItemFlexColumnRenderer?: { text?: Runs } }[];
  fixedColumns?: { musicResponsiveListItemFixedColumnRenderer?: { text?: Runs } }[];
  playlistItemData?: { videoId?: string };
  navigationEndpoint?: { watchEndpoint?: WatchEndpoint; browseEndpoint?: { browseId?: string } };
  thumbnail?: { musicThumbnailRenderer?: { thumbnail?: Thumbs } };
  overlay?: {
    musicItemThumbnailOverlayRenderer?: {
      content?: { musicPlayButtonRenderer?: { playNavigationEndpoint?: { watchEndpoint?: WatchEndpoint } } };
    };
  };
}
interface PanelVideo {
  videoId?: string;
  title?: Runs;
  longBylineText?: Runs;
  lengthText?: Runs;
  thumbnail?: Thumbs;
  selected?: boolean;
  navigationEndpoint?: { watchEndpoint?: WatchEndpoint };
}
interface PanelContent {
  playlistPanelVideoRenderer?: PanelVideo;
  automixPreviewVideoRenderer?: {
    content?: { automixPlaylistVideoRenderer?: { navigationEndpoint?: { watchPlaylistEndpoint?: WatchEndpoint } } };
  };
}
interface ShelfContent { musicResponsiveListItemRenderer?: ResponsiveItem }

// ─── Helpers (Runs.kt / Utils.kt) ──────────────────────────────────────────

/** Splits bylines on the " • " separator run. */
export const splitBySeparator = (runs: Run[]): Run[][] => {
  const out: Run[][] = [];
  let current: Run[] = [];
  for (const run of runs) {
    if (run.text === ' • ') {
      out.push(current);
      current = [];
    } else {
      current.push(run);
    }
  }
  out.push(current);
  return out;
};

/** Artist runs alternate with ", " / " & " joiners; keep the even ones. */
export const oddElements = <T>(items: T[]): T[] => items.filter((_, i) => i % 2 === 0);

/** "3:45" -> 225, "1:02:03" -> 3723. */
export const parseTime = (text: string | undefined): number | undefined => {
  if (!text) return undefined;
  const parts = text.split(':').map(p => Number(p));
  if (parts.some(p => !Number.isFinite(p))) return undefined;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return undefined;
};

/** Thumbnails come smallest-first; also ask the CDN for a sharper square. */
export const bestThumbnail = (thumbs: Thumbs | undefined): string | undefined => {
  const url = thumbs?.thumbnails?.[thumbs.thumbnails.length - 1]?.url;
  if (!url) return undefined;
  return url.replace(/[=]w\d+-h\d+/, '=w544-h544');
};

const firstText = (runs: Runs | undefined): string | undefined => runs?.runs?.[0]?.text;

// ─── Song rows ─────────────────────────────────────────────────────────────

/** musicResponsiveListItemRenderer -> song (SearchPage.toYTItem, song branch). */
export const songFromResponsiveItem = (r: ResponsiveItem): YTSong | null => {
  // Artists/albums have a browse endpoint on the row itself; songs don't.
  if (r.navigationEndpoint?.browseEndpoint && !r.navigationEndpoint.watchEndpoint) return null;

  const firstColumn = r.flexColumns?.[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs;
  const secondLine = r.flexColumns?.[1]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs;
  if (!firstColumn || !secondLine) return null;

  const playEndpoint = r.overlay?.musicItemThumbnailOverlayRenderer?.content?.musicPlayButtonRenderer?.playNavigationEndpoint?.watchEndpoint;
  const videoId =
    r.playlistItemData?.videoId ??
    r.navigationEndpoint?.watchEndpoint?.videoId ??
    playEndpoint?.videoId ??
    firstColumn[0]?.navigationEndpoint?.watchEndpoint?.videoId;
  const title = firstColumn[0]?.text;
  if (!videoId || !title) return null;

  const parts = splitBySeparator(secondLine);
  // Search rows lead with a type label ("Song", "Video") that has no endpoint.
  const lead = parts[0] ?? [];
  const hasTypeLabel = parts.length > 1 && lead.length === 1 && !lead[0].navigationEndpoint && /^(song|video|episode)$/i.test(lead[0].text ?? '');
  const meta = hasTypeLabel ? parts.slice(1) : parts;

  const artists = oddElements(meta[0] ?? []).map(run => run.text ?? '').filter(Boolean);
  if (artists.length === 0) return null;
  const albumRun = meta[1]?.[0];
  const album = albumRun?.navigationEndpoint?.browseEndpoint ? albumRun.text : undefined;
  const fixedDuration = firstText(r.fixedColumns?.[0]?.musicResponsiveListItemFixedColumnRenderer?.text);
  const duration = parseTime(meta[meta.length - 1]?.[0]?.text) ?? parseTime(fixedDuration);

  return {
    videoId,
    title,
    artists,
    album,
    duration,
    thumbnail: bestThumbnail(r.thumbnail?.musicThumbnailRenderer?.thumbnail),
    musicVideoType: (playEndpoint ?? r.navigationEndpoint?.watchEndpoint)?.watchEndpointMusicSupportedConfigs?.watchEndpointMusicConfig?.musicVideoType,
  };
};

/** playlistPanelVideoRenderer -> song (NextPage.fromPlaylistPanelVideoRenderer). */
export const songFromPanelVideo = (r: PanelVideo): YTSong | null => {
  const byline = r.longBylineText?.runs;
  const title = firstText(r.title);
  if (!r.videoId || !title || !byline) return null;
  const parts = splitBySeparator(byline);
  const artists = oddElements(parts[0] ?? []).map(run => run.text ?? '').filter(Boolean);
  if (artists.length === 0) return null;
  const albumRun = parts[1]?.[0];
  return {
    videoId: r.videoId,
    title,
    artists,
    album: albumRun?.navigationEndpoint?.browseEndpoint ? albumRun.text : undefined,
    duration: parseTime(firstText(r.lengthText)),
    thumbnail: bestThumbnail(r.thumbnail),
    musicVideoType: r.navigationEndpoint?.watchEndpoint?.watchEndpointMusicSupportedConfigs?.watchEndpointMusicConfig?.musicVideoType,
  };
};

// ─── Pages ─────────────────────────────────────────────────────────────────

/** Walks any JSON and collects every node under `key`. Used for search shelves. */
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

/** /search (songs filter) -> songs. */
export const parseSearchSongs = (json: unknown): YTSong[] => {
  const shelves = collect<{ contents?: ShelfContent[] }>(json, 'musicShelfRenderer');
  return shelves
    .flatMap(shelf => shelf.contents ?? [])
    .map(c => (c.musicResponsiveListItemRenderer ? songFromResponsiveItem(c.musicResponsiveListItemRenderer) : null))
    .filter((s): s is YTSong => s !== null);
};

export interface NextPage {
  songs: YTSong[];
  /** The automix radio endpoint Echo follows to build an endless queue. */
  automix?: { playlistId: string; params?: string; videoId?: string };
  /** browseId of the "Related" tab. */
  relatedBrowseId?: string;
}

interface NextResponse {
  contents?: {
    singleColumnMusicWatchNextResultsRenderer?: {
      tabbedRenderer?: {
        watchNextTabbedResultsRenderer?: {
          tabs?: {
            tabRenderer?: {
              endpoint?: { browseEndpoint?: { browseId?: string } };
              content?: { musicQueueRenderer?: { content?: { playlistPanelRenderer?: { contents?: PanelContent[] } } } };
            };
          }[];
        };
      };
    };
  };
  continuationContents?: { playlistPanelContinuation?: { contents?: PanelContent[] } };
}

/** /next -> queue songs + automix + related (YouTube.next). */
export const parseNext = (json: unknown): NextPage => {
  const res = (json ?? {}) as NextResponse;
  const tabs = res.contents?.singleColumnMusicWatchNextResultsRenderer?.tabbedRenderer?.watchNextTabbedResultsRenderer?.tabs;
  const panel = res.continuationContents?.playlistPanelContinuation?.contents
    ?? tabs?.[0]?.tabRenderer?.content?.musicQueueRenderer?.content?.playlistPanelRenderer?.contents
    ?? [];

  const songs = panel
    .map(c => (c.playlistPanelVideoRenderer ? songFromPanelVideo(c.playlistPanelVideoRenderer) : null))
    .filter((s): s is YTSong => s !== null);

  const automixEndpoint = panel[panel.length - 1]?.automixPreviewVideoRenderer?.content?.automixPlaylistVideoRenderer?.navigationEndpoint?.watchPlaylistEndpoint;
  const automix = automixEndpoint?.playlistId
    ? { playlistId: automixEndpoint.playlistId, params: automixEndpoint.params, videoId: automixEndpoint.videoId }
    : undefined;

  return { songs, automix, relatedBrowseId: tabs?.[2]?.tabRenderer?.endpoint?.browseEndpoint?.browseId };
};

/** /browse (related tab) -> audio tracks from its carousels (YouTube.related). */
export const parseRelatedSongs = (json: unknown): YTSong[] => {
  const carousels = collect<{ contents?: ShelfContent[] }>(json, 'musicCarouselShelfRenderer');
  return carousels
    .flatMap(c => c.contents ?? [])
    .map(c => (c.musicResponsiveListItemRenderer ? songFromResponsiveItem(c.musicResponsiveListItemRenderer) : null))
    .filter((s): s is YTSong => s !== null)
    // Echo keeps only real audio tracks from Related, never music videos.
    .filter(s => !s.musicVideoType || s.musicVideoType === 'MUSIC_VIDEO_TYPE_ATV');
};
