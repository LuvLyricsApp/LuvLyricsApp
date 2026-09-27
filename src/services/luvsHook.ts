/**
 * Where a Luvs clip starts. Spotify's previews open on the chorus; without
 * chorus detection we use the well-worn heuristic that the first chorus of a
 * pop song lands around 25–35% in, clamped so intros are skipped but the
 * hook is never overshot on long tracks.
 */
export const HOOK_MIN_DURATION = 90; // shorter clips start from the top
const HOOK_FRACTION = 0.3;
const HOOK_EARLIEST = 25;
const HOOK_LATEST = 70;

/** Seconds into the song to start the clip at; 0 when it should play from the start. */
export const hookOffsetSeconds = (duration: number | string | undefined): number => {
  // The Luvs feed crosses the Kotlin bridge; don't trust the number type.
  const d = Number(duration);
  if (!d || !Number.isFinite(d) || d < HOOK_MIN_DURATION) return 0;
  const target = d * HOOK_FRACTION;
  return Math.round(Math.min(Math.max(target, HOOK_EARLIEST), HOOK_LATEST));
};
