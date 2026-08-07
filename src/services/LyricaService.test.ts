import { getLyricsFriendlyError } from './LyricaService';

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
