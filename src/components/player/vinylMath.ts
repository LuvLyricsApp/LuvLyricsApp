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
 * The two lobes of reflected light around the record, as sweep-gradient stops:
 * a strong one and a softer one opposite it, each with a warm and a cool fringe.
 */
export const lobeStops = (palette: AuraPalette): Stop[] => {
  const clear = 'rgba(255,255,255,0)';
  const lobe = (centre: number, half: number, peak: number): Stop[] => [
    { at: centre - half, color: clear },
    { at: centre - half * 0.55, color: rgba(palette.secondary, peak * 0.55) },
    { at: centre, color: `rgba(255,255,255,${peak})` },
    { at: centre + half * 0.55, color: rgba(palette.tertiary, peak * 0.55) },
    { at: centre + half, color: clear },
  ];
  return [{ at: 0, color: clear }, ...lobe(0.375, 0.085, 0.34), ...lobe(0.875, 0.07, 0.24), { at: 1, color: clear }];
};

/** Arm angles in degrees about the pivot: resting beside the record, and on the outer groove. */
export const ARM_REST = -5;
export const ARM_PLAY = 16;
