import { normalizePlayerBackground } from './settingsStore';

describe('normalizePlayerBackground', () => {
  it('keeps the two backgrounds that still exist', () => {
    expect(normalizePlayerBackground('apple')).toBe('apple');
    expect(normalizePlayerBackground('blend')).toBe('blend');
  });

  it('moves the retired glow background to Apple + glow', () => {
    expect(normalizePlayerBackground('glow')).toBe('blend');
  });

  it('falls back to Apple + glow for anything unknown', () => {
    expect(normalizePlayerBackground(undefined)).toBe('blend');
    expect(normalizePlayerBackground(42)).toBe('blend');
  });
});
