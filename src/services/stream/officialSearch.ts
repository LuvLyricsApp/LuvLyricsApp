/**
 * Search the way Echo Music does: YouTube Music decides which songs a query
 * means and how they look (official title, artists, album art); the catalog
 * only supplies audio. A plain catalog search returns covers, lofi edits and
 * re-uploads of the same song, each with its own artwork.
 *
 * The catalog search for the query runs alongside, so most YT songs match
 * without a request of their own. When YouTube Music is unreachable or little
 * resolves, catalog results fill in — minus the versions nobody asked for.
 */
import { UnifiedSong } from '../../types/song';
import { searchMusic } from '../MultiSourceSearchService';
import { YTMusicClient } from '../ytmusic/YTMusicClient';
import { YTSong } from '../ytmusic/parsers';
import { resolveMany, variantsIn } from '../ytmusic/resolver';
import { dedupeStreamable } from './streamSong';

const MIN_OFFICIAL = 5;

export interface OfficialSearchDeps {
  searchYT: (q: string) => Promise<YTSong[]>;
  searchCatalog: (q: string) => Promise<UnifiedSong[]>;
}

const defaultDeps: OfficialSearchDeps = {
  searchYT: q => YTMusicClient.searchSongs(q),
  searchCatalog: q => searchMusic(q),
};

export async function searchOfficial(
  query: string,
  limit = 20,
  deps: OfficialSearchDeps = defaultDeps,
): Promise<UnifiedSong[]> {
  const q = query.trim();
  if (!q) return [];
  const [yts, catalog] = await Promise.all([
    deps.searchYT(q).catch(() => [] as YTSong[]),
    deps.searchCatalog(q).catch(() => [] as UnifiedSong[]),
  ]);
  const official = await resolveMany(yts, deps.searchCatalog, limit, 6, catalog);
  if (official.length >= MIN_OFFICIAL) return dedupeStreamable(official).slice(0, limit);

  const wanted = new Set(variantsIn(q));
  const plain = catalog.filter(s => variantsIn(s.title).every(v => wanted.has(v)));
  return dedupeStreamable([...official, ...plain]).slice(0, limit);
}
