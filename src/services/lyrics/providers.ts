/**
 * Lyrics providers ported from Echo Music. Every provider:
 *   - takes the same LyricsQuery,
 *   - returns normalised line-LRC (or plain text) or null,
 *   - never throws (see fetchWithTimeout).
 */
import { Buffer } from 'buffer';
import { buildUrl, fetchJson } from '../net/fetchWithTimeout';
import { formatLrcTime, hasLrcTimestamps, toLineLrc, ttmlToLrc } from './lrc';

export interface LyricsQuery {
  title: string;
  artist: string;
  album?: string;
  /** Seconds; 0/undefined when unknown. */
  duration?: number;
  /** YouTube video id, when the song came from YouTube. */
  videoId?: string;
}

export type LyricsProviderName =
  | 'YouLyPlus'
  | 'Paxsenix'
  | 'Unison'
  | 'BetterLyrics'
  | 'SimpMusic'
  | 'LrcLib'
  | 'KuGou';

export interface ProviderLyrics {
  provider: LyricsProviderName;
  lyrics: string;
  synced: boolean;
  trackName?: string;
  artistName?: string;
  albumName?: string;
  duration?: number;
}

export type LyricsProvider = (q: LyricsQuery) => Promise<ProviderLyrics | null>;

const durationSecs = (q: LyricsQuery): number | undefined =>
  q.duration && q.duration > 0 ? Math.round(q.duration) : undefined;

/**
 * Resolves with the first non-null value, or null once every promise settles
 * empty. Promise.any isn't guaranteed in React Native's Promise polyfill.
 */
export const firstNonNull = <T>(promises: Promise<T | null>[]): Promise<T | null> =>
  new Promise(resolve => {
    let pending = promises.length;
    if (pending === 0) resolve(null);
    for (const p of promises) {
      p.then(
        value => {
          if (value !== null) resolve(value);
          else if (--pending === 0) resolve(null);
        },
        () => {
          if (--pending === 0) resolve(null);
        },
      );
    }
  });

const result = (
  provider: LyricsProviderName,
  raw: string | null | undefined,
  meta: Partial<Omit<ProviderLyrics, 'provider' | 'lyrics' | 'synced'>> = {},
): ProviderLyrics | null => {
  if (!raw || !raw.trim()) return null;
  const synced = hasLrcTimestamps(raw);
  const lyrics = synced ? toLineLrc(raw) : raw.trim();
  return lyrics ? { provider, lyrics, synced, ...meta } : null;
};

// ─── YouLyPlus (LyricsPlus / KPoe mirrors) ──────────────────────────────────

const YOULY_SERVERS = [
  'https://lyricsplus.prjktla.my.id',
  'https://lyricsplus.atomix.one',
  'https://lyricsplus.binimum.org',
  'https://lyricsplus.prjktla.workers.dev',
  'https://lyricsplus-seven.vercel.app',
  'https://lyrics-plus-backend.vercel.app',
];

interface YoulyLine { text?: string; time?: number; syllabus?: { text?: string }[] }
interface YoulyResponse {
  syncedLyrics?: string;
  plainLyrics?: string;
  lyrics?: YoulyLine[];
  trackName?: string;
  artistName?: string;
  albumName?: string;
}

let youlyLastWorking: string | null = null;

const youlyLinesToLrc = (lines: YoulyLine[]): string =>
  lines
    .map(line => {
      const text = line.syllabus?.length
        ? line.syllabus.map(s => s.text ?? '').join('')
        : line.text ?? '';
      return `${formatLrcTime(line.time ?? 0)}${text.replace(/\s+/g, ' ').trim()}`;
    })
    .join('\n');

export const youLyPlus: LyricsProvider = async q => {
  const servers = youlyLastWorking
    ? [youlyLastWorking, ...YOULY_SERVERS.filter(s => s !== youlyLastWorking)]
    : YOULY_SERVERS;
  const params = { title: q.title, artist: q.artist, duration: durationSecs(q), album: q.album };

  // Race the mirrors: the first one with usable lyrics wins.
  return firstNonNull(servers.map(async server => {
    const res = await fetchJson<YoulyResponse>(buildUrl(`${server}/v2/lyrics/get`, params), { timeoutMs: 10_000 });
    const raw = res?.syncedLyrics?.trim()
      || (res?.lyrics?.length ? youlyLinesToLrc(res.lyrics) : '')
      || res?.plainLyrics?.trim();
    const hit = result('YouLyPlus', raw, { trackName: res?.trackName, artistName: res?.artistName, albumName: res?.albumName });
    if (hit) youlyLastWorking = server;
    return hit;
  }));
};

// ─── Paxsenix (Apple Music lyrics proxy) ────────────────────────────────────

const PAXSENIX = 'https://lyrics.paxsenix.org';

interface PaxSearchResult { id: string; songName?: string; trackName?: string; artistName?: string; albumName?: string; duration?: number }
interface PaxLyricText { text: string }
interface PaxLyricsResponse {
  type?: string;
  content?: { timestamp: number; text?: PaxLyricText[] }[];
  elrc?: string;
  elrcMultiPerson?: string;
  ttmlContent?: string;
  plain?: string;
}

export const paxsenix: LyricsProvider = async q => {
  const results = await fetchJson<PaxSearchResult[]>(
    buildUrl(`${PAXSENIX}/apple-music/search`, { q: `${q.title} ${q.artist}` }),
    { headers: { 'User-Agent': 'LuvLyrics/1.0' } },
  );
  if (!Array.isArray(results) || results.length === 0) return null;

  const target = durationSecs(q);
  const lower = (s?: string) => (s ?? '').toLowerCase();
  const best = results
    .map(r => {
      const name = lower(r.trackName ?? r.songName);
      let score = 0;
      if (name === lower(q.title)) score += 10;
      else if (name.includes(lower(q.title)) || lower(q.title).includes(name)) score += 5;
      if (lower(r.artistName).includes(lower(q.artist).split(/[,&]/)[0].trim())) score += 6;
      // Paxsenix durations are milliseconds.
      if (target && r.duration && Math.abs(r.duration / 1000 - target) <= 4) score += 4;
      return { r, score };
    })
    .filter(x => x.score >= 9)
    .sort((a, b) => b.score - a.score)[0]?.r;
  if (!best) return null;

  const res = await fetchJson<PaxLyricsResponse>(buildUrl(`${PAXSENIX}/apple-music/lyrics`, { id: best.id }), {
    headers: { 'User-Agent': 'LuvLyrics/1.0' },
  });
  if (!res) return null;

  let raw: string | undefined;
  if (res.ttmlContent) raw = ttmlToLrc(res.ttmlContent);
  if (!raw) raw = res.elrcMultiPerson || res.elrc;
  if (!raw && res.content?.length) {
    raw = res.content
      .map(line => `${formatLrcTime(line.timestamp)}${(line.text ?? []).map(t => t.text).join(' ').replace(/\s+/g, ' ').trim()}`)
      .join('\n');
  }
  if (!raw) raw = res.plain;
  return result('Paxsenix', raw, { trackName: best.trackName ?? best.songName, artistName: best.artistName, albumName: best.albumName });
};

// ─── Unison (community-voted lyrics) ────────────────────────────────────────

const UNISON = 'https://unison.boidu.dev';

interface UnisonEntry { song?: string; artist?: string; lyrics?: string }
interface UnisonResponse { success?: boolean; data?: UnisonEntry | null }

export const unison: LyricsProvider = async q => {
  const pick = (res: UnisonResponse | null) => (res?.success && res.data?.lyrics ? res.data : null);
  let entry: UnisonEntry | null = null;
  if (q.videoId) entry = pick(await fetchJson<UnisonResponse>(buildUrl(`${UNISON}/lyrics`, { v: q.videoId })));
  if (!entry) {
    entry = pick(await fetchJson<UnisonResponse>(buildUrl(`${UNISON}/lyrics`, {
      song: q.title,
      artist: q.artist,
      album: q.album,
      duration: durationSecs(q),
    })));
  }
  return entry ? result('Unison', entry.lyrics, { trackName: entry.song, artistName: entry.artist }) : null;
};

// ─── Better Lyrics (TTML, word-synced upstream) ─────────────────────────────

const BETTER_LYRICS = 'https://lyrics-api.boidu.dev/getLyrics';

export const betterLyrics: LyricsProvider = async q => {
  const res = await fetchJson<{ ttml?: string }>(buildUrl(BETTER_LYRICS, {
    s: q.title,
    a: q.artist,
    d: durationSecs(q),
    al: q.album,
  }));
  return res?.ttml ? result('BetterLyrics', ttmlToLrc(res.ttml)) : null;
};

// ─── SimpMusic (keyed by YouTube video id) ──────────────────────────────────

const SIMPMUSIC = ['https://api-lyrics.simpmusic.org/v1/', 'https://vivi-yt-music-server.onrender.com/v1/'];

interface SimpLyrics {
  songTitle?: string;
  artistName?: string;
  durationSeconds?: number;
  syncedLyrics?: string | null;
  plainLyric?: string | null;
  richSyncLyrics?: string | null;
}
interface SimpResponse { type?: string; data?: SimpLyrics[] }

export const simpMusic: LyricsProvider = async q => {
  if (!q.videoId) return null;
  const d = durationSecs(q);
  for (const base of SIMPMUSIC) {
    const res = await fetchJson<SimpResponse>(`${base}${encodeURIComponent(q.videoId)}`, {
      headers: { 'User-Agent': 'SimpMusicLyrics/1.0' },
    });
    if (!res) continue; // HTTP failure: try the fallback mirror
    if (res.type !== 'success' || !Array.isArray(res.data)) return null;
    const valid = d ? res.data.filter(t => Math.abs((t.durationSeconds ?? 0) - d) <= 10) : res.data;
    const best = d
      ? [...valid].sort((a, b) => Math.abs((a.durationSeconds ?? 0) - d) - Math.abs((b.durationSeconds ?? 0) - d))[0]
      : valid[0];
    if (!best) return null;
    return result('SimpMusic', best.richSyncLyrics || best.syncedLyrics || best.plainLyric, {
      trackName: best.songTitle,
      artistName: best.artistName,
      duration: best.durationSeconds,
    });
  }
  return null;
};

// ─── LRCLIB ─────────────────────────────────────────────────────────────────

const LRCLIB = 'https://lrclib.net/api';

interface LrcLibHit {
  trackName?: string;
  artistName?: string;
  albumName?: string;
  duration?: number;
  syncedLyrics?: string | null;
  plainLyrics?: string | null;
}

export const lrcLib: LyricsProvider = async q => {
  const headers = { 'User-Agent': 'LuvLyrics/1.0 (https://github.com/LuvLyricsApp/LuvLyricsApp)' };
  const d = durationSecs(q);
  let hit: LrcLibHit | null = null;
  if (d) {
    hit = await fetchJson<LrcLibHit>(buildUrl(`${LRCLIB}/get`, {
      track_name: q.title,
      artist_name: q.artist,
      album_name: q.album,
      duration: d,
    }), { headers });
  }
  if (!hit?.syncedLyrics && !hit?.plainLyrics) {
    const list = await fetchJson<LrcLibHit[]>(buildUrl(`${LRCLIB}/search`, { track_name: q.title, artist_name: q.artist }), { headers });
    const candidates = (list ?? []).filter(h => !d || !h.duration || Math.abs(h.duration - d) <= 5);
    hit = candidates.find(h => h.syncedLyrics) ?? candidates.find(h => h.plainLyrics) ?? null;
  }
  if (!hit) return null;
  return result('LrcLib', hit.syncedLyrics || hit.plainLyrics, {
    trackName: hit.trackName,
    artistName: hit.artistName,
    albumName: hit.albumName,
    duration: hit.duration,
  });
};

// ─── KuGou ──────────────────────────────────────────────────────────────────

const KUGOU_DURATION_TOLERANCE = 8;

interface KuGouSongs { data?: { info?: { duration: number; hash: string }[] } }
interface KuGouCandidates { candidates?: { id: number | string; accesskey: string }[] }
interface KuGouDownload { content?: string }

const kugouTitle = (t: string) => t.replace(/\(.*\)|（.*）|「.*」|『.*』|<.*>|《.*》|〈.*〉|＜.*＞/g, '').trim();
const kugouArtist = (a: string) =>
  a.replace(/, /g, '、').replace(/ & /g, '、').replace(/\./g, '').replace(/和/g, '、').replace(/\(.*\)|（.*）/g, '').trim();

/** Drops credit lines ("作词 : …", "Composer: …") at the head and tail. */
const stripKuGouCredits = (lrc: string): string => {
  const lines = lrc.split(/\r?\n/).filter(l => /^\[\d\d:\d\d\.\d{2,3}\].*/.test(l));
  const isCredit = (l: string) => /.+\].+[:：].+/.test(l);
  let head = 0;
  for (let i = Math.min(30, lines.length - 1); i >= 0; i--) {
    if (isCredit(lines[i])) { head = i + 1; break; }
  }
  return lines.slice(head).join('\n');
};

export const kuGou: LyricsProvider = async q => {
  const keyword = `${kugouTitle(q.title)} - ${kugouArtist(q.artist)}${q.album ? ` ${q.album}` : ''}`;
  const d = durationSecs(q);

  const download = async (id: number | string, accesskey: string): Promise<ProviderLyrics | null> => {
    const res = await fetchJson<KuGouDownload>(buildUrl('https://lyrics.kugou.com/download', {
      fmt: 'lrc', charset: 'utf8', client: 'pc', ver: 1, id, accesskey,
    }));
    if (!res?.content) return null;
    try {
      return result('KuGou', stripKuGouCredits(Buffer.from(res.content, 'base64').toString('utf8')));
    } catch {
      return null;
    }
  };

  const songs = await fetchJson<KuGouSongs>(buildUrl('https://mobileservice.kugou.com/api/v3/search/song', {
    version: 9108, plat: 0, pagesize: 8, showtype: 0, keyword,
  }));
  for (const song of songs?.data?.info ?? []) {
    if (d && Math.abs(song.duration - d) > KUGOU_DURATION_TOLERANCE) continue;
    const byHash = await fetchJson<KuGouCandidates>(buildUrl('https://lyrics.kugou.com/search', {
      ver: 1, man: 'yes', client: 'pc', hash: song.hash,
    }));
    const c = byHash?.candidates?.[0];
    if (c) {
      const hit = await download(c.id, c.accesskey);
      if (hit) return hit;
    }
  }

  const byKeyword = await fetchJson<KuGouCandidates>(buildUrl('https://lyrics.kugou.com/search', {
    ver: 1, man: 'yes', client: 'pc', keyword, duration: d ? d * 1000 : undefined,
  }));
  const c = byKeyword?.candidates?.[0];
  return c ? download(c.id, c.accesskey) : null;
};

export const LYRICS_PROVIDERS: Record<LyricsProviderName, LyricsProvider> = {
  YouLyPlus: youLyPlus,
  Paxsenix: paxsenix,
  Unison: unison,
  BetterLyrics: betterLyrics,
  SimpMusic: simpMusic,
  LrcLib: lrcLib,
  KuGou: kuGou,
};

/** Echo Music's default order: richest word-synced sources first. */
export const DEFAULT_PROVIDER_ORDER: LyricsProviderName[] = [
  'YouLyPlus',
  'Paxsenix',
  'Unison',
  'BetterLyrics',
  'SimpMusic',
  'LrcLib',
  'KuGou',
];
