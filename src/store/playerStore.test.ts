// The DB layer is stubbed only so this module graph loads under testEnvironment:
// 'node' — none of the behaviour under test reads or writes SQLite.
jest.mock('../database/queries', () => ({
  getSongById: jest.fn().mockResolvedValue(null),
}));
jest.mock('./songsStore', () => ({
  useSongsStore: { getState: () => ({ songs: [], setCurrentSong: jest.fn() }) },
}));
jest.mock('./settingsStore', () => ({
  useSettingsStore: { getState: () => ({ updatePlaylistHistory: jest.fn() }) },
}));

import {
  usePlayerStore,
  playerControls,
  beginAudioLoad,
  endAudioLoad,
} from './playerStore';
import { isStalePlayingEcho, clearPlaybackIntent } from '../playback/playbackIntent';

describe('requestPlayback', () => {
  let calls: string[];
  let originalPlay: typeof playerControls.play;
  let originalPause: typeof playerControls.pause;

  beforeEach(() => {
    calls = [];
    // playerControls is a mutable module ref that PlayerContext writes at mount,
    // so a test can stand in for the native player without a mocking framework.
    originalPlay = playerControls.play;
    originalPause = playerControls.pause;
    playerControls.play = () => calls.push('play');
    playerControls.pause = () => calls.push('pause');
    usePlayerStore.setState({ isPlaying: false });
    clearPlaybackIntent();
  });

  afterEach(() => {
    playerControls.play = originalPlay;
    playerControls.pause = originalPause;
    clearPlaybackIntent();
  });

  it('updates the store and issues the matching command', () => {
    usePlayerStore.getState().requestPlayback(true);
    expect(usePlayerStore.getState().isPlaying).toBe(true);
    expect(calls).toEqual(['play']);

    usePlayerStore.getState().requestPlayback(false);
    expect(usePlayerStore.getState().isPlaying).toBe(false);
    expect(calls).toEqual(['play', 'pause']);
  });

  // This is what stops the flicker: the intent must be armed by the same call that
  // flips the store, so a status echo arriving in between is recognised as stale.
  it('arms the echo guard so a contradicting status is rejected', () => {
    usePlayerStore.getState().requestPlayback(false);
    expect(isStalePlayingEcho(true)).toBe(true);
  });

  it('still issues the command when the store is already in the target state', () => {
    usePlayerStore.setState({ isPlaying: true });
    usePlayerStore.getState().requestPlayback(true);
    // A no-op in the store must not become a no-op at the player — the player may
    // genuinely be paused while the store thinks otherwise.
    expect(calls).toEqual(['play']);
  });
});

describe('audio load ownership', () => {
  afterEach(() => {
    endAudioLoad('song-a');
    endAudioLoad('song-b');
  });

  // MiniPlayer and NowPlayingScreen both watch loadedAudioId; without this claim
  // they both call player.replace() for the same track.
  it('grants the claim once and refuses a concurrent claim for the same track', () => {
    expect(beginAudioLoad('song-a')).toBe(true);
    expect(beginAudioLoad('song-a')).toBe(false);
  });

  it('releases the claim so the same track can be reloaded later', () => {
    expect(beginAudioLoad('song-a')).toBe(true);
    endAudioLoad('song-a');
    expect(beginAudioLoad('song-a')).toBe(true);
  });

  it('lets a newer track take over from an in-flight load', () => {
    expect(beginAudioLoad('song-a')).toBe(true);
    // user skips before song-a finishes loading
    expect(beginAudioLoad('song-b')).toBe(true);
    // a late release from the abandoned load must not free the new claim
    endAudioLoad('song-a');
    expect(beginAudioLoad('song-b')).toBe(false);
  });
});
