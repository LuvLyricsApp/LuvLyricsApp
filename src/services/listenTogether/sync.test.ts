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
}));
jest.mock('../../store/listenTogetherStore', () => {
  const { create } = jest.requireActual('zustand');
  return { useListenTogetherStore: create(() => ({ room: { room_code: 'R', current_track: null }, role: 'guest', announce: jest.fn() })) };
});

import { usePlayerStore, playerControls } from '../../store/playerStore';
import { durationSV } from '../../playback/positionBus';
import { sendBufferReady, sendPlaybackAction } from './client';
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
