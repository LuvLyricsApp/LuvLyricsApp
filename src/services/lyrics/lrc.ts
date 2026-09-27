/**
 * LRC helpers shared by the Echo lyrics providers.
 *
 * Providers hand back anything from word-synced "enhanced LRC" to Apple TTML.
 * LuvLyrics renders line-synced lyrics, so everything is normalised to plain
 * `[mm:ss.xx]line` text that `parseTimestampedLyrics` already understands.
 */

const pad = (n: number, width = 2): string => String(n).padStart(width, '0');

/** Milliseconds -> "[mm:ss.xx]". */
export const formatLrcTime = (ms: number): string => {
  const safe = Math.max(0, Math.round(ms));
  const minutes = Math.floor(safe / 60000);
  const seconds = Math.floor((safe % 60000) / 1000);
  const centis = Math.floor((safe % 1000) / 10);
  return `[${pad(minutes)}:${pad(seconds)}.${pad(centis)}]`;
};

/**
 * TTML clock values: "12.5s", "340ms", "01:02.345", "1:02:03.4", "7.5".
 * Returns milliseconds, or null when unparseable.
 */
export const parseClock = (value: string | undefined): number | null => {
  if (!value) return null;
  const v = value.trim();
  if (/^\d+(\.\d+)?s$/.test(v)) return Math.round(parseFloat(v) * 1000);
  if (/^\d+(\.\d+)?ms$/.test(v)) return Math.round(parseFloat(v));
  const parts = v.split(':');
  if (parts.length > 3 || parts.some(p => p === '' || isNaN(Number(p)))) return null;
  const nums = parts.map(Number);
  let seconds = 0;
  for (const n of nums) seconds = seconds * 60 + n;
  return Math.round(seconds * 1000);
};

const decodeEntities = (s: string): string =>
  s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;|&#x27;/g, "'")
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCharCode(Number(d)));

/** Removes every `<span … ttm:role="x-bg">…</span>`, honouring nested spans. */
const stripBackgroundSpans = (body: string): string => {
  let result = body;
  for (;;) {
    const start = result.search(/<span\b[^>]*ttm:role="x-bg"[^>]*>/);
    if (start === -1) return result;
    const tagRegex = /<(\/?)span\b[^>]*>/g;
    tagRegex.lastIndex = start;
    let depth = 0;
    let end = result.length;
    let tag: RegExpExecArray | null;
    while ((tag = tagRegex.exec(result)) !== null) {
      depth += tag[1] ? -1 : 1;
      if (depth === 0) {
        end = tag.index + tag[0].length;
        break;
      }
    }
    result = result.slice(0, start) + result.slice(end);
  }
};

/**
 * Apple-style TTML -> line LRC. Each `<p begin="…">` becomes one line; word
 * spans are flattened. Background-vocal spans (ttm:role="x-bg") are dropped so
 * the main line stays readable.
 */
export const ttmlToLrc = (ttml: string): string => {
  const out: string[] = [];
  const pRegex = /<p\b([^>]*)>([\s\S]*?)<\/p>/g;
  let match: RegExpExecArray | null;
  while ((match = pRegex.exec(ttml)) !== null) {
    const attrs = match[1];
    let body = match[2];
    const begin = parseClock(attrs.match(/\bbegin="([^"]+)"/)?.[1]);
    if (begin === null) continue;
    body = stripBackgroundSpans(body);
    // Word spans are often written back-to-back with the space inside or
    // outside the tag — collapse tags to nothing, then normalise whitespace.
    const text = decodeEntities(body.replace(/<br\s*\/?>/g, ' ').replace(/<[^>]+>/g, ''))
      .replace(/\s+/g, ' ')
      .trim();
    if (text) out.push(`${formatLrcTime(begin)}${text}`);
  }
  return out.join('\n');
};

/**
 * Strips word-level timing (`<00:12.34>`), `{bg}` markers and metadata tags
 * (`[ar:…]`, `[offset:…]`) so enhanced LRC renders as clean line LRC.
 */
export const toLineLrc = (lrc: string): string =>
  lrc
    .split(/\r\n|\r|\n/)
    .map(line => line.replace(/<\d{1,2}:\d{2}(?:\.\d{1,3})?>/g, '').replace(/\{bg\}/g, ''))
    .filter(line => !/^\[(ar|ti|al|by|offset|length|re|ve|au|#):/i.test(line.trim()))
    .map(line => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');

export const hasLrcTimestamps = (text: string): boolean => /\[\d{1,2}:\d{2}(?:[.:]\d{1,3})?\]/.test(text);
