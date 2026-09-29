import { dropIndex, filterQueue, isCoverFull, moveItem, playingFromLabel, rowShift, seekSide, seekTarget } from './coverStage';

describe('isCoverFull', () => {
  it('follows Apple Music inspired on the Apple styles', () => {
    expect(isCoverFull('blend', true, false)).toBe(true);
    expect(isCoverFull('apple', false, true)).toBe(false);
  });
  it('follows its own switch on the card styles', () => {
    expect(isCoverFull('youtube', true, false)).toBe(false);
    expect(isCoverFull('aura', false, true)).toBe(true);
  });
});

describe('seekTarget', () => {
  it('steps within the song', () => {
    expect(seekTarget(30, 200, 5)).toBe(35);
    expect(seekTarget(30, 200, -5)).toBe(25);
  });
  it('stops at the start and just before the end', () => {
    expect(seekTarget(3, 200, -5)).toBe(0);
    expect(seekTarget(198, 200, 5)).toBe(199.5);
  });
  it('still moves forward when the length is unknown', () => {
    expect(seekTarget(10, 0, 5)).toBe(15);
  });
});

describe('seekSide', () => {
  it('splits the cover down the middle', () => {
    expect(seekSide(10, 300)).toBe(-1);
    expect(seekSide(160, 300)).toBe(1);
  });
});

describe('playingFromLabel', () => {
  it('names a streamed mix after its first song', () => {
    expect(playingFromLabel('stream', 'Mayakama', undefined)).toBe('Mayakama mix');
  });
  it('names the library and playlists', () => {
    expect(playingFromLabel('library', 'x', undefined)).toBe('Your library');
    expect(playingFromLabel('p-12', 'x', 'Road trip')).toBe('Road trip');
    expect(playingFromLabel('p-12', 'x', undefined)).toBe('Your queue');
    expect(playingFromLabel(null, undefined, undefined)).toBe('Your queue');
  });
});

describe('filterQueue', () => {
  const familiar = [true, false, true, false];
  it('keeps every row for All', () => expect(filterQueue(familiar, 'all')).toEqual([0, 1, 2, 3]));
  it('keeps songs on the phone for Familiar', () => expect(filterQueue(familiar, 'familiar')).toEqual([0, 2]));
  it('keeps the rest for Discover', () => expect(filterQueue(familiar, 'discover')).toEqual([1, 3]));
});

describe('moveItem', () => {
  it('moves a row down and up', () => {
    expect(moveItem(['a', 'b', 'c', 'd'], 0, 2)).toEqual(['b', 'c', 'a', 'd']);
    expect(moveItem(['a', 'b', 'c', 'd'], 3, 1)).toEqual(['a', 'd', 'b', 'c']);
  });
  it('clamps the target and ignores a bad source', () => {
    expect(moveItem(['a', 'b'], 0, 9)).toEqual(['b', 'a']);
    expect(moveItem(['a', 'b'], 5, 0)).toEqual(['a', 'b']);
  });
});

describe('dropIndex and rowShift', () => {
  it('rounds the drag to whole rows, inside the list', () => {
    expect(dropIndex(2, 130, 64, 10)).toBe(4);
    expect(dropIndex(2, -500, 64, 10)).toBe(0);
    expect(dropIndex(8, 500, 64, 10)).toBe(9);
  });
  it('moves the rows in between towards the gap', () => {
    expect(rowShift(3, 1, 3, 64)).toBe(-64);
    expect(rowShift(1, 3, 1, 64)).toBe(64);
    expect(rowShift(0, 1, 3, 64)).toBe(0);
    expect(rowShift(1, 1, 3, 64)).toBe(0);
  });
});
