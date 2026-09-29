/**
 * The full-screen player is a sheet the app drives itself, not a native stack
 * transition: it rises out of the mini pill, follows the finger while you drag
 * it down, and settles back onto the page you were on.
 *
 * The native `slide_from_bottom` could do neither — it could not be dragged, and
 * on Android the modal had no swipe-down at all. The route is presented as a
 * transparent modal with no animation; NowPlayingScreen animates itself.
 *
 * A swipe up on the pill hands its release velocity over here so the sheet
 * carries the same momentum instead of restarting from rest.
 */
import { navigationRef } from '../utils/navigationService';

let pendingOpenVelocity = 0;

/** Opens the player. `velocity` is the finger's upward speed in px/s (positive). */
export const openPlayerSheet = (songId: string, velocity = 0): void => {
  if (!navigationRef.isReady()) return;
  const current = navigationRef.getCurrentRoute();
  if (current?.name === 'NowPlaying') return;
  pendingOpenVelocity = Math.max(0, velocity);
  navigationRef.navigate('NowPlaying', { songId });
};

/** Read once by the sheet as it mounts. */
export const takeOpenVelocity = (): number => {
  const v = pendingOpenVelocity;
  pendingOpenVelocity = 0;
  return v;
};

/** Drag distance (fraction of screen height) past which a release dismisses. */
export const DISMISS_DISTANCE = 0.22;
/** Downward release speed (px/s) that dismisses regardless of distance. */
export const DISMISS_VELOCITY = 900;
