import { styleUpdates } from './styleLink';

describe('styleUpdates', () => {
  it('reads every look it knows', () => {
    expect(styleUpdates({
      playerBackground: 'aura',
      miniPlayerBackground: 'glass',
      appBackground: 'glow',
      vinyl: '1',
      fps: '0',
    })).toEqual({
      playerBackground: 'aura',
      miniPlayerBackground: 'glass',
      appBackground: 'glow',
      playerVinyl: true,
      showPerformanceHUD: false,
    });
  });

  it('ignores values it does not know, so a link cannot write anything else', () => {
    expect(styleUpdates({ playerBackground: 'neon', miniPlayerBackground: '', appBackground: 'x', vinyl: 'yes', canvasEnabled: '0' })).toEqual({});
  });

  it('leaves what it was not asked about alone', () => {
    expect(styleUpdates({ miniPlayerBackground: 'black' })).toEqual({ miniPlayerBackground: 'black' });
  });
});
