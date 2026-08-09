/**
 * LyricFlow - Lyrica API Service
 * Single source for all lyrics (LRCLIB, YouTube Music, Genius, JioSaavn, etc.)
 */

import { LyricLine, LyricWord } from '../types/song';

const BASE_URL = 'https://test-0k.onrender.com/lyrics';
const WORD_TIMING_SOURCE_MARKERS = ['betterlyrics', 'unison'];
const WORD_TIMING_LINE_REGEX = /^<[^>\n]+>$/;

export type LyricsPrecision = 'word' | 'synced' | 'plain';

const PRECISION_PRIORITY: Record<LyricsPrecision, number> = {
  word: 3,
  synced: 2,
  plain: 1,
};

type LyricaStrategy = {
  timestamps: boolean;
  fast: boolean;
  label: string;
  rank: number;
};

export interface LyricaResult {
  lyrics: string;
  rawLyrics?: string;
  source: string;
  provider?: string;
  precision: LyricsPrecision;
  format?: string;
  syncType?: string;
  strategyRank?: number;
  metadata?: {
    title?: string;
    artist?: string;
    album?: string;
    duration?: number;
    coverArt?: string;
  };
}

export function getLyricsPrecisionLabel(precision: LyricsPrecision): string {
  switch (precision) {
    case 'word':
      return 'Word Timed';
    case 'synced':
      return 'Synced';
    case 'plain':
    default:
      return 'Plain';
  }
}

export function detectLyricsPrecision(
  lyrics: string,
  source?: string,
  hasTimedPayload: boolean = false
): LyricsPrecision {
  const hasWordTimingMarkup = lyrics
    .split(/\r?\n/)
    .some((line) => {
      const trimmed = line.trim();
      return WORD_TIMING_LINE_REGEX.test(trimmed) && trimmed.includes('|') && trimmed.includes(':');
    });
  const hasInlineWordTimestamps = /<\d{1,2}:\d{2}\.\d{2,3}>/.test(lyrics);

  if (hasWordTimingMarkup || hasInlineWordTimestamps) {
    return 'word';
  }

  const normalizedSource = (source?.toLowerCase() ?? '').replace(/[^a-z0-9]/g, '');
  const isWordTimingProvider = WORD_TIMING_SOURCE_MARKERS.some(marker => normalizedSource.includes(marker));
  const hasSyncedTiming = hasTimedPayload || /\[\d{2}:\d{2}\.\d{2,3}\]/.test(lyrics);

  if (isWordTimingProvider && hasSyncedTiming) {
    return 'word';
  }

  return hasSyncedTiming ? 'synced' : 'plain';
}

export function compareLyricsPriority(
  left: Pick<LyricaResult, 'precision' | 'strategyRank'>,
  right: Pick<LyricaResult, 'precision' | 'strategyRank'>
): number {
  const precisionDelta = PRECISION_PRIORITY[left.precision] - PRECISION_PRIORITY[right.precision];
  if (precisionDelta !== 0) {
    return precisionDelta;
  }

  return (left.strategyRank ?? 0) - (right.strategyRank ?? 0);
}

const XML_ENTITY_MAP: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': '\'',
  '&apos;': '\'',
};

const decodeXmlEntities = (value: string): string =>
  value.replace(/&(amp|lt|gt|quot|#39|apos);/g, (entity) => XML_ENTITY_MAP[entity] ?? entity);

const stripXmlTags = (value: string): string =>
  decodeXmlEntities(value.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

const looksLikeTtml = (lyrics: string): boolean =>
  /^\s*<tt[\s>]/i.test(lyrics);

const parseTtmlTime = (value: string): number => {
  const trimmed = value.trim();
  if (!trimmed) return 0;

  const parts = trimmed.split(':').map((part) => part.trim());
  if (parts.length === 3) {
    return (Number(parts[0]) * 3600) + (Number(parts[1]) * 60) + Number(parts[2]);
  }

  if (parts.length === 2) {
    return (Number(parts[0]) * 60) + Number(parts[1]);
  }

  return Number(trimmed) || 0;
};

const formatSeconds = (value: number): string => value.toFixed(3).replace(/\.?0+$/, '');

const formatLrcTimestamp = (secondsValue: number): string => {
  const totalMs = Math.max(0, Math.round(secondsValue * 1000));
  const minutes = Math.floor(totalMs / 60000);
  const seconds = Math.floor((totalMs % 60000) / 1000);
  const hundredths = Math.floor((totalMs % 1000) / 10);
  return `[${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(hundredths).padStart(2, '0')}]`;
};

const extractAttr = (attrs: string, name: string): string | null => {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = attrs.match(new RegExp(`${escaped}="([^"]+)"`, 'i'));
  return match?.[1] ?? null;
};

const parseTtmlSpanWords = (content: string): Array<{ text: string; startTime: number; endTime: number }> => {
  const words: Array<{ text: string; startTime: number; endTime: number }> = [];
  const spanRegex = /<span\b([^>]*)>([\s\S]*?)<\/span>/gi;

  for (const match of content.matchAll(spanRegex)) {
    const attrs = match[1] ?? '';
    const nestedRole = extractAttr(attrs, 'ttm:role') ?? extractAttr(attrs, 'role');
    if (nestedRole === 'x-bg' || nestedRole === 'x-translation' || nestedRole === 'x-roman') {
      continue;
    }

    const begin = extractAttr(attrs, 'begin');
    const end = extractAttr(attrs, 'end');
    const text = stripXmlTags(match[2] ?? '');

    if (!begin || !end || !text) continue;

    words.push({
      text,
      startTime: parseTtmlTime(begin),
      endTime: parseTtmlTime(end),
    });
  }

  return words;
};

export function convertTtmlToInternalLrc(ttml: string): string {
  const lines: string[] = [];
  const pRegex = /<p\b([^>]*)>([\s\S]*?)<\/p>/gi;

  for (const match of ttml.matchAll(pRegex)) {
    const attrs = match[1] ?? '';
    const inner = match[2] ?? '';
    const begin = extractAttr(attrs, 'begin');
    if (!begin) continue;

    const backgroundRegex = /<span\b([^>]*)ttm:role="x-bg"([^>]*)>([\s\S]*?)<\/span>/gi;
    const backgroundChunks = Array.from(inner.matchAll(backgroundRegex));
    const mainInner = inner.replace(backgroundRegex, ' ');
    const words = parseTtmlSpanWords(mainInner);
    const lineText = words.length > 0 ? words.map((word) => word.text).join(' ') : stripXmlTags(mainInner);
    if (!lineText) continue;

    lines.push(`${formatLrcTimestamp(parseTtmlTime(begin))}${lineText}`);

    if (words.length > 0) {
      lines.push(`<${words.map((word) => `${word.text}:${formatSeconds(word.startTime)}:${formatSeconds(word.endTime)}`).join('|')}>`);
    }

    for (const bgChunk of backgroundChunks) {
      const bgWords = parseTtmlSpanWords(bgChunk[3] ?? '');
      const bgText = bgWords.length > 0 ? bgWords.map((word) => word.text).join(' ') : stripXmlTags(bgChunk[3] ?? '');
      if (!bgText) continue;

      const bgBegin = bgWords[0]?.startTime ?? parseTtmlTime(begin);
      lines.push(`${formatLrcTimestamp(bgBegin)}{bg}${bgText}`);

      if (bgWords.length > 0) {
        lines.push(`<${bgWords.map((word) => `${word.text}:${formatSeconds(word.startTime)}:${formatSeconds(word.endTime)}`).join('|')}>`);
      }
    }
  }

  return lines.join('\n');
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
      let strategies: LyricaStrategy[] = [
        { timestamps: true, fast: false, label: 'synced-slow', rank: 3 },
        { timestamps: true, fast: true, label: 'synced-fast', rank: 2 },
        { timestamps: false, fast: false, label: 'plain', rank: 1 },
      ];

      if (syncedOnly) {
        strategies = strategies.filter(s => s.timestamps);
        console.log('[Lyrica] Synced-only mode active');
      }
      
      // All strategies race. Awaiting them one at a time meant a slow or dead
      // strategy spent its whole timeout before the next was even tried, which
      // is where the ~30s-per-song came from — the request itself was never the
      // slow part. Cost is the same handful of requests, just overlapped.
      const attempts = strategies.map((strategy) => {
        let url = `${BASE_URL}/?artist=${encodeURIComponent(cleanArtist)}&song=${encodeURIComponent(cleanSong)}&timestamps=${strategy.timestamps}&fast=${strategy.fast}&metadata=true`;
        if (duration) url += `&duration=${Math.floor(duration)}`;
        return this.executeFetch(url, strategy);
      });

      // Resolve on the first *synced* result — that is what the app is built
      // around. A plain result is held back as a consolation prize and only
      // returned once every attempt has finished without producing timestamps,
      // so a fast plain answer never robs us of a slightly slower synced one.
      return await new Promise<LyricaResult | null>((resolve) => {
        let outstanding = attempts.length;
        let bestResult: LyricaResult | null = null;
        let settled = false;

        const settle = (value: LyricaResult | null) => {
          if (settled) return;
          settled = true;
          resolve(value);
        };

        attempts.forEach((attempt) => {
          attempt
            .then((result) => {
              if (!result) return;

              if (!bestResult || compareLyricsPriority(result, bestResult) > 0) {
                bestResult = result;
              }

              if (result.precision === 'word') {
                settle(result);
              }
            })
            .catch(() => { /* a losing strategy must not sink the race */ })
            .finally(() => {
              outstanding -= 1;
              if (outstanding === 0) settle(bestResult);
            });
        });
      });
    } catch (error) {
      console.error('[Lyrica] Fetch error:', error);
      throw error;
    }
  }

  private async executeFetch(url: string, strategy: LyricaStrategy): Promise<LyricaResult | null> {
    // defined timeout promise
    // 45s was far past the point of usefulness: a lyrics API that has not
    // answered in a few seconds is not going to. With the strategies racing,
    // this is now the hard ceiling on a whole lookup rather than per attempt.
    const timeoutPromise = new Promise<null>((_, reject) =>
        setTimeout(() => reject(new Error('TIMEOUT')), 7000)
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
        console.log(`[Lyrica] ${strategy.label} HTTP ${response.status}:`, truncatedError);
        if (response.status === 404) {
          return null;
        }

        throw new Error(`Lyrics request failed: ${response.status} ${response.statusText}`.trim());
      }

      const data = await response.json();
      
      if (data.status === 'success' && data.data) {
        const originalLyricsPayload = typeof data.data.lyrics === 'string'
          ? data.data.lyrics
          : null;
        let finalLyrics = data.data.lyrics;

        // TTML bodies include <div> (and other tags). Convert before the HTML reject
        // or Unison richsync would be thrown away as "HTML instead of lyrics".
        if (typeof finalLyrics === 'string' && looksLikeTtml(finalLyrics)) {
          finalLyrics = convertTtmlToInternalLrc(finalLyrics);
        } else if (
          typeof finalLyrics === 'string' &&
          (finalLyrics.includes('<div') || finalLyrics.includes('<html') || finalLyrics.includes('<!DOCTYPE'))
        ) {
            console.warn(`[Lyrica] ${strategy.label} returned HTML instead of lyrics, rejecting.`);
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
          const provider = typeof data.data.source === 'string' && data.data.source.trim()
            ? data.data.source.trim()
            : `Lyrica (${strategy.label})`;
          const hasTimedPayload = Boolean(
            data.data.hasTimestamps ||
            data.data.timestamped ||
            (Array.isArray(data.data.timed_lyrics) && data.data.timed_lyrics.length > 0)
          );

          return {
            lyrics: finalLyrics,
            rawLyrics: originalLyricsPayload ?? finalLyrics,
            source: provider,
            provider,
            precision: detectLyricsPrecision(finalLyrics, provider, hasTimedPayload),
            format: data.data.format,
            syncType: data.data.syncType,
            strategyRank: strategy.rank,
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
         console.warn(`[Lyrica] ${strategy.label} timed out safely (7s cap).`);
         throw new Error('Lyrics request timed out');
      }

      console.log(`[Lyrica] ${strategy.label} failed:`, err.message || 'Unknown Network Error');
      throw err instanceof Error ? err : new Error('Lyrics request failed');
    }
  }

  parseLrc(lrcContent: string, duration: number = 180): LyricLine[] {
    if (!lrcContent) return [];
    
    const lines = lrcContent.split('\n');
    const result: LyricLine[] = [];
    const timeRegex = /\[(\d{2}):(\d{2})\.(\d{2,3})\]/;
    const wordLineRegex = /^<([^>\n]+)>$/;
    // A2:B / enhanced LRC inline word stamps: <mm:ss.xx>word
    const inlineWordRegex = /<(\d{1,2}):(\d{2})\.(\d{2,3})>([^<]*)/g;

    // Check if ANY line has a timestamp first
    const hasTimestamps = lines.some(line => timeRegex.test(line));
    
    // Ensure valid duration for estimation (prevent 0 timestamps)
    const safeDuration = duration > 0 ? duration : 180;

    if (hasTimestamps) {
        // Standard LRC + optional trailing word-timing rows produced by convertTtmlToInternalLrc
        lines.forEach((line, index) => {
          const trimmed = line.trim();
          const wordMatch = trimmed.match(wordLineRegex);
          if (wordMatch && result.length > 0) {
            const words = parseInternalWordTiming(wordMatch[1]);
            if (words.length > 0) {
              result[result.length - 1].words = words;
            }
            return;
          }

          const match = line.match(timeRegex);
          if (match) {
            const minutes = parseInt(match[1], 10);
            const seconds = parseInt(match[2], 10);
            const millisecondsStr = match[3].padEnd(3, '0'); 
            const milliseconds = parseInt(millisecondsStr, 10);
            
            const timestamp = minutes * 60 + seconds + milliseconds / 1000;
            let text = line.replace(timeRegex, '').trim();

            // Inline enhanced-LRC word stamps on the same line as the line timestamp
            const words: LyricWord[] = [];
            inlineWordRegex.lastIndex = 0;
            let inlineMatch: RegExpExecArray | null;
            while ((inlineMatch = inlineWordRegex.exec(text)) !== null) {
              const wMin = parseInt(inlineMatch[1], 10);
              const wSec = parseInt(inlineMatch[2], 10);
              const wMs = parseInt(inlineMatch[3].padEnd(3, '0'), 10);
              const startTime = wMin * 60 + wSec + wMs / 1000;
              const wordText = inlineMatch[4].trim();
              if (wordText) {
                words.push({ text: wordText, startTime, endTime: startTime });
              }
            }
            if (words.length > 0) {
              // Close each word at the next word start; last word open-ended (line end filled later)
              for (let i = 0; i < words.length - 1; i++) {
                words[i].endTime = words[i + 1].startTime;
              }
              words[words.length - 1].endTime = words[words.length - 1].startTime + 2;
              text = words.map((w) => w.text).join(' ');
            }

            if (!text) {
              text = '[INSTRUMENTAL]';
            }

            // Background vocal marker from TTML conversion — keep for styling, strip for plain text
            const isBg = text.startsWith('{bg}');
            if (isBg) {
              text = text.slice(4);
            }

            result.push({
              timestamp,
              text,
              lineOrder: index,
              ...(words.length > 0 ? { words } : {}),
            });
          }
        });
    } else {
        // PLAIN TEXT AUTO-SCROLL LOGIC
        const meaningfulLines = lines
          .map(l => l.trim())
          .filter(l => l.length > 0 && !wordLineRegex.test(l));
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

/**
 * Parse internal word-timing payload: `word:start:end|word2:start:end`
 * (emitted by convertTtmlToInternalLrc).
 */
export function parseInternalWordTiming(payload: string): LyricWord[] {
  if (!payload?.trim()) return [];

  return payload
    .split('|')
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk) => {
      // text may contain colons; times are the last two numeric fields
      const parts = chunk.split(':');
      if (parts.length < 3) return null;
      const endRaw = parts[parts.length - 1];
      const startRaw = parts[parts.length - 2];
      const text = parts.slice(0, parts.length - 2).join(':').trim();
      const startTime = Number(startRaw);
      const endTime = Number(endRaw);
      if (!text || !Number.isFinite(startTime) || !Number.isFinite(endTime)) return null;
      return { text, startTime, endTime } satisfies LyricWord;
    })
    .filter((word): word is LyricWord => word !== null);
}

/**
 * Re-attach word timings from the locally stored provider payload.
 * Prefer lyricsRaw (original TTML / rich body) so playback never re-hits Unison.
 */
export function hydrateLyricsWithWordTimings(params: {
  lyrics: LyricLine[];
  lyricsRaw?: string | null;
  lyricsFormat?: string | null;
  lyricsSyncType?: string | null;
  lyricsPrecision?: LyricsPrecision | null;
  duration?: number;
}): LyricLine[] {
  const { lyrics, lyricsRaw, lyricsFormat, lyricsSyncType, lyricsPrecision, duration = 180 } = params;
  if (!lyricsRaw?.trim()) return lyrics;

  const alreadyWorded = lyrics.some((line) => line.words && line.words.length > 0);
  if (alreadyWorded) return lyrics;

  const hasInternalWordRows = lyricsRaw
    .split(/\r?\n/)
    .some((line) => {
      const trimmed = line.trim();
      return WORD_TIMING_LINE_REGEX.test(trimmed) && trimmed.includes('|') && trimmed.includes(':');
    });
  const isRich =
    lyricsPrecision === 'word' ||
    (lyricsSyncType ?? '').toLowerCase() === 'richsync' ||
    (lyricsFormat ?? '').toLowerCase() === 'ttml' ||
    looksLikeTtml(lyricsRaw) ||
    hasInternalWordRows ||
    /<\d{1,2}:\d{2}\.\d{2,3}>/.test(lyricsRaw);

  if (!isRich) {
    return lyrics;
  }

  let content = lyricsRaw;
  if (looksLikeTtml(content) || (lyricsFormat ?? '').toLowerCase() === 'ttml') {
    content = convertTtmlToInternalLrc(content);
  }

  const parsed = lyricaService.parseLrc(content, duration);
  if (parsed.length === 0) return lyrics;

  const hasWords = parsed.some((line) => line.words && line.words.length > 0);
  if (!hasWords) return lyrics;

  // Prefer the re-parsed rich lines (timestamps + words) so highlight stays coherent.
  return parsed;
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
