/**
 * Resolves the motion canvas for a song by walking the provider cascade.
 * Hits are cached for a day so skipping back and forth never refetches.
 */
import { cacheKey, TtlCache } from '../net/fetchWithTimeout';
import {
  fetchAppleMusicCanvas,
  fetchArtistVideoCanvas,
  fetchEchoCanvas,
  fetchTidalCanvas,
} from './providers';
import { CanvasArtwork, CanvasCredentials, CanvasQuery } from './types';

const DAY_MS = 24 * 60 * 60 * 1000;
// A miss is remembered briefly only: it may just mean the phone was offline.
const MISS_TTL_MS = 30 * 60 * 1000;
const hits = new TtlCache<CanvasArtwork>(DAY_MS);
const misses = new TtlCache<true>(MISS_TTL_MS);
const inFlight = new Map<string, Promise<CanvasArtwork | null>>();

type Step = (q: CanvasQuery, c: CanvasCredentials) => Promise<CanvasArtwork | null>;

/** Keyless sources (Echo Canvas manifest, ArchiveTune artist video) — tried per artist spelling. */
const FREE: Step[] = [
  q => fetchEchoCanvas(q),
  q => fetchArtistVideoCanvas(q),
];
/** Sources that need the listener's own token from Settings. */
const KEYED: Step[] = [
  (q, c) => fetchTidalCanvas(q, c),
  (q, c) => fetchAppleMusicCanvas(q, c),
];

/** "A, B & C" -> "A": archives file a song under its lead artist. */
const leadArtist = (artist: string): string => artist.split(/,|&| feat\.? | ft\.? | x /i)[0].trim();

/** Strips "(Official Video)", "[Lyrics]", "(feat. X)" etc. that break matching. */
export const cleanTitleForLookup = (title: string): string =>
  title
    .replace(/\.(mp3|m4a|flac|wav|ogg|opus)$/i, '')
    .replace(/[([](official|lyrics?|audio|video|visuali[sz]er|mv|hd|4k)[^)\]]*[)\]]/gi, '')
    .replace(/[([](feat\.?|ft\.?|featuring)[^)\]]*[)\]]/gi, '')
    // Official YouTube Music titles: 'Marandhaye (From "Teddy")'.
    .replace(/[([]from\s[^)\]]*[)\]]/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

export const CanvasService = {
  /**
   * Concurrent callers for the same song share one walk, so the walk is not
   * tied to any single caller's lifetime — callers drop stale results instead.
   */
  async resolve(query: CanvasQuery, creds: CanvasCredentials = {}): Promise<CanvasArtwork | null> {
    const title = cleanTitleForLookup(query.title);
    const artist = query.artist === 'Unknown Artist' ? '' : query.artist.trim();
    if (!title || !artist) return null;

    const q: CanvasQuery = { ...query, title, artist };
    const key = cacheKey(title, artist, query.album, Boolean(creds.appleMusicToken), Boolean(creds.tidalToken));
    const cached = hits.get(key);
    if (cached) return cached;
    if (misses.has(key)) return null;

    const pending = inFlight.get(key);
    if (pending) return pending;

    const lead = leadArtist(artist);
    const spellings = lead && lead !== artist ? [q, { ...q, artist: lead }] : [q];
    const run = (async () => {
      for (const spelling of spellings) {
        for (const step of FREE) {
          const hit = await step(spelling, creds);
          if (hit) return hit;
        }
      }
      for (const step of KEYED) {
        const hit = await step(q, creds);
        if (hit) return hit;
      }
      return null;
    })();

    inFlight.set(key, run);
    try {
      const result = await run;
      if (result) hits.set(key, result);
      else misses.set(key, true);
      return result;
    } finally {
      inFlight.delete(key);
    }
  },

  clearCache(): void {
    hits.clear();
    misses.clear();
  },
};
