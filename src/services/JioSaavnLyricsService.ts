/**
 * Service for fetching lyrics from JioSaavn API
 * API Documentation: https://saavn.dev
 */

import { LyricLine } from '../types/song';
import { handleAsyncError } from '../utils/errorHandler';

const BASE_URL = 'https://saavn.sumit.co';

interface SaavnSongResult {
  id: string;
  name: string;
  hasLyrics: boolean;
  lyricsId: string | null;
  duration: number | null;
  artists: {
    primary: Array<{ name: string }>;
  };
}

interface SaavnSearchResponse {
  success: boolean;
  data: {
    total: number;
    results: SaavnSongResult[];
  };
}

// interface SaavnSongDetails {
//   success: boolean;
//   data: {
//     id: string;
//     name: string;
//     hasLyrics: boolean;
//     lyricsId: string | null;
//     lyrics?: string; // This field may or may not exist - we'll test
//     // ... other fields
//   };
// }

export interface SaavnLyricsResult {
  lyrics: string;
  source: string;
  metadata?: {
    title: string;
    artist: string;
    duration?: number;
  };
}

export const JioSaavnLyricsService = {
  /**
   * Search for a song and get lyrics if available
   */
  getLyrics: async (
    title: string,
    artist: string,
    _duration?: number
  ): Promise<SaavnLyricsResult | null> => {
    try {
      console.log(`[JioSaavn] 🔍 Searching for: ${title} - ${artist}`);
      
      // Step 1: Search for the song
      const query = `${title} ${artist}`.trim();
      const searchUrl = `${BASE_URL}/api/search/songs?query=${encodeURIComponent(query)}&limit=5`;
      
      console.log('[JioSaavn] Search URL:', searchUrl);
      
      const timeoutPromise = new Promise<any>((_, reject) => 
        setTimeout(() => reject(new Error('TIMEOUT')), 10000)
      );
      
      const searchResponse = await Promise.race([
        fetch(searchUrl, {
            method: 'GET',
            headers: {
            'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)',
            'Accept': 'application/json',
            }
        }),
        timeoutPromise
      ]) as Response;
      
      if (!searchResponse.ok) {
        handleAsyncError('JioSaavnLyricsService.searchGenius.httpError', new Error(`HTTP ${searchResponse.status} ${searchResponse.statusText}`));
        return null;
      }
      
      const searchData: SaavnSearchResponse = await searchResponse.json();
      console.log('[JioSaavn] Search results:', searchData.data.total);
      
      if (!searchData.success || !searchData.data.results.length) {
        console.log('[JioSaavn] No results found');
        return null;
      }
      
      // Find best match with lyrics
      let bestMatch: SaavnSongResult | null = null;
      
      for (const result of searchData.data.results) {
        console.log(`[JioSaavn] Result: ${result.name} - hasLyrics: ${result.hasLyrics}, lyricsId: ${result.lyricsId}`);
        
        if (result.hasLyrics && result.lyricsId) {
          bestMatch = result;
          break; // Use first result with lyrics
        }
      }
      
      if (!bestMatch) {
        console.log('[JioSaavn] No results with lyrics found');
        return null;
      }
      
      console.log(`[JioSaavn] Best match: ${bestMatch.name} (ID: ${bestMatch.id}, LyricsID: ${bestMatch.lyricsId})`);
      
      // Step 2: Try multiple endpoints to get lyrics
      const lyricsData = await JioSaavnLyricsService.fetchLyricsData(bestMatch.id, bestMatch.lyricsId!);
      
      if (!lyricsData) {
        console.log('[JioSaavn] Could not fetch lyrics data');
        return null;
      }
      
      return {
        lyrics: lyricsData,
        source: 'Synced',
        metadata: {
          title: bestMatch.name,
          artist: bestMatch.artists.primary.map(a => a.name).join(', '),
          duration: bestMatch.duration || undefined
        }
      };
      
    } catch (error: any) {
      if (error.message === 'TIMEOUT' || error.name === 'AbortError') {
          console.warn('[JioSaavn] Search timed out');
      } else {
          handleAsyncError('JioSaavnLyricsService.getLyrics', error);
      }
      return null;
    }
  },
  
  /**
   * Try different endpoints to fetch lyrics
   * We'll test multiple possible endpoints since the docs don't specify
   */
  fetchLyricsData: async (songId: string, lyricsId: string): Promise<string | null> => {
    const endpoints = [
      `/api/songs/${songId}/lyrics`,
      `/api/lyrics/${lyricsId}`,
      `/api/songs/${songId}`,
    ];
    
    for (const endpoint of endpoints) {
      try {
        const url = `${BASE_URL}${endpoint}`;
        console.log(`[JioSaavn] Trying endpoint: ${url}`);
        
        const timeoutPromiseEndpoint = new Promise<any>((_, reject) => 
            setTimeout(() => reject(new Error('TIMEOUT')), 8000)
        );
        
        const response = await Promise.race([
            fetch(url, {
                method: 'GET',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)',
                    'Accept': 'application/json',
                }
            }),
            timeoutPromiseEndpoint
        ]) as Response;
        
        if (!response.ok) {
          handleAsyncError(`JioSaavnLyricsService.fetchLyricsData.${endpoint}.httpError`, new Error(`HTTP ${response.status}`));
          continue;
        }
        
        const data = await response.json();
        console.log(`[JioSaavn] Response from ${endpoint}:`, JSON.stringify(data).substring(0, 200));
        
        // Try to extract lyrics from various possible structures
        if (data.success && data.data) {
          if (data.data.lyrics) {
            console.log('[JioSaavn] ✅ Found lyrics in data.lyrics');
            return data.data.lyrics;
          }
          if (data.data.syncedLyrics) {
            console.log('[JioSaavn] ✅ Found lyrics in data.syncedLyrics');
            return data.data.syncedLyrics;
          }
          if (data.data.lrc) {
            console.log('[JioSaavn] ✅ Found lyrics in data.lrc');
            return data.data.lrc;
          }
        }
        
        // If it's a direct lyrics response
        if (typeof data === 'string') {
          console.log('[JioSaavn] ✅ Found lyrics as direct string');
          return data;
        }
        
      } catch (error: any) {
        if (error.name === 'AbortError') {
             console.warn(`[JioSaavn] ${endpoint} timed out`);
        } else {
             handleAsyncError(`JioSaavnLyricsService.fetchLyricsData.${endpoint}`, error);
        }
        continue;
      }
    }
    
    console.log('[JioSaavn] ❌ No lyrics found in any endpoint');
    return null;
  },
  
  /**
   * Parse LRC format if needed (reuse LrcLib parser logic)
   */
  parseLrc: (lrcContent: string, duration: number = 180): LyricLine[] => {
    if (!lrcContent) return [];
    
    const lines = lrcContent.split('\n');
    const result: LyricLine[] = [];
    const timeRegex = /\[(\d{2}):(\d{2})\.(\d{2,3})\]/;

    const hasTimestamps = lines.some(line => timeRegex.test(line));
    const safeDuration = duration > 0 ? duration : 180;

    if (hasTimestamps) {
      lines.forEach((line, index) => {
        const match = line.match(timeRegex);
        if (match) {
          const minutes = parseInt(match[1], 10);
          const seconds = parseInt(match[2], 10);
          const milliseconds = parseInt(match[3].padEnd(3, '0'), 10);
          const timestamp = minutes * 60 + seconds + milliseconds / 1000;
          const text = line.replace(timeRegex, '').trim();

          if (text) {
            result.push({
              id: undefined,
              timestamp,
              text,
              lineOrder: index
            });
          }
        }
      });
    } else {
      // Plain text fallback
      const meaningfulLines = lines.map(l => l.trim()).filter(l => l.length > 0);
      const totalLines = meaningfulLines.length;
      if (totalLines > 0) {
        const timePerLine = safeDuration / totalLines;
        meaningfulLines.forEach((text, index) => {
          result.push({
            id: undefined,
            timestamp: index * timePerLine,
            text,
            lineOrder: index
          });
        });
      }
    }
    
    return result.map((line, idx) => ({ ...line, lineOrder: idx }));
  }
};
