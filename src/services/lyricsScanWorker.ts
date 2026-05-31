import { lyricaService } from './LyricaService';
import { useSongsStore } from '../store/songsStore';
import {
  useLyricsScanQueueStore,
  appendLog,
  cancelPruneTimer,
  schedulePruneTimer,
} from '../store/lyricsScanQueueStore';
import { handleAsyncError } from '../utils/errorHandler';
const COMPLETED_JOB_TTL_MS = 5 * 60 * 1000;

/**
 * Processes the lyrics scan queue until empty.
 * Pure orchestration — all state lives in useLyricsScanQueueStore.
 * Call this whenever new jobs are added (e.g. from BackgroundDownloader's useEffect).
 */
export async function processLyricsScanQueue(): Promise<void> {
  const store = useLyricsScanQueueStore.getState();

  if (store.processing) return;

  store.pruneExpiredJobs();
  store.setProcessing(true);

  try {
    while (true) {
      const { queue } = useLyricsScanQueueStore.getState();
      const nextJob = Object.values(queue).find(job => job.status === 'pending');
      if (!nextJob) break;

      const { updateJob, removeFromQueue } = useLyricsScanQueueStore.getState();

      cancelPruneTimer(nextJob.songId);

      updateJob(nextJob.songId, { status: 'scanning' });
      updateJob(nextJob.songId, prev => ({
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
          updateJob(nextJob.songId, prev => ({
            status: 'failed' as const,
            log: appendLog(
              prev.log,
              nextJob.isForcedSynced ? 'No synced lyrics found' : 'No lyrics found'
            ),
          }));
          await delay(500);
          continue;
        }

        const hasSynced = lyricaService.hasTimestamps(result.lyrics);
        const sourceName = result.source;
        const parsedLyrics = lyricaService.parseLrc(
          result.lyrics,
          result.metadata?.duration || nextJob.duration
        );

        if (parsedLyrics.length === 0) {
          updateJob(nextJob.songId, prev => ({
            status: 'failed' as const,
            log: appendLog(prev.log, 'Failed to parse lyrics'),
          }));
          await delay(500);
          continue;
        }

        const currentSong = await useSongsStore.getState().getSong(nextJob.songId);

        if (!currentSong) {
          updateJob(nextJob.songId, prev => ({
            status: 'failed' as const,
            log: appendLog(prev.log, 'Song not found in DB'),
          }));
          await delay(500);
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

        updateJob(nextJob.songId, prev => ({
          status: 'completed' as const,
          resultType: hasSynced ? 'synced' : 'plain',
          log: appendLog(prev.log, `Saved ${parsedLyrics.length} lines (${sourceName})`),
        }));

        schedulePruneTimer(nextJob.songId, COMPLETED_JOB_TTL_MS, () => {
          removeFromQueue(nextJob.songId);
        });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        handleAsyncError(`lyricsScanWorker.processJob.${nextJob.songId}`, error);
        updateJob(nextJob.songId, prev => ({
          status: 'failed' as const,
          log: appendLog(prev.log, `Error: ${message}`),
        }));
      }

      await delay(500);
    }
  } catch (error) {
    handleAsyncError('lyricsScanWorker.processQueue', error);
  } finally {
    useLyricsScanQueueStore.getState().setProcessing(false);
  }
}

const delay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
