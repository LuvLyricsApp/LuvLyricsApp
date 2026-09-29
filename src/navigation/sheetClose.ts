/**
 * When a sheet over the player (queue, timer, menu…) should close under a
 * downward drag. Kept apart from playerSheet.ts, which pulls in navigation.
 */

/** A sheet closes on a drag this far down (points)… */
export const SHEET_CLOSE_DISTANCE = 96;
/** …or a flick this fast (points per second). */
export const SHEET_CLOSE_VELOCITY = 900;

/** Whether a downward drag of such a sheet should close it rather than settle back. */
export const shouldCloseSheet = (translationY: number, velocityY: number): boolean =>
  translationY > SHEET_CLOSE_DISTANCE || velocityY > SHEET_CLOSE_VELOCITY;
