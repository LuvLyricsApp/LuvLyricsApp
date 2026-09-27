import { accentInk, DEFAULT_AURA, hexToHsl, hexToRgb, NEUTRAL_AURA, paletteFromColors, shadePalette, vivify } from './palette';

describe('hexToRgb', () => {
  it('parses to 0..1 and never returns NaN', () => {
    expect(hexToRgb('#ff8000')).toEqual([1, 128 / 255, 0]);
    expect(hexToRgb('nonsense')).toEqual([0.5, 0.5, 0.5]);
  });
});

describe('vivify', () => {
  it('keeps the hue but lifts a dull colour into the readable range', () => {
    const dull = '#3a2f2a'; // murky brown
    const out = hexToHsl(vivify(dull));
    expect(Math.abs(out.hue - hexToHsl(dull).hue)).toBeLessThan(2);
    expect(out.sat).toBeGreaterThanOrEqual(0.44);
    expect(out.light).toBeGreaterThanOrEqual(0.41);
    expect(out.light).toBeLessThanOrEqual(0.63);
  });
});

describe('paletteFromColors', () => {
  it('uses distinct hues from the cover when it has them', () => {
    const p = paletteFromColors(['#e0245e', '#1da1f2', '#ffad1f']);
    const hues = [p.primary, p.secondary, p.tertiary].map(h => hexToHsl(h).hue);
    expect(Math.abs(hues[0] - hues[1])).toBeGreaterThan(40);
  });

  it('builds lighter/darker stops for a one-colour cover instead of inventing hues', () => {
    const p = paletteFromColors(['#c0392b']);
    const [a, b, c] = [p.primary, p.secondary, p.tertiary].map(h => hexToHsl(h));
    expect(Math.abs(a.hue - b.hue)).toBeLessThan(3);
    expect(Math.abs(a.hue - c.hue)).toBeLessThan(3);
    expect(b.light).toBeGreaterThan(c.light);
  });

  it('gives greyscale covers a quiet neutral, and no data the default room', () => {
    expect(paletteFromColors(['#777777', '#ffffff', '#101010'])).toEqual(NEUTRAL_AURA);
    expect(paletteFromColors([undefined, null])).toEqual(DEFAULT_AURA);
  });
});

describe('accentInk / shadePalette', () => {
  it('mixes the primary 38% toward white for readable eyebrows', () => {
    expect(accentInk({ primary: '#000000', secondary: '#000000', tertiary: '#000000' })).toBe('#616161');
    expect(accentInk({ primary: '#ffffff', secondary: '#000000', tertiary: '#000000' })).toBe('#ffffff');
  });

  it('only ever darkens', () => {
    const shaded = shadePalette(DEFAULT_AURA, 0.5);
    expect(hexToHsl(shaded.primary).light).toBeLessThan(hexToHsl(DEFAULT_AURA.primary).light);
  });
});
