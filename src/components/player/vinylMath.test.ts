import { DEFAULT_AURA } from '../allegra/palette';
import { ARM_PLAY, ARM_REST, lobeStops, unit, VINYL_SPIN_DEG_PER_S } from './vinylMath';

describe('lobeStops', () => {
  const stops = lobeStops(DEFAULT_AURA);

  it('runs the whole way round, clear at both ends so the sweep seams invisibly', () => {
    expect(stops[0]).toMatchObject({ at: 0, color: 'rgba(255,255,255,0)' });
    expect(stops[stops.length - 1]).toMatchObject({ at: 1, color: 'rgba(255,255,255,0)' });
  });

  it('is sorted, which a sweep gradient needs', () => {
    for (let i = 1; i < stops.length; i++) expect(stops[i].at).toBeGreaterThanOrEqual(stops[i - 1].at);
  });

  it('has two lobes, the first stronger, each peaking in white', () => {
    const peaks = stops.filter(s => /^rgba\(255,255,255,0\.\d+\)$/.test(s.color) && !s.color.endsWith(',0)'));
    expect(peaks).toHaveLength(2);
    const alpha = (c: string) => Number(c.slice(c.lastIndexOf(',') + 1, -1));
    expect(alpha(peaks[0].color)).toBeGreaterThan(alpha(peaks[1].color));
  });

  it('tints the fringes with the cover colours, not a fixed one', () => {
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
