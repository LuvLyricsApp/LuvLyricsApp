/**
 * LyricsRepository
 * Asks every Echo Music provider in parallel (YouLyPlus, Paxsenix, Unison,
 * BetterLyrics, SimpMusic, LRCLIB, KuGou) plus the Lyrica backend, then ranks
 * all of it so the picker shows real options instead of a single guess.
 */

import { lyricaService, LyricaResult } from './LyricaService';
import { SmartLyricMatcher } from './SmartLyricMatcher';
import { EchoLyricsCascade } from './lyrics/EchoLyricsCascade';

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
      const [echoHits, lyrica] = await Promise.all([
        EchoLyricsCascade.fetchAll({
          title: targetMetadata.title,
          artist: targetMetadata.artist,
          duration: targetMetadata.duration,
        }),
        lyricaService.fetchLyrics(targetMetadata.title, targetMetadata.artist, false, targetMetadata.duration, { skipEcho: true })
          .catch(() => null),
      ]);
      const multiResults: LyricaResult[] = echoHits.map(hit => lyricaService.fromProvider(hit));
      if (lyrica) multiResults.push(lyrica);

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
      if (__DEV__) console.error('[LyricsRepository] Error:', error);
      onProgress?.('Search failed');
    }

    return results;
  }
};
