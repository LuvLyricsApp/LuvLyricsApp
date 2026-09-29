/**
 * The maths of the Library's coverflow (GlassDeck), kept apart from the view so
 * it can be tested. `d` is a card's signed distance from the focus, in cards:
 * 0 = the centre card, -1 = one to its left, +1 = one to its right.
 */

/** How the focus follows a drag: one card per `step` points, resisting past either end. */
export const focusFromDrag = (start: number, translationX: number, step: number, count: number): number => {
  'worklet';
  const raw = start - translationX / step;
  const last = Math.max(0, count - 1);
  if (raw < 0) return raw * 0.35;
  if (raw > last) return last + (raw - last) * 0.35;
  return raw;
};

/** The card a release settles on: where the flick is heading, not where the finger let go. */
export const settleFocus = (focus: number, velocityX: number, step: number, count: number): number => {
  'worklet';
  const landing = focus - (velocityX / step) * 0.16;
  return Math.min(Math.max(0, count - 1), Math.max(0, Math.round(landing)));
};

/** Sideways offset of a card: neighbours a full step out, the ones beyond crowd together. */
export const flowOffset = (d: number, step: number): number => {
  'worklet';
  const a = Math.abs(d);
  const inner = Math.min(a, 1) * step;
  const outer = Math.max(0, a - 1) * step * 0.5;
  return Math.sign(d) * (inner + outer);
};

/** Which side of the centre a tap at `x` (across a stage of `width`) lands on, for a centre card `cardWidth` wide: -1, 0 or 1. */
export const tapSide = (x: number, width: number, cardWidth: number): -1 | 0 | 1 => {
  const from = x - width / 2;
  if (Math.abs(from) <= cardWidth / 2) return 0;
  return from < 0 ? -1 : 1;
};
