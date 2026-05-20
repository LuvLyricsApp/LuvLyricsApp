import { create } from 'zustand';
import { Song } from '../types/song';

import { lyricaService } from '../services/LyricaService';
import { useSongsStore } from './songsStore';

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

const appendLog = (log: string[], entry: string) => [...log, entry].slice(-MAX_LOG_ENTRIES);

const isCompletedJobExpired = (job: ScanJob, now: number) =>
  job.status === 'completed' &&
  typeof job.finishedAt === 'number' &&
  now - job.finishedAt >= COMPLETED_JOB_TTL_MS;

const pruneExpiredCompletedJobs = (queue: Record<string, ScanJob>, now: number) =>
  Object.fromEntries(
    Object.entries(queue).filter(([, job]) => !isCompletedJobExpired(job, now))
  );

const cancelPruneTimer = (songId: string) => {
  const timer = pruneTimers.get(songId);
  if (timer) {
    clearTimeout(timer);
    pruneTimers.delete(songId);
  }
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
  processQueue: () => Promise<void>;
  getJobStatus: (songId: string) => ScanJob | undefined;
}

export const useLyricsScanQueueStore = create<LyricsScanQueueState>((set, get) => ({
  queue: {},
  processing: false,

  addToQueue: (song: Song, forceSynced?: boolean) => {
    const now = Date.now();
    get().pruneExpiredJobs();

    const { queue, processQueue } = get();
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

        if (!get().processing) processQueue();
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

    if (!get().processing) {
      processQueue();
    }
  },

  removeFromQueue: (songId: string) => {
    cancelPruneTimer(songId);

    set(state => {
      const { [songId]: _, ...rest } = state.queue;
      return { queue: rest };
    });
  },

  clearCompleted: () => {
    const completedIds = Object.values(get().queue)
      .filter(job => job.status === 'completed')
      .map(job => job.songId);

    completedIds.forEach(cancelPruneTimer);

    set(state => ({
      queue: Object.fromEntries(
        Object.entries(state.queue).filter(([, job]) => job.status !== 'completed')
      ),
    }));
  },

  clearFailed: () => {
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

      if (removedIds.length === 0) {
        return state;
      }

      return { queue: nextQueue };
    });
  },

  getJobStatus: (songId: string) => get().queue[songId],

  processQueue: async () => {
    if (get().processing) return;

    get().pruneExpiredJobs();
    set({ processing: true });

    try {
      while (true) {
        const { queue } = get();
        const nextJob = Object.values(queue).find(job => job.status === 'pending');

        if (!nextJob) break;

        cancelPruneTimer(nextJob.songId);

        set(state => ({
          queue: {
            ...state.queue,
            [nextJob.songId]: {
              ...state.queue[nextJob.songId],
              status: 'scanning' as const,
              updatedAt: Date.now(),
              finishedAt: undefined,
            },
          },
        }));

        const updateJob = (updates: Partial<ScanJob> | ((prev: ScanJob) => Partial<ScanJob>)) => {
          set(state => {
            const prev = state.queue[nextJob.songId];
            if (!prev) return state;

            const newValues = typeof updates === 'function' ? updates(prev) : updates;
            const nextStatus = newValues.status ?? prev.status;
            const isTerminal = nextStatus === 'completed' || nextStatus === 'failed';
            const timestamp = Date.now();

            return {
              queue: {
                ...state.queue,
                [nextJob.songId]: {
                  ...prev,
                  ...newValues,
                  updatedAt: timestamp,
                  finishedAt: isTerminal ? (newValues.finishedAt ?? timestamp) : undefined,
                },
              },
            };
          });
        };

        updateJob(prev => ({
          attempts: prev.attempts + 1,
          log: appendLog(prev.log, 'Searching for lyrics...'),
        }));

        try {
          const result = await lyricaService.fetchLyrics(
            nextJob.title,
            nextJob.artist,
            nextJob.isForcedSynced,
            nextJob.duration
          );

          if (!result || !result.lyrics) {
            updateJob(prev => ({
              status: 'failed' as const,
              log: appendLog(
                prev.log,
                nextJob.isForcedSynced ? 'No synced lyrics found' : 'No lyrics found'
              ),
            }));
            await new Promise(resolve => setTimeout(resolve, 500));
            continue;
          }

          const hasSynced = lyricaService.hasTimestamps(result.lyrics);
          const sourceName = result.source;
          const parsedLyrics = lyricaService.parseLrc(
            result.lyrics,
            result.metadata?.duration || nextJob.duration
          );

          if (parsedLyrics.length === 0) {
            updateJob(prev => ({
              status: 'failed' as const,
              log: appendLog(prev.log, 'Failed to parse lyrics'),
            }));
            await new Promise(resolve => setTimeout(resolve, 500));
            continue;
          }

          const currentSong = await useSongsStore.getState().getSong(nextJob.songId);

          if (!currentSong) {
            updateJob(prev => ({
              status: 'failed' as const,
              log: appendLog(prev.log, 'Song not found in DB'),
            }));
            await new Promise(resolve => setTimeout(resolve, 500));
            continue;
          }

          await useSongsStore.getState().updateSong({
            ...currentSong,
            lyrics: parsedLyrics,
            duration:
              result.metadata?.duration && result.metadata.duration > 0
                ? result.metadata.duration
                : currentSong.duration,
            lyricSource: sourceName,
          });

          updateJob(prev => ({
            status: 'completed' as const,
            resultType: hasSynced ? 'synced' : 'plain',
            log: appendLog(prev.log, `Saved ${parsedLyrics.length} lines (${sourceName})`),
          }));

          pruneTimers.set(
            nextJob.songId,
            setTimeout(() => {
              get().removeFromQueue(nextJob.songId);
            }, COMPLETED_JOB_TTL_MS)
          );
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : String(error);
          console.error(`[ScanQueue] Error processing "${nextJob.title}":`, error);
          updateJob(prev => ({
            status: 'failed' as const,
            log: appendLog(prev.log, `Error: ${message}`),
          }));
        }

        await new Promise(resolve => setTimeout(resolve, 500));
      }
    } catch (error) {
      console.error('[ScanQueue] Queue processor error:', error);
    } finally {
      set({ processing: false });
    }
  },
}));
