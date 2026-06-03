/**
 * Service for interacting with Genius API and Scraping Lyrics
 * https://docs.genius.com/
 */

import { LyricLine } from '../types/song';
import { GeniusHitResponse, GeniusSearchResponse } from '../types/providerResponses';

const GENIUS_API_URL = 'https://api.genius.com';
const ACCESS_TOKEN = process.env.EXPO_PUBLIC_GENIUS_ACCESS_TOKEN ?? '';

if (!ACCESS_TOKEN && __DEV__) {
  console.warn(
    '[GeniusService] EXPO_PUBLIC_GENIUS_ACCESS_TOKEN is not set. ' +
    'Copy .env.example to .env and add your token.'
  );
}

export interface GeniusTrack {
  id: number;
  title: string;
  artist: string;
  url: string;
  albumArt: string;
  plainLyrics: string;
}

const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

export const GeniusService = {
  /**
   * 1. Search Genius API for a song to get its URL
   */
  searchGenius: async (query: string): Promise<GeniusTrack[]> => {
    try {
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('TIMEOUT')), 10000)
      );

      const response = await Promise.race([
        fetch(`${GENIUS_API_URL}/search?q=${encodeURIComponent(query)}`, {
            headers: {
            'Authorization': `Bearer ${ACCESS_TOKEN}`
            }
        }),
        timeoutPromise
      ]) as Response;

      if (!response.ok) {
        console.warn(`[GeniusService] Search failed: ${response.status}`);
        return [];
      }

      const data = await response.json() as GeniusSearchResponse;
      const hits = data.response?.hits || [];

      // Map hits to simpler objects
      return hits.map((hit: GeniusHitResponse) => ({
        id: hit.result.id,
        title: hit.result.title,
        artist: hit.result.primary_artist.name,
        url: hit.result.url,
        albumArt: hit.result.song_art_image_thumbnail_url,
        plainLyrics: '' // To be filled by scraping
      }));

    } catch (error: unknown) {
      if (getErrorMessage(error) === 'TIMEOUT') {
          console.warn('[GeniusService] Search timed out');
      } else {
          console.error('[GeniusService] Search error:', error);
      }
      return [];
    }
  },

  /**
   * 2. Scrape lyrics from a Genius song URL
   * Using Regex to extract text from <div data-lyrics-container="true">
   */
  scrapeGeniusLyrics: async (url: string): Promise<string | null> => {
    try {
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('TIMEOUT')), 15000)
      );

      const response = await Promise.race([
        fetch(url),
        timeoutPromise
      ]) as Response;

      if (!response.ok) {
        // Handle native crash risk by just throwing error which is caught below
        throw new Error(`Failed to fetch Genius page: ${response.status}`);
      }

      const html = await response.text();

      // Modern Genius pages render lyrics in many data-lyrics-container blocks.
      // Keep this selector loose (attribute-only) so class name churn does not break scraping.
      const containerRegex = /<div[^>]*data-lyrics-container="true"[^>]*>([\s\S]*?)<\/div>/gi;
      const containerMatches = Array.from(html.matchAll(containerRegex));

      let lyricsHtml = containerMatches
        .map(match => (match[1] || '').trim())
        .filter(Boolean)
        .join('\n');

      // Fallback for legacy Genius pages.
      if (!lyricsHtml) {
        const legacyMatch = html.match(/<div[^>]*class="lyrics"[^>]*>([\s\S]*?)<\/div>/i);
        lyricsHtml = legacyMatch?.[1]?.trim() || '';
      }

      if (!lyricsHtml) {
        console.warn('[GeniusService] No lyrics container found in HTML');
        return null;
      }

      // Remove non-lyric blocks before stripping tags.
      const sanitizedHtml = lyricsHtml
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<!--([\s\S]*?)-->/g, '');

      // Convert HTML to text while preserving line breaks.
      const plainText = sanitizedHtml
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/p>/gi, '\n')
        .replace(/<\/div>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#x27;|&#39;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&nbsp;/g, ' ')
        .replace(/\r\n?/g, '\n');

      // Remove metadata/pollution lines that are often injected around lyrics.
      const cleanedLines = plainText
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0)
        .filter(line => {
          const normalized = line.toLowerCase();

          // Keep section markers like [Verse 1], but remove unrelated metadata.
          if (/^\d+\s+contributors?$/i.test(line)) return false;
          if (/\bcontributor(s)?\b/i.test(line) && line.length < 80) return false;
          if (/\btranslations?\b/i.test(line)) return false;
          if (/^embed$/i.test(line) || /^you might also like$/i.test(line)) return false;
          if (/\bcover\b/i.test(line) && /\b(by|it was|was a)\b/i.test(normalized)) return false;
          if (/^\d*\s*embed$/i.test(line)) return false;

          return true;
        });

      const finalLyrics = cleanedLines.join('\n').replace(/\n{3,}/g, '\n\n').trim();

      if (!finalLyrics) {
        console.warn('[GeniusService] Lyrics extracted but empty after cleaning');
        return null;
      }

      return finalLyrics;

    } catch (error) {
      console.error('[GeniusService] Scrape error:', error);
      return null;
    }
  },

  /**
   * Convert plain text to "fake" LyricLines (without timestamps)
   * This allows them to be used in the same UI, just unsynced.
   */
  convertToLyricLines: (text: string): LyricLine[] => {
    return text.split('\n').map((line, index) => ({
      id: undefined,
      timestamp: 0, // 0 indicates unsynced
      text: line.trim(),
      lineOrder: index
    })).filter(l => l.text.length > 0);
  }
};
