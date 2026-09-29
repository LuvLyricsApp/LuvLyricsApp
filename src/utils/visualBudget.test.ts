import { renderScaleFor, resolveVisualBudget } from './visualBudget';

const fps = (minStepSeconds: number) => (minStepSeconds === 0 ? Infinity : 0.8 / minStepSeconds);

describe('resolveVisualBudget', () => {
  it('lets a normal phone draw at 60fps while music plays, and keeps a paused room alive at 24', () => {
    const playing = resolveVisualBudget({ tier: 'normal', batterySaver: false, playing: true });
    expect(playing).toMatchObject({ pixelsPerPoint: 1, running: true });
    expect(fps(playing.minStepSeconds)).toBeCloseTo(60);

    const paused = resolveVisualBudget({ tier: 'normal', batterySaver: false, playing: false });
    expect(paused.running).toBe(true);
    expect(fps(paused.minStepSeconds)).toBeCloseTo(24);
  });

  it('runs the light path on low-end phones and rests while paused', () => {
    const playing = resolveVisualBudget({ tier: 'low', batterySaver: false, playing: true });
    expect(playing).toMatchObject({ pixelsPerPoint: 0.6, running: true });
    expect(fps(playing.minStepSeconds)).toBeCloseTo(30);
    expect(resolveVisualBudget({ tier: 'low', batterySaver: false, playing: false }).running).toBe(false);
  });

  it('gives a normal phone the light path while Battery Saver is on', () => {
    const playing = resolveVisualBudget({ tier: 'normal', batterySaver: true, playing: true });
    expect(playing).toMatchObject({ pixelsPerPoint: 0.6, running: true });
    expect(fps(playing.minStepSeconds)).toBeCloseTo(30);
    expect(resolveVisualBudget({ tier: 'normal', batterySaver: true, playing: false }).running).toBe(false);
  });

  it('never caps below the display rate it must keep up with at 60Hz', () => {
    // A frame at 60Hz lasts 16.6ms; the cap's gap has to be shorter than that.
    const { minStepSeconds } = resolveVisualBudget({ tier: 'normal', batterySaver: false, playing: true });
    expect(minStepSeconds).toBeLessThan(1 / 60);
  });
});

describe('renderScaleFor', () => {
  it('budgets device pixels per point and never draws above half size', () => {
    expect(renderScaleFor(1, 3)).toBeCloseTo(1 / 3);
    expect(renderScaleFor(1, 2)).toBe(0.5);
    expect(renderScaleFor(1, 1)).toBe(0.5);
    expect(renderScaleFor(0.6, 3)).toBeCloseTo(0.2);
  });
});
