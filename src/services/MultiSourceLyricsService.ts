import { lyricaService, LyricaResult } from './LyricaService';

/**
 * Maps internal/network errors to user-friendly messages.
 * Keeps console.error for debug, surfaces concise text for UI.
 */
export function getLyricsFriendlyError(error: unknown): string {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    if (msg.includes('network') || msg.includes('failed to fetch')) {
      return 'No internet connection. Check your network and try again.';
    }
    if (msg.includes('timeout') || msg.includes('timed out')) {
      return 'Lyrics request timed out. Please check connection and try again.';
    }
    if (msg.includes('404') || msg.includes('not found')) {
      return 'No lyrics found for this song.';
    }
    if (msg.includes('429') || msg.includes('rate limit')) {
      return 'Too many requests. Please wait a moment and try again.';
    }
    if (msg.includes('500') || msg.includes('503') || msg.includes('server')) {
      return 'Lyrics service is temporarily unavailable. Please retry in a moment.';
    }
  }

  return 'Lyrics service is temporarily unavailable. Please retry in a moment.';
}

/**
 * Service to race multiple lyric providers and aggregate results
 * User Requirement: "Show all lyrics so they can preview and select"
 */
export const MultiSourceLyricsService = {
  fetchLyricsParallel: async (
    title: string,
    artist: string,
    duration?: number
  ): Promise<LyricaResult[]> => {
    try {
      console.log('[LyricsEngine] Restricted to Lyrica only (slow synced > fast synced > plain)');

      const result = await lyricaService.fetchLyrics(title, artist, false, duration);
      return result ? [result] : [];
    } catch (error) {
      console.error('[LyricsEngine] Critical failure in fetchLyricsParallel:', error);
      throw error;
    }
  }
};
