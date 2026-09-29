/**
 * When a sheet over the player (queue, timer, menu…) should close under a
 * downward drag. Kept apart from playerSheet.ts, which pulls in navigation.
 */

/** A sheet closes on a drag this far down (points)… */
export const SHEET_CLOSE_DISTANCE = 96;
/** …or a flick this fast (points per second). */
export const SHEET_CLOSE_VELOCITY = 900;

/**
 * Whether a downward drag of such a sheet should close it rather than settle back.
 * Called from the sheet's pan on the UI thread, so it must stay a worklet:
 * without the directive a release build throws "Object is not a function" and
 * the app dies on the first swipe that ends on a sheet.
 */
export const shouldCloseSheet = (translationY: number, velocityY: number): boolean => {
  'worklet';
  return translationY > SHEET_CLOSE_DISTANCE || velocityY > SHEET_CLOSE_VELOCITY;
};
