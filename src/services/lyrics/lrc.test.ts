import { formatLrcTime, hasLrcTimestamps, parseClock, toLineLrc, ttmlToLrc } from './lrc';
import { parseTimestampedLyrics } from '../../utils/timestampParser';

describe('formatLrcTime', () => {
  it('formats milliseconds as [mm:ss.xx]', () => {
    expect(formatLrcTime(0)).toBe('[00:00.00]');
    expect(formatLrcTime(83_456)).toBe('[01:23.45]');
    expect(formatLrcTime(-5)).toBe('[00:00.00]');
  });
});

describe('parseClock', () => {
  it('handles every TTML clock form', () => {
    expect(parseClock('12.5s')).toBe(12_500);
    expect(parseClock('340ms')).toBe(340);
    expect(parseClock('01:02.345')).toBe(62_345);
    expect(parseClock('1:02:03.4')).toBe(3_723_400);
    expect(parseClock('7.5')).toBe(7_500);
  });

  it('rejects garbage', () => {
    expect(parseClock(undefined)).toBeNull();
    expect(parseClock('abc')).toBeNull();
    expect(parseClock('1::2')).toBeNull();
  });
});

describe('ttmlToLrc', () => {
  const ttml = `<tt xmlns:ttm="http://www.w3.org/ns/ttml#metadata"><body><div>
    <p begin="00:01.000" end="00:03.000"><span begin="00:01.000">Hello</span> <span begin="00:01.500">world</span></p>
    <p begin="4.25s"><span>Main</span> <span ttm:role="x-bg"><span>(ooh</span> <span>yeah)</span></span> <span>line</span></p>
    <p begin="00:06.000">Tom &amp; Jerry&#39;s</p>
    <p>no timing</p>
  </div></body></tt>`;

  it('flattens word spans, drops background vocals and decodes entities', () => {
    expect(ttmlToLrc(ttml)).toBe(
      ['[00:01.00]Hello world', '[00:04.25]Main line', "[00:06.00]Tom & Jerry's"].join('\n'),
    );
  });

  it('produces text the app parser reads as synced lines', () => {
    const lines = parseTimestampedLyrics(ttmlToLrc(ttml));
    expect(lines.map(l => [l.timestamp, l.text])).toEqual([
      [1, 'Hello world'],
      [4.25, 'Main line'],
      [6, "Tom & Jerry's"],
    ]);
  });
});

describe('toLineLrc', () => {
  it('strips word timings, bg markers and metadata tags', () => {
    const enhanced = [
      '[ar:Someone]',
      '[offset:0]',
      '[00:10.00]{bg}<00:10.00>Word <00:10.50>by <00:11.00>word',
      '',
      '[00:12.00]Plain line',
    ].join('\n');
    expect(toLineLrc(enhanced)).toBe('[00:10.00]Word by word\n[00:12.00]Plain line');
  });
});

describe('hasLrcTimestamps', () => {
  it('detects synced text', () => {
    expect(hasLrcTimestamps('[00:01.00]hi')).toBe(true);
    expect(hasLrcTimestamps('just words\nmore words')).toBe(false);
  });
});
