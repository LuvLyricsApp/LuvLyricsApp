/**
 * LyricFlow - Tamil2Lyrics Scraper
 * Regional priority for latest Tamil songs
 */


export interface Tamil2LyricsResult {
  lyrics: string;
  language: 'tamil' | 'english';
  source: 'Tamil2Lyrics';
}

class Tamil2LyricsService {
  private readonly BASE_URL = 'https://tamil2lyrics.com';
  private readonly USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

  async searchAndFetch(title: string, artist?: string): Promise<Tamil2LyricsResult | null> {
    try {
      const searchQuery = artist ? `${title} ${artist}` : title;
      const searchUrl = `${this.BASE_URL}/?s=${encodeURIComponent(searchQuery)}`;
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(searchUrl, {
        headers: { 'User-Agent': this.USER_AGENT },
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);

      if (!response.ok) return null;

      const html = await response.text();
      
      // Extract first result link
      const linkMatch = html.match(/<a[^>]+href="([^"]+)"[^>]*class="[^"]*entry-title-link[^"]*"/);
      if (!linkMatch) return null;

      const songUrl = linkMatch[1];
      return await this.fetchLyrics(songUrl);
    } catch (error) {
      if (__DEV__) console.error('[Tamil2LyricsService.searchAndFetch] Async error:', error);
      return null;
    }
  }

  private async fetchLyrics(url: string): Promise<Tamil2LyricsResult | null> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(url, {
        headers: { 'User-Agent': this.USER_AGENT },
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);

      if (!response.ok) return null;

      const html = await response.text();

      // Try English (Romanized) first
      let lyricsMatch = html.match(/<div[^>]+id="English"[^>]*>(.*?)<\/div>/s);
      let language: 'tamil' | 'english' = 'english';

      // Fallback to Tamil script
      if (!lyricsMatch) {
        lyricsMatch = html.match(/<div[^>]+id="Tamil"[^>]*>(.*?)<\/div>/s);
        language = 'tamil';
      }

      if (!lyricsMatch) return null;

      let lyrics = lyricsMatch[1];

      // Clean HTML
      lyrics = lyrics.replace(/<br\s*\/?>/gi, '\n');
      lyrics = lyrics.replace(/<[^>]*>/g, '');
      lyrics = this.decodeHtmlEntities(lyrics);
      lyrics = lyrics.trim();

      if (!lyrics) return null;

      return {
        lyrics,
        language,
        source: 'Tamil2Lyrics',
      };
    } catch (error) {
      if (__DEV__) console.error('[Tamil2LyricsService.fetchLyrics] Async error:', error);
      return null;
    }
  }

  private decodeHtmlEntities(text: string): string {
    const entities: Record<string, string> = {
      '&amp;': '&',
      '&lt;': '<',
      '&gt;': '>',
      '&quot;': '"',
      '&#39;': "'",
      '&nbsp;': ' ',
    };

    return text.replace(/&[^;]+;/g, (match) => entities[match] || match);
  }
}

export const tamil2LyricsService = new Tamil2LyricsService();
