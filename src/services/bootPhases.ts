/**
 * Start-up in three phases, so the first frame never waits on work nobody has
 * asked for yet.
 *
 *   1. first frame   preload, fonts, audio mode, database: `App.tsx` awaits
 *                    these before it renders anything
 *   2. idle          everything that can wait for the app to be usable: queue
 *                    hydration, the search index check, the desktop bridge,
 *                    the Luvs warm-up. `runWhenIdle` runs a job once touches
 *                    and animations have settled, plus a beat so jobs land one
 *                    after another instead of in a single burst
 *   3. on demand     nothing here: a screen loads its own data when opened
 *
 * A job that throws or rejects is dropped quietly; it must never stop another.
 */
import { InteractionManager } from 'react-native';

/** Quiet time after interactions finish before background work begins. */
export const IDLE_SETTLE_MS = 1200;

const report = (name: string, error: unknown): void => {
  if (__DEV__) console.warn(`[boot] ${name} failed`, error);
};

export const runWhenIdle = (name: string, job: () => unknown, extraDelayMs = 0): void => {
  InteractionManager.runAfterInteractions(() => {
    setTimeout(() => {
      try {
        Promise.resolve(job()).catch(error => report(name, error));
      } catch (error) {
        report(name, error);
      }
    }, IDLE_SETTLE_MS + extraDelayMs);
  });
};
