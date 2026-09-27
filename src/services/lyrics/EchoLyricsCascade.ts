/**
 * Walks the Echo Music lyrics providers in order.
 *
 * `fetchBest` returns the first synced result, remembering the first plain
 * result as a fallback. `fetchAll` asks every provider at once and returns
 * everything that came back — used by the lyrics picker.
 */
import { cacheKey, TtlCache } from '../net/fetchWithTimeout';
import {
  DEFAULT_PROVIDER_ORDER,
  LYRICS_PROVIDERS,
  LyricsProviderName,
  LyricsQuery,
  ProviderLyrics,
} from './providers';

const cache = new TtlCache<ProviderLyrics>(6 * 60 * 60 * 1000);

const cleanQuery = (q: LyricsQuery): LyricsQuery => ({
  ...q,
  title: q.title
    .replace(/\.(mp3|m4a|flac|wav|ogg|opus)$/i, '')
    .replace(/[([](official|lyrics?|audio|video|visuali[sz]er|mv|hd|4k|mp3_\d+k)[^)\]]*[)\]]/gi, '')
    .replace(/\s+/g, ' ')
    .trim(),
  artist: q.artist === 'Unknown Artist' ? '' : q.artist.trim(),
});

export const EchoLyricsCascade = {
  async fetchBest(
    query: LyricsQuery,
    order: LyricsProviderName[] = DEFAULT_PROVIDER_ORDER,
    syncedOnly = false,
  ): Promise<ProviderLyrics | null> {
    const q = cleanQuery(query);
    if (!q.title || !q.artist) return null;

    const key = cacheKey(q.title, q.artist, q.album, q.duration ? Math.round(q.duration) : '', syncedOnly);
    const cached = cache.get(key);
    if (cached) return cached;

    let plainFallback: ProviderLyrics | null = null;
    for (const name of order) {
      const provider = LYRICS_PROVIDERS[name];
      if (!provider) continue;
      const hit = await provider(q);
      if (!hit) continue;
      if (hit.synced) {
        cache.set(key, hit);
        return hit;
      }
      plainFallback ??= hit;
    }
    if (plainFallback && !syncedOnly) {
      cache.set(key, plainFallback);
      return plainFallback;
    }
    return null;
  },

  async fetchAll(query: LyricsQuery, order: LyricsProviderName[] = DEFAULT_PROVIDER_ORDER): Promise<ProviderLyrics[]> {
    const q = cleanQuery(query);
    if (!q.title || !q.artist) return [];
    const settled = await Promise.all(order.map(name => LYRICS_PROVIDERS[name]?.(q) ?? Promise.resolve(null)));
    return settled.filter((r): r is ProviderLyrics => r !== null);
  },

  clearCache(): void {
    cache.clear();
  },
};
