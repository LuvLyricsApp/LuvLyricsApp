/**
 * Canvas providers, in the order Echo Music tries them.
 *
 * 1. EchoCanvas  — community manifest of hand-mapped song -> mp4/m3u8 loops.
 * 2. ArtistVideo — ArchiveTune's public artwork service (animated covers).
 * 3. Tidal       — album video covers, needs a Tidal client token (optional).
 * 4. AppleMusic  — album motion artwork via the official Apple Music API,
 *                  needs YOUR MusicKit developer token (optional).
 *
 * Each provider returns null on any failure; none of them throw.
 */
import { buildUrl, fetchJson } from '../net/fetchWithTimeout';
import { CanvasArtwork, CanvasCredentials, CanvasQuery, toArtwork } from './types';
import { artistsOverlap, fuzzyContains, isBlacklistedCollection, MIN_MATCH_SCORE, scoreResult } from './matching';

// ─── 1. Echo Music canvas manifest ──────────────────────────────────────────

const ECHO_CANVAS_MANIFEST = 'https://canvas.echomusic.fun/canvas.json';
const MANIFEST_TTL_MS = 60_000;

interface EchoCanvasItem { song?: string; artist?: string; url?: string }
interface EchoCanvasManifest { items?: EchoCanvasItem[] }

let manifestCache: { items: EchoCanvasItem[]; expiresAt: number } | null = null;

const loadEchoManifest = async (signal?: AbortSignal): Promise<EchoCanvasItem[]> => {
  if (manifestCache && manifestCache.expiresAt > Date.now()) return manifestCache.items;
  const manifest = await fetchJson<EchoCanvasManifest>(ECHO_CANVAS_MANIFEST, { signal, timeoutMs: 10_000 });
  if (!manifest) return manifestCache?.items ?? [];
  const items = Array.isArray(manifest.items) ? manifest.items : [];
  manifestCache = { items, expiresAt: Date.now() + MANIFEST_TTL_MS };
  return items;
};

export const resetEchoManifestCache = (): void => { manifestCache = null; };

export const fetchEchoCanvas = async ({ title, artist }: CanvasQuery, signal?: AbortSignal): Promise<CanvasArtwork | null> => {
  if (!title.trim() || !artist.trim()) return null;
  const items = await loadEchoManifest(signal);
  const hit = items.find(item =>
    item.song && item.artist && item.url &&
    fuzzyContains(title, item.song) && fuzzyContains(artist, item.artist),
  );
  return hit?.url ? toArtwork(hit.url, 'EchoCanvas', { name: hit.song, artist: hit.artist }) : null;
};

// ─── 2. ArchiveTune artist video ────────────────────────────────────────────

const ARTIST_VIDEO_BASE = 'https://artwork-archivetune.koiiverse.cloud/';

interface ArtistVideoResponse {
  name?: string;
  artist?: string;
  albumId?: string;
  static?: string;
  animated?: string;
  videoUrl?: string;
}

export const fetchArtistVideoCanvas = async (
  { title, artist, album, duration }: CanvasQuery,
  signal?: AbortSignal,
): Promise<CanvasArtwork | null> => {
  if (!title.trim() || !artist.trim()) return null;
  const url = buildUrl(ARTIST_VIDEO_BASE, {
    s: title,
    a: artist,
    al: album,
    d: duration && duration > 0 ? Math.round(duration) : undefined,
  });
  const res = await fetchJson<ArtistVideoResponse>(url, { signal, timeoutMs: 10_000 });
  const motion = res?.animated || res?.videoUrl;
  if (!res || !motion) return null;
  if (res.artist && !artistsOverlap(artist, res.artist)) return null;
  return toArtwork(motion, 'ArtistVideo', { name: res.name, artist: res.artist, poster: res.static });
};

// ─── 3. Tidal video covers ──────────────────────────────────────────────────

const TIDAL_API = 'https://api.tidal.com/v1/search';

interface TidalArtist { name?: string }
interface TidalAlbum { title?: string; videoCover?: string | null }
interface TidalItem {
  title?: string;
  artist?: TidalArtist;
  artists?: TidalArtist[];
  album?: TidalAlbum;
  videoCover?: string | null;
}
interface TidalSearchResponse {
  tracks?: { items?: TidalItem[] };
  albums?: { items?: TidalItem[] };
}

/** Tidal returns a UUID; the playable loop lives at a path built from its parts. */
export const tidalVideoUrl = (videoCover: string): string | null => {
  const parts = videoCover.split('-');
  if (parts.length !== 5) return null;
  return `https://resources.tidal.com/videos/${parts.join('/')}/1280x1280.mp4`;
};

export const fetchTidalCanvas = async (
  { title, artist, album }: CanvasQuery,
  creds: CanvasCredentials,
  signal?: AbortSignal,
): Promise<CanvasArtwork | null> => {
  const token = creds.tidalToken?.trim();
  if (!token || !title.trim() || !artist.trim()) return null;

  const url = buildUrl(TIDAL_API, {
    query: album ? `${album} ${artist} ${title}` : `${artist} ${title}`,
    limit: 10,
    types: 'TRACKS',
    countryCode: (creds.storefront ?? 'us').toUpperCase(),
  });
  const res = await fetchJson<TidalSearchResponse>(url, { signal, headers: { 'X-Tidal-Token': token } });
  for (const item of res?.tracks?.items ?? []) {
    if (item.title && !fuzzyContains(item.title, title)) continue;
    const primary = item.artist?.name ?? item.artists?.[0]?.name;
    if (primary && !artistsOverlap(artist, primary)) continue;
    const cover = item.album?.videoCover;
    const videoUrl = cover ? tidalVideoUrl(cover) : null;
    if (videoUrl) {
      return toArtwork(videoUrl, 'Tidal', { name: item.title, artist: primary, albumName: item.album?.title });
    }
  }
  return null;
};

// ─── 4. Apple Music motion artwork (official API, user token) ───────────────

const APPLE_API = 'https://api.music.apple.com/v1/catalog';

interface AppleVideoAsset { video?: string; videoUrl?: string; hlsUrl?: string; url?: string }
interface AppleEditorialVideo {
  motionDetailRaw?: AppleVideoAsset;
  motionDetailSquare?: AppleVideoAsset;
  motionDetailTall?: AppleVideoAsset;
  motionSquareVideo1x1?: AppleVideoAsset;
  motionDetailStatic?: AppleVideoAsset;
}
interface AppleAttributes {
  name?: string;
  artistName?: string;
  albumName?: string;
  url?: string;
  editorialVideo?: AppleEditorialVideo;
}
interface AppleResource {
  id?: string;
  type?: string;
  attributes?: AppleAttributes;
  relationships?: { albums?: { data?: { id?: string }[] } };
}
interface AppleSearchResponse { results?: { songs?: { data?: AppleResource[] } } }
interface AppleAlbumResponse { data?: AppleResource[] }

export const extractEditorialVideoUrl = (ev?: AppleEditorialVideo): string | null => {
  if (!ev) return null;
  const assets = [ev.motionDetailSquare, ev.motionSquareVideo1x1, ev.motionDetailRaw, ev.motionDetailTall, ev.motionDetailStatic];
  for (const asset of assets) {
    const url = asset?.video || asset?.videoUrl || asset?.hlsUrl || asset?.url;
    if (url) return url;
  }
  return null;
};

/** music.apple.com/{sf}/album/{slug}/{albumId}?i={songId} */
const albumIdFromUrl = (url?: string): string | null => {
  const match = url?.match(/\/album\/[^/]+\/(\d+)/);
  return match?.[1] ?? null;
};

export const fetchAppleMusicCanvas = async (
  { title, artist, album }: CanvasQuery,
  creds: CanvasCredentials,
  signal?: AbortSignal,
): Promise<CanvasArtwork | null> => {
  const token = creds.appleMusicToken?.trim();
  if (!token || !title.trim() || !artist.trim()) return null;
  const storefront = (creds.storefront ?? 'us').toLowerCase();
  const headers = { Authorization: `Bearer ${token}` };

  let term = fuzzyContains(title, artist) ? title : `${artist} ${title}`;
  if (album && !fuzzyContains(term, album)) term = `${term} ${album}`;

  const search = await fetchJson<AppleSearchResponse>(
    buildUrl(`${APPLE_API}/${storefront}/search`, { term, types: 'songs', limit: 10, include: 'albums' }),
    { signal, headers },
  );

  const ranked = (search?.results?.songs?.data ?? [])
    .map(item => {
      const a = item.attributes;
      if (!a?.name || !a.artistName || isBlacklistedCollection(a.name, a.albumName)) return null;
      const score = scoreResult({
        term: title,
        artist,
        album,
        resultName: a.name,
        resultArtist: a.artistName,
        resultCollection: a.albumName,
      });
      return score === null ? null : { item, score };
    })
    .filter((r): r is { item: AppleResource; score: number } => r !== null && r.score >= MIN_MATCH_SCORE)
    .sort((x, y) => y.score - x.score);

  const tried = new Set<string>();
  for (const { item } of ranked) {
    const albumId = item.relationships?.albums?.data?.[0]?.id ?? albumIdFromUrl(item.attributes?.url);
    if (!albumId || albumId.startsWith('pl.') || tried.has(albumId)) continue;
    tried.add(albumId);

    const res = await fetchJson<AppleAlbumResponse>(
      buildUrl(`${APPLE_API}/${storefront}/albums/${albumId}`, { extend: 'editorialVideo' }),
      { signal, headers },
    );
    const albumAttrs = res?.data?.[0]?.attributes;
    if (!albumAttrs || isBlacklistedCollection(albumAttrs.name)) continue;
    const url = extractEditorialVideoUrl(albumAttrs.editorialVideo);
    if (url) {
      return toArtwork(url, 'AppleMusic', {
        name: item.attributes?.name,
        artist: item.attributes?.artistName ?? albumAttrs.artistName,
        albumName: albumAttrs.name,
      });
    }
  }
  return null;
};
