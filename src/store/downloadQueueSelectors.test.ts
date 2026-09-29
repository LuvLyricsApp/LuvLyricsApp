jest.mock('../services/DownloadManager', () => ({ downloadManager: { pauseDownload: jest.fn(), resumeDownload: jest.fn() } }));

import { QueueItem } from './downloadQueueStore';
import { queueShape } from './downloadQueueSelectors';

const item = (id: string, over: Partial<QueueItem> = {}): QueueItem => ({
  id,
  song: { id, title: `Song ${id}`, artist: 'Artist' } as QueueItem['song'],
  status: 'pending',
  progress: 0,
  ...over,
});

describe('queueShape', () => {
  it('does not change while a download only reports progress', () => {
    const before = queueShape([item('a', { status: 'downloading', progress: 0.1 }), item('b')]);
    const after = queueShape([item('a', { status: 'downloading', progress: 0.9, stageStatus: 'Downloading audio...' }), item('b')]);
    expect(after).toBe(before);
  });

  it('changes when an item is added, removed or changes state', () => {
    const base = queueShape([item('a'), item('b')]);
    expect(queueShape([item('a'), item('b'), item('c')])).not.toBe(base);
    expect(queueShape([item('a')])).not.toBe(base);
    expect(queueShape([item('a', { status: 'downloading' }), item('b')])).not.toBe(base);
  });

  it('keeps the order, since the lists draw in queue order', () => {
    expect(queueShape([item('a'), item('b')])).not.toBe(queueShape([item('b'), item('a')]));
  });
});
