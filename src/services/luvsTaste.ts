/**
 * Luvs learns from what the listener streams, the way Echo Music recommends:
 * take the songs they actually play, ask YouTube Music for each one's radio
 * (automix / related), and resolve those to catalog audio. The Kotlin engine
 * weaves the result into every Luvs page alongside its artist discovery.
 *
 * Seeds are weighted by play count and recency (a three-day half-life), taken
 * one per artist so a single favourite can't flood the feed. Results are cached
 * for a while; opening Luvs never waits on YouTube Music for more than a moment.
 */
import { Song, UnifiedSong } from '../types/song';
import { StreamPlay } from '../store/streamHistoryStore';

const HALF_LIFE_MS = 3 * 24 * 60 * 60 * 1000;
const MAX_SEEDS = 5;
const PER_SEED = 8;
const CACHE_MS = 20 * 60 * 1000;

export type Recommend = (seed: UnifiedSong, limit: number) => Promise<UnifiedSong[]>;

const key = (s: { title: string; artist?: string }) =>
  `${s.title.trim().toLowerCase()}|${(s.artist ?? '').trim().toLowerCase()}`;
const primaryArtist = (artist: string | undefined) =>
  (artist ?? '').split(/[,&]| feat\.? | ft\.? /i)[0].trim().toLowerCase();

const asSeed = (s: Song): UnifiedSong => ({
  id: s.id,
  title: s.title,
  artist: s.artist ?? '',
  highResArt: s.coverImageUri ?? '',
  downloadUrl: '',
  source: 'Local',
  duration: s.duration,
});

/**
 * The songs that best describe current taste: streamed plays scored by count
 * and recency, then the most-played library songs as a fallback, one per artist.
 */
export function tasteSeeds(plays: StreamPlay[], library: Song[], now = Date.now(), max = MAX_SEEDS): UnifiedSong[] {
  const scored = plays
    .map(p => ({ song: p.song, score: p.plays * Math.pow(0.5, (now - p.playedAt) / HALF_LIFE_MS) }))
    .sort((a, b) => b.score - a.score)
    .map(x => x.song);
  const fromLibrary = [...library]
    .filter(s => s.playCount > 0 && s.artist && s.artist !== 'Unknown Artist')
    .sort((a, b) => b.playCount - a.playCount)
    .slice(0, 20)
    .map(asSeed);

  const artists = new Set<string>();
  const seeds: UnifiedSong[] = [];
  for (const song of [...scored, ...fromLibrary]) {
    const artist = primaryArtist(song.artist);
    if (!artist || artists.has(artist)) continue;
    artists.add(artist);
    seeds.push(song);
    if (seeds.length >= max) break;
  }
  return seeds;
}

/**
 * Radio for each seed, merged round-robin so every seed is represented near the
 * top, without the seeds themselves and without duplicates.
 */
export async function tasteRecommendations(seeds: UnifiedSong[], recommend: Recommend, perSeed = PER_SEED): Promise<UnifiedSong[]> {
  const lists = await Promise.all(seeds.map(seed => recommend(seed, perSeed).catch(() => [] as UnifiedSong[])));
  const exclude = new Set(seeds.map(key));
  const out: UnifiedSong[] = [];
  const longest = Math.max(0, ...lists.map(l => l.length));
  for (let i = 0; i < longest; i++) {
    for (const list of lists) {
      const song = list[i];
      if (!song || !(song.streamUrl || song.downloadUrl)) continue;
      const k = key(song);
      if (exclude.has(k)) continue;
      exclude.add(k);
      out.push(song);
    }
  }
  return out;
}

let cache: { seeds: string; at: number; songs: UnifiedSong[] } | null = null;
let inFlight: Promise<UnifiedSong[]> | null = null;

/** Cached taste recommendations for the current seeds. */
export function loadTaste(plays: StreamPlay[], library: Song[], recommend: Recommend): Promise<UnifiedSong[]> {
  const seeds = tasteSeeds(plays, library);
  if (seeds.length === 0) return Promise.resolve([]);
  const seedKey = seeds.map(key).join('~');
  if (cache && cache.seeds === seedKey && Date.now() - cache.at < CACHE_MS) return Promise.resolve(cache.songs);
  if (inFlight) return inFlight;
  inFlight = tasteRecommendations(seeds, recommend)
    .then(songs => {
      cache = { seeds: seedKey, at: Date.now(), songs };
      return songs;
    })
    .finally(() => { inFlight = null; });
  return inFlight;
}

/** For tests. */
export function resetTasteCache(): void {
  cache = null;
  inFlight = null;
}
