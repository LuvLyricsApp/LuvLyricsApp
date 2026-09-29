import {
  countOf,
  formatTime,
  formatTimeLong,
  formatRelativeDate,
  formatSongSubtitle,
  truncateText,
} from './formatters';

// ── countOf ──────────────────────────────────────────────────────────────────

describe('countOf', () => {
  it('says 1 song, not 1 songs', () => {
    expect(countOf(0, 'song')).toBe('0 songs');
    expect(countOf(1, 'song')).toBe('1 song');
    expect(countOf(2, 'song')).toBe('2 songs');
    expect(countOf(1, 'library', 'libraries')).toBe('1 library');
    expect(countOf(3, 'library', 'libraries')).toBe('3 libraries');
  });
});

// ── formatTime ───────────────────────────────────────────────────────────────

describe('formatTime', () => {
  it.each([
    [0, '0:00'],
    [5, '0:05'],
    [59, '0:59'],
    [60, '1:00'],
    [65, '1:05'],
    [245, '4:05'],
    [3600, '60:00'],
    [3661, '61:01'],
  ])('%i seconds → "%s"', (input, expected) => {
    expect(formatTime(input)).toBe(expected);
  });

  it('floors fractional seconds', () => {
    expect(formatTime(61.9)).toBe('1:01');
  });
});

// ── formatTimeLong ───────────────────────────────────────────────────────────

describe('formatTimeLong', () => {
  it.each([
    [0, '00:00'],
    [5, '00:05'],
    [60, '01:00'],
    [65, '01:05'],
    [245, '04:05'],
    [600, '10:00'],
  ])('%i seconds → "%s"', (input, expected) => {
    expect(formatTimeLong(input)).toBe(expected);
  });

  it('zero-pads both components', () => {
    expect(formatTimeLong(9)).toBe('00:09');
  });
});

// ── formatRelativeDate ───────────────────────────────────────────────────────

describe('formatRelativeDate', () => {
  function ago(ms: number): string {
    return new Date(Date.now() - ms).toISOString();
  }

  const MINUTE = 60 * 1000;
  const HOUR = 60 * MINUTE;
  const DAY = 24 * HOUR;

  it('returns "Just now" for < 1 minute ago', () => {
    expect(formatRelativeDate(ago(30 * 1000))).toBe('Just now');
  });

  it('returns "X min ago" for < 1 hour', () => {
    expect(formatRelativeDate(ago(5 * MINUTE))).toBe('5 min ago');
    expect(formatRelativeDate(ago(30 * MINUTE))).toBe('30 min ago');
  });

  it('returns "X hour(s) ago" for < 1 day', () => {
    expect(formatRelativeDate(ago(1 * HOUR))).toBe('1 hour ago');
    expect(formatRelativeDate(ago(3 * HOUR))).toBe('3 hours ago');
  });

  it('returns "Yesterday" for 1 day ago', () => {
    expect(formatRelativeDate(ago(1 * DAY + HOUR))).toBe('Yesterday');
  });

  it('returns "X days ago" for < 7 days', () => {
    expect(formatRelativeDate(ago(3 * DAY))).toBe('3 days ago');
    expect(formatRelativeDate(ago(6 * DAY))).toBe('6 days ago');
  });

  it('returns "X week(s) ago" for < 30 days', () => {
    expect(formatRelativeDate(ago(8 * DAY))).toBe('1 week ago');
    expect(formatRelativeDate(ago(14 * DAY))).toBe('2 weeks ago');
  });

  it('returns "X month(s) ago" for < 365 days', () => {
    expect(formatRelativeDate(ago(31 * DAY))).toBe('1 month ago');
    expect(formatRelativeDate(ago(62 * DAY))).toBe('2 months ago');
  });

  it('returns "X year(s) ago" for >= 365 days', () => {
    expect(formatRelativeDate(ago(366 * DAY))).toBe('1 year ago');
    expect(formatRelativeDate(ago(2 * 365 * DAY))).toBe('2 years ago');
  });
});

// ── formatSongSubtitle ───────────────────────────────────────────────────────

describe('formatSongSubtitle', () => {
  it('joins artist and album with bullet', () => {
    expect(formatSongSubtitle('The Weeknd', 'After Hours')).toBe('The Weeknd • After Hours');
  });

  it('returns only artist when album is missing', () => {
    expect(formatSongSubtitle('Adele')).toBe('Adele');
  });

  it('returns only album when artist is missing', () => {
    expect(formatSongSubtitle(undefined, 'Thriller')).toBe('Thriller');
  });

  it('returns "Unknown" when both are missing', () => {
    expect(formatSongSubtitle()).toBe('Unknown');
    expect(formatSongSubtitle(undefined, undefined)).toBe('Unknown');
  });

  it('filters out legacy "Downloaded" album', () => {
    expect(formatSongSubtitle('Coldplay', 'Downloaded')).toBe('Coldplay');
    expect(formatSongSubtitle(undefined, 'Downloaded')).toBe('Unknown');
  });
});

// ── truncateText ─────────────────────────────────────────────────────────────

describe('truncateText', () => {
  it('returns original text when within limit', () => {
    expect(truncateText('hello', 10)).toBe('hello');
    expect(truncateText('hello', 5)).toBe('hello');
  });

  it('truncates and appends ellipsis when over limit', () => {
    expect(truncateText('hello world', 8)).toBe('hello...');
  });

  it('keeps exactly maxLength chars in result', () => {
    const result = truncateText('abcdefghij', 7);
    expect(result.length).toBe(7);
    expect(result).toBe('abcd...');
  });
});
