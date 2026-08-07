import {
  shouldPreservePlayingStateDuringSeek,
  shouldAdoptNativePlayingState,
} from './playerStatusGuard';
import {
  setPlaybackIntent,
  isStalePlayingEcho,
  clearPlaybackIntent,
} from '../playback/playbackIntent';

describe('shouldPreservePlayingStateDuringSeek', () => {
  it('preserves playing state for transient seek statuses', () => {
    expect(
      shouldPreservePlayingStateDuringSeek({
        playing: false,
        playbackState: 'buffering',
        isBuffering: false,
        isLoaded: true,
      })
    ).toBe(true);

    expect(
      shouldPreservePlayingStateDuringSeek({
        playing: false,
        playbackState: 'loading',
        isBuffering: false,
        isLoaded: true,
      })
    ).toBe(true);

    expect(
      shouldPreservePlayingStateDuringSeek({
        playing: false,
        playbackState: 'ready',
        isBuffering: false,
        isLoaded: true,
      })
    ).toBe(true);

    expect(
      shouldPreservePlayingStateDuringSeek({
        playing: false,
        playbackState: 'idle',
        isBuffering: true,
        isLoaded: true,
      })
    ).toBe(true);

    expect(
      shouldPreservePlayingStateDuringSeek({
        playing: false,
        playbackState: 'idle',
        isBuffering: false,
        isLoaded: false,
      })
    ).toBe(true);
  });

  it('does not preserve state for a real pause', () => {
    expect(
      shouldPreservePlayingStateDuringSeek({
        playing: false,
        playbackState: 'paused',
        isBuffering: false,
        isLoaded: true,
      })
    ).toBe(false);
  });

  it('does not preserve state while actively playing', () => {
    expect(
      shouldPreservePlayingStateDuringSeek({
        playing: true,
        playbackState: 'ready',
        isBuffering: true,
        isLoaded: true,
      })
    ).toBe(false);
  });

  // Android emits playbackState "ended" (not "finished") when a song completes.
  // The guard must NOT preserve state here — nextInPlaylist() handles the transition via didJustFinish.
  it('does not preserve state when Android song ends (playbackState "ended")', () => {
    expect(
      shouldPreservePlayingStateDuringSeek({
        playing: false,
        playbackState: 'ended',
        isBuffering: false,
        isLoaded: true,
      })
    ).toBe(false);
  });
});

describe('shouldAdoptNativePlayingState', () => {
  const base = {
    storePlaying: true,
    nativePlaying: false,
    preserveDuringSeek: false,
    isStaleEcho: false,
  };

  it('adopts a genuine external state change', () => {
    // e.g. headphones unplugged, or audio focus lost to another app
    expect(shouldAdoptNativePlayingState(base)).toBe(true);
  });

  it('ignores status that merely agrees with the store', () => {
    expect(
      shouldAdoptNativePlayingState({ ...base, storePlaying: false, nativePlaying: false })
    ).toBe(false);
    expect(
      shouldAdoptNativePlayingState({ ...base, storePlaying: true, nativePlaying: true })
    ).toBe(false);
  });

  it('ignores a transient buffering/seek blip', () => {
    expect(shouldAdoptNativePlayingState({ ...base, preserveDuringSeek: true })).toBe(false);
  });

  it('ignores a status that predates a play/pause we just issued', () => {
    expect(shouldAdoptNativePlayingState({ ...base, isStaleEcho: true })).toBe(false);
  });
});

// Replays the exact event sequences behind the two reported bugs, driving the real
// playbackIntent module rather than a stand-in.
describe('play/pause flicker regression', () => {
  beforeEach(() => clearPlaybackIntent());
  afterEach(() => clearPlaybackIntent());

  const adopt = (storePlaying: boolean, nativePlaying: boolean, now: number) =>
    shouldAdoptNativePlayingState({
      storePlaying,
      nativePlaying,
      preserveDuringSeek: false,
      isStaleEcho: isStalePlayingEcho(nativePlaying, now),
    });

  // Home-tab mini player: tap pause, then ExoPlayer's 250ms poller delivers a tick
  // that was sampled before the pause landed. Adopting it flips the icon back.
  it('does not bounce the icon when a stale poller tick lands after a pause', () => {
    let storePlaying = true;

    // user taps pause — optimistic update + intent armed
    setPlaybackIntent(false, 1000);
    storePlaying = false;

    // stale tick still carrying isPlaying: true
    expect(adopt(storePlaying, true, 1100)).toBe(false);
    // and a second one, still inside the window
    expect(adopt(storePlaying, true, 1300)).toBe(false);

    // player finally reports paused — agrees, nothing to change
    expect(adopt(storePlaying, false, 1400)).toBe(false);
    expect(storePlaying).toBe(false);
  });

  // Same race on the way up: tapping play while the player reports STATE_BUFFERING.
  it('does not bounce the icon while the player buffers into playback', () => {
    let storePlaying = false;

    setPlaybackIntent(true, 2000);
    storePlaying = true;

    expect(adopt(storePlaying, false, 2050)).toBe(false); // buffering, not yet playing
    expect(adopt(storePlaying, true, 2200)).toBe(false); // caught up, already in sync
    expect(storePlaying).toBe(true);
  });

  // The guard must not swallow real events once the intent is settled, or a pause
  // from the lock screen / another app would leave the UI lying.
  it('adopts an external pause once the intent has been satisfied', () => {
    setPlaybackIntent(true, 3000);
    expect(adopt(true, true, 3050)).toBe(false); // intent satisfied and cleared here

    // later, audio focus is lost — no intent pending, so this must be adopted
    expect(adopt(true, false, 5000)).toBe(true);
  });

  // If the player never agrees (dropped command, native crash), the guard must
  // expire rather than pin the UI to a state the player isn't in.
  it('stops guarding after the intent window lapses', () => {
    setPlaybackIntent(false, 4000);
    expect(adopt(false, true, 4100)).toBe(false); // guarded
    expect(adopt(false, true, 6000)).toBe(true); // 2s later — window lapsed, trust player
  });
});
