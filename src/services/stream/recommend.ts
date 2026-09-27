/**
 * "What should play after this song?" — Echo Music's answer, LuvLyrics' audio.
 *
 *   1. Find the seed on YouTube Music (songs search).
 *   2. Take its automix radio, as Echo's queue does; fall back to Related.
 *   3. Resolve each YT track to a streamable Saavn/Gaana song.
 *   4. If YouTube Music is unreachable or little resolves, use Saavn's own radio.
 */
import { UnifiedSong } from '../../types/song';
import { getRecommendations, searchMusic } from '../MultiSourceSearchService';
import { YTMusicClient } from '../ytmusic/YTMusicClient';
import { YTSong } from '../ytmusic/parsers';
import { matchScore, resolveMany } from '../ytmusic/resolver';
import { cacheKey, TtlCache } from '../net/fetchWithTimeout';
import { dedupeStreamable } from './streamSong';

const MIN_YT_RESULTS = 3;
const seedVideoIds = new TtlCache<string | null>(7 * 24 * 60 * 60 * 1000, 500);

export interface RecommendDeps {
  searchYT: (q: string) => Promise<YTSong[]>;
  radioYT: (videoId: string) => Promise<YTSong[]>;
  relatedYT: (videoId: string) => Promise<YTSong[]>;
  searchCatalog: (q: string) => Promise<UnifiedSong[]>;
  catalogRadio: (providerId: string) => Promise<UnifiedSong[]>;
}

export const defaultDeps: RecommendDeps = {
  searchYT: q => YTMusicClient.searchSongs(q),
  radioYT: id => YTMusicClient.radio(id),
  relatedYT: id => YTMusicClient.related(id),
  searchCatalog: q => searchMusic(q),
  catalogRadio: id => getRecommendations(id),
};

/** Finds the YouTube Music videoId of a catalog song (same title/artist/duration rules as resolving). */
export const findSeedVideoId = async (seed: UnifiedSong, deps: RecommendDeps): Promise<string | null> => {
  const key = cacheKey(seed.source, seed.id);
  const hit = seedVideoIds.get(key);
  if (hit !== undefined) return hit;
  const results = await deps.searchYT(`${seed.title} ${seed.artist.split(',')[0]}`).catch(() => []);
  let best: { id: string; score: number } | null = null;
  for (const yt of results) {
    // Score the YT result against the seed by pretending the seed is the candidate.
    const score = matchScore(yt, { ...seed, downloadUrl: seed.downloadUrl || 'seed' });
    if (score !== null && (!best || score > best.score)) best = { id: yt.videoId, score };
  }
  const id = best?.id ?? null;
  seedVideoIds.set(key, id);
  return id;
};

export async function recommendFor(
  seed: UnifiedSong,
  limit = 15,
  deps: RecommendDeps = defaultDeps,
): Promise<UnifiedSong[]> {
  let fromYT: UnifiedSong[] = [];
  const videoId = await findSeedVideoId(seed, deps);
  if (videoId) {
    let mix = await deps.radioYT(videoId).catch(() => []);
    if (mix.length === 0) mix = await deps.relatedYT(videoId).catch(() => []);
    fromYT = await resolveMany(mix, deps.searchCatalog, limit);
  }
  const exclude = [`${seed.title.trim().toLowerCase()}|${seed.artist.trim().toLowerCase()}`];
  if (fromYT.length >= MIN_YT_RESULTS) return dedupeStreamable(fromYT, exclude).slice(0, limit);

  const fallback = seed.source === 'Saavn' ? await deps.catalogRadio(seed.id).catch(() => []) : [];
  return dedupeStreamable([...fromYT, ...fallback], exclude).slice(0, limit);
}

export const clearRecommendCache = (): void => seedVideoIds.clear();
