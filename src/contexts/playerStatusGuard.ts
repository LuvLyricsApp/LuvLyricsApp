/**
 * Single decision point for "should the store adopt what the player just reported?".
 * Both platform status handlers funnel through this so iOS and Android can't drift —
 * Android previously had no guard at all, which is what caused the play/pause flicker.
 *
 * `isStaleEcho` is injected rather than read here so this stays pure and testable
 * without mocking the clock; callers pass `isStalePlayingEcho(nativePlaying)`.
 */
export const shouldAdoptNativePlayingState = ({
  storePlaying,
  nativePlaying,
  preserveDuringSeek,
  isStaleEcho,
}: {
  storePlaying: boolean;
  nativePlaying: boolean;
  preserveDuringSeek: boolean;
  isStaleEcho: boolean;
}): boolean => {
  if (storePlaying === nativePlaying) return false; // already in sync
  if (preserveDuringSeek) return false; // transient buffering/seek blip
  if (isStaleEcho) return false; // status predates a play/pause we just issued
  return true;
};

export const shouldPreservePlayingStateDuringSeek = ({
  playing,
  playbackState,
  isBuffering,
  isLoaded,
}: {
  playing: boolean;
  playbackState: string;
  isBuffering: boolean;
  isLoaded: boolean;
}) =>
  !playing &&
  (isBuffering ||
    playbackState === 'buffering' ||
    playbackState === 'loading' ||
    playbackState === 'ready' ||
    !isLoaded);
