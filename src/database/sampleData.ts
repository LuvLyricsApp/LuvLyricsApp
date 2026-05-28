/**
 * LyricFlow - Sample Song Data for Testing
 * Use this to test the app before adding real songs
 */

import { Song } from '../types/song';

export const SAMPLE_SONGS: Song[] = [
  {
    id: 'sample-midnight-city',
    title: 'Midnight City',
    artist: 'M83',
    album: 'Hurry Up, We\'re Dreaming',
    gradientId: 'aurora',
    duration: 65,
    dateCreated: '2026-02-09T10:00:00Z',
    dateModified: '2026-02-09T10:00:00Z',
    playCount: 5,
    lastPlayed: '2026-02-09T12:00:00Z',
    lyrics: [
      { timestamp: 0, text: '♪ Instrumental intro ♪', lineOrder: 0 },
      { timestamp: 5, text: 'Waiting in the car', lineOrder: 1 },
      { timestamp: 10, text: 'Waiting for a ride in the dark', lineOrder: 2 },
      { timestamp: 16, text: 'The night city grows', lineOrder: 3 },
      { timestamp: 22, text: 'Look and see her eyes, they glow', lineOrder: 4 },
      { timestamp: 28, text: 'Waiting in the car', lineOrder: 5 },
      { timestamp: 34, text: 'Waiting for the ride in the dark', lineOrder: 6 },
      { timestamp: 40, text: 'Drinking in the lounge', lineOrder: 7 },
      { timestamp: 46, text: 'Following the neon signs', lineOrder: 8 },
      { timestamp: 52, text: 'Waiting for a word', lineOrder: 9 },
      { timestamp: 58, text: 'Looking at the milky skyline', lineOrder: 10 },
    ],
  },
  {
    id: 'sample-bohemian-rhapsody',
    title: 'Bohemian Rhapsody',
    artist: 'Queen',
    album: 'A Night at the Opera',
    gradientId: 'midnight',
    duration: 85,
    dateCreated: '2026-02-08T15:00:00Z',
    dateModified: '2026-02-08T15:00:00Z',
    playCount: 12,
    lastPlayed: '2026-02-09T08:00:00Z',
    lyrics: [
      { timestamp: 0, text: 'Is this the real life?', lineOrder: 0 },
      { timestamp: 4, text: 'Is this just fantasy?', lineOrder: 1 },
      { timestamp: 8, text: 'Caught in a landslide', lineOrder: 2 },
      { timestamp: 12, text: 'No escape from reality', lineOrder: 3 },
      { timestamp: 17, text: 'Open your eyes', lineOrder: 4 },
      { timestamp: 21, text: 'Look up to the skies and see', lineOrder: 5 },
      { timestamp: 26, text: 'I\'m just a poor boy', lineOrder: 6 },
      { timestamp: 30, text: 'I need no sympathy', lineOrder: 7 },
      { timestamp: 35, text: 'Because I\'m easy come, easy go', lineOrder: 8 },
      { timestamp: 40, text: 'Little high, little low', lineOrder: 9 },
      { timestamp: 45, text: 'Any way the wind blows', lineOrder: 10 },
      { timestamp: 50, text: 'Doesn\'t really matter to me', lineOrder: 11 },
      { timestamp: 56, text: 'To me...', lineOrder: 12 },
      { timestamp: 62, text: 'Mama, just killed a man', lineOrder: 13 },
      { timestamp: 68, text: 'Put a gun against his head', lineOrder: 14 },
      { timestamp: 73, text: 'Pulled my trigger, now he\'s dead', lineOrder: 15 },
      { timestamp: 79, text: 'Mama, life had just begun', lineOrder: 16 },
    ],
  },
  {
    id: 'sample-blinding-lights',
    title: 'Blinding Lights',
    artist: 'The Weeknd',
    album: 'After Hours',
    gradientId: 'neon',
    duration: 70,
    dateCreated: '2026-02-07T20:00:00Z',
    dateModified: '2026-02-07T20:00:00Z',
    playCount: 8,
    lastPlayed: '2026-02-09T06:00:00Z',
    lyrics: [
      { timestamp: 0, text: '♪ Synth intro ♪', lineOrder: 0 },
      { timestamp: 6, text: 'I\'ve been tryna call', lineOrder: 1 },
      { timestamp: 10, text: 'I\'ve been on my own for long enough', lineOrder: 2 },
      { timestamp: 16, text: 'Maybe you can show me how to love', lineOrder: 3 },
      { timestamp: 22, text: 'Maybe', lineOrder: 4 },
      { timestamp: 26, text: 'I\'m going through withdrawals', lineOrder: 5 },
      { timestamp: 31, text: 'You don\'t even have to do too much', lineOrder: 6 },
      { timestamp: 37, text: 'You can turn me on with just a touch', lineOrder: 7 },
      { timestamp: 42, text: 'Baby', lineOrder: 8 },
      { timestamp: 46, text: 'I look around and Sin City\'s cold and empty', lineOrder: 9 },
      { timestamp: 52, text: 'No one\'s around to judge me', lineOrder: 10 },
      { timestamp: 57, text: 'I can\'t see clearly when you\'re gone', lineOrder: 11 },
      { timestamp: 63, text: 'I said, ooh, I\'m blinded by the lights', lineOrder: 12 },
    ],
  },
];

/**
 * Insert all sample songs into database (for testing)
 */
export const loadSampleData = async (insertFn: (song: Song) => Promise<void>): Promise<number> => {
  let count = 0;
  for (const song of SAMPLE_SONGS) {
    try {
      await insertFn(song);
      count++;
    } catch (error) {
      if (__DEV__) console.warn(`Sample song "${song.title}" may already exist`);
    }
  }
  return count;
};
