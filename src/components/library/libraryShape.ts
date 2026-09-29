/**
 * Pure shaping for the Library screen: the artist orbit, the A–Z rail and the
 * cover deck's card positions. Kept free of React so it can be tested.
 */
import type { Song } from '../../types/song';

/** "A, B & C" / "A feat. B" → "A": the artist whose song it is. */
export const leadArtist = (artist: string | undefined | null): string => {
  const lead = (artist ?? '').split(/,|&| feat\.? | ft\.? | x | with /i)[0]?.trim() ?? '';
  return lead && !/^unknown artist$/i.test(lead) ? lead : '';
};

export interface ArtistGroup {
  name: string;
  count: number;
  /** The newest song with a cover, for the bubble. */
  cover?: string;
  /** Most recent song first. */
  songs: Song[];
}

/** Artists by how many of their songs are saved (ties: most recent first). */
export const groupArtists = (songs: Song[], limit = 14): ArtistGroup[] => {
  const byName = new Map<string, ArtistGroup>();
  for (const song of songs) {
    const name = leadArtist(song.artist);
    if (!name) continue;
    const key = name.toLowerCase();
    const group = byName.get(key) ?? { name, count: 0, songs: [] };
    group.count += 1;
    group.songs.push(song);
    byName.set(key, group);
  }
  const newest = (s: Song) => Date.parse(s.dateCreated) || 0;
  return [...byName.values()]
    .map(g => {
      const sorted = [...g.songs].sort((a, b) => newest(b) - newest(a));
      return { ...g, songs: sorted, cover: sorted.find(s => s.coverImageUri)?.coverImageUri };
    })
    .sort((a, b) => b.count - a.count || newest(b.songs[0]) - newest(a.songs[0]))
    .slice(0, limit);
};

/** The rail letter a title or name files under: A–Z, else "#". */
export const letterOf = (text: string | undefined | null): string => {
  const first = (text ?? '').trim().replace(/^(the|a|an)\s+/i, '').charAt(0).toUpperCase();
  return first >= 'A' && first <= 'Z' ? first : '#';
};

/** For a list sorted by `keyOf`, the first index of each letter, in list order. */
export const letterIndex = <T,>(items: T[], keyOf: (item: T) => string | undefined | null): { letter: string; index: number }[] => {
  const seen = new Set<string>();
  const out: { letter: string; index: number }[] = [];
  items.forEach((item, index) => {
    const letter = letterOf(keyOf(item));
    if (!seen.has(letter)) {
      seen.add(letter);
      out.push({ letter, index });
    }
  });
  return out;
};

/** Which rail entry a touch at `y` (0 = top of the rail) lands on. */
export const railPick = (y: number, railHeight: number, count: number): number => {
  if (count <= 0 || railHeight <= 0) return 0;
  return Math.max(0, Math.min(count - 1, Math.floor((y / railHeight) * count)));
};

