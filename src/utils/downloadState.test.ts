import { downloadStateOf, libraryKeys, matchKey } from './downloadState';

describe('matchKey', () => {
  it('matches the same song across sources', () => {
    expect(matchKey('São Paulo', 'The Weeknd, Anitta')).toBe(matchKey('Sao Paulo', 'The Weeknd'));
    expect(matchKey('Levitating (feat. DaBaby)', 'Dua Lipa')).toBe(matchKey('Levitating', 'Dua Lipa & DaBaby'));
    expect(matchKey('Here Comes The Sun - Remastered 2019', 'The Beatles')).toBe(matchKey('Here Comes the Sun', 'The Beatles'));
    expect(matchKey("We Don't Talk Anymore", 'Charlie Puth feat. Selena Gomez')).toBe(matchKey('We Dont Talk Anymore', 'Charlie Puth'));
  });

  it('keeps different songs apart', () => {
    expect(matchKey('Ordinary', 'Alex Warren')).not.toBe(matchKey('Ordinary', 'Wayne Brady'));
    expect(matchKey('Save Your Tears', 'The Weeknd')).not.toBe(matchKey('Save Your Tears (Remix)x', 'Ariana Grande'));
  });

  it('keeps non-Latin titles', () => {
    expect(matchKey('காதல்', 'A.R. Rahman')).toBe(matchKey('காதல்', 'A.R. Rahman, Shreya Ghoshal'));
    expect(matchKey('காதல்', 'A.R. Rahman')).not.toBe(matchKey('', 'A.R. Rahman'));
  });
});

describe('libraryKeys', () => {
  it('only counts songs with audio and caches per array', () => {
    const songs = [
      { title: 'Espresso', artist: 'Sabrina Carpenter', audioUri: 'file:///a.mp3' },
      { title: 'Lyrics only', artist: 'Someone' },
    ];
    const keys = libraryKeys(songs);
    expect(keys.has(matchKey('Espresso', 'Sabrina Carpenter'))).toBe(true);
    expect(keys.has(matchKey('Lyrics only', 'Someone'))).toBe(false);
    expect(libraryKeys(songs)).toBe(keys);
  });
});

describe('downloadStateOf', () => {
  it('follows the queue', () => {
    expect(downloadStateOf({ status: 'pending', progress: 0 }, false).phase).toBe('queued');
    expect(downloadStateOf({ status: 'staging', progress: 0 }, false).phase).toBe('queued');
    expect(downloadStateOf({ status: 'downloading', progress: 0.42 }, false)).toEqual({ phase: 'downloading', progress: 0.42 });
    expect(downloadStateOf({ status: 'paused', progress: 0.3 }, false).phase).toBe('paused');
    expect(downloadStateOf({ status: 'completed', progress: 1 }, false).phase).toBe('saved');
    expect(downloadStateOf({ status: 'failed', progress: 0 }, false).phase).toBe('failed');
  });

  it('shows a song already on the phone as saved', () => {
    expect(downloadStateOf(undefined, true).phase).toBe('saved');
    expect(downloadStateOf({ status: 'failed', progress: 0 }, true).phase).toBe('saved');
    expect(downloadStateOf(undefined, false).phase).toBe('idle');
  });

  it('clamps progress', () => {
    expect(downloadStateOf({ status: 'downloading', progress: 1.4 }, false).progress).toBe(1);
    expect(downloadStateOf({ status: 'downloading', progress: -1 }, false).progress).toBe(0);
  });
});
