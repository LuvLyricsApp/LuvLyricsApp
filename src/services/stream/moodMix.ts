/**
 * "Your <mood> mix": a mood chip seen through the listener's own taste.
 *
 * YouTube Music's mood shelves are the same for everyone when you aren't
 * signed in. This asks YouTube Music (songs search, InnerTube) for the mood
 * *by the artists this listener actually plays or follows*, and in the
 * languages they prefer, then weaves the answers together so every favourite
 * is represented near the top. Only songs really by that artist are kept, and
 * covers / lofi / sped-up versions are dropped unless the mood asks for them.
 */
import { YTSong } from '../ytmusic/parsers';
import { normalizeTitle, variantsIn } from '../ytmusic/resolver';

/** What a chip means in a search ("Feel good" -> "happy"). */
const MOOD_WORDS: Record<string, string> = {
  'feel good': 'happy',
  romance: 'romantic',
  romantic: 'romantic',
  relax: 'chill',
  chill: 'chill',
  energise: 'energetic',
  energize: 'energetic',
  energy: 'energetic',
  workout: 'workout',
  party: 'party',
  sad: 'sad',
  heartbreak: 'sad',
  focus: 'calm',
  sleep: 'sleep',
  commute: 'road trip',
};

export const moodWord = (label: string): string => MOOD_WORDS[label.trim().toLowerCase()] ?? label.trim().toLowerCase();

export interface Taste {
  /** Favourite artists, strongest first. */
  artists: string[];
  /** Preferred song languages, strongest first. */
  languages: string[];
}

const PER_ARTIST = 4;
const PER_LANGUAGE = 6;
const MAX_ARTISTS = 5;
const MAX_LANGUAGES = 2;

const norm = (s: string) => s.trim().toLowerCase();
const byArtist = (song: YTSong, artist: string) => {
  const a = norm(artist);
  return song.artists.some(x => norm(x) === a || norm(x).includes(a) || a.includes(norm(x)));
};

export async function personalMoodMix(
  label: string,
  taste: Taste,
  searchYT: (query: string) => Promise<YTSong[]>,
  limit = 30,
): Promise<YTSong[]> {
  const word = moodWord(label);
  const allowed = new Set(variantsIn(`${label} ${word}`));
  const plain = (s: YTSong) => variantsIn(s.title).every(v => allowed.has(v));

  const queries = [
    ...taste.artists.slice(0, MAX_ARTISTS).map(artist => ({ q: `${artist} ${word} songs`, artist })),
    ...taste.languages.slice(0, MAX_LANGUAGES).map(language => ({ q: `${language} ${word} songs`, artist: null as string | null })),
  ];
  if (queries.length === 0) return [];

  const lists = await Promise.all(queries.map(async ({ q, artist }) => {
    const found = await searchYT(q).catch(() => [] as YTSong[]);
    return found
      .filter(plain)
      .filter(s => !artist || byArtist(s, artist))
      .slice(0, artist ? PER_ARTIST : PER_LANGUAGE);
  }));

  // Round-robin so each favourite shows up near the top, then dedupe.
  const seen = new Set<string>();
  const out: YTSong[] = [];
  const longest = Math.max(0, ...lists.map(l => l.length));
  for (let i = 0; i < longest && out.length < limit; i++) {
    for (const list of lists) {
      const song = list[i];
      if (!song) continue;
      const key = `${normalizeTitle(song.title)}|${norm(song.artists[0] ?? '')}`;
      if (seen.has(song.videoId) || seen.has(key)) continue;
      seen.add(song.videoId);
      seen.add(key);
      out.push(song);
      if (out.length >= limit) break;
    }
  }
  return out;
}
