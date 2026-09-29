jest.mock('react-native', () => ({
  InteractionManager: { runAfterInteractions: (task: () => void) => task() },
}));

import { IDLE_SETTLE_MS, runWhenIdle } from './bootPhases';

describe('runWhenIdle', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('does not run the job until the settle time has passed', () => {
    const job = jest.fn();
    runWhenIdle('job', job);
    expect(job).not.toHaveBeenCalled();
    jest.advanceTimersByTime(IDLE_SETTLE_MS - 1);
    expect(job).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(job).toHaveBeenCalledTimes(1);
  });

  it('staggers jobs by their extra delay', () => {
    const order: string[] = [];
    runWhenIdle('late', () => { order.push('late'); }, 500);
    runWhenIdle('early', () => { order.push('early'); });
    jest.advanceTimersByTime(IDLE_SETTLE_MS + 500);
    expect(order).toEqual(['early', 'late']);
  });

  it('keeps going when a job throws or rejects', async () => {
    const after = jest.fn();
    runWhenIdle('throws', () => { throw new Error('boom'); });
    runWhenIdle('rejects', () => Promise.reject(new Error('nope')));
    runWhenIdle('fine', after);
    jest.advanceTimersByTime(IDLE_SETTLE_MS);
    await Promise.resolve();
    expect(after).toHaveBeenCalledTimes(1);
  });
});
