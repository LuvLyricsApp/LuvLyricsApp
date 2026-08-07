const API_BASE = 'https://www.googleapis.com/youtube/v3/search';

/**
 * Search YouTube for a video matching the song title + artist.
 * Returns the first result's videoId, or null if not found / no key.
 */
export const findYouTubeVideoId = async (
  title: string,
  artist: string,
  apiKey: string,
): Promise<string | null> => {
  if (!apiKey?.trim()) return null;

  try {
    const query = encodeURIComponent(`${title} ${artist}`);
    const url = `${API_BASE}?part=id&type=video&maxResults=1&q=${query}&key=${apiKey.trim()}`;
    const res = await fetch(url);
    if (!res.ok) {
      if (__DEV__) console.warn(`[YTSearch] HTTP ${res.status}`);
      return null;
    }
    const data = await res.json();
    const videoId = data?.items?.[0]?.id?.videoId ?? null;
    if (__DEV__) console.log(`[YTSearch] ${title} → ${videoId}`);
    return videoId;
  } catch (e) {
    if (__DEV__) console.warn('[YTSearch] Failed:', e);
    return null;
  }
};
