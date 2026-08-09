import {
  compareLyricsPriority,
  convertTtmlToInternalLrc,
  detectLyricsPrecision,
  getLyricsFriendlyError,
  getLyricsPrecisionLabel,
} from './LyricaService';

describe('getLyricsFriendlyError', () => {
  it('returns network message for fetch failures', () => {
    expect(getLyricsFriendlyError(new Error('Failed to fetch')))
      .toBe('No internet connection. Check your network and try again.');
  });

  it('returns timeout message for timed out errors', () => {
    expect(getLyricsFriendlyError(new Error('Request timed out')))
      .toBe('Lyrics request timed out. Please check connection and try again.');
  });

  it('returns provider-down message for 500 errors', () => {
    expect(getLyricsFriendlyError(new Error('500 server error')))
      .toBe('Lyrics service is temporarily unavailable. Please retry in a moment.');
  });

  it('returns rate limit message for 429 errors', () => {
    expect(getLyricsFriendlyError(new Error('429 rate limit exceeded')))
      .toBe('Too many requests. Please wait a moment and try again.');
  });

  it('returns not found message for 404 errors', () => {
    expect(getLyricsFriendlyError(new Error('404 not found')))
      .toBe('No lyrics found for this song.');
  });

  it('returns unavailable message for unknown errors', () => {
    expect(getLyricsFriendlyError(new Error('Something weird happened')))
      .toBe('Lyrics service is temporarily unavailable. Please retry in a moment.');
  });

  it('handles non-Error values gracefully', () => {
    expect(getLyricsFriendlyError('string error'))
      .toBe('Lyrics service is temporarily unavailable. Please retry in a moment.');
    expect(getLyricsFriendlyError(null))
      .toBe('Lyrics service is temporarily unavailable. Please retry in a moment.');
    expect(getLyricsFriendlyError(undefined))
      .toBe('Lyrics service is temporarily unavailable. Please retry in a moment.');
  });
});

describe('lyrics precision helpers', () => {
  it('detects inline word timing markup as word-timed lyrics', () => {
    expect(
      detectLyricsPrecision('[00:08.72]<00:08.72>Fly <00:09.32>me <00:09.84>to the moon')
    ).toBe('word');
  });

  it('promotes synced Better Lyrics and Unison payloads to the word tier', () => {
    expect(detectLyricsPrecision('[00:12.00] Hello', 'Better Lyrics', true)).toBe('word');
    expect(detectLyricsPrecision('[00:12.00] Hello', 'Unison', true)).toBe('word');
  });

  it('keeps ordinary timestamped lyrics in the synced tier', () => {
    expect(detectLyricsPrecision('[00:12.00] Hello', 'LRCLIB')).toBe('synced');
  });

  it('ranks precision before strategy priority', () => {
    expect(compareLyricsPriority(
      { precision: 'word', strategyRank: 2 },
      { precision: 'synced', strategyRank: 3 }
    )).toBeGreaterThan(0);

    expect(compareLyricsPriority(
      { precision: 'synced', strategyRank: 3 },
      { precision: 'synced', strategyRank: 2 }
    )).toBeGreaterThan(0);
  });

  it('returns stable user-facing labels', () => {
    expect(getLyricsPrecisionLabel('word')).toBe('Word Timed');
    expect(getLyricsPrecisionLabel('synced')).toBe('Synced');
    expect(getLyricsPrecisionLabel('plain')).toBe('Plain');
  });

  it('converts TTML richsync payloads into internal rich lines', () => {
    const converted = convertTtmlToInternalLrc(
      '<tt><body><div><p begin="0:23.971"><span begin="0:23.971" end="0:24.104">You\'re</span> <span begin="0:24.104" end="0:27.026">emotional</span></p></div></body></tt>'
    );

    expect(converted).toContain('[00:23.97]You\'re emotional');
    expect(converted).toContain('<You\'re:23.971:24.104|emotional:24.104:27.026>');
    expect(detectLyricsPrecision(converted, 'Unison', true)).toBe('word');
  });
});
