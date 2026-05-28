/**
 * LyricFlow - Timestamp Parser Utility
 * Parses lyrics text with timestamps into structured LyricLine array
 * 
 * Supports formats:
 * - 0:01, 0:15, 1:23
 * - 00:01, 00:15, 01:23
 * - With or without brackets [0:01]
 * - With dialogue prefixes (- Speaker:)
 */

import { LyricLine } from '../types/song';

// Regex patterns for timestamp detection (Supports 00:00.00 and 00:00)
// Now permissive for 1-digit seconds to handle "dirty" lyrics like [0:3.75]
const TIMESTAMP_REGEX = /[[(]?(\d{1,2})[:.](\d{1,2})(\.\d+)?[\])]?/g;
const SINGLE_TIMESTAMP_REGEX = /[[(]?(\d{1,2})[:.](\d{1,2})(\.\d+)?[\])]?/; // No global flag

/**
 * Parse a timestamp string into seconds
 * @param minutes - minutes part
 * @param seconds - seconds part
 * @param milliseconds - optional milliseconds part (e.g. ".75" or ".750")
 * @returns total seconds
 */
const parseTimeToSeconds = (minutes: string, seconds: string, milliseconds?: string): number => {
  const secs = parseFloat(seconds + (milliseconds || ''));
  return parseInt(minutes, 10) * 60 + secs;
};

/**
 * Parse raw lyrics text with timestamps into structured LyricLine array
 * Detects timestamps at any position in a line and strips them from display text.
 * 
 * @param rawText - Raw lyrics text with timestamps
 * @returns Array of LyricLine objects
 */
export const parseTimestampedLyrics = (rawText: string): LyricLine[] => {
  if (!rawText) return [];
  
  // Handle potential escaped newlines if the source didn't decode correctly
  let textToParse = rawText;
  if (textToParse.includes('\\n')) {
      textToParse = textToParse.replace(/\\n/g, '\n');
  }
  
  const lines = textToParse.split(/\r\n|\r|\n/).map((line) => line.trim()).filter(Boolean);
  const lyrics: LyricLine[] = [];
  
  if (__DEV__) console.log(`[Parser] Raw text length: ${rawText.length}, Lines: ${lines.length}`);
  if (lines.length > 0) {
      if (__DEV__) console.log(`[Parser] First line: "${lines[0]}"`);
  }
  
  let currentTimestamp = 0;
  let currentTextLines: string[] = [];
  let lineOrder = 0;
  
  // First check if there are ANY timestamps
  TIMESTAMP_REGEX.lastIndex = 0;
  const hasTimestamps = TIMESTAMP_REGEX.test(textToParse);
  
  if (!hasTimestamps) {
    if (__DEV__) console.log('[Parser] No timestamps detected in text');
    // If no timestamps, treat every line as a separate lyric line
    return lines.map((text, index) => ({
      timestamp: 0,
      text,
      lineOrder: index,
    }));
  }
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Search for the first timestamp in this line
    const match = line.match(SINGLE_TIMESTAMP_REGEX);
    
    if (match) {
      // Save previous lyrics block if any
      if (currentTextLines.length > 0) {
        lyrics.push({
          timestamp: currentTimestamp,
          text: currentTextLines.join('\n'),
          lineOrder: lineOrder++,
        });
        currentTextLines = [];
      }
      
      // Parse new timestamp
      let rawTimestamp = parseTimeToSeconds(match[1], match[2], match[3]);
      
      // Use raw timestamp (Dynamic offset applied in renderer instead of "saving" it)
      currentTimestamp = rawTimestamp;
      
      // Clean the line text by removing ALL timestamps and common separators
      let cleanedText = line.replace(TIMESTAMP_REGEX, '').trim();
      // Remove leading/trailing symbols commonly used as separators (-, :, |, .)
      cleanedText = cleanedText.replace(/^[ -:.|]+|[ -:.|]+$/g, '').trim();

      if (cleanedText.length > 0) {
        // Inline timestamp with text
        currentTextLines.push(cleanedText);
      }
      
      // IMPORTANT: If this line had a timestamp, it marks the START of a new block (usually).
      // However, if the text was inline (e.g. "[00:10] Hello"), we want to commit it immediately 
      // if the NEXT line also has a timestamp.
      // But the current structure accumulates widely.
      // Let's stick to the current logic: A timestamp triggers the commit of the *previous* block.
      // The current block starts here.
      
    } else {
      // Regular text line - add to current block
      currentTextLines.push(line);
    }
  }
  
  // Don't forget the last block
  if (currentTextLines.length > 0 || currentTimestamp > 0) {
    // Even if text is empty, if we have a timestamp, we might want a spacer (instrumental)? 
    // But for now, only push if text exists OR we want to support instrumental markers.
    if (currentTextLines.length > 0) {
        lyrics.push({
        timestamp: currentTimestamp,
        text: currentTextLines.join('\n'),
        lineOrder: lineOrder,
        });
    }
  }
  
  return lyrics;
};

/**
 * Calculate total duration from lyrics (last timestamp + estimated reading time)
 * @param lyrics - Array of LyricLine objects
 * @returns Duration in seconds
 */
export const calculateDuration = (lyrics: LyricLine[]): number => {
  if (lyrics.length === 0) return 0;
  
  const lastLine = lyrics[lyrics.length - 1];
  // Add 10 seconds after the last timestamp for reading time
  return lastLine.timestamp + 10;
};

/**
 * Get the current line index based on elapsed time
 * @param lyrics - Array of LyricLine objects
 * @param currentTime - Current time in seconds
 * @returns Index of the current lyric line
 */
export const getCurrentLineIndex = (lyrics: LyricLine[], currentTime: number): number => {
  if (lyrics.length === 0) return -1;
  
  // Find the last line whose timestamp is <= currentTime
  for (let i = lyrics.length - 1; i >= 0; i--) {
    if (lyrics[i].timestamp <= currentTime) {
      return i;
    }
  }
  
  return 0; // Default to first line
};

/**
 * Convert lyrics array back to raw text format for editing
 * @param lyrics - Array of LyricLine objects
 * @returns Raw text with timestamps
 */
export const lyricsToRawText = (lyrics: LyricLine[]): string => {
  // Check if all timestamps are 0 (likely no timestamps were provided)
  const allZero = lyrics.every(line => line.timestamp === 0);
  
  if (allZero) {
    return lyrics.map(line => line.text).join('\n');
  }

  return lyrics
    .map((line) => {
      const minutes = Math.floor(line.timestamp / 60);
      const seconds = (line.timestamp % 60);
      
      // Format seconds to be 05.50 (2 digits, dot, 2 digits)
      // timestamp is in SECONDS (float).
      // So 5.5 -> 05.50
      const secondsInt = Math.floor(seconds);
      const milliseconds = Math.round((seconds - secondsInt) * 100);
      
      const secondsStr = secondsInt.toString().padStart(2, '0');
      const msStr = milliseconds.toString().padStart(2, '0');
      
      const timeStr = `[${minutes.toString().padStart(2, '0')}:${secondsStr}.${msStr}]`;
      return `${timeStr} ${line.text}`;
    })
    .join('\n');
};

/**
 * Validate if raw text contains valid timestamps
 * @param rawText - Raw lyrics text
 * @returns true if at least one valid timestamp is found
 */
export const hasValidTimestamps = (rawText: string): boolean => {
  return TIMESTAMP_REGEX.test(rawText);
};

/**
 * Normalize lyrics timestamps to ensure they are in seconds.
 * Detects if timestamps are likely in milliseconds (e.g. > 1000s avg) and converts them.
 * Also sorts lyrics by timestamp to ensure timeline integrity.
 */
export const normalizeLyrics = (lyrics: LyricLine[]): LyricLine[] => {
  if (!lyrics || lyrics.length === 0) return [];

  // 1. Check if we need to convert from MS to Seconds
  // Heuristic: If the first non-zero timestamp is > 600 (10 mins) and we have multiple lines, 
  // it's extremely likely to be in milliseconds (unless it's a podcast/long mix, but 10m start is rare for songs)
  // A safer heuristic: If ANY timestamp exceeds 3600 (1 hour) it's suspicious for a normal song, 
  // but let's look at the average magnitude of the first few timestamps.
  
  const sample = lyrics.filter(l => l.timestamp > 0).slice(0, 5);
  let isMilliseconds = false;
  
  if (sample.length > 0) {
    const avg = sample.reduce((sum, l) => sum + l.timestamp, 0) / sample.length;
    // If average is > 1000, it's definitely milliseconds (1000s = 16 mins)
    if (avg > 1000) {
      isMilliseconds = true;
    }
  }

  let normalized = lyrics.map(line => ({
    ...line,
    timestamp: isMilliseconds ? line.timestamp / 1000 : line.timestamp
  }));

  // 2. Ensure sorted by timestamp
  normalized.sort((a, b) => a.timestamp - b.timestamp);

  // 3. Re-assign line orders
  return normalized.map((line, index) => ({
    ...line,
    lineOrder: index
  }));
};
