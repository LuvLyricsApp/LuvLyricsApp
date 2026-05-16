import {
  parseTimestampedLyrics,
  getCurrentLineIndex,
  normalizeLyrics,
  lyricsToRawText,
  hasValidTimestamps,
} from './timestampParser';

describe('timestampParser', () => {
  it('parses bracket timestamp format', () => {
    const parsed = parseTimestampedLyrics('[00:10.50] Hello world');
    expect(parsed).toHaveLength(1);
    expect(parsed[0].timestamp).toBeCloseTo(10.5, 2);
    expect(parsed[0].text).toBe('Hello world');
  });

  it('parses parenthesis timestamp format', () => {
    const parsed = parseTimestampedLyrics('(0:09) line');
    expect(parsed).toHaveLength(1);
    expect(parsed[0].timestamp).toBe(9);
    expect(parsed[0].text).toBe('line');
  });

  it('parses raw colon timestamp format without wrappers', () => {
    const parsed = parseTimestampedLyrics('0:07 raw line');
    expect(parsed).toHaveLength(1);
    expect(parsed[0].timestamp).toBe(7);
    expect(parsed[0].text).toBe('raw line');
  });

  it('parses dot timestamp format', () => {
    const parsed = parseTimestampedLyrics('1.23 dot line');
    expect(parsed).toHaveLength(1);
    expect(parsed[0].timestamp).toBe(83);
    expect(parsed[0].text).toBe('dot line');
  });

  it('keeps malformed untimestamped lines with the current lyric block', () => {
    const parsed = parseTimestampedLyrics('[00:05] first line\nmalformed line\n[00:10] second line');
    expect(parsed).toHaveLength(2);
    expect(parsed[0]).toMatchObject({
      timestamp: 5,
      text: 'first line\nmalformed line',
      lineOrder: 0,
    });
    expect(parsed[1]).toMatchObject({
      timestamp: 10,
      text: 'second line',
      lineOrder: 1,
    });
  });

  it('returns no lyric lines for empty or whitespace-only input', () => {
    expect(parseTimestampedLyrics('')).toEqual([]);
    expect(parseTimestampedLyrics('   \n\t  ')).toEqual([]);
  });

  it('handles plain text without timestamps', () => {
    const parsed = parseTimestampedLyrics('line one\nline two');
    expect(parsed).toHaveLength(2);
    expect(parsed[0].timestamp).toBe(0);
    expect(parsed[1].timestamp).toBe(0);
  });

  it('detects valid timestamps', () => {
    expect(hasValidTimestamps('[01:20] text')).toBe(true);
    expect(hasValidTimestamps('no timestamp')).toBe(false);
  });

  it('returns current line index for a time cursor', () => {
    const parsed = parseTimestampedLyrics('[00:00] a\n[00:05] b\n[00:10] c');
    expect(getCurrentLineIndex(parsed, 0)).toBe(0);
    expect(getCurrentLineIndex(parsed, 6)).toBe(1);
    expect(getCurrentLineIndex(parsed, 20)).toBe(2);
  });

  it('normalizes millisecond-like timestamps and sorts lines', () => {
    const normalized = normalizeLyrics([
      { timestamp: 2500, text: 'later', lineOrder: 0 },
      { timestamp: 1000, text: 'first', lineOrder: 1 },
    ]);
    expect(normalized[0].text).toBe('first');
    expect(normalized[0].timestamp).toBe(1);
    expect(normalized[1].timestamp).toBe(2.5);
  });

  it('reassigns line order after normalizing out-of-order timestamps', () => {
    const normalized = normalizeLyrics([
      { timestamp: 12, text: 'third', lineOrder: 0 },
      { timestamp: 3, text: 'first', lineOrder: 1 },
      { timestamp: 8, text: 'second', lineOrder: 2 },
    ]);

    expect(normalized.map((line) => line.text)).toEqual(['first', 'second', 'third']);
    expect(normalized.map((line) => line.lineOrder)).toEqual([0, 1, 2]);
  });

  it('converts lyrics back to raw text', () => {
    const text = lyricsToRawText([
      { timestamp: 65.23, text: 'hello', lineOrder: 0 },
    ]);
    expect(text).toContain('[01:05.23]');
    expect(text).toContain('hello');
  });
});
