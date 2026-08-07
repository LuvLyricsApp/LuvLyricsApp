import {
  setPlaybackIntent,
  isStalePlayingEcho,
  clearPlaybackIntent,
  INTENT_WINDOW_MS,
} from './playbackIntent';

describe('playbackIntent', () => {
  beforeEach(() => {
    clearPlaybackIntent();
  });

  it('adopts native status when no intent is pending', () => {
    expect(isStalePlayingEcho(true)).toBe(false);
    expect(isStalePlayingEcho(false)).toBe(false);
  });

  // The bug: user taps pause, a 250ms poller tick still carrying isPlaying=true
  // lands, and the icon flips pause → play → pause.
  it('rejects a contradicting echo right after the user pauses', () => {
    setPlaybackIntent(false, 1000);
    expect(isStalePlayingEcho(true, 1050)).toBe(true);
  });

  it('rejects a contradicting echo right after the user plays', () => {
    setPlaybackIntent(true, 1000);
    expect(isStalePlayingEcho(false, 1050)).toBe(true);
  });

  it('stops guarding once the player agrees', () => {
    setPlaybackIntent(false, 1000);
    expect(isStalePlayingEcho(false, 1100)).toBe(false);
    // Intent is spent — a genuine later resume must be adopted immediately.
    expect(isStalePlayingEcho(true, 1150)).toBe(false);
  });

  it('gives up after the window lapses so the player stays the source of truth', () => {
    setPlaybackIntent(false, 1000);
    expect(isStalePlayingEcho(true, 1000 + INTENT_WINDOW_MS + 1)).toBe(false);
    expect(isStalePlayingEcho(true, 1000 + INTENT_WINDOW_MS + 2)).toBe(false);
  });

  it('lets a newer intent supersede an older one', () => {
    setPlaybackIntent(false, 1000);
    setPlaybackIntent(true, 1200);
    expect(isStalePlayingEcho(false, 1250)).toBe(true);
    expect(isStalePlayingEcho(true, 1300)).toBe(false);
  });
});
