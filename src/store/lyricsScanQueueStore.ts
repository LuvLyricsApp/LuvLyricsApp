import { create } from 'zustand';
import { Song } from '../types/song';

const COMPLETED_JOB_TTL_MS = 5 * 60 * 1000;
const MAX_LOG_ENTRIES = 12;
const pruneTimers = new Map<string, ReturnType<typeof setTimeout>>();

export interface ScanJob {
  songId: string;
  title: string;
  artist: string;
  album?: string;
  duration: number;
  attempts: number;
  status: 'pending' | 'scanning' | 'completed' | 'failed';
  resultType?: 'synced' | 'plain' | 'none';
  isForcedSynced?: boolean;
  log: string[];
  createdAt: number;
  updatedAt: number;
  finishedAt?: number;
}

export const appendLog = (log: string[], entry: string) => [...log, entry].slice(-MAX_LOG_ENTRIES);

const isCompletedJobExpired = (job: ScanJob, now: number) =>
  job.status === 'completed' &&
  typeof job.finishedAt === 'number' &&
  now - job.finishedAt >= COMPLETED_JOB_TTL_MS;

const pruneExpiredCompletedJobs = (queue: Record<string, ScanJob>, now: number) =>
  Object.fromEntries(
    Object.entries(queue).filter(([, job]) => !isCompletedJobExpired(job, now))
  );

export const cancelPruneTimer = (songId: string) => {
  const timer = pruneTimers.get(songId);
  if (timer) {
    clearTimeout(timer);
    pruneTimers.delete(songId);
  }
};

export const schedulePruneTimer = (songId: string, ttl: number, removeFn: () => void) => {
  pruneTimers.set(songId, setTimeout(removeFn, ttl));
};

interface LyricsScanQueueState {
  /** Record keyed by songId for O(1) lookups */
  queue: Record<string, ScanJob>;
  processing: boolean;

  addToQueue: (song: Song, forceSynced?: boolean) => void;
  removeFromQueue: (songId: string) => void;
  clearCompleted: () => void;
  clearFailed: () => void;
  pruneExpiredJobs: () => void;
  setProcessing: (processing: boolean) => void;
  updateJob: (songId: string, updates: Partial<ScanJob> | ((prev: ScanJob) => Partial<ScanJob>)) => void;
  getJobStatus: (songId: string) => ScanJob | undefined;
  hydrateFromDb: () => Promise<void>;
}

export const useLyricsScanQueueStore = create<LyricsScanQueueState>((set, get) => ({
  queue: {},
  processing: false,

  addToQueue: (song: Song, forceSynced?: boolean) => {
    const now = Date.now();
    get().pruneExpiredJobs();

    const { queue } = get();
    const existing = queue[song.id];

    if (existing) {
      const isPlainRetry = forceSynced && existing.resultType === 'plain';

      if (existing.status === 'failed' || isPlainRetry) {
        cancelPruneTimer(song.id);
        set(state => ({
          queue: {
            ...state.queue,
            [song.id]: {
              ...state.queue[song.id],
              status: 'pending' as const,
              attempts: 0,
              isForcedSynced: forceSynced,
              updatedAt: now,
              finishedAt: undefined,
              log: appendLog(
                state.queue[song.id].log,
                isPlainRetry ? 'Retrying specifically for synced lyrics...' : 'Retrying...'
              ),
            },
          },
        }));
        import('../database/scanQueueQueries').then(m => {
          // Use upsertScanJob: completed jobs have their DB row deleted, so UPDATE would silently no-op
          const updatedJob = get().queue[song.id];
          if (updatedJob) m.upsertScanJob(updatedJob).catch(() => {});
        }).catch(() => {});
      }
      return;
    }

    const newJob: ScanJob = {
      songId: song.id,
      title: song.title,
      artist: song.artist || 'Unknown Artist',
      album: song.album,
      duration: song.duration,
      attempts: 0,
      status: 'pending',
      isForcedSynced: forceSynced,
      log: ['Queued'],
      createdAt: now,
      updatedAt: now,
    };

    set({ queue: { ...queue, [song.id]: newJob } });
    import('../database/scanQueueQueries').then(m => {
      m.upsertScanJob(newJob).catch(() => {});
    }).catch(() => {});
  },

  removeFromQueue: (songId: string) => {
    cancelPruneTimer(songId);
    import('../database/scanQueueQueries').then(m => m.deleteScanJob(songId)).catch(() => {});
    set(state => {
      const rest = { ...state.queue };
      delete rest[songId];
      return { queue: rest };
    });
  },

  clearCompleted: () => {
    const completedIds = Object.values(get().queue)
      .filter(job => job.status === 'completed')
      .map(job => job.songId);
    completedIds.forEach(cancelPruneTimer);
    if (completedIds.length > 0) {
      import('../database/scanQueueQueries').then(m => {
        completedIds.forEach(id => m.deleteScanJob(id).catch(() => {}));
      }).catch(() => {});
    }
    set(state => ({
      queue: Object.fromEntries(
        Object.entries(state.queue).filter(([, job]) => job.status !== 'completed')
      ),
    }));
  },

  clearFailed: () => {
    const failedIds = Object.values(get().queue)
      .filter(job => job.status === 'failed')
      .map(job => job.songId);
    if (failedIds.length > 0) {
      import('../database/scanQueueQueries').then(m => {
        failedIds.forEach(id => m.deleteScanJob(id).catch(() => {}));
      }).catch(() => {});
    }
    set(state => ({
      queue: Object.fromEntries(
        Object.entries(state.queue).filter(([, job]) => job.status !== 'failed')
      ),
    }));
  },

  pruneExpiredJobs: () => {
    const now = Date.now();
    set(state => {
      const nextQueue = pruneExpiredCompletedJobs(state.queue, now);
      const removedIds = Object.keys(state.queue).filter(songId => !nextQueue[songId]);
      removedIds.forEach(cancelPruneTimer);
      if (removedIds.length === 0) return state;
      return { queue: nextQueue };
    });
  },

  setProcessing: (processing: boolean) => set({ processing }),

  updateJob: (songId: string, updates: Partial<ScanJob> | ((prev: ScanJob) => Partial<ScanJob>)) => {
    const prev = get().queue[songId];
    if (!prev) return;
    const newValues = typeof updates === 'function' ? updates(prev) : updates;

    if (newValues.status) {
      import('../database/scanQueueQueries').then(m => {
        if (newValues.status === 'completed') {
          m.deleteScanJob(songId).catch(() => {});
        } else {
          m.updateScanJobStatus(
            songId,
            newValues.status!,
            newValues.attempts ?? prev.attempts
          ).catch(() => {});
        }
      }).catch(() => {});
    }

    const nextStatus = newValues.status ?? prev.status;
    const isTerminal = nextStatus === 'completed' || nextStatus === 'failed';
    const timestamp = Date.now();
    set(state => {
      const current = state.queue[songId];
      if (!current) return state;
      return {
        queue: {
          ...state.queue,
          [songId]: {
            ...current,
            ...newValues,
            updatedAt: timestamp,
            finishedAt: isTerminal ? (newValues.finishedAt ?? timestamp) : undefined,
          },
        },
      };
    });
  },

  getJobStatus: (songId: string) => get().queue[songId],

  hydrateFromDb: async () => {
    try {
      const { loadPendingScanJobs, pruneOldFailedJobs } = await import('../database/scanQueueQueries');
      await pruneOldFailedJobs(30 * 24 * 60 * 60 * 1000);
      const jobs = await loadPendingScanJobs();
      if (jobs.length > 0) {
        set(state => {
          const merged: Record<string, ScanJob> = { ...state.queue };
          jobs.forEach(job => {
            if (!merged[job.songId]) {
              merged[job.songId] = job;
            }
          });
          return { queue: merged };
        });
      }
    } catch (e) {
      if (__DEV__) console.warn('[LyricsScanQueueStore] hydrateFromDb failed:', e);
    }
  },
}));
