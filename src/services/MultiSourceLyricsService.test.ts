jest.mock('../services/LyricaService', () => ({
  lyricaService: {
    fetchLyrics: jest.fn(),
  },
}));

import { lyricaService } from '../services/LyricaService';
import { getLyricsFriendlyError, MultiSourceLyricsService } from './MultiSourceLyricsService';

const mockFetchLyrics = jest.mocked(lyricaService.fetchLyrics);

describe('getLyricsFriendlyError', () => {
  beforeEach(() => {
    mockFetchLyrics.mockReset();
  });

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

  it('returns lyric results when the provider finds a match', async () => {
    mockFetchLyrics.mockResolvedValue({
      lyrics: 'hello world',
      source: 'Lyrica (plain)',
    });

    await expect(
      MultiSourceLyricsService.fetchLyricsParallel('Song', 'Artist', 180)
    ).resolves.toEqual([
      {
        lyrics: 'hello world',
        source: 'Lyrica (plain)',
      },
    ]);
  });

  it('returns an empty array when the provider finds no lyrics', async () => {
    mockFetchLyrics.mockResolvedValue(null);

    await expect(
      MultiSourceLyricsService.fetchLyricsParallel('Song', 'Artist', 180)
    ).resolves.toEqual([]);
  });

  it('rethrows provider errors so the UI can map them to friendly messages', async () => {
    mockFetchLyrics.mockRejectedValue(new Error('429 rate limit exceeded'));

    await expect(
      MultiSourceLyricsService.fetchLyricsParallel('Song', 'Artist', 180)
    ).rejects.toThrow('429 rate limit exceeded');
  });
});
