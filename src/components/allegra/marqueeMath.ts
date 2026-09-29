/** The pace and rhythm of Marquee, kept apart from the view so they can be tested. */

/** Points per second: slow enough to read as it goes by. */
export const MARQUEE_SPEED = 30;
/** Rest between loops (the 2–3 seconds the title sits still). */
export const MARQUEE_REST_MS = 2500;
/** A beat before the first loop, so a new title can be read where it starts. */
export const MARQUEE_START_MS = 1400;
/** Space between the end of the title and its next copy. */
export const MARQUEE_GAP = 48;

/** How far one loop travels and how long it takes; 0 when the text fits. */
export const marqueeLoop = (textWidth: number, boxWidth: number, gap = MARQUEE_GAP, speed = MARQUEE_SPEED): { distance: number; duration: number } => {
  if (boxWidth <= 0 || textWidth <= boxWidth + 1) return { distance: 0, duration: 0 };
  const distance = Math.ceil(textWidth) + gap;
  return { distance, duration: Math.round((distance / speed) * 1000) };
};
