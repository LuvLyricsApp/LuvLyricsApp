jest.mock('react-native', () => ({ Platform: { OS: 'android' } }));

import { DOUBLE_TAP_MS, isDoubleTap, playerSheetRest } from './tabs';

describe('isDoubleTap', () => {
  it('counts a second press inside the window', () => {
    expect(isDoubleTap(1000, 1000 + DOUBLE_TAP_MS - 1)).toBe(true);
  });

  it('ignores a slow second press and a first press', () => {
    expect(isDoubleTap(1000, 1000 + DOUBLE_TAP_MS + 1)).toBe(false);
    expect(isDoubleTap(0, 500)).toBe(false);
  });
});

describe('playerSheetRest', () => {
  it('rests the sheet on the pill, as wide as the pill', () => {
    const rest = playerSheetRest(400, 800, 24, true);
    expect(rest.y).toBeGreaterThan(600);
    expect(rest.y).toBeLessThan(800);
    expect(rest.scale).toBeGreaterThan(0.8);
    expect(rest.scale).toBeLessThan(1);
  });

  it('rests below the screen at full width without a pill', () => {
    expect(playerSheetRest(400, 800, 24, false)).toEqual({ y: 800, scale: 1 });
  });
});
