import { shuffled } from './shuffle';

describe('shuffled', () => {
  it('keeps every item exactly once and leaves the input alone', () => {
    const input = [1, 2, 3, 4, 5, 6];
    const out = shuffled(input);
    expect([...out].sort()).toEqual([1, 2, 3, 4, 5, 6]);
    expect(input).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('is deterministic for a given random source', () => {
    const seq = [0.1, 0.9, 0.4, 0.7];
    let i = 0;
    const next = () => seq[i++ % seq.length];
    const a = shuffled(['a', 'b', 'c', 'd', 'e'], next);
    i = 0;
    const b = shuffled(['a', 'b', 'c', 'd', 'e'], next);
    expect(a).toEqual(b);
  });

  it('handles empty and single lists', () => {
    expect(shuffled([])).toEqual([]);
    expect(shuffled(['only'])).toEqual(['only']);
  });
});
