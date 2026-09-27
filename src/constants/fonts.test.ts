jest.mock('react-native', () => ({ Platform: { OS: 'android' } }));

import { numericWeight, resolveSfStyle, SF_FACES, sfFaceForWeight, sfTracking } from './fonts';

describe('SF Pro weight → face', () => {
  it('reads string, numeric and named weights', () => {
    expect(numericWeight(undefined)).toBe(400);
    expect(numericWeight('600')).toBe(600);
    expect(numericWeight(800)).toBe(800);
    expect(numericWeight('bold')).toBe(700);
    expect(numericWeight('semibold')).toBe(600);
  });

  it('maps to the three shipped faces', () => {
    expect(sfFaceForWeight('400')).toBe(SF_FACES.regular);
    expect(sfFaceForWeight('500')).toBe(SF_FACES.regular);
    expect(sfFaceForWeight('600')).toBe(SF_FACES.semibold);
    expect(sfFaceForWeight('bold')).toBe(SF_FACES.bold);
    expect(sfFaceForWeight('900')).toBe(SF_FACES.bold);
  });
});

describe('Apple tracking table', () => {
  it('matches the published points and interpolates between them', () => {
    expect(sfTracking(17)).toBe(-0.43);
    expect(sfTracking(12)).toBe(0);
    expect(sfTracking(34)).toBe(-1.05);
    expect(sfTracking(18)).toBeCloseTo(-0.49, 2);
    expect(sfTracking(8)).toBe(0.12);
    expect(sfTracking(68)).toBe(-2.1);
  });
});

describe('resolveSfStyle', () => {
  it('picks the face from the final weight and stops Android faking bold', () => {
    expect(resolveSfStyle({ fontSize: 17, fontWeight: '700' })).toEqual({
      fontFamily: SF_FACES.bold, fontWeight: 'normal', letterSpacing: -0.43,
    });
  });

  it('defaults unstyled text to Regular at Android’s 14pt', () => {
    expect(resolveSfStyle(undefined)).toEqual({ fontFamily: SF_FACES.regular, fontWeight: 'normal', letterSpacing: -0.15 });
  });

  it('keeps explicit tracking and deliberate families', () => {
    expect(resolveSfStyle({ fontSize: 20, fontWeight: '600', letterSpacing: 1 })).toEqual({ fontFamily: SF_FACES.semibold, fontWeight: 'normal' });
    expect(resolveSfStyle({ fontFamily: 'monospace', fontSize: 13 })).toBeNull();
    expect(resolveSfStyle({ fontFamily: 'ionicons', fontSize: 24 })).toBeNull();
    expect(resolveSfStyle({ fontFamily: SF_FACES.bold, fontSize: 17 })).toEqual({ letterSpacing: -0.43 });
  });

  it('lets a nested span inherit what it does not set', () => {
    expect(resolveSfStyle({ color: 'red' }, true)).toBeNull();
    expect(resolveSfStyle({ fontWeight: 'bold' }, true)).toEqual({ fontFamily: SF_FACES.bold, fontWeight: 'normal' });
    expect(resolveSfStyle({ fontSize: 13 }, true)).toEqual({ letterSpacing: -0.08 });
  });
});
