jest.mock('react-native', () => ({ Platform: { OS: 'ios', Version: 17 } }));

import { tierFor } from './performanceTier';

const phone = (over: Partial<Parameters<typeof tierFor>[0]> = {}) =>
  ({ totalMemMb: 7600, lowRam: false, cores: 8, apiLevel: 34, ...over });

describe('tierFor', () => {
  it('keeps the full visuals on a current phone', () => {
    expect(tierFor(phone())).toBe('normal');
    expect(tierFor(phone({ totalMemMb: 3700 }))).toBe('normal'); // a 4GB phone reports ~3.7GB
  });

  it('takes the light path on old or budget phones', () => {
    expect(tierFor(phone({ totalMemMb: 2800 }))).toBe('low');
    expect(tierFor(phone({ lowRam: true }))).toBe('low');
    expect(tierFor(phone({ cores: 4 }))).toBe('low');
    expect(tierFor(phone({ apiLevel: 28 }))).toBe('low');
  });
});
