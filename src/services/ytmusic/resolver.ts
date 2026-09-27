/**
 * YouTube Music decides *what* plays next; the catalog provider supplies the
 * audio. A YT song is matched to a Saavn/Gaana track by title, artist and
 * duration. Songs with no confident match are skipped rather than guessed.
 */
import { UnifiedSong } from '../../types/song';
import { cacheKey, TtlCache } from '../net/fetchWithTimeout';
import { artistsOverlap, fuzzyContains } from '../canvas/matching';
import { streamUrlOf } from '../stream/streamSong';
import { YTSong } from './parsers';

export type CatalogSearch = (query: string) => Promise<UnifiedSong[]>;

const DURATION_TOLERANCE = 8; // seconds

/** Drops "(Official Video)", "(From 'Movie')", "[Remastered]" etc. before comparing. */
export const normalizeTitle = (title: string): string =>
  title
    .replace(/\s*[([](official|lyrics?|audio|video|visuali[sz]er|remaster(ed)?|from\s[^)\]]*|feat\.?[^)\]]*|ft\.?[^)\]]*)[^)\]]*[)\]]/gi, '')
    .replace(/\s+-\s+(remaster(ed)?|live|radio edit).*$/i, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

/** Higher is better; null = not the same recording. */
export const matchScore = (yt: YTSong, candidate: UnifiedSong): number | null => {
  if (!streamUrlOf(candidate)) return null;
  const ytTitle = normalizeTitle(yt.title);
  const cTitle = normalizeTitle(candidate.title);
  const ytArtist = yt.artists.join(', ');
  const titleExact = ytTitle === cTitle;
  if (!titleExact && !fuzzyContains(ytTitle, cTitle)) return null;
  if (!artistsOverlap(ytArtist, candidate.artist) && !fuzzyContains(ytArtist, candidate.artist)) return null;

  let score = titleExact ? 20 : 10;
  if (yt.duration && candidate.duration) {
    const diff = Math.abs(yt.duration - candidate.duration);
    if (diff > DURATION_TOLERANCE * 3) return null; // different cut (extended mix, live)
    score += diff <= DURATION_TOLERANCE ? 10 : 0;
  }
  return score;
};

const resolved = new TtlCache<UnifiedSong | null>(24 * 60 * 60 * 1000, 1000);

export const resolveToCatalog = async (yt: YTSong, search: CatalogSearch): Promise<UnifiedSong | null> => {
  const key = cacheKey(yt.videoId);
  const hit = resolved.get(key);
  if (hit !== undefined) return hit;

  const candidates = await search(`${yt.title} ${yt.artists[0] ?? ''}`.trim()).catch(() => []);
  let best: { song: UnifiedSong; score: number } | null = null;
  for (const c of candidates) {
    const score = matchScore(yt, c);
    if (score !== null && (!best || score > best.score)) best = { song: c, score };
  }
  const result = best?.song ?? null;
  resolved.set(key, result);
  return result;
};

/** Resolves in order with bounded concurrency; stops once `limit` matches are found. */
export const resolveMany = async (
  songs: YTSong[],
  search: CatalogSearch,
  limit: number,
  concurrency = 4,
): Promise<UnifiedSong[]> => {
  const out: (UnifiedSong | null)[] = new Array(songs.length).fill(null);
  let cursor = 0;
  let found = 0;
  const worker = async () => {
    while (cursor < songs.length && found < limit) {
      const i = cursor++;
      const match = await resolveToCatalog(songs[i], search);
      if (match) {
        out[i] = match;
        found++;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, songs.length) }, worker));
  return out.filter((s): s is UnifiedSong => s !== null).slice(0, limit);
};

export const clearResolverCache = (): void => resolved.clear();
