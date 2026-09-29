import { marqueeLoop, MARQUEE_GAP, MARQUEE_SPEED } from './marqueeMath';

describe('marqueeLoop', () => {
  it('stands still when the title fits', () => {
    expect(marqueeLoop(120, 200)).toEqual({ distance: 0, duration: 0 });
    expect(marqueeLoop(200.5, 200)).toEqual({ distance: 0, duration: 0 });
  });

  it('waits for a measured box', () => {
    expect(marqueeLoop(300, 0)).toEqual({ distance: 0, duration: 0 });
  });

  it('travels the title plus the gap at the steady pace', () => {
    const { distance, duration } = marqueeLoop(300.2, 180);
    expect(distance).toBe(301 + MARQUEE_GAP);
    expect(duration).toBe(Math.round((distance / MARQUEE_SPEED) * 1000));
  });

  it('takes longer for a longer title', () => {
    expect(marqueeLoop(600, 180).duration).toBeGreaterThan(marqueeLoop(300, 180).duration);
  });
});
