/**
 * YouTube Music decides *what* plays next; the catalog provider supplies the
 * audio. A YT song is matched to a Saavn/Gaana track by title, artist and
 * duration. Songs with no confident match are skipped rather than guessed.
 *
 * As in Echo Music, what the listener sees is YouTube Music's official entry —
 * its title, artists and album art — and only the audio comes from the catalog
 * match. Catalogs carry covers, karaoke tracks and re-uploads with their own
 * artwork; showing those made the same song appear with "other cover arts".
 */
import { UnifiedSong } from '../../types/song';
import { cacheKey, TtlCache } from '../net/fetchWithTimeout';
import { artistsOverlap, fuzzyContains } from '../canvas/matching';
import { streamUrlOf } from '../stream/streamSong';
import { YTSong } from './parsers';
import { titleCaseShouting } from '../../utils/sentenceCase';

export type CatalogSearch = (query: string) => Promise<UnifiedSong[]>;

const DURATION_TOLERANCE = 8; // seconds

/**
 * Words that mark a different recording of a song. A catalog candidate carrying
 * one is rejected unless the YouTube Music title asked for it too.
 */
const VARIANT_MARKERS = [
  'cover', 'karaoke', 'instrumental', 'lofi', 'lo-fi', 'slowed', 'reverb', 'sped up',
  'speed up', 'nightcore', '8d', 'remix', 'reprise', 'unplugged', 'acoustic', 'live',
  'mashup', 'rendition', 'tribute', 'female version', 'male version', 'piano version',
  'flute', 'violin', 'ringtone', 'bgm',
];

export const variantsIn = (title: string): string[] => {
  const t = ` ${title.toLowerCase().replace(/[^a-z0-9 -]/g, ' ')} `;
  return VARIANT_MARKERS.filter(m => t.includes(` ${m} `) || t.includes(` ${m}ed `));
};

/** Drops "(Official Video)", "(From 'Movie')", "[Remastered]" etc. before comparing. */
export const normalizeTitle = (title: string): string =>
  title
    .replace(/\s*[([](official|lyrics?|audio|video|visuali[sz]er|remaster(ed)?|from\s[^)\]]*|feat\.?[^)\]]*|ft\.?[^)\]]*)[^)\]]*[)\]]/gi, '')
    .replace(/\s+-\s+(remaster(ed)?|live|radio edit).*$/i, '')
    .replace(/[()[\]]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

/** Higher is better; null = not the same recording. */
export const matchScore = (yt: YTSong, candidate: UnifiedSong): number | null => {
  if (!streamUrlOf(candidate)) return null;
  const wanted = new Set(variantsIn(yt.title));
  if (variantsIn(candidate.title).some(v => !wanted.has(v))) return null;
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

/** The best catalog match for a YT song among `candidates`, or null. */
const bestMatch = (yt: YTSong, candidates: UnifiedSong[]): UnifiedSong | null => {
  let best: { song: UnifiedSong; score: number } | null = null;
  for (const c of candidates) {
    const score = matchScore(yt, c);
    if (score !== null && (!best || score > best.score)) best = { song: c, score };
  }
  return best?.song ?? null;
};

/** Catalog audio, YouTube Music's official identity (Echo Music's model). */
const withOfficialIdentity = (yt: YTSong, song: UnifiedSong): UnifiedSong => ({
  ...song,
  title: titleCaseShouting(yt.title || song.title),
  artist: titleCaseShouting(yt.artists.length > 0 ? yt.artists.join(', ') : song.artist),
  highResArt: yt.thumbnail || song.highResArt,
  duration: yt.duration || song.duration,
});

/**
 * `primed` is catalog results already in hand (a search for the same query):
 * a match there saves the per-song catalog request.
 */
export const resolveToCatalog = async (
  yt: YTSong,
  search: CatalogSearch,
  primed: UnifiedSong[] = [],
): Promise<UnifiedSong | null> => {
  const key = cacheKey(yt.videoId);
  const hit = resolved.get(key);
  if (hit !== undefined) return hit;

  let match = bestMatch(yt, primed);
  if (!match) {
    const candidates = await search(`${yt.title} ${yt.artists[0] ?? ''}`.trim()).catch(() => []);
    match = bestMatch(yt, candidates);
  }
  const result = match ? withOfficialIdentity(yt, match) : null;
  resolved.set(key, result);
  return result;
};

/** Resolves in order with bounded concurrency; stops once `limit` matches are found. */
export const resolveMany = async (
  songs: YTSong[],
  search: CatalogSearch,
  limit: number,
  concurrency = 4,
  primed: UnifiedSong[] = [],
): Promise<UnifiedSong[]> => {
  const out: (UnifiedSong | null)[] = new Array(songs.length).fill(null);
  let cursor = 0;
  let found = 0;
  const worker = async () => {
    while (cursor < songs.length && found < limit) {
      const i = cursor++;
      const match = await resolveToCatalog(songs[i], search, primed);
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
