import { deckSlot, groupArtists, leadArtist, letterIndex, letterOf, railPick } from './libraryShape';
import type { Song } from '../../types/song';

const song = (id: string, title: string, artist: string, day: number, cover?: string): Song => ({
  id,
  title,
  artist,
  gradientId: 'dynamic',
  duration: 200,
  dateCreated: new Date(2026, 0, day).toISOString(),
  dateModified: new Date(2026, 0, day).toISOString(),
  playCount: 0,
  lyrics: [],
  coverImageUri: cover,
});

describe('leadArtist', () => {
  it('keeps the first credited artist', () => {
    expect(leadArtist('Anirudh Ravichander, Super Subu')).toBe('Anirudh Ravichander');
    expect(leadArtist('Dua Lipa feat. DaBaby')).toBe('Dua Lipa');
    expect(leadArtist('Unknown Artist')).toBe('');
  });
});

describe('groupArtists', () => {
  it('orders artists by how many songs are saved and picks the newest cover', () => {
    const songs = [
      song('1', 'Hukum', 'Anirudh Ravichander, Super Subu', 1, 'old.jpg'),
      song('2', 'Kaavaalaa', 'Anirudh Ravichander', 5, 'new.jpg'),
      song('3', 'Levitating', 'Dua Lipa', 9),
    ];
    const groups = groupArtists(songs);
    expect(groups.map(g => [g.name, g.count])).toEqual([['Anirudh Ravichander', 2], ['Dua Lipa', 1]]);
    expect(groups[0].cover).toBe('new.jpg');
  });
});

describe('letters', () => {
  it('files titles under their first letter, ignoring "The"', () => {
    expect(letterOf('The Weeknd')).toBe('W');
    expect(letterOf('7 rings')).toBe('#');
    expect(letterOf('abc')).toBe('A');
  });

  it('finds the first row of each letter in list order', () => {
    const list = ['Apple', 'Avocado', 'Banana', 'Cherry', 'Citrus'];
    expect(letterIndex(list, x => x)).toEqual([
      { letter: 'A', index: 0 },
      { letter: 'B', index: 2 },
      { letter: 'C', index: 3 },
    ]);
  });

  it('maps a touch on the rail to an entry, clamped at both ends', () => {
    expect(railPick(0, 260, 26)).toBe(0);
    expect(railPick(259, 260, 26)).toBe(25);
    expect(railPick(-40, 260, 26)).toBe(0);
    expect(railPick(900, 260, 26)).toBe(25);
  });
});

describe('deckSlot', () => {
  it('counts cards back from the front and wraps', () => {
    expect(deckSlot(3, 3, 5)).toBe(0);
    expect(deckSlot(4, 3, 5)).toBe(1);
    expect(deckSlot(0, 3, 5)).toBe(2);
    expect(deckSlot(2, 3, 5)).toBe(4);
  });
});
