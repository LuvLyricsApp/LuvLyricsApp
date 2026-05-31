/**
 * LyricsRepository
 * Simplified with Lyrica API (aggregates LRCLIB, YouTube Music, Genius, JioSaavn)
 */

import { lyricaService, LyricaResult } from './LyricaService';
import { SmartLyricMatcher } from './SmartLyricMatcher';
import { handleAsyncError } from '../utils/errorHandler';

export interface SearchResult {
  id: string;
  source: string;
  type: 'synced' | 'plain';
  trackName: string;
  artistName: string;
  albumName?: string;
  plainLyrics: string;
  syncedLyrics?: string;
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
          type: hasTimestamps ? 'synced' : 'plain',
          trackName: res.metadata?.title || targetMetadata.title,
          artistName: res.metadata?.artist || targetMetadata.artist,
          albumName: res.metadata?.album,
          plainLyrics: res.lyrics,
          syncedLyrics: hasTimestamps ? res.lyrics : undefined,
          matchScore: scored.matchScore,
          matchReason: scored.matchReason,
          duration: res.metadata?.duration,
          albumArt: res.metadata?.coverArt,
        });
      }

      // Sort by match score
      results.sort((a, b) => b.matchScore - a.matchScore);

      onProgress?.(`Found ${results.length} lyric options`);
    } catch (error) {
      handleAsyncError('LyricsRepository.searchSmart', error);
      onProgress?.('Search failed');
    }

    return results;
  }
};
