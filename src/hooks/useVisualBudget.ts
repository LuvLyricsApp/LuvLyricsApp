import { useMemo } from 'react';
import { PixelRatio } from 'react-native';
import { usePlayerStore } from '../store/playerStore';
import { performanceTier } from '../utils/performanceTier';
import { useBatterySaver } from '../utils/batterySaver';
import { renderScaleFor, resolveVisualBudget } from '../utils/visualBudget';

export interface AmbientBudget {
  /** Shortest wait between redraws, in seconds (0 = every display frame). */
  minStepSeconds: number;
  /** Canvas size as a fraction of its box; scale it back up by 1 / renderScale. */
  renderScale: number;
  /** false: rest on the last frame. */
  running: boolean;
}

/**
 * The frame cap, canvas density and rest rule for an ambient visual, from the
 * device tier, Battery Saver and whether music is playing. Every shader and
 * glow asks this instead of carrying its own numbers.
 */
export const useVisualBudget = (): AmbientBudget => {
  const playing = usePlayerStore(s => s.isPlaying);
  const batterySaver = useBatterySaver();
  return useMemo(() => {
    const budget = resolveVisualBudget({ tier: performanceTier(), batterySaver, playing });
    return {
      minStepSeconds: budget.minStepSeconds,
      renderScale: renderScaleFor(budget.pixelsPerPoint, PixelRatio.get()),
      running: budget.running,
    };
  }, [batterySaver, playing]);
};
