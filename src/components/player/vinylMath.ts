/** The pure numbers behind VinylDisc, kept apart from the drawing so they can be tested. */
import { AuraPalette, hexToRgb } from '../allegra/palette';

/** Degrees per second while playing: a slow, calm turn (about 8 seconds a lap). */
export const VINYL_SPIN_DEG_PER_S = 44;
/** The label is this fraction of the record's diameter. */
export const LABEL = 0.34;

export const rgba = (hex: string, alpha: number): string => {
  const [r, g, b] = hexToRgb(hex).map(c => Math.round(c * 255));
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

/** A steady 0..1 from an integer, so the grooves vary without a random source. */
export const unit = (i: number): number => {
  const x = Math.sin((i + 1) * 12.9898) * 43758.5453;
  return x - Math.floor(x);
};

export interface Stop { at: number; color: string }

/**
 * The reflections on a record, as sweep-gradient stops: a strong lobe of light
 * and a softer one opposite it, each with a thin bright glint at its heart —
 * the way a lamp shows in grooves, wide and soft with a sharp core. The edges
 * of a lobe carry a whisper of the cover's colours (warm one side, cool the
 * other), like a record catching a coloured lamp.
 *
 * The profile is periodic, so the sweep's seam at the top is invisible.
 */
interface Lobe { centre: number; width: number; peak: number }
const LOBES: readonly Lobe[] = [
  { centre: 0.375, width: 0.075, peak: 0.36 },
  { centre: 0.375, width: 0.014, peak: 0.42 },
  { centre: 0.875, width: 0.06, peak: 0.24 },
  { centre: 0.875, width: 0.011, peak: 0.3 },
];
const SAMPLES = 96;

export const lobeStops = (palette: AuraPalette): Stop[] => {
  const warm = hexToRgb(palette.secondary).map(c => c * 255);
  const cool = hexToRgb(palette.tertiary).map(c => c * 255);
  const stops: Stop[] = [];
  for (let i = 0; i <= SAMPLES; i++) {
    const p = i / SAMPLES;
    let alpha = 0;
    let lead = { weight: 0, offset: 0 };
    for (const lobe of LOBES) {
      // Distance round the circle, so p = 0 and p = 1 are the same point.
      let d = p - lobe.centre;
      d -= Math.round(d);
      const g = lobe.peak * Math.exp(-Math.pow(d / lobe.width, 2));
      alpha += g;
      if (g > lead.weight) lead = { weight: g, offset: d / lobe.width };
    }
    alpha = Math.min(0.62, alpha);
    // Away from a lobe's heart the light takes on the cover's warm or cool colour.
    const tint = lead.offset < 0 ? warm : cool;
    const mix = Math.min(0.7, Math.abs(lead.offset) * 0.5);
    const [r, g, b] = [0, 1, 2].map(k => Math.round(255 + (tint[k] - 255) * mix));
    stops.push({ at: p, color: `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(3)})` });
  }
  return stops;
};

/** Arm angles in degrees about the pivot: resting beside the record, and on the outer groove. */
export const ARM_REST = -5;
export const ARM_PLAY = 16;
