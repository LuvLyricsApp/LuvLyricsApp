jest.mock('./songsStore', () => ({
  useSongsStore: {
    getState: () => ({
      getSong: jest.fn(),
      updateSong: jest.fn(),
    }),
  },
}));

import { Song } from '../types/song';
import { ScanJob, useLyricsScanQueueStore } from './lyricsScanQueueStore';

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

  it('requeues a completed plain-lyrics job for synced retry', () => {
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
