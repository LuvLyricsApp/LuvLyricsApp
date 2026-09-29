// Player, library and network are faked; the sync logic under test is real.
jest.mock('../../playback/positionBus', () => ({ positionSV: { value: 0 }, durationSV: { value: 0 } }));

jest.mock('../../store/playerStore', () => {
  const { create } = jest.requireActual('zustand');
  const seekTo = jest.fn();
  const store = create(() => ({
    currentSongId: null as string | null,
    currentSong: null as unknown,
    loadedAudioId: null as string | null,
    isPlaying: false,
    requestPlayback: jest.fn(),
    setPlaylistQueue: jest.fn(),
    nextInPlaylist: jest.fn(async () => {}),
    previousInPlaylist: jest.fn(),
  }));
  return { usePlayerStore: store, playerControls: { seekTo } };
});
jest.mock('../../store/songsStore', () => ({
  useSongsStore: { getState: () => ({ songs: [{ id: 'local-1', title: 'Cardigan', artist: 'Taylor Swift', audioUri: 'file:///c.mp3' }] }) },
}));
jest.mock('../MultiSourceSearchService', () => ({ searchMusic: jest.fn(async () => []) }));
jest.mock('../ytmusic/resolver', () => ({ resolveToCatalog: jest.fn(async () => null) }));
jest.mock('../stream/StreamService', () => ({ StreamService: { catalogFor: () => undefined, play: jest.fn() } }));
jest.mock('../player/playerMenuActions', () => ({ youtubeIdFor: jest.fn(async () => 'yt-host-song') }));

let emit: (e: unknown) => void = () => {};
let control = false;
jest.mock('./client', () => ({
  canControl: () => control,
  onListenTogetherEvent: (l: (e: unknown) => void) => { emit = l; return () => {}; },
  sendBufferReady: jest.fn(),
  sendPlaybackAction: jest.fn(),
  requestSync: jest.fn(),
}));
let volumeListener: (e: { volume: number }) => void = () => {};
jest.mock('../NativeAudioPlayer', () => ({
  NativeAudioPlayer: {
    setVolume: jest.fn(),
    addListener: (_: string, cb: (e: { volume: number }) => void) => { volumeListener = cb; return { remove: jest.fn() }; },
  },
}));
jest.mock('../../store/listenTogetherStore', () => {
  const { create } = jest.requireActual('zustand');
  return {
    useListenTogetherStore: create(() => ({
      room: { room_code: 'R', current_track: null },
      role: 'guest',
      announce: jest.fn(),
      syncHostVolume: true,
      smartResync: true,
    })),
  };
});

import { usePlayerStore, playerControls } from '../../store/playerStore';
import { durationSV } from '../../playback/positionBus';
import { requestSync, sendBufferReady, sendPlaybackAction } from './client';
import { NativeAudioPlayer } from '../NativeAudioPlayer';
import { useListenTogetherStore } from '../../store/listenTogetherStore';
import { startListenTogetherSync } from './sync';
import { Song } from '../../types/song';

const flush = () => new Promise(r => setTimeout(r, 0));
const track = { id: 'yt-cardigan', title: 'cardigan', artist: 'Taylor Swift', duration: 239000 };

describe('listen together sync', () => {
  let stop: () => void;
  beforeEach(() => { stop = startListenTogetherSync(); jest.clearAllMocks(); });
  afterEach(() => stop());

  it('a guest loads the host’s track paused, reports ready, then starts at the room position', async () => {
    control = false;
    const player = usePlayerStore.getState() as unknown as { setPlaylistQueue: jest.Mock; requestPlayback: jest.Mock };
    player.setPlaylistQueue.mockImplementation(() => usePlayerStore.setState({ currentSongId: 'local-1' }));

    emit({ kind: 'playback', payload: { action: 'change_track', track_info: track } });
    await flush();
    // The phone's own copy of the song is used (title/artist match).
    expect(player.setPlaylistQueue).toHaveBeenCalledWith('listen-together', [expect.objectContaining({ id: 'local-1' })], 0);

    // Audio finishes loading.
    usePlayerStore.setState({ loadedAudioId: 'local-1' });
    (durationSV as { value: number }).value = 239;
    await new Promise(r => setTimeout(r, 150));
    expect(player.requestPlayback).toHaveBeenLastCalledWith(false);
    expect(sendBufferReady).toHaveBeenCalledWith('yt-cardigan');

    // Host presses play at 42s while we buffer; everyone ready → seek + play.
    emit({ kind: 'playback', payload: { action: 'play', position: 42000 } });
    emit({ kind: 'buffer_complete', trackId: 'yt-cardigan' });
    expect(playerControls.seekTo).toHaveBeenCalledWith(42);
    expect(player.requestPlayback).toHaveBeenLastCalledWith(true);
  });

  it('a guest takes the host volume only while Sync host volume is on', () => {
    control = false;
    emit({ kind: 'playback', payload: { action: 'set_volume', volume: 0.4 } });
    expect(NativeAudioPlayer.setVolume).toHaveBeenCalledWith(0.4);

    (NativeAudioPlayer.setVolume as jest.Mock).mockClear();
    useListenTogetherStore.setState({ syncHostVolume: false });
    emit({ kind: 'playback', payload: { action: 'set_volume', volume: 0.9 } });
    expect(NativeAudioPlayer.setVolume).not.toHaveBeenCalled();
    useListenTogetherStore.setState({ syncHostVolume: true });
  });

  it('a host sends its volume when it moves by at least 1%', () => {
    control = true;
    useListenTogetherStore.setState({ role: 'host' });
    volumeListener({ volume: 0.5 });
    volumeListener({ volume: 0.505 });
    const sent = (sendPlaybackAction as jest.Mock).mock.calls.filter(c => c[0].action === 'set_volume');
    expect(sent).toHaveLength(1);
    expect(sent[0][0].volume).toBe(0.5);
    useListenTogetherStore.setState({ role: 'guest' });
  });

  it('a guest asks for a fresh sync a second after reconnecting (smart resync)', () => {
    jest.useFakeTimers();
    control = false;
    emit({ kind: 'reconnected', payload: { is_host: false, state: { current_track: null, volume: null } } });
    expect(requestSync).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1000);
    expect(requestSync).toHaveBeenCalledTimes(1);
    jest.useRealTimers();
  });

  it('a host broadcasts its own song change with the YouTube Music id', async () => {
    control = true;
    // Step past the previous test's "just applied a remote change" window.
    const later = Date.now() + 5000;
    jest.spyOn(Date, 'now').mockReturnValue(later);
    (durationSV as { value: number }).value = 0;
    usePlayerStore.setState({
      currentSongId: 'stream:Saavn:9',
      currentSong: { id: 'stream:Saavn:9', title: 'August', artist: 'Taylor Swift', duration: 261, lyrics: [] } as unknown as Song,
    });
    await flush();
    await flush();
    expect(sendPlaybackAction).toHaveBeenCalledWith(expect.objectContaining({
      action: 'change_track',
      track_info: expect.objectContaining({ id: 'yt-host-song', title: 'August', duration: 261000 }),
    }));
    jest.restoreAllMocks();
  });
});
