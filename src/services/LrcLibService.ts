/**
 * Service for interacting with LRCLIB API
 * https://lrclib.net/docs
 */

import { LyricLine } from '../types/song';
import { LrcLibTrackResponse } from '../types/providerResponses';
import { parseTimestampedLyrics, hasValidTimestamps } from '../utils/timestampParser';
import { handleAsyncError } from '../utils/errorHandler';


const BASE_URL = 'https://lrclib.net/api';

export type LrcLibTrack = LrcLibTrackResponse;

const isAbortError = (error: unknown): error is Error =>
  error instanceof Error && error.name === 'AbortError';

export const LrcLibService = {
  /**
   * Search for lyrics by query or specific fields
   */
  search: async (params: string | { track_name?: string; artist_name?: string; album_name?: string; q?: string }): Promise<LrcLibTrack[]> => {
    try {
      let queryPath = '';
      if (typeof params === 'string') {
        queryPath = `/search?q=${encodeURIComponent(params)}`;
      } else {
        const querySegments = Object.entries(params)
          .filter(([_, v]) => v)
          .map(([k, v]) => `${k}=${encodeURIComponent(v as string)}`);
        queryPath = `/search?${querySegments.join('&')}`;
      }

      const searchUrl = `${BASE_URL}${queryPath}`;
      console.log('[LrcLibService] Searching LRCLIB:', searchUrl);
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout
      
      const response = await fetch(searchUrl, {
        signal: controller.signal,
        method: 'GET',
        headers: {
          'User-Agent': 'LuvLyrics/1.0 (Mobile; Android)',
          'Accept': 'application/json',
        }
      });
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`LRCLIB Search failed: ${response.status} ${response.statusText}`);
      }
      return await response.json() as LrcLibTrack[];
    } catch (error: unknown) {
      if (isAbortError(error)) {
         console.warn('[LrcLibService] Search timed out');
      } else {
         handleAsyncError('LrcLibService.search', error);
      }
      return [];
    }
  },

  /**
   * Get specific lyrics by parameters (more precise than search)
   */
  getLyrics: async (
    trackName: string, 
    artistName: string, 
    albumName?: string, 
    duration?: number
  ): Promise<LrcLibTrack | null> => {
    try {
      // LRCLIB API uses specific query parameters
      let url = `${BASE_URL}/get?track_name=${encodeURIComponent(trackName)}&artist_name=${encodeURIComponent(artistName)}`;
      if (albumName) url += `&album_name=${encodeURIComponent(albumName)}`;
      if (duration) url += `&duration=${duration}`;
      
      console.log('[LrcLibService] Getting lyrics from:', url);
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout
      
      const response = await fetch(url, {
        signal: controller.signal,
        method: 'GET',
        headers: {
          'User-Agent': 'LuvLyrics/1.0 (Mobile; Android)',
          'Accept': 'application/json',
        }
      });
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        if (response.status === 404) return null;
        throw new Error(`LRCLIB Get failed: ${response.status} ${response.statusText}`);
      }
      return await response.json() as LrcLibTrack;
    } catch (error: unknown) {
      if (isAbortError(error)) {
         console.warn('[LrcLibService] GetLyrics timed out');
      } else {
         handleAsyncError('LrcLibService.getLyrics', error);
      }
      return null;
    }
  },

  /**
   * Parse LRC format string into LyricLine[]
   */
  /**
   * Parse LRC format string into LyricLine[]
   * Uses centralized parser for robustness, falls back to interpolation for plain text.
   */
  parseLrc: (lrcContent: string, duration: number = 180): LyricLine[] => {
    if (!lrcContent) return [];
    
    // 1. Try to parse as Synced Lyrics using robust utility
    if (hasValidTimestamps(lrcContent)) {
        return parseTimestampedLyrics(lrcContent);
    }
    
    // 2. PLAIN TEXT FALLBACK (Interpolated Timestamps)
    // If no timestamps found, distribute lines evenly across duration
    const lines = lrcContent.split('\n');
    const result: LyricLine[] = [];
    const safeDuration = duration > 0 ? duration : 180;
    
    const meaningfulLines = lines.map(l => l.trim()).filter(l => l.length > 0);
    const totalLines = meaningfulLines.length;
    
    if (totalLines > 0) {
        const timePerLine = safeDuration / totalLines;
        meaningfulLines.forEach((text, index) => {
            result.push({
                timestamp: index * timePerLine,
                text,
                lineOrder: index
            });
        });
    }
    
    return result;
  }
};
