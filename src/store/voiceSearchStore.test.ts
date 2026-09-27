import { useVoiceSearchStore } from './voiceSearchStore';
import { Song, UnifiedSong } from '../types/song';
import { songQueryOf } from '../utils/voiceIntentParser';

const local = (id: string, title: string, artist: string): Song => ({
  id, title, artist, gradientId: '1', duration: 200, dateCreated: '', dateModified: '', playCount: 0, lyrics: [],
});
const remote = (id: string, title: string, artist: string): UnifiedSong => ({
  id, title, artist, highResArt: '', downloadUrl: 'u', source: 'Saavn',
});

const library = [local('1', 'Tum Hi Ho', 'Arijit Singh'), local('2', 'Hotel California', 'Eagles')];

beforeEach(() => {
  jest.useFakeTimers();
  useVoiceSearchStore.getState().dismiss();
});
afterEach(() => jest.useRealTimers());

describe('voice search', () => {
  it('shows the library match immediately, then adds streamable ones without duplicating it', async () => {
    let resolve: (v: UnifiedSong[]) => void = () => {};
    const catalog = jest.fn(() => new Promise<UnifiedSong[]>(r => { resolve = r; }));
    const done = useVoiceSearchStore.getState().search('tum hi ho', { songs: library, catalog });

    expect(useVoiceSearchStore.getState().phase).toBe('results');
    expect(useVoiceSearchStore.getState().picks.map(p => p.song.id)).toEqual(['1']);

    resolve([remote('s1', 'Tum Hi Ho', 'Arijit Singh'), remote('s2', 'Tum Hi Ho (Female)', 'Palak')]);
    await done;
    const picks = useVoiceSearchStore.getState().picks;
    expect(picks.map(p => `${p.kind}:${p.song.id}`)).toEqual(['local:1', 'stream:s2']);
  });

  it('reuses the request started from the partial transcript', async () => {
    const catalog = jest.fn(async () => [remote('s9', 'Pasoori', 'Ali Sethi')]);
    const store = useVoiceSearchStore.getState();
    store.listen();
    store.hear('play pasoori', catalog, songQueryOf);
    jest.advanceTimersByTime(400);
    expect(catalog).toHaveBeenCalledTimes(1);

    await store.search('pasoori', { songs: [], catalog });
    expect(catalog).toHaveBeenCalledTimes(1);
    expect(useVoiceSearchStore.getState().picks[0].song.id).toBe('s9');
  });

  it('leads with the streamable copy when asked to download', async () => {
    const catalog = jest.fn(async () => [remote('s1', 'Hotel California (Live)', 'Eagles')]);
    await useVoiceSearchStore.getState().search('hotel california', { songs: library, catalog, wantsDownload: true });
    expect(useVoiceSearchStore.getState().picks[0].kind).toBe('stream');
  });

  it('says so when nothing matches, and ignores a result that lands after dismiss', async () => {
    const empty = jest.fn(async () => [] as UnifiedSong[]);
    await useVoiceSearchStore.getState().search('zzzz', { songs: library, catalog: empty });
    expect(useVoiceSearchStore.getState().phase).toBe('empty');

    let resolve: (v: UnifiedSong[]) => void = () => {};
    const slow = jest.fn(() => new Promise<UnifiedSong[]>(r => { resolve = r; }));
    const pending = useVoiceSearchStore.getState().search('kesariya', { songs: [], catalog: slow });
    useVoiceSearchStore.getState().dismiss();
    resolve([remote('k', 'Kesariya', 'Arijit Singh')]);
    await pending;
    expect(useVoiceSearchStore.getState().phase).toBe('idle');
  });

  it('shows a command confirmation briefly', () => {
    useVoiceSearchStore.getState().notify('Next song');
    expect(useVoiceSearchStore.getState().phase).toBe('notice');
    jest.advanceTimersByTime(1500);
    expect(useVoiceSearchStore.getState().phase).toBe('idle');
  });
});
