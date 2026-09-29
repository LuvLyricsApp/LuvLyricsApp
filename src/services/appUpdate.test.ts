import { LATEST_APK_URL, parseRelease, releasedAgo } from './appUpdate';

describe('parseRelease', () => {
  it('reads the date and the APK from a release', () => {
    const build = parseRelease({
      published_at: '2026-09-27T18:49:06Z',
      assets: [
        { name: 'notes.txt', browser_download_url: 'https://example.com/notes.txt' },
        { name: 'LuvLyrics.apk', browser_download_url: 'https://example.com/LuvLyrics.apk' },
      ],
    });
    expect(build?.publishedAt.toISOString()).toBe('2026-09-27T18:49:06.000Z');
    expect(build?.downloadUrl).toBe('https://example.com/LuvLyrics.apk');
  });

  it('falls back to the stable download link when the release lists no APK', () => {
    expect(parseRelease({ published_at: '2026-09-27T18:49:06Z', assets: [] })?.downloadUrl).toBe(LATEST_APK_URL);
  });

  it('has nothing to offer without a usable date', () => {
    expect(parseRelease(null)).toBeNull();
    expect(parseRelease({})).toBeNull();
    expect(parseRelease({ published_at: 'not a date' })).toBeNull();
  });
});

describe('releasedAgo', () => {
  const now = new Date('2026-09-29T12:00:00Z');
  it('says today, yesterday and a few days ago in words', () => {
    expect(releasedAgo(new Date('2026-09-29T08:00:00Z'), now)).toBe('today');
    expect(releasedAgo(new Date('2026-09-28T08:00:00Z'), now)).toBe('yesterday');
    expect(releasedAgo(new Date('2026-09-25T08:00:00Z'), now)).toBe('4 days ago');
  });
});
