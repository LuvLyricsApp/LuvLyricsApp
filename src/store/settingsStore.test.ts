import { lyricsTextStyle, normalizePlayerBackground } from './settingsStore';

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

describe('lyricsTextStyle', () => {
  it('keeps the player default at medium / normal / left', () => {
    expect(lyricsTextStyle('medium', 'normal')).toEqual({ fontSize: 28, lineHeight: 34, marginVertical: 16, textAlign: 'left' });
  });

  it('follows text size, line spacing and the song alignment', () => {
    const style = lyricsTextStyle('large', 'relaxed', 'center');
    expect(style.fontSize).toBeGreaterThan(28);
    expect(style.marginVertical).toBeGreaterThan(16);
    expect(style.textAlign).toBe('center');
    expect(lyricsTextStyle('small', 'compact').fontSize).toBeLessThan(28);
  });
});
