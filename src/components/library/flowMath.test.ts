import { flowOffset, focusFromDrag, settleFocus, tapSide } from './flowMath';

describe('focusFromDrag', () => {
  it('moves a card per step of drag, in the opposite direction to the finger', () => {
    expect(focusFromDrag(2, -100, 100, 6)).toBe(3);
    expect(focusFromDrag(2, 100, 100, 6)).toBe(1);
    expect(focusFromDrag(2, 0, 100, 6)).toBe(2);
  });

  it('resists past the first and last card instead of stopping dead', () => {
    expect(focusFromDrag(0, 100, 100, 6)).toBeCloseTo(-0.35);
    expect(focusFromDrag(5, -100, 100, 6)).toBeCloseTo(5.35);
  });
});

describe('settleFocus', () => {
  it('lands on the nearest card for a slow release', () => {
    expect(settleFocus(2.4, 0, 100, 6)).toBe(2);
    expect(settleFocus(2.6, 0, 100, 6)).toBe(3);
  });

  it('carries a flick on to the next card', () => {
    expect(settleFocus(2.2, -900, 100, 6)).toBe(4);
    expect(settleFocus(2.8, 900, 100, 6)).toBe(1);
  });

  it('never leaves the deck', () => {
    expect(settleFocus(-0.3, 800, 100, 6)).toBe(0);
    expect(settleFocus(5.4, -800, 100, 6)).toBe(5);
    expect(settleFocus(0, 0, 100, 0)).toBe(0);
  });
});

describe('flowOffset', () => {
  it('puts the centre at zero and neighbours a full step out on their own side', () => {
    expect(flowOffset(0, 100)).toBe(0);
    expect(flowOffset(1, 100)).toBe(100);
    expect(flowOffset(-1, 100)).toBe(-100);
  });

  it('crowds the outer cards closer together', () => {
    expect(flowOffset(2, 100)).toBe(150);
    expect(flowOffset(-3, 100)).toBe(-200);
  });

  it('moves smoothly between slots', () => {
    expect(flowOffset(0.5, 100)).toBe(50);
  });
});

describe('tapSide', () => {
  it('is the centre card inside its width, else the side it landed on', () => {
    expect(tapSide(180, 360, 200)).toBe(0);
    expect(tapSide(40, 360, 200)).toBe(-1);
    expect(tapSide(330, 360, 200)).toBe(1);
  });
});
