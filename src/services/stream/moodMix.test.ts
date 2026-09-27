import { moodWord, personalMoodMix } from './moodMix';
import { YTSong } from '../ytmusic/parsers';

const yt = (videoId: string, title: string, artist: string): YTSong => ({ videoId, title, artists: [artist] });

describe('personalMoodMix', () => {
  it('maps chips to search words', () => {
    expect(moodWord('Feel good')).toBe('happy');
    expect(moodWord('Romance')).toBe('romantic');
    expect(moodWord('Monsoon')).toBe('monsoon');
  });

  it('asks for the mood by each favourite artist and language, keeps only their songs, and interleaves', async () => {
    const queries: string[] = [];
    const results: Record<string, YTSong[]> = {
      'Anirudh Ravichander romantic songs': [
        yt('a1', 'Hayyoda', 'Anirudh Ravichander'),
        yt('x1', 'Some Hit', 'Someone Else'), // not by the artist
        yt('a2', 'Chuttamalle', 'Anirudh Ravichander'),
      ],
      'Arijit Singh romantic songs': [yt('b1', 'Tum Hi Ho', 'Arijit Singh'), yt('b2', 'Tum Hi Ho (Lofi)', 'Arijit Singh')],
      'Tamil romantic songs': [yt('t1', 'Munbe Vaa', 'A.R. Rahman'), yt('a1', 'Hayyoda', 'Anirudh Ravichander')],
    };
    const mix = await personalMoodMix(
      'Romance',
      { artists: ['Anirudh Ravichander', 'Arijit Singh'], languages: ['Tamil'] },
      async q => { queries.push(q); return results[q] ?? []; },
    );
    expect(queries).toEqual(['Anirudh Ravichander romantic songs', 'Arijit Singh romantic songs', 'Tamil romantic songs']);
    expect(mix.map(s => s.videoId)).toEqual(['a1', 'b1', 't1', 'a2']);
  });

  it('keeps lofi when the mood asks for it', async () => {
    const mix = await personalMoodMix('Lofi', { artists: ['Arijit Singh'], languages: [] }, async () => [yt('b2', 'Tum Hi Ho (Lofi)', 'Arijit Singh')]);
    expect(mix).toHaveLength(1);
  });

  it('returns nothing without any taste to go on', async () => {
    const search = jest.fn(async () => [] as YTSong[]);
    expect(await personalMoodMix('Relax', { artists: [], languages: [] }, search)).toEqual([]);
    expect(search).not.toHaveBeenCalled();
  });
});
