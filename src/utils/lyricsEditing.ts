/**
 * Pure helpers behind the lyrics editor (screens/LyricsEditorScreen.tsx).
 */

const STAMP = /^\[(\d+):(\d+(?:\.\d+)?)\](.*)$/;

/** Does the text carry at least one [mm:ss] timestamp? */
export const hasTimestamps = (text: string): boolean =>
  text.split('\n').some(line => STAMP.test(line.trim()));

const formatStamp = (totalSeconds: number): string => {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds - minutes * 60;
  const fixed = seconds.toFixed(2);
  return `[${minutes}:${seconds < 10 ? `0${fixed}` : fixed}]`;
};

/**
 * Moves every timestamp by `offsetSeconds` (never below zero). Lines without
 * a timestamp are left alone.
 */
export const shiftTimestamps = (text: string, offsetSeconds: number): string =>
  text
    .split('\n')
    .map(line => {
      const match = line.match(STAMP);
      if (!match) return line;
      const at = Math.max(0, Number(match[1]) * 60 + Number(match[2]) + offsetSeconds);
      return `${formatStamp(at)}${match[3]}`;
    })
    .join('\n');

/** "3:25" or "205" → seconds; anything else → 0. */
export const parseDurationInput = (input: string): number => {
  const parts = input.trim().split(':');
  if (parts.length === 2) {
    const minutes = parseInt(parts[0], 10);
    const seconds = parseInt(parts[1], 10);
    return Number.isNaN(minutes) || Number.isNaN(seconds) ? 0 : minutes * 60 + seconds;
  }
  if (parts.length === 1) {
    const seconds = parseInt(parts[0], 10);
    return Number.isNaN(seconds) ? 0 : seconds;
  }
  return 0;
};

/** "+0.6s", "−1.5s" — the running shift, with a real minus sign. */
export const formatOffset = (seconds: number): string => {
  const rounded = Math.round(seconds * 10) / 10;
  if (rounded === 0) return '0s';
  return `${rounded > 0 ? '+' : '−'}${Math.abs(rounded)}s`;
};
