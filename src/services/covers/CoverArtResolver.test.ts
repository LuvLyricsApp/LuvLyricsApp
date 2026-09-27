import { catalogSource, CoverCandidate, CoverSource, findCover, isConfidentMatch, upscaleItunesArtwork } from './CoverArtResolver';
import { hashString, monogramOf, duotoneFor } from '../../components/allegra/artworkSeed';
import { UnifiedSong } from '../../types/song';

const candidate = (title: string, artist: string, duration?: number, source: CoverCandidate['source'] = 'iTunes'): CoverCandidate => ({
  title, artist, duration, artwork: `https://art/${title}.jpg`, source,
});

describe('upscaleItunesArtwork', () => {
  it('asks the CDN for a 1000px square', () => {
    expect(upscaleItunesArtwork('https://is1-ssl.mzstatic.com/image/thumb/Music/v4/ab/cd/100x100bb.jpg'))
      .toBe('https://is1-ssl.mzstatic.com/image/thumb/Music/v4/ab/cd/1000x1000bb.jpg');
    expect(upscaleItunesArtwork('https://x/60x60bb.png')).toBe('https://x/1000x1000bb.jpg');
  });
});

describe('isConfidentMatch', () => {
  const q = { title: 'Kesariya (From "Brahmastra")', artist: 'Arijit Singh', duration: 268 };

  it('accepts the same recording across title decorations and featured artists', () => {
    expect(isConfidentMatch(q, candidate('Kesariya', 'Pritam, Arijit Singh', 267))).toBe(true);
  });

  it('rejects other artists, other cuts, and artist-less queries', () => {
    expect(isConfidentMatch(q, candidate('Kesariya', 'A Cover Band', 268))).toBe(false);
    expect(isConfidentMatch(q, candidate('Kesariya (Extended Mix)', 'Arijit Singh', 420))).toBe(false);
    expect(isConfidentMatch({ title: 'Kesariya', artist: 'Unknown Artist' }, candidate('Kesariya', 'Arijit Singh'))).toBe(false);
  });
});

describe('findCover', () => {
  it('takes the first confident hit, falling through sources in order', async () => {
    const itunes: CoverSource = jest.fn(async () => [candidate('Starboy', 'Someone Else', 230)]);
    const saavn: CoverSource = jest.fn(async () => [candidate('Starboy', 'The Weeknd', 230, 'Saavn')]);
    const hit = await findCover({ title: 'Starboy', artist: 'The Weeknd', duration: 230 }, [itunes, saavn]);
    expect(hit?.source).toBe('Saavn');
  });

  it('survives failing sources and returns null when nothing matches', async () => {
    const broken: CoverSource = jest.fn(async () => { throw new Error('offline'); });
    await expect(findCover({ title: 'X', artist: 'Y' }, [broken])).resolves.toBeNull();
  });

  it('adapts catalog search results', async () => {
    const search = jest.fn(async (): Promise<UnifiedSong[]> => [
      { id: '1', title: 'Pasoori', artist: 'Ali Sethi, Shae Gill', highResArt: 'https://c/p-500x500.jpg', downloadUrl: 'u', source: 'Saavn', duration: 224 },
      { id: '2', title: 'No art', artist: 'Ali Sethi', highResArt: '', downloadUrl: 'u', source: 'Saavn' },
    ]);
    const out = await catalogSource(search)({ title: 'Pasoori', artist: 'Ali Sethi' });
    expect(out).toEqual([expect.objectContaining({ artwork: 'https://c/p-500x500.jpg', source: 'Saavn' })]);
  });
});

describe('generated artwork helpers', () => {
  it('hashes deterministically', () => {
    expect(hashString('Tum Hi Ho|Arijit Singh')).toBe(hashString('Tum Hi Ho|Arijit Singh'));
    expect(hashString('a')).not.toBe(hashString('b'));
  });

  it('picks a monogram past articles, quotes and brackets, across scripts', () => {
    expect(monogramOf('The Night We Met')).toBe('N');
    expect(monogramOf('"(Intro) Heat"')).toBe('I');
    expect(monogramOf('தீ தளபதி')).toBe('த');
    expect(monogramOf('')).toBe('♪');
  });

  it('gives a song the same duotone every time', () => {
    expect(duotoneFor('Levitating|Dua Lipa')).toEqual(duotoneFor('Levitating|Dua Lipa'));
  });
});
