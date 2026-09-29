import { shouldCloseSheet, SHEET_CLOSE_DISTANCE, SHEET_CLOSE_VELOCITY } from './sheetClose';

describe('shouldCloseSheet', () => {
  it('settles back after a short, slow drag', () => {
    expect(shouldCloseSheet(30, 100)).toBe(false);
    expect(shouldCloseSheet(SHEET_CLOSE_DISTANCE, SHEET_CLOSE_VELOCITY)).toBe(false);
  });

  it('closes after a long drag', () => {
    expect(shouldCloseSheet(SHEET_CLOSE_DISTANCE + 1, 0)).toBe(true);
  });

  it('closes on a quick flick even from a short distance', () => {
    expect(shouldCloseSheet(20, SHEET_CLOSE_VELOCITY + 1)).toBe(true);
  });

  it('does not close on an upward flick', () => {
    expect(shouldCloseSheet(-40, -2000)).toBe(false);
  });
});
