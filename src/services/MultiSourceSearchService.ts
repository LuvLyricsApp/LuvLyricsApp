import { UnifiedSong } from '../types/song';
import {
  ProviderDownloadResponse,
  ProviderImageResponse,
  SaavnGaanaRecommendationsResponse,
  SaavnGaanaSearchResponse,
  SaavnGaanaSongResponse,
} from '../types/providerResponses';

// Fake browser headers to bypass Cloudflare Bot Protection
const BROWSER_HEADERS = {
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1'
};

// LAYER 1: JioSaavn (The Official 320kbps Standard)
const SAAVN_API = 'https://jiosaavn-api-byprats.vercel.app/api'; 

// LAYER 2: Gaana (Fallback)
const GAANA_API = 'https://gaanaapibyprats.vercel.app/api';

type ProviderSource = 'Saavn' | 'Gaana';

const createTimeout = (ms: number): Promise<never> =>
  new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), ms));

const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const getBestImage = (images: ProviderImageResponse[] = []): ProviderImageResponse | undefined =>
  images.find(i => i.quality === '500x500') || images[images.length - 1];

const getBestDownload = (downloads: ProviderDownloadResponse[] = []): ProviderDownloadResponse | undefined =>
  downloads.find(u => u.quality === '320kbps') || downloads[downloads.length - 1];

const getArtistName = (song: SaavnGaanaSongResponse): string => {
  if (typeof song.primaryArtists === 'string') {
    return song.primaryArtists;
  }

  const primaryArtists = song.artists?.primary;
  if (primaryArtists?.[0]) {
    return primaryArtists.map(a => a.name).filter(Boolean).join(', ');
  }

  return 'Unknown Artist';
};

const parsePlays = (val: string | number | undefined): number => {
  if (typeof val === 'number') return val;
  if (typeof val === 'string') return parseInt(val.replace(/[^0-9]/g, '') || '0', 10);
  return 0;
};

const decodeHtml = (str: string): string =>
  str
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));

const mapProviderSong = (song: SaavnGaanaSongResponse, source: ProviderSource): UnifiedSong => {
  const highResImage = getBestImage(song.image);
  const topQuality = getBestDownload(song.downloadUrl);

  return {
    id: song.id ?? '',
    title: decodeHtml(song.name || song.title || ''),
    artist: decodeHtml(getArtistName(song)),
    highResArt: highResImage?.url || '',
    downloadUrl: topQuality?.url || '',
    hasLyrics: song.hasLyrics === true,
    source,
    duration: song.duration,
    playCount: source === 'Saavn' ? parsePlays(song.playCount || song.play_count) : 0,
    language: song.language,
  };
};

/**
 * ============================================================================
 * LAYER 2: GAANA (Fallback Source)
 * ============================================================================
 */
async function searchGaana(query: string): Promise<UnifiedSong[]> {
  try {
    console.log(`[Gaana] Searching (Fallback): ${query}`);
    const searchUrl = `${GAANA_API}/search/songs?query=${encodeURIComponent(query)}&limit=20`;

    const timeoutPromise = createTimeout(25000);

    const response = await Promise.race([
        fetch(searchUrl, {
            headers: BROWSER_HEADERS,
        }),
        timeoutPromise
    ]) as Response;

    if (!response.ok) return [];

    const json = await response.json() as SaavnGaanaSearchResponse;
    const results = json.data?.results;
    if (!json.success || !Array.isArray(results)) return [];

    return results
      .map(song => mapProviderSong(song, 'Gaana'))
      .filter((s: UnifiedSong) => s.downloadUrl);

  } catch (error: unknown) {
    if (__DEV__) console.error('[MultiSourceSearchService.searchGaana] Async error:', error);
    return [];
  }
}

/**
 * ============================================================================
 * LAYER 1: JIOSAAVN (The Official Source)
 * ============================================================================
 */
async function searchSaavn(query: string): Promise<UnifiedSong[]> {
  try {
    console.log(`[Saavn] Searching: ${query}`);
    const searchUrl = `${SAAVN_API}/search/songs?query=${encodeURIComponent(query)}&limit=20`;

    const timeoutPromise = createTimeout(25000);

    const response = await Promise.race([
        fetch(searchUrl, {
            headers: BROWSER_HEADERS,
        }),
        timeoutPromise
    ]) as Response;

    if (!response.ok) {
        if (__DEV__) console.error('[MultiSourceSearchService.searchSaavn.httpError] HTTP error:', new Error(`HTTP ${response.status}`));
        return [];
    }

    const json = await response.json() as SaavnGaanaSearchResponse;
    const results = json.data?.results;
    if (!json.success || !Array.isArray(results)) {
         return [];
    }

    return results
      .map(song => mapProviderSong(song, 'Saavn'))
      .filter((s: UnifiedSong) => s.downloadUrl);

  } catch (error: unknown) {
    if (__DEV__) console.error('[MultiSourceSearchService.searchSaavn] Async error:', error);
    return [];
  }
}

/**
 * Main Search Interface
 * Now exclusively uses Saavn for reliability
 */
export async function searchMusic(query: string, artistName?: string, onProgress?: (status: string) => void): Promise<UnifiedSong[]> {
  console.log(`[SearchEngine] 🚀 Searching JioSaavn. Query: "${query}"`);
  onProgress?.('Searching JioSaavn...');

  try {
      let results = await searchSaavn(query);
      
      // FALLBACK TO GAANA
      if (results.length === 0) {
          console.log(`[SearchEngine] ⚠️ Saavn returned 0 results. Trying Gaana...`);
          onProgress?.('Saavn empty. Trying Gaana...');
          const gaanaResults = await searchGaana(query);
          results = gaanaResults;
      }

      if (artistName && results.length > 0) {
        const lowerArtist = artistName.toLowerCase();
        results = results.filter(s => 
          s.artist.toLowerCase().includes(lowerArtist) || 
          lowerArtist.includes(s.artist.toLowerCase())
        );
      }

      // Sort by popularity and authenticity
      return results.sort((a, b) => {
          if (a.isAuthentic !== b.isAuthentic) return a.isAuthentic ? -1 : 1; 
          return (b.playCount || 0) - (a.playCount || 0);
      });

  } catch (error: unknown) {
      const message = getErrorMessage(error);
      const name = error instanceof Error ? error.name : '';
      if (message === 'TIMEOUT' || name === 'AbortError' || message.includes('Network request failed')) {
          console.warn(`[SearchEngine] Network timeout/error for "${query}".`);
      } else {
          if (__DEV__) console.error('[MultiSourceSearchService.searchMusic] Async error:', error);
      }
      return [];
  }
}

/**
 * Recommendations (Saavn Radio)
 */
export async function getRecommendations(songId: string): Promise<UnifiedSong[]> {
  try {
    const url = `${SAAVN_API}/songs/${songId}/suggestions?limit=15`;
    const response = await fetch(url, { headers: BROWSER_HEADERS });
    if (!response.ok) return [];

    const json = await response.json() as SaavnGaanaRecommendationsResponse;
    if (!json.success || !json.data) return [];

    const results = json.data;

    return (Array.isArray(results) ? results : [results])
      .map(song => mapProviderSong(song, 'Saavn'))
      .filter((s: UnifiedSong) => s.downloadUrl);

  } catch (error) {
    console.warn(`[SaavnRecs] Failed:`, error);
    return [];
  }
}

export const MultiSourceSearchService = {
  searchMusic,
  searchSaavn,
  getRecommendations
};
