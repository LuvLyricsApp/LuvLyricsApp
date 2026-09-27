/**
 * Finds real cover art for library songs that don't have any.
 *
 *   1. iTunes Search — Apple's catalog art, requested at 1000×1000.
 *   2. JioSaavn search — strongest for Indian catalogs.
 *
 * A candidate is only accepted when title, artist and (when known) duration
 * agree — a wrong cover is worse than the designed placeholder. Sources are
 * injected so the matching rules are testable without the network.
 */
import { UnifiedSong } from '../../types/song';
import { buildUrl, fetchJson } from '../net/fetchWithTimeout';
import { matchScore } from '../ytmusic/resolver';

export interface CoverQuery {
  title: string;
  artist?: string;
  /** Seconds, when known. */
  duration?: number;
}

export interface CoverCandidate {
  title: string;
  artist: string;
  duration?: number;
  artwork: string;
  source: 'iTunes' | 'Saavn';
}

export type CoverSource = (q: CoverQuery) => Promise<CoverCandidate[]>;

interface ITunesTrack {
  trackName?: string;
  artistName?: string;
  trackTimeMillis?: number;
  artworkUrl100?: string;
}

/** iTunes serves any square size from the same path; 1000 is sharp on 3× screens. */
export const upscaleItunesArtwork = (url: string, px = 1000): string =>
  url.replace(/\/\d+x\d+(bb|-\d+)?\.(jpg|png|webp)$/i, `/${px}x${px}bb.jpg`);

export const itunesSource: CoverSource = async q => {
  const term = [q.title, q.artist].filter(Boolean).join(' ');
  const res = await fetchJson<{ results?: ITunesTrack[] }>(
    buildUrl('https://itunes.apple.com/search', { term, media: 'music', entity: 'song', limit: 8 }),
  );
  return (res?.results ?? [])
    .filter(t => t.trackName && t.artistName && t.artworkUrl100)
    .map(t => ({
      title: t.trackName as string,
      artist: t.artistName as string,
      duration: t.trackTimeMillis ? Math.round(t.trackTimeMillis / 1000) : undefined,
      artwork: upscaleItunesArtwork(t.artworkUrl100 as string),
      source: 'iTunes' as const,
    }));
};

export const catalogSource = (search: (q: string) => Promise<UnifiedSong[]>): CoverSource => async q => {
  const results = await search([q.title, q.artist].filter(Boolean).join(' ')).catch(() => []);
  return results
    .filter(s => s.highResArt)
    .map(s => ({ title: s.title, artist: s.artist, duration: s.duration, artwork: s.highResArt, source: 'Saavn' as const }));
};

/** Same acceptance rules the stream resolver uses: title, artist overlap, duration within tolerance. */
export const isConfidentMatch = (q: CoverQuery, c: CoverCandidate): boolean => {
  if (!q.artist || q.artist === 'Unknown Artist') return false; // title alone matches too many covers
  return (
    matchScore(
      { videoId: 'cover', title: q.title, artists: [q.artist], duration: q.duration && q.duration > 0 ? q.duration : undefined },
      { id: 'c', title: c.title, artist: c.artist, duration: c.duration, highResArt: c.artwork, downloadUrl: c.artwork, source: 'Saavn' },
    ) !== null
  );
};

export async function findCover(q: CoverQuery, sources: CoverSource[]): Promise<CoverCandidate | null> {
  for (const source of sources) {
    const candidates = await source(q).catch(() => []);
    const hit = candidates.find(c => isConfidentMatch(q, c));
    if (hit) return hit;
  }
  return null;
}
