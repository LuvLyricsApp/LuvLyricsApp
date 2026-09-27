import { Buffer } from 'buffer';
import { EchoLyricsCascade } from './EchoLyricsCascade';
import { firstNonNull, kuGou, simpMusic, youLyPlus } from './providers';
import { mockFetch } from '../testing/mockFetch';

afterEach(() => EchoLyricsCascade.clearCache());

const query = { title: 'Blinding Lights', artist: 'The Weeknd', duration: 200 };

describe('firstNonNull', () => {
  it('resolves with the first non-null value and ignores rejections', async () => {
    const slow = new Promise<string | null>(r => setTimeout(() => r('slow'), 20));
    await expect(firstNonNull([Promise.reject(new Error('x')), Promise.resolve(null), slow])).resolves.toBe('slow');
    await expect(firstNonNull<string>([Promise.resolve(null)])).resolves.toBeNull();
    await expect(firstNonNull<string>([])).resolves.toBeNull();
  });
});

describe('youLyPlus', () => {
  it('converts KPoe syllable lines to line LRC', async () => {
    const f = mockFetch([['https://lyricsplus', {
      lyrics: [
        { time: 1000, syllabus: [{ text: 'Hello ' }, { text: 'there' }] },
        { time: 2500, text: 'Second line' },
      ],
    }]]);
    const hit = await youLyPlus(query);
    f.restore();
    expect(hit).toEqual(expect.objectContaining({
      provider: 'YouLyPlus',
      synced: true,
      lyrics: '[00:01.00]Hello there\n[00:02.50]Second line',
    }));
  });
});

describe('simpMusic', () => {
  it('needs a video id and picks the closest duration', async () => {
    expect(await simpMusic(query)).toBeNull();
    const f = mockFetch([['https://api-lyrics.simpmusic.org/v1/', {
      type: 'success',
      data: [
        { durationSeconds: 120, syncedLyrics: '[00:01.00]wrong' },
        { durationSeconds: 201, syncedLyrics: '[00:01.00]right' },
      ],
    }]]);
    const hit = await simpMusic({ ...query, videoId: 'abc' });
    f.restore();
    expect(hit?.lyrics).toBe('[00:01.00]right');
  });
});

describe('kuGou', () => {
  it('decodes base64 LRC and strips credit lines', async () => {
    const lrc = '[00:00.00]作词 : Someone\n[00:00.50]Composer: X\n[00:10.00]First real line\n[00:12.00]Second';
    const f = mockFetch([
      ['https://mobileservice.kugou.com', { data: { info: [{ duration: 201, hash: 'H' }] } }],
      ['https://lyrics.kugou.com/search', { candidates: [{ id: 7, accesskey: 'K' }] }],
      ['https://lyrics.kugou.com/download', { content: Buffer.from(lrc, 'utf8').toString('base64') }],
    ]);
    const hit = await kuGou(query);
    f.restore();
    expect(hit?.lyrics).toBe('[00:10.00]First real line\n[00:12.00]Second');
  });
});

describe('EchoLyricsCascade.fetchBest', () => {
  it('skips plain results until a synced provider answers', async () => {
    const f = mockFetch([
      ['https://lyricsplus', { plainLyrics: 'plain words only' }],
      ['https://lrclib.net/api/get', { trackName: 'Blinding Lights', syncedLyrics: '[00:05.00]I been tryna call' }],
    ]);
    const hit = await EchoLyricsCascade.fetchBest(query);
    f.restore();
    expect(hit?.provider).toBe('LrcLib');
    expect(hit?.synced).toBe(true);
  });

  it('falls back to the first plain result, unless synced-only', async () => {
    const f = mockFetch([['https://lyricsplus', { plainLyrics: 'plain words only' }]]);
    const plain = await EchoLyricsCascade.fetchBest(query);
    EchoLyricsCascade.clearCache();
    const syncedOnly = await EchoLyricsCascade.fetchBest(query, undefined, true);
    f.restore();
    expect(plain).toEqual(expect.objectContaining({ provider: 'YouLyPlus', synced: false, lyrics: 'plain words only' }));
    expect(syncedOnly).toBeNull();
  });

  it('survives every provider being down', async () => {
    const f = mockFetch([]);
    await expect(EchoLyricsCascade.fetchBest(query)).resolves.toBeNull();
    f.restore();
  });
});

describe('EchoLyricsCascade.fetchAll', () => {
  it('collects one result per answering provider', async () => {
    const f = mockFetch([
      ['https://lyricsplus', { syncedLyrics: '[00:01.00]a' }],
      ['https://lrclib.net/api/get', { syncedLyrics: '[00:01.00]b' }],
      ['https://lyrics-api.boidu.dev/getLyrics', { ttml: '<p begin="1s">c</p>' }],
    ]);
    const all = await EchoLyricsCascade.fetchAll(query);
    f.restore();
    expect(all.map(r => r.provider).sort()).toEqual(['BetterLyrics', 'LrcLib', 'YouLyPlus']);
  });
});
