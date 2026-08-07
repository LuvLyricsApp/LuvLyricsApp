jest.mock('./songsStore', () => ({
  useSongsStore: {
    getState: () => ({
      getSong: jest.fn(),
      updateSong: jest.fn(),
    }),
  },
}));

jest.mock('../database/scanQueueQueries', () => ({
  upsertScanJob: jest.fn().mockResolvedValue(undefined),
  updateScanJobStatus: jest.fn().mockResolvedValue(undefined),
  deleteScanJob: jest.fn().mockResolvedValue(undefined),
  loadPendingScanJobs: jest.fn().mockResolvedValue([]),
  pruneOldFailedJobs: jest.fn().mockResolvedValue(undefined),
}));

import { Song } from '../types/song';
import { ScanJob, useLyricsScanQueueStore } from './lyricsScanQueueStore';
import * as scanQueueQueries from '../database/scanQueueQueries';

const now = 1_000_000;
const completedTtlMs = 5 * 60 * 1000;

const createSong = (): Song => ({
  id: 'song-1',
  title: 'Test Song',
  artist: 'Test Artist',
  album: 'Test Album',
  gradientId: 'dynamic',
  duration: 180,
  dateCreated: new Date(now).toISOString(),
  dateModified: new Date(now).toISOString(),
  playCount: 0,
  lyrics: [],
});

const createJob = (overrides: Partial<ScanJob>): ScanJob => ({
  songId: 'song-1',
  title: 'Test Song',
  artist: 'Test Artist',
  duration: 180,
  attempts: 1,
  status: 'pending',
  log: ['Queued'],
  createdAt: now,
  updatedAt: now,
  ...overrides,
});

describe('lyricsScanQueueStore', () => {
  beforeEach(() => {
    jest.spyOn(Date, 'now').mockReturnValue(now);
    useLyricsScanQueueStore.setState({ queue: {}, processing: false });
    jest.clearAllMocks();
    (scanQueueQueries.loadPendingScanJobs as jest.Mock).mockResolvedValue([]);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    useLyricsScanQueueStore.setState({ queue: {}, processing: false });
  });

  it('prunes only completed jobs that are past the retention window', () => {
    useLyricsScanQueueStore.setState({
      queue: {
        oldCompleted: createJob({
          songId: 'oldCompleted',
          status: 'completed',
          finishedAt: now - completedTtlMs - 1,
        }),
        recentCompleted: createJob({
          songId: 'recentCompleted',
          status: 'completed',
          finishedAt: now - completedTtlMs + 1,
        }),
        failed: createJob({
          songId: 'failed',
          status: 'failed',
          finishedAt: now - completedTtlMs - 50_000,
        }),
      },
      processing: false,
    });

    useLyricsScanQueueStore.getState().pruneExpiredJobs();

    expect(useLyricsScanQueueStore.getState().queue).toEqual({
      recentCompleted: expect.objectContaining({ status: 'completed' }),
      failed: expect.objectContaining({ status: 'failed' }),
    });
  });

  it('requeues a completed plain-lyrics job for synced retry', async () => {
    const song = createSong();
    const longLog = Array.from({ length: 12 }, (_, index) => `log-${index}`);

    useLyricsScanQueueStore.setState({
      queue: {
        [song.id]: createJob({
          songId: song.id,
          status: 'completed',
          resultType: 'plain',
          attempts: 3,
          finishedAt: now - 1_000,
          log: longLog,
        }),
      },
      processing: true,
    });

    useLyricsScanQueueStore.getState().addToQueue(song, true);

    expect(useLyricsScanQueueStore.getState().queue[song.id]).toEqual(
      expect.objectContaining({
        status: 'pending',
        attempts: 0,
        isForcedSynced: true,
        finishedAt: undefined,
      })
    );
    expect(useLyricsScanQueueStore.getState().queue[song.id].log).toHaveLength(12);
    expect(useLyricsScanQueueStore.getState().queue[song.id].log.at(-1)).toBe(
      'Retrying specifically for synced lyrics...'
    );

    // Flush all pending microtasks/macrotasks so the dynamic import .then() fires
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(scanQueueQueries.upsertScanJob).toHaveBeenCalled();
  });

  it('clears completed and failed jobs without touching active work', () => {
    useLyricsScanQueueStore.setState({
      queue: {
        pending: createJob({ songId: 'pending', status: 'pending' }),
        completed: createJob({ songId: 'completed', status: 'completed', finishedAt: now }),
        failed: createJob({ songId: 'failed', status: 'failed', finishedAt: now }),
      },
      processing: false,
    });

    useLyricsScanQueueStore.getState().clearCompleted();
    expect(useLyricsScanQueueStore.getState().queue).toEqual({
      pending: expect.objectContaining({ status: 'pending' }),
      failed: expect.objectContaining({ status: 'failed' }),
    });

    useLyricsScanQueueStore.getState().clearFailed();
    expect(useLyricsScanQueueStore.getState().queue).toEqual({
      pending: expect.objectContaining({ status: 'pending' }),
    });
  });
});

describe('lyricsScanQueueStore — hydrateFromDb', () => {
  beforeEach(() => {
    jest.spyOn(Date, 'now').mockReturnValue(now);
    useLyricsScanQueueStore.setState({ queue: {}, processing: false });
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    useLyricsScanQueueStore.setState({ queue: {}, processing: false });
  });

  it('populates an empty queue with jobs from the DB', async () => {
    const dbJobs: ScanJob[] = [
      createJob({ songId: 'db-song-1', title: 'DB Song 1', status: 'pending', attempts: 0 }),
      createJob({ songId: 'db-song-2', title: 'DB Song 2', status: 'failed', attempts: 2 }),
    ];
    (scanQueueQueries.loadPendingScanJobs as jest.Mock).mockResolvedValue(dbJobs);

    await useLyricsScanQueueStore.getState().hydrateFromDb();

    const { queue } = useLyricsScanQueueStore.getState();
    expect(queue['db-song-1']).toEqual(expect.objectContaining({ title: 'DB Song 1', status: 'pending' }));
    expect(queue['db-song-2']).toEqual(expect.objectContaining({ title: 'DB Song 2', status: 'failed' }));
  });

  it('does not overwrite jobs already in memory', async () => {
    const inMemoryJob = createJob({ songId: 'song-1', title: 'In-Memory', status: 'scanning' });
    useLyricsScanQueueStore.setState({ queue: { 'song-1': inMemoryJob } });

    const dbJob = createJob({ songId: 'song-1', title: 'From DB', status: 'pending' });
    (scanQueueQueries.loadPendingScanJobs as jest.Mock).mockResolvedValue([dbJob]);

    await useLyricsScanQueueStore.getState().hydrateFromDb();

    expect(useLyricsScanQueueStore.getState().queue['song-1'].title).toBe('In-Memory');
    expect(useLyricsScanQueueStore.getState().queue['song-1'].status).toBe('scanning');
  });

  it('handles an empty DB result without changing queue state', async () => {
    (scanQueueQueries.loadPendingScanJobs as jest.Mock).mockResolvedValue([]);
    useLyricsScanQueueStore.setState({
      queue: { 'existing-song': createJob({ songId: 'existing-song' }) },
    });

    await useLyricsScanQueueStore.getState().hydrateFromDb();

    expect(Object.keys(useLyricsScanQueueStore.getState().queue)).toEqual(['existing-song']);
  });

  it('survives a DB failure without throwing', async () => {
    (scanQueueQueries.loadPendingScanJobs as jest.Mock).mockRejectedValue(new Error('DB error'));

    await expect(
      useLyricsScanQueueStore.getState().hydrateFromDb()
    ).resolves.toBeUndefined();

    expect(useLyricsScanQueueStore.getState().queue).toEqual({});
  });

  it('prunes old failed jobs before loading from DB', async () => {
    await useLyricsScanQueueStore.getState().hydrateFromDb();
    expect(scanQueueQueries.pruneOldFailedJobs).toHaveBeenCalledWith(expect.any(Number));
  });
});
