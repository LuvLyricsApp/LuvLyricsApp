/**
 * LyricsRepository
 * Simplified with Lyrica API (aggregates LRCLIB, YouTube Music, Genius, JioSaavn)
 */

import { lyricaService, LyricaResult, LyricsPrecision, compareLyricsPriority } from './LyricaService';
import { SmartLyricMatcher } from './SmartLyricMatcher';

export interface SearchResult {
  id: string;
  source: string;
  type: 'synced' | 'plain';
  precision: LyricsPrecision;
  trackName: string;
  artistName: string;
  albumName?: string;
  plainLyrics: string;
  syncedLyrics?: string;
  rawLyrics: string;
  format?: string;
  syncType?: string;
  matchScore: number;
  matchReason: string;
  duration?: number;
  albumArt?: string;
  url?: string;
}

export const LyricsRepository = {
  searchSmart: async (
    query: string,
    targetMetadata: { title: string; artist: string; duration: number },
    onProgress?: (status: string) => void
  ): Promise<SearchResult[]> => {
    const results: SearchResult[] = [];
    
    onProgress?.('Searching global databases...');
    
    try {
      const raw = await lyricaService.fetchLyrics(targetMetadata.title, targetMetadata.artist, false, targetMetadata.duration);
      const multiResults: LyricaResult[] = raw ? [raw] : [];

      if (multiResults.length === 0) {
        onProgress?.('No lyrics found');
        return [];
      }

      for (let i = 0; i < multiResults.length; i++) {
        const res = multiResults[i];
        const hasTimestamps = lyricaService.hasTimestamps(res.lyrics);
        
        const scored = SmartLyricMatcher.calculateScore(
          {
            id: i,
            trackName: res.metadata?.title || targetMetadata.title,
            artistName: res.metadata?.artist || targetMetadata.artist,
            duration: res.metadata?.duration || targetMetadata.duration,
            plainLyrics: res.lyrics,
            syncedLyrics: hasTimestamps ? res.lyrics : '',
            albumName: res.metadata?.album || '',
            instrumental: false,
          },
          null,
          targetMetadata
        );

        results.push({
          id: `result-${i}-${res.source}`,
          source: res.source,
          type: res.precision === 'plain' ? 'plain' : 'synced',
          precision: res.precision,
          trackName: res.metadata?.title || targetMetadata.title,
          artistName: res.metadata?.artist || targetMetadata.artist,
          albumName: res.metadata?.album,
          plainLyrics: res.lyrics,
          syncedLyrics: hasTimestamps ? res.lyrics : undefined,
          rawLyrics: res.rawLyrics ?? res.lyrics,
          format: res.format,
          syncType: res.syncType,
          matchScore: scored.matchScore,
          matchReason: scored.matchReason,
          duration: res.metadata?.duration,
          albumArt: res.metadata?.coverArt,
        });
      }

      results.sort((a, b) => {
        const precisionDelta = compareLyricsPriority(
          { precision: a.precision },
          { precision: b.precision }
        );
        if (precisionDelta !== 0) {
          return -precisionDelta;
        }

        return b.matchScore - a.matchScore;
      });

      onProgress?.(`Found ${results.length} lyric options`);
    } catch (error) {
      console.error('[LyricsRepository] Error:', error);
      onProgress?.('Search failed');
    }

    return results;
  }
};
