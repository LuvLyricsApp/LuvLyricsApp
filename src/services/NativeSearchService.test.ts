import { NativeSearchService } from './NativeSearchService';

describe('NativeSearchService.parseDuration', () => {
  it.each([
    ['0:00', 0],
    ['0:30', 30],
    ['1:00', 60],
    ['4:05', 245],
    ['3:33', 213],
    ['10:00', 600],
    ['59:59', 3599],
  ])('"%s" → %i seconds', (timeStr, expected) => {
    expect(NativeSearchService.parseDuration(timeStr)).toBe(expected);
  });

  it.each([
    ['1:00:00', 3600],
    ['1:01:01', 3661],
    ['2:30:00', 9000],
  ])('handles h:mm:ss format "%s" → %i seconds', (timeStr, expected) => {
    expect(NativeSearchService.parseDuration(timeStr)).toBe(expected);
  });

  it('returns 0 for unknown format', () => {
    expect(NativeSearchService.parseDuration('broken')).toBe(0);
    expect(NativeSearchService.parseDuration('')).toBe(0);
  });
});
