import { isCardPlayerBackground, lyricsTextStyle, normalizeMiniPlayerBackground, normalizePlayerBackground } from './settingsStore';

describe('normalizePlayerBackground', () => {
  it('keeps the two backgrounds that still exist', () => {
    expect(normalizePlayerBackground('apple')).toBe('apple');
    expect(normalizePlayerBackground('blend')).toBe('blend');
  });

  it('keeps the shader wash and YouTube Music', () => {
    expect(normalizePlayerBackground('aura')).toBe('aura');
    expect(normalizePlayerBackground('youtube')).toBe('youtube');
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
    expect(lyricsTextStyle(28, 'normal')).toEqual({ fontSize: 28, lineHeight: 34, marginVertical: 16, textAlign: 'left' });
  });

  it('follows text size, line spacing and alignment', () => {
    const style = lyricsTextStyle(34, 'relaxed', 'center');
    expect(style.fontSize).toBeGreaterThan(28);
    expect(style.marginVertical).toBeGreaterThan(16);
    expect(style.textAlign).toBe('center');
    expect(lyricsTextStyle(24, 'compact').fontSize).toBeLessThan(28);
  });

  it('keeps a custom size in range', () => {
    expect(lyricsTextStyle(90, 'normal').fontSize).toBe(44);
    expect(lyricsTextStyle(4, 'normal').fontSize).toBe(20);
    expect(lyricsTextStyle(Number.NaN, 'normal').fontSize).toBe(28);
  });
});

describe('isCardPlayerBackground', () => {
  it('is the two styles that show the artwork as a card', () => {
    expect(isCardPlayerBackground('youtube')).toBe(true);
    expect(isCardPlayerBackground('aura')).toBe(true);
    expect(isCardPlayerBackground('apple')).toBe(false);
    expect(isCardPlayerBackground('blend')).toBe(false);
  });
});

describe('normalizeMiniPlayerBackground', () => {
  it('keeps every style the pill has', () => {
    for (const v of ['glow', 'tint', 'glass', 'black'] as const) expect(normalizeMiniPlayerBackground(v)).toBe(v);
  });

  it('falls back to the glow for anything unknown', () => {
    expect(normalizeMiniPlayerBackground(undefined)).toBe('glow');
    expect(normalizeMiniPlayerBackground('neon')).toBe('glow');
  });
});
