/**
 * Luvs as a map of tastes. Each lane is one taste, side by side (swipe
 * across); going down a lane digs deeper into that taste (swipe up).
 *
 *   For you            the Luvs engine's own feed (engine + taste weaving)
 *   <artist>           radio from one of your seeds, one lane per favourite
 *                      artist (luvsTaste.tasteSeeds, one seed per artist)
 *   Chill / Energy     your personal mood mixes (Stream's moodMix)
 *
 * A lane grows as you go down it: when you near its end, the radio of the
 * song you're on is appended — each step stays close to the last, so the
 * lane drifts deeper into the taste instead of jumping somewhere else.
 */
import type { UnifiedSong } from '../types/song';

export type LaneKind = 'forYou' | 'artist' | 'mood';

export interface LaneSpec {
  id: string;
  kind: LaneKind;
  /** The short name on the lane rail. */
  title: string;
  /** Where the lane comes from, one line. */
  subtitle: string;
  seed?: UnifiedSong;
  mood?: string;
}

export const FOR_YOU: LaneSpec = { id: 'for-you', kind: 'forYou', title: 'For you', subtitle: 'Your mix' };
export const MOODS = ['Chill', 'Energy'] as const;
export const MAX_ARTIST_LANES = 4;
/** Load more when this close to a lane's end. */
export const DEEPEN_AHEAD = 3;

const lead = (artist: string | undefined): string =>
  (artist ?? '').split(/,|&| feat\.? | ft\.? | x /i)[0]?.trim() ?? '';

const songKey = (s: Pick<UnifiedSong, 'title' | 'artist'>): string =>
  `${s.title.trim().toLowerCase()}|${(s.artist ?? '').trim().toLowerCase()}`;

/** The lanes, in rail order: For you, one per favourite artist, then the moods. */
export const laneSpecs = (seeds: UnifiedSong[]): LaneSpec[] => {
  const artists: LaneSpec[] = [];
  const seen = new Set<string>();
  for (const seed of seeds) {
    const name = lead(seed.artist);
    if (!name || /^unknown artist$/i.test(name) || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    artists.push({ id: `artist:${name.toLowerCase()}`, kind: 'artist', title: name, subtitle: `More like ${name}`, seed });
    if (artists.length >= MAX_ARTIST_LANES) break;
  }
  const moods = MOODS.map<LaneSpec>(mood => ({ id: `mood:${mood.toLowerCase()}`, kind: 'mood', title: mood, subtitle: `Your ${mood.toLowerCase()} mix`, mood }));
  return [FOR_YOU, ...artists, ...moods];
};

/** `incoming` minus anything already in the lane (same song id or same title and artist). */
export const freshSongs = (lane: UnifiedSong[], incoming: UnifiedSong[]): UnifiedSong[] => {
  const ids = new Set(lane.map(s => s.id));
  const keys = new Set(lane.map(songKey));
  const out: UnifiedSong[] = [];
  for (const song of incoming) {
    const key = songKey(song);
    if (ids.has(song.id) || keys.has(key) || !(song.streamUrl || song.downloadUrl)) continue;
    ids.add(song.id);
    keys.add(key);
    out.push(song);
  }
  return out;
};

/** Should the lane grow now? */
export const needsDeepening = (depth: number, length: number, loading: boolean): boolean =>
  !loading && length > 0 && depth >= length - DEEPEN_AHEAD;

/**
 * The songs to keep warm around a position: the next two down the lane,
 * the one above, and what the neighbouring lanes are on.
 */
export const warmAround = (
  lanes: { songs: UnifiedSong[] }[],
  laneIndex: number,
  depths: number[],
): UnifiedSong[] => {
  const lane = lanes[laneIndex]?.songs ?? [];
  const depth = depths[laneIndex] ?? 0;
  const out = [lane[depth + 1], lane[depth + 2], lane[depth - 1]];
  for (const side of [laneIndex - 1, laneIndex + 1]) {
    const songs = lanes[side]?.songs;
    if (songs) out.push(songs[depths[side] ?? 0]);
  }
  return out.filter((s): s is UnifiedSong => !!s);
};

export interface LaneSources {
  recommend: (seed: UnifiedSong, limit: number) => Promise<UnifiedSong[]>;
  moodMix: (mood: string, limit: number) => Promise<UnifiedSong[]>;
}

/** A lane's first songs (For you comes from the engine, not from here). */
export const loadLane = async (spec: LaneSpec, sources: LaneSources): Promise<UnifiedSong[]> => {
  if (spec.kind === 'artist' && spec.seed) return freshSongs([spec.seed], await sources.recommend(spec.seed, 14).catch(() => []));
  if (spec.kind === 'mood' && spec.mood) return freshSongs([], await sources.moodMix(spec.mood, 14).catch(() => []));
  return [];
};

/** More of the same taste: the radio of the song the listener is on. */
export const deepenLane = async (songs: UnifiedSong[], depth: number, sources: LaneSources): Promise<UnifiedSong[]> => {
  const from = songs[Math.min(depth, songs.length - 1)];
  if (!from) return [];
  return freshSongs(songs, await sources.recommend(from, 12).catch(() => []));
};
