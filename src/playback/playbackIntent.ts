// Tracks the last play/pause we asked the player for, so a late status echo
// can't bounce the UI back to the old state.
//
// Both backends report asynchronously: ExoPlayer polls every 250ms and expo-audio
// reports buffering as "not playing". A tick emitted between our optimistic store
// update and the transition actually landing would otherwise flip the icon back —
// the play → pause → play flicker.

export const INTENT_WINDOW_MS = 1500;

let intendedPlaying: boolean | null = null;
let intendedAt = 0;

export function setPlaybackIntent(playing: boolean, now: number = Date.now()): void {
  intendedPlaying = playing;
  intendedAt = now;
}

// True while a native status update still contradicts a pending intent.
// Self-clearing: once the player agrees, or the window lapses, we trust it again.
export function isStalePlayingEcho(nativePlaying: boolean, now: number = Date.now()): boolean {
  if (intendedPlaying === null) return false;
  if (nativePlaying === intendedPlaying || now - intendedAt > INTENT_WINDOW_MS) {
    intendedPlaying = null;
    return false;
  }
  return true;
}

export function clearPlaybackIntent(): void {
  intendedPlaying = null;
  intendedAt = 0;
}
