import { DEFAULT_AURA } from '../allegra/palette';
import { ARM_PLAY, ARM_REST, lobeStops, unit, VINYL_SPIN_DEG_PER_S } from './vinylMath';

const alphaOf = (color: string): number => Number(color.slice(color.lastIndexOf(',') + 1, -1));

describe('lobeStops', () => {
  const stops = lobeStops(DEFAULT_AURA);

  it('runs the whole way round', () => {
    expect(stops[0].at).toBe(0);
    expect(stops[stops.length - 1].at).toBe(1);
  });

  it('is sorted, which a sweep gradient needs', () => {
    for (let i = 1; i < stops.length; i++) expect(stops[i].at).toBeGreaterThan(stops[i - 1].at);
  });

  it('is the same at both ends, so the sweep has no seam', () => {
    expect(stops[0].color).toBe(stops[stops.length - 1].color);
  });

  it('is clear between the lobes and never brighter than a reflection should be', () => {
    const alphas = stops.map(s => alphaOf(s.color));
    expect(Math.min(...alphas)).toBeLessThan(0.02);
    expect(Math.max(...alphas)).toBeLessThanOrEqual(0.62);
  });

  it('has two lobes of light, the first stronger', () => {
    const at = (p: number) => alphaOf(stops.reduce((best, s) => (Math.abs(s.at - p) < Math.abs(best.at - p) ? s : best)).color);
    expect(at(0.375)).toBeGreaterThan(at(0.875));
    expect(at(0.875)).toBeGreaterThan(at(0.6));
  });

  it('tints the edges of a lobe with the cover colours, not a fixed one', () => {
    const warm = lobeStops({ primary: '#ff0000', secondary: '#ff0000', tertiary: '#ff0000' });
    const cool = lobeStops({ primary: '#0000ff', secondary: '#0000ff', tertiary: '#0000ff' });
    expect(warm.map(s => s.color)).not.toEqual(cool.map(s => s.color));
  });
});

describe('unit', () => {
  it('is steady and stays inside 0..1', () => {
    expect(unit(7)).toBe(unit(7));
    for (let i = 0; i < 200; i++) {
      expect(unit(i)).toBeGreaterThanOrEqual(0);
      expect(unit(i)).toBeLessThan(1);
    }
  });
});

describe('motion constants', () => {
  it('turns slowly enough to read as calm and the arm lands further round than it rests', () => {
    expect(VINYL_SPIN_DEG_PER_S).toBeGreaterThan(20);
    expect(VINYL_SPIN_DEG_PER_S).toBeLessThan(90);
    expect(ARM_PLAY).toBeGreaterThan(ARM_REST);
  });
});
