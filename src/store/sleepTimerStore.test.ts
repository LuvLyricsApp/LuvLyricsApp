import { sleepLabel, sleepTimerEnd } from './sleepTimerStore';

describe('sleep timer', () => {
  it('fires after the chosen minutes, or when the song ends', () => {
    expect(sleepTimerEnd(30, 1_000, 200)).toBe(1_000 + 30 * 60_000);
    expect(sleepTimerEnd('end', 1_000, 42.5)).toBe(1_000 + 42_500);
    expect(sleepTimerEnd('end', 1_000, 0)).toBe(2_000); // never "already over"
  });

  it('labels what is left in minutes, then seconds', () => {
    expect(sleepLabel(10 * 60_000, 0)).toBe('10 min');
    expect(sleepLabel(61_000, 0)).toBe('2 min');
    expect(sleepLabel(45_000, 0)).toBe('45 s');
  });
});
