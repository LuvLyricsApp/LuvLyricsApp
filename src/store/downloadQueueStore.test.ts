jest.mock('../services/DownloadManager', () => ({
  downloadManager: {
    pauseDownload: jest.fn(),
    resumeDownload: jest.fn(),
  },
}));

jest.mock('../database/downloadQueueQueries', () => ({
  insertJob: jest.fn().mockResolvedValue(undefined),
  updateJobStatus: jest.fn().mockResolvedValue(undefined),
  deleteJob: jest.fn().mockResolvedValue(undefined),
  deleteCompletedJobs: jest.fn().mockResolvedValue(undefined),
  loadAllJobs: jest.fn().mockResolvedValue([]),
}));

import { useDownloadQueueStore, QueueItem } from './downloadQueueStore';
import { UnifiedSong } from '../types/song';
import * as downloadQueueQueries from '../database/downloadQueueQueries';
import { downloadManager } from '../services/DownloadManager';

const createSong = (id = 'song-1'): UnifiedSong => ({
  id,
  title: 'Test Song',
  artist: 'Test Artist',
  highResArt: 'https://example.com/art.jpg',
  downloadUrl: 'https://example.com/song.mp3',
  source: 'Saavn' as const,
});

const createItem = (overrides: Partial<QueueItem> = {}): QueueItem => ({
  id: 'song-1',
  song: createSong('song-1'),
  status: 'pending',
  progress: 0,
  ...overrides,
});

describe('downloadQueueStore', () => {
  beforeEach(() => {
    useDownloadQueueStore.setState({ queue: [], isProcessing: false });
    jest.clearAllMocks();
    (downloadQueueQueries.loadAllJobs as jest.Mock).mockResolvedValue([]);
  });

  afterEach(() => {
    useDownloadQueueStore.setState({ queue: [], isProcessing: false });
  });

  describe('addToQueue', () => {
    it('adds new songs as pending items with progress 0', () => {
      useDownloadQueueStore.getState().addToQueue([createSong()]);
      const { queue } = useDownloadQueueStore.getState();
      expect(queue).toHaveLength(1);
      expect(queue[0].status).toBe('pending');
      expect(queue[0].progress).toBe(0);
      expect(queue[0].stageStatus).toBe('Waiting...');
    });

    it('skips songs that are already in the queue', () => {
      useDownloadQueueStore.setState({ queue: [createItem({ id: 'song-1' })] });
      useDownloadQueueStore.getState().addToQueue([createSong('song-1')]);
      expect(useDownloadQueueStore.getState().queue).toHaveLength(1);
    });

    it('adds only non-duplicate songs when given a mixed batch', () => {
      useDownloadQueueStore.setState({ queue: [createItem({ id: 'song-1' })] });
      useDownloadQueueStore.getState().addToQueue([createSong('song-1'), createSong('song-2')]);
      expect(useDownloadQueueStore.getState().queue).toHaveLength(2);
      expect(useDownloadQueueStore.getState().queue[1].id).toBe('song-2');
    });

    it('stores targetPlaylistId on each new item', () => {
      useDownloadQueueStore.getState().addToQueue([createSong()], 'pl-42');
      expect(useDownloadQueueStore.getState().queue[0].targetPlaylistId).toBe('pl-42');
    });

    it('stores sortOrder per item when provided', () => {
      useDownloadQueueStore.getState().addToQueue([createSong('a'), createSong('b')], undefined, [3, 7]);
      const queue = useDownloadQueueStore.getState().queue;
      expect(queue[0].sortOrder).toBe(3);
      expect(queue[1].sortOrder).toBe(7);
    });

    it('fires insertJob for each new item', async () => {
      useDownloadQueueStore.getState().addToQueue([createSong('a'), createSong('b')]);
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(downloadQueueQueries.insertJob).toHaveBeenCalledTimes(2);
    });

    it('does not fire insertJob for duplicate items', async () => {
      useDownloadQueueStore.setState({ queue: [createItem({ id: 'song-1' })] });
      useDownloadQueueStore.getState().addToQueue([createSong('song-1')]);
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(downloadQueueQueries.insertJob).not.toHaveBeenCalled();
    });
  });

  describe('updateItem', () => {
    beforeEach(() => {
      useDownloadQueueStore.setState({ queue: [createItem()] });
    });

    it('merges updates onto the matching item', () => {
      useDownloadQueueStore.getState().updateItem('song-1', { stageStatus: 'Fetching lyrics...' });
      expect(useDownloadQueueStore.getState().queue[0].stageStatus).toBe('Fetching lyrics...');
    });

    it('leaves other items unchanged', () => {
      useDownloadQueueStore.setState({
        queue: [createItem({ id: 'song-1' }), createItem({ id: 'song-2', song: createSong('song-2') })],
      });
      useDownloadQueueStore.getState().updateItem('song-1', { stageStatus: 'Done' });
      expect(useDownloadQueueStore.getState().queue[1].stageStatus).toBeUndefined();
    });

    it('calls deleteJob when status transitions to completed', async () => {
      useDownloadQueueStore.getState().updateItem('song-1', { status: 'completed' });
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(downloadQueueQueries.deleteJob).toHaveBeenCalledWith('song-1');
      expect(downloadQueueQueries.updateJobStatus).not.toHaveBeenCalled();
    });

    it('calls updateJobStatus for failed status with error', async () => {
      useDownloadQueueStore.getState().updateItem('song-1', { status: 'failed', error: 'timeout' });
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(downloadQueueQueries.updateJobStatus).toHaveBeenCalledWith('song-1', 'failed', 'timeout');
    });

    it('calls updateJobStatus for downloading status', async () => {
      useDownloadQueueStore.getState().updateItem('song-1', { status: 'downloading' });
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(downloadQueueQueries.updateJobStatus).toHaveBeenCalledWith('song-1', 'downloading', undefined);
    });

    it('skips DB write for progress-only updates (throttle window)', async () => {
      jest.spyOn(Date, 'now').mockReturnValue(0);
      useDownloadQueueStore.getState().updateItem('song-1', { progress: 50 });
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(downloadQueueQueries.updateJobStatus).not.toHaveBeenCalled();
      expect(downloadQueueQueries.deleteJob).not.toHaveBeenCalled();
      jest.restoreAllMocks();
    });
  });

  describe('removeItem', () => {
    it('removes the item from the queue', () => {
      useDownloadQueueStore.setState({ queue: [createItem()] });
      useDownloadQueueStore.getState().removeItem('song-1');
      expect(useDownloadQueueStore.getState().queue).toHaveLength(0);
    });

    it('leaves other items intact', () => {
      useDownloadQueueStore.setState({
        queue: [createItem({ id: 'song-1' }), createItem({ id: 'song-2', song: createSong('song-2') })],
      });
      useDownloadQueueStore.getState().removeItem('song-1');
      const { queue } = useDownloadQueueStore.getState();
      expect(queue).toHaveLength(1);
      expect(queue[0].id).toBe('song-2');
    });

    it('fires deleteJob for the removed item', async () => {
      useDownloadQueueStore.setState({ queue: [createItem()] });
      useDownloadQueueStore.getState().removeItem('song-1');
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(downloadQueueQueries.deleteJob).toHaveBeenCalledWith('song-1');
    });
  });

  describe('clearCompleted', () => {
    it('removes only completed items', () => {
      useDownloadQueueStore.setState({
        queue: [
          createItem({ id: 'a', status: 'completed' }),
          createItem({ id: 'b', song: createSong('b'), status: 'pending' }),
          createItem({ id: 'c', song: createSong('c'), status: 'failed' }),
        ],
      });
      useDownloadQueueStore.getState().clearCompleted();
      const ids = useDownloadQueueStore.getState().queue.map(i => i.id);
      expect(ids).toEqual(['b', 'c']);
    });

    it('fires deleteCompletedJobs', async () => {
      useDownloadQueueStore.setState({ queue: [createItem({ status: 'completed' })] });
      useDownloadQueueStore.getState().clearCompleted();
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(downloadQueueQueries.deleteCompletedJobs).toHaveBeenCalledTimes(1);
    });

    it('is a no-op on an already-clean queue', () => {
      useDownloadQueueStore.setState({
        queue: [createItem({ status: 'pending' }), createItem({ id: 'b', song: createSong('b'), status: 'failed' })],
      });
      useDownloadQueueStore.getState().clearCompleted();
      expect(useDownloadQueueStore.getState().queue).toHaveLength(2);
    });
  });

  describe('pauseItem', () => {
    it('sets status to paused and stageStatus to Paused', () => {
      useDownloadQueueStore.setState({ queue: [createItem({ status: 'downloading' })] });
      useDownloadQueueStore.getState().pauseItem('song-1');
      const item = useDownloadQueueStore.getState().queue[0];
      expect(item.status).toBe('paused');
      expect(item.stageStatus).toBe('Paused');
    });

    it('calls downloadManager.pauseDownload with the song id', () => {
      useDownloadQueueStore.setState({ queue: [createItem()] });
      useDownloadQueueStore.getState().pauseItem('song-1');
      expect(downloadManager.pauseDownload).toHaveBeenCalledWith('song-1');
    });

    it('persists paused status to DB', async () => {
      useDownloadQueueStore.setState({ queue: [createItem()] });
      useDownloadQueueStore.getState().pauseItem('song-1');
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(downloadQueueQueries.updateJobStatus).toHaveBeenCalledWith('song-1', 'paused');
    });
  });

  describe('resumeItem', () => {
    it('sets status back to pending and stageStatus to Resuming...', () => {
      useDownloadQueueStore.setState({ queue: [createItem({ status: 'paused' })] });
      useDownloadQueueStore.getState().resumeItem('song-1');
      const item = useDownloadQueueStore.getState().queue[0];
      expect(item.status).toBe('pending');
      expect(item.stageStatus).toBe('Resuming...');
    });

    it('calls downloadManager.resumeDownload', () => {
      useDownloadQueueStore.setState({ queue: [createItem({ status: 'paused' })] });
      useDownloadQueueStore.getState().resumeItem('song-1');
      expect(downloadManager.resumeDownload).toHaveBeenCalledWith('song-1');
    });

    it('persists pending status to DB', async () => {
      useDownloadQueueStore.setState({ queue: [createItem({ status: 'paused' })] });
      useDownloadQueueStore.getState().resumeItem('song-1');
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(downloadQueueQueries.updateJobStatus).toHaveBeenCalledWith('song-1', 'pending');
    });
  });

  describe('retryItem', () => {
    it('resets status to pending, progress to 0, stageStatus to Retrying...', () => {
      useDownloadQueueStore.setState({
        queue: [createItem({ status: 'failed', progress: 25, stageStatus: 'Error' })],
      });
      useDownloadQueueStore.getState().retryItem('song-1');
      const item = useDownloadQueueStore.getState().queue[0];
      expect(item.status).toBe('pending');
      expect(item.progress).toBe(0);
      expect(item.stageStatus).toBe('Retrying...');
    });

    it('persists pending status to DB', async () => {
      useDownloadQueueStore.setState({ queue: [createItem({ status: 'failed' })] });
      useDownloadQueueStore.getState().retryItem('song-1');
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(downloadQueueQueries.updateJobStatus).toHaveBeenCalledWith('song-1', 'pending');
    });
  });

  describe('setProcessing', () => {
    it('sets isProcessing true', () => {
      useDownloadQueueStore.getState().setProcessing(true);
      expect(useDownloadQueueStore.getState().isProcessing).toBe(true);
    });

    it('sets isProcessing false', () => {
      useDownloadQueueStore.setState({ isProcessing: true });
      useDownloadQueueStore.getState().setProcessing(false);
      expect(useDownloadQueueStore.getState().isProcessing).toBe(false);
    });
  });
});

describe('downloadQueueStore — hydrateFromDb', () => {
  beforeEach(() => {
    useDownloadQueueStore.setState({ queue: [], isProcessing: false });
    jest.clearAllMocks();
    (downloadQueueQueries.loadAllJobs as jest.Mock).mockResolvedValue([]);
  });

  afterEach(() => {
    useDownloadQueueStore.setState({ queue: [], isProcessing: false });
  });

  it('prepends DB jobs before any existing in-memory items', async () => {
    const dbItems = [createItem({ id: 'db-song', song: createSong('db-song') })];
    const inMemory = createItem({ id: 'mem-song', song: createSong('mem-song') });
    useDownloadQueueStore.setState({ queue: [inMemory] });
    (downloadQueueQueries.loadAllJobs as jest.Mock).mockResolvedValue(dbItems);

    await useDownloadQueueStore.getState().hydrateFromDb();

    const ids = useDownloadQueueStore.getState().queue.map(i => i.id);
    expect(ids[0]).toBe('db-song');
    expect(ids[1]).toBe('mem-song');
  });

  it('does not overwrite items already in memory', async () => {
    const inMemory = createItem({ id: 'song-1', status: 'downloading' });
    useDownloadQueueStore.setState({ queue: [inMemory] });

    const dbItem = createItem({ id: 'song-1', status: 'pending' });
    (downloadQueueQueries.loadAllJobs as jest.Mock).mockResolvedValue([dbItem]);

    await useDownloadQueueStore.getState().hydrateFromDb();

    // In-memory item (downloading) wins over DB item (pending)
    const match = useDownloadQueueStore.getState().queue.find(i => i.id === 'song-1')!;
    expect(match.status).toBe('downloading');
    expect(useDownloadQueueStore.getState().queue).toHaveLength(1);
  });

  it('handles an empty DB result without changing the existing queue', async () => {
    useDownloadQueueStore.setState({ queue: [createItem()] });
    (downloadQueueQueries.loadAllJobs as jest.Mock).mockResolvedValue([]);
    await useDownloadQueueStore.getState().hydrateFromDb();
    expect(useDownloadQueueStore.getState().queue).toHaveLength(1);
  });

  it('survives a DB failure without throwing', async () => {
    (downloadQueueQueries.loadAllJobs as jest.Mock).mockRejectedValue(new Error('DB unavailable'));
    await expect(useDownloadQueueStore.getState().hydrateFromDb()).resolves.toBeUndefined();
    expect(useDownloadQueueStore.getState().queue).toEqual([]);
  });

  it('populates an empty queue with all jobs from the DB', async () => {
    const dbItems = [
      createItem({ id: 'a', song: createSong('a'), status: 'pending' }),
      createItem({ id: 'b', song: createSong('b'), status: 'failed' }),
    ];
    (downloadQueueQueries.loadAllJobs as jest.Mock).mockResolvedValue(dbItems);

    await useDownloadQueueStore.getState().hydrateFromDb();

    const { queue } = useDownloadQueueStore.getState();
    expect(queue).toHaveLength(2);
    expect(queue[0].id).toBe('a');
    expect(queue[1].id).toBe('b');
  });
});
