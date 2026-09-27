import { MINI_BLOBS, oscillate, PLAYER_BLOBS, rgba, rotatedColorAt, toRgb } from './glowMath';

describe("Echo's glow maths", () => {
  it('oscillate follows min + (max - min) * ((sin(2π(p + phase)) + 1) / 2)', () => {
    expect(oscillate([0, 1, 0], 0)).toBeCloseTo(0.5);
    expect(oscillate([0, 1, 0], 0.25)).toBeCloseTo(1);
    expect(oscillate([0, 1, 0], 0.75)).toBeCloseTo(0);
    expect(oscillate([1, 0, 0.2], 0.05)).toBeCloseTo(0);
  });

  it('rotatedColorAt walks round the palette as progress goes 0 → 1', () => {
    const palette = [toRgb('#ff0000'), toRgb('#00ff00'), toRgb('#0000ff')];
    expect(rotatedColorAt(palette, 0, 0)).toEqual([255, 0, 0]);
    // A third of the way through, colour 0 has become colour 1.
    expect(rotatedColorAt(palette, 0, 1 / 3).map(Math.round)).toEqual([0, 255, 0]);
    // Halfway between entries it's an even mix.
    expect(rotatedColorAt(palette, 0, 1 / 6).map(Math.round)).toEqual([128, 128, 0]);
    // Index wraps like Kotlin's % size.
    expect(rotatedColorAt(palette, 4, 0)).toEqual([0, 255, 0]);
  });

  it('keeps Echo’s six player glows and two mini glows', () => {
    expect(PLAYER_BLOBS).toHaveLength(6);
    expect(PLAYER_BLOBS.map(b => b.alphas)).toEqual([[0.85, 0.5], [0.8, 0.45], [0.75, 0.4], [0.7, 0.35], [0.65, 0.3], [0.6, 0.25]]);
    expect(MINI_BLOBS.map(b => b.r)).toEqual([1.2, 1.0]);
    expect(rgba([10, 20, 30], 0.5)).toBe('rgba(10, 20, 30, 0.5)');
  });
});
