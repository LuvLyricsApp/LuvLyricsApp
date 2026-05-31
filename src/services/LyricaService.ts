/**
 * LyricFlow - Lyrica API Service
 * Single source for all lyrics (LRCLIB, YouTube Music, Genius, JioSaavn, etc.)
 */

import { LyricLine } from '../types/song';
import { handleAsyncError } from '../utils/errorHandler';

const BASE_URL = 'https://test-0k.onrender.com/lyrics';

export interface LyricaResult {
  lyrics: string;
  source: string;
  metadata?: {
    title?: string;
    artist?: string;
    album?: string;
    duration?: number;
    coverArt?: string;
  };
}

class LyricaService {
  async fetchLyrics(song: string, artist: string, syncedOnly: boolean = false, duration?: number): Promise<LyricaResult | null> {
    try {
      // Clean song title - remove file extensions and extra metadata
      let cleanSong = song
        .replace(/\(Lyrics\)/gi, '')
        .replace(/\(Official.*?\)/gi, '')
        .replace(/\(MP3_\d+K\)/gi, '')
        .replace(/\(Audio\)/gi, '')
        .trim();
      
      // Clean artist - handle "Unknown Artist"
      let cleanArtist = artist === 'Unknown Artist' ? '' : artist;
      
      // If artist is empty and song has dash, split it
      if (!cleanArtist && cleanSong.includes(' - ')) {
        const parts = cleanSong.split(' - ');
        cleanArtist = parts[0].trim();
        cleanSong = parts.slice(1).join(' - ').trim();
      }
      
      console.log('[Lyrica] Cleaned - Artist:', cleanArtist, 'Song:', cleanSong, 'Duration:', duration);
      
      // Priority: Synced (slow) > Synced (fast) > Plain text
      // User request: "synced slow , then synced fats then plain"
      let strategies = [
        { timestamps: true, fast: false, label: 'synced-slow' },
        { timestamps: true, fast: true, label: 'synced-fast' },
        { timestamps: false, fast: false, label: 'plain' },
      ];

      if (syncedOnly) {
        strategies = strategies.filter(s => s.timestamps);
        console.log('[Lyrica] Synced-only mode active');
      }
      
      for (const strategy of strategies) {
        let url = `${BASE_URL}/?artist=${encodeURIComponent(cleanArtist)}&song=${encodeURIComponent(cleanSong)}&timestamps=${strategy.timestamps}&fast=${strategy.fast}&metadata=true`;
        if (duration) url += `&duration=${Math.floor(duration)}`;
        
        console.log(`[Lyrica] Trying ${strategy.label}`);
        
        const result = await this.executeFetch(url, strategy.label);
        if (result) return result;
      }
      
      console.log('[Lyrica] All strategies exhausted');
      return null;
    } catch (error) {
      handleAsyncError('LyricaService.fetchLyrics', error);
      throw error;
    }
  }

  private async executeFetch(url: string, label: string): Promise<LyricaResult | null> {
    // defined timeout promise
    const timeoutPromise = new Promise<null>((_, reject) => 
        setTimeout(() => reject(new Error('TIMEOUT')), 45000)
    );

    try {
      const response = await Promise.race([
        fetch(url, {
            headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'application/json',
            },
        }),
        timeoutPromise
      ]) as Response;

      if (!response.ok) {
        let errorText = '';
        try {
            errorText = await response.text();
        } catch {
            errorText = 'Read failed';
        }
        
        const truncatedError = errorText.length > 200 ? errorText.substring(0, 200) + '...' : errorText;
        console.log(`[Lyrica] ${label} HTTP ${response.status}:`, truncatedError);
        if (response.status === 404) {
          return null;
        }

        throw new Error(`Lyrics request failed: ${response.status} ${response.statusText}`.trim());
      }

      const data = await response.json();
      
      if (data.status === 'success' && data.data) {
        let finalLyrics = data.data.lyrics;

        // Reject HTML content immediately
        if (typeof finalLyrics === 'string' && (finalLyrics.includes('<div') || finalLyrics.includes('<html') || finalLyrics.includes('<!DOCTYPE'))) {
            console.warn(`[Lyrica] ${label} returned HTML instead of lyrics, rejecting.`);
            return null;
        }

        // Handle structured timed lyrics if plaintext is missing
        if (!finalLyrics && data.data.timestamped) {
          finalLyrics = data.data.timestamped;
        }

        if (!finalLyrics && Array.isArray(data.data.timed_lyrics)) {
          finalLyrics = data.data.timed_lyrics
            .map((line: any) => {
              const ms = line.start_time || 0;
              const minutes = Math.floor(ms / 60000);
              const seconds = Math.floor((ms % 60000) / 1000);
              const hundredths = Math.floor((ms % 1000) / 10);
              const timestamp = `[${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(hundredths).padStart(2, '0')}]`;
              return `${timestamp} ${line.text || ''}`;
            })
            .join('\n');
        } else if (Array.isArray(finalLyrics)) {
           try {
               finalLyrics = finalLyrics.map((line: any) => {
                  const ms = line.start_time || 0;
                  const minutes = Math.floor(ms / 60000);
                  const seconds = Math.floor((ms % 60000) / 1000);
                  const hundredths = Math.floor((ms % 1000) / 10);
                  const timestamp = `[${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(hundredths).padStart(2, '0')}]`;
                  return `${timestamp} ${line.text || ''}`;
               }).join('\n');
           } catch {
               finalLyrics = ''; 
           }
        } else if (typeof finalLyrics === 'string' && (finalLyrics.trim().startsWith('[') || finalLyrics.trim().startsWith('{'))) {
           try {
              const parsedJson = JSON.parse(finalLyrics);
              if (Array.isArray(parsedJson)) {
                   finalLyrics = parsedJson.map((line: any) => {
                      const ms = line.start_time || 0;
                      const minutes = Math.floor(ms / 60000);
                      const seconds = Math.floor((ms % 60000) / 1000);
                      const hundredths = Math.floor((ms % 1000) / 10);
                      const timestamp = `[${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(hundredths).padStart(2, '0')}]`;
                      return `${timestamp} ${line.text || ''}`;
                   }).join('\n');
              }
           } catch {
               if (finalLyrics.trim().startsWith('[{"')) {
                   finalLyrics = null; 
               }
           }
        }

        if (finalLyrics) {
          return {
            lyrics: finalLyrics,
            source: `Lyrica (${label})`, 
            metadata: {
              title: data.data.track_name || data.data.title,
              artist: data.data.artist_name || data.data.artist,
              duration: data.data.duration?.seconds || data.data.duration,
              coverArt: data.data.album_art
            }
          };
        }
      }
      return null;
    } catch (err: any) {
      if (err.message === 'TIMEOUT' || err.name === 'AbortError') {
         console.warn(`[Lyrica] ${label} timed out safely (45s limit).`);
         throw new Error('Lyrics request timed out');
      }

      console.log(`[Lyrica] ${label} failed:`, err.message || 'Unknown Network Error');
      throw err instanceof Error ? err : new Error('Lyrics request failed');
    }
  }

  parseLrc(lrcContent: string, duration: number = 180): LyricLine[] {
    if (!lrcContent) return [];
    
    const lines = lrcContent.split('\n');
    const result: LyricLine[] = [];
    const timeRegex = /\[(\d{2}):(\d{2})\.(\d{2,3})\]/;

    // Check if ANY line has a timestamp first
    const hasTimestamps = lines.some(line => timeRegex.test(line));
    
    // Ensure valid duration for estimation (prevent 0 timestamps)
    const safeDuration = duration > 0 ? duration : 180;

    if (hasTimestamps) {
        // Standard LRC Parsing
        lines.forEach((line, index) => {
          const match = line.match(timeRegex);
          if (match) {
            const minutes = parseInt(match[1], 10);
            const seconds = parseInt(match[2], 10);
            const millisecondsStr = match[3].padEnd(3, '0'); 
            const milliseconds = parseInt(millisecondsStr, 10);
            
            const timestamp = minutes * 60 + seconds + milliseconds / 1000;
            let text = line.replace(timeRegex, '').trim();

            if (!text) {
              text = '[INSTRUMENTAL]';
            }

            result.push({
              timestamp,
              text,
              lineOrder: index,
            });
          }
        });
    } else {
        // PLAIN TEXT AUTO-SCROLL LOGIC
        const meaningfulLines = lines.map(l => l.trim()).filter(l => l.length > 0);
        const totalLines = meaningfulLines.length;
        
        if (totalLines > 0) {
            const timePerLine = safeDuration / totalLines;
            meaningfulLines.forEach((text, index) => {
                result.push({
                    timestamp: index * timePerLine,
                    text: text,
                    lineOrder: index,
                });
            });
        }
    }
    
    return result.map((line, idx) => ({ ...line, lineOrder: idx }));
  }

  hasTimestamps(lyrics: string): boolean {
    return /\[\d{2}:\d{2}\.\d{2,3}\]/.test(lyrics);
  }
}

export const lyricaService = new LyricaService();

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
