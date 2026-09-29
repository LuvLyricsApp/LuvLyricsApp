/**
 * How hard an ambient visual (the shader field, the glows) may work right now.
 *
 * One rule set instead of a copy in every visual: the frame cap, the pixel
 * density and whether the visual should draw at all all come from here, so the
 * battery cost of the app's atmosphere is tuned in one place. Pure — the hook
 * (`hooks/useVisualBudget`) feeds it the device tier, Battery Saver and whether
 * music is playing.
 *
 *   low tier / Battery Saver   30fps at 0.6 pixels per point, and rests on its
 *                              last frame while music is paused
 *   normal, playing            capped at 60fps (a 120Hz screen redraws half as
 *                              often), 1 pixel per point
 *   normal, paused             24fps, still alive
 */
export type VisualTier = 'low' | 'normal';

export interface VisualBudgetInput {
  tier: VisualTier;
  /** The phone's Battery Saver is on. */
  batterySaver: boolean;
  /** Music is playing. */
  playing: boolean;
}

export interface VisualBudget {
  /** Shortest wait between redraws, in seconds. 0 means every display frame. */
  minStepSeconds: number;
  /** Device pixels drawn per point; the canvas is scaled up to fill its box. */
  pixelsPerPoint: number;
  /** false: rest on the last frame and stop the frame loop. */
  running: boolean;
}

/**
 * Frames arrive a hair early or late, so a cap of exactly 1/60s would skip every
 * other frame on a 60Hz screen. Redraw once 80% of the target gap has passed.
 */
const GAP_TOLERANCE = 0.8;
const gapFor = (fps: number): number => (1 / fps) * GAP_TOLERANCE;

export const resolveVisualBudget = ({ tier, batterySaver, playing }: VisualBudgetInput): VisualBudget => {
  if (tier === 'low' || batterySaver) {
    return { minStepSeconds: gapFor(30), pixelsPerPoint: 0.6, running: playing };
  }
  return { minStepSeconds: gapFor(playing ? 60 : 24), pixelsPerPoint: 1, running: true };
};

/**
 * Canvas size as a fraction of its box. Skia draws at the screen's pixel
 * density, so a fixed fraction cost 2.25x more on a 3x phone than a 2x one;
 * budget device pixels per point instead, never above half size.
 */
export const renderScaleFor = (pixelsPerPoint: number, pixelRatio: number): number =>
  Math.min(0.5, pixelsPerPoint / Math.max(1, pixelRatio));
