/**
 * The Stream home feed, modelled on Echo Music's HomeViewModel:
 *
 *   Quick picks        — radio from your most-played seeds, mixed and shuffled
 *   Keep listening     — what you streamed recently
 *   Daily discover     — one recommendation per seed, "because you played X"
 *   Similar to <artist>— more from the artists you return to
 *   Forgotten favorites— downloaded songs you loved but haven't played lately
 *
 * Radio comes from `recommend` — YouTube Music's automix (as in Echo) resolved
 * to catalog audio, with Saavn radio as fallback (see recommend.ts). Sources
 * are injected so this stays pure/testable.
 */
import { Song, UnifiedSong } from '../../types/song';
import { dedupeStreamable, isOnDevice, streamIdFor } from './streamSong';

export interface FeedSources {
  searchMusic: (query: string) => Promise<UnifiedSong[]>;
  /** Songs to play after `seed`, already resolved to something streamable. */
  recommend: (seed: UnifiedSong) => Promise<UnifiedSong[]>;
}

export interface FeedHistoryEntry {
  song: UnifiedSong;
  playedAt: number;
  plays: number;
}

export interface FeedInput {
  localSongs: Song[];
  history: FeedHistoryEntry[];
  /** Preferred languages for the cold-start shelf, strongest first. */
  languages?: string[];
  now?: number;
  /** Injected for deterministic tests. */
  random?: () => number;
}

export interface DailyDiscoverItem {
  seed: UnifiedSong;
  recommendation: UnifiedSong;
}

export interface SimilarShelf {
  artist: string;
  songs: UnifiedSong[];
}

export interface HomeFeed {
  quickPicks: UnifiedSong[];
  keepListening: UnifiedSong[];
  dailyDiscover: DailyDiscoverItem[];
  similar: SimilarShelf[];
  forgottenFavorites: Song[];
  /** True when there was no history and the feed fell back to charts. */
  coldStart: boolean;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const QUICK_PICKS = 20;

const shuffle = <T>(items: T[], random: () => number): T[] => {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

const primaryArtist = (artist: string | undefined): string =>
  (artist ?? '').split(/,|&| feat\.?| ft\.?| x /i)[0].trim();

/** Recency-weighted play score: a song played often *and* lately ranks first. */
export const seedScore = (entry: FeedHistoryEntry, now: number): number => {
  const ageDays = Math.max(0, (now - entry.playedAt) / DAY_MS);
  return entry.plays / (1 + ageDays / 7);
};

/** Library songs worth revisiting: liked or replayed, untouched for 2+ weeks. */
export const pickForgottenFavorites = (songs: Song[], now: number, limit = 10): Song[] =>
  songs
    .filter(s => isOnDevice(s.audioUri) && (s.isLiked || s.playCount >= 3))
    .filter(s => !s.lastPlayed || now - Date.parse(s.lastPlayed) > 14 * DAY_MS)
    .sort((a, b) => b.playCount - a.playCount)
    .slice(0, limit);

/** Resolves a library song to a streamable catalog id so it can seed radio. */
const resolveLocalSeed = async (song: Song, sources: FeedSources): Promise<UnifiedSong | null> => {
  const artist = primaryArtist(song.artist);
  const results = await sources.searchMusic(`${song.title} ${artist}`.trim()).catch(() => []);
  const title = song.title.toLowerCase();
  return results.find(r => r.title.toLowerCase().includes(title) || title.includes(r.title.toLowerCase())) ?? null;
};

export async function buildHomeFeed(input: FeedInput, sources: FeedSources): Promise<HomeFeed> {
  const now = input.now ?? Date.now();
  const random = input.random ?? Math.random;

  const history = [...input.history].sort((a, b) => b.playedAt - a.playedAt);
  const keepListening = dedupeStreamable(history.map(h => h.song)).slice(0, 12);
  const forgottenFavorites = pickForgottenFavorites(input.localSongs, now);

  // Seeds: best streamed songs first, topped up from the most-played library songs.
  const streamSeeds = [...input.history]
    .sort((a, b) => seedScore(b, now) - seedScore(a, now))
    .map(h => h.song)
    .slice(0, 3);
  let seeds = streamSeeds;
  if (seeds.length < 3) {
    const localTop = [...input.localSongs]
      .filter(s => s.playCount > 0)
      .sort((a, b) => b.playCount - a.playCount)
      .slice(0, 3 - seeds.length);
    const resolved = await Promise.all(localTop.map(s => resolveLocalSeed(s, sources)));
    seeds = [...seeds, ...resolved.filter((s): s is UnifiedSong => s !== null)];
  }

  const played = new Set(history.map(h => streamIdFor(h.song)));

  // Cold start: no history anywhere — lead with charts in the listener's languages.
  if (seeds.length === 0) {
    const langs = (input.languages?.length ? input.languages : ['English', 'Hindi']).slice(0, 2);
    const shelves = await Promise.all(langs.map(l => sources.searchMusic(`${l} top hits`).catch(() => [])));
    return {
      quickPicks: shuffle(dedupeStreamable(shelves.flat()), random).slice(0, QUICK_PICKS),
      keepListening,
      dailyDiscover: [],
      similar: [],
      forgottenFavorites,
      coldStart: true,
    };
  }

  const radios = await Promise.all(seeds.map(seed => sources.recommend(seed).catch(() => [])));

  // Quick picks: interleave the radios so no single seed dominates, then shuffle.
  const interleaved: UnifiedSong[] = [];
  for (let i = 0; i < Math.max(...radios.map(r => r.length), 0); i++) {
    for (const radio of radios) if (radio[i]) interleaved.push(radio[i]);
  }
  const quickPicks = shuffle(dedupeStreamable(interleaved, played), random).slice(0, QUICK_PICKS);

  const inQuickPicks = new Set(quickPicks.map(streamIdFor));
  const dailyDiscover: DailyDiscoverItem[] = [];
  seeds.forEach((seed, i) => {
    const pick = radios[i].find(r => !played.has(streamIdFor(r)) && !inQuickPicks.has(streamIdFor(r)))
      ?? radios[i].find(r => !played.has(streamIdFor(r)));
    if (pick) dailyDiscover.push({ seed, recommendation: pick });
  });

  // Similar-to shelves for the two artists the listener returns to most.
  const artistWeight = new Map<string, number>();
  for (const h of input.history) {
    const a = primaryArtist(h.song.artist);
    if (a) artistWeight.set(a, (artistWeight.get(a) ?? 0) + seedScore(h, now));
  }
  for (const s of input.localSongs) {
    const a = primaryArtist(s.artist);
    if (a && a !== 'Unknown Artist') artistWeight.set(a, (artistWeight.get(a) ?? 0) + s.playCount * 0.5);
  }
  const topArtists = [...artistWeight.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([a]) => a);
  const similar = (await Promise.all(topArtists.map(async artist => {
    const results = await sources.searchMusic(artist).catch(() => []);
    const lower = artist.toLowerCase();
    const songs = dedupeStreamable(results.filter(r => r.artist.toLowerCase().includes(lower)), played).slice(0, 12);
    return { artist, songs };
  }))).filter(shelf => shelf.songs.length >= 3);

  return { quickPicks, keepListening, dailyDiscover, similar, forgottenFavorites, coldStart: false };
}
