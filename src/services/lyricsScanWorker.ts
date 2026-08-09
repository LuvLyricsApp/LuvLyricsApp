import { lyricaService } from './LyricaService';
import { useSongsStore } from '../store/songsStore';
import {
  useLyricsScanQueueStore,
  appendLog,
  cancelPruneTimer,
  schedulePruneTimer,
  type ScanJob,
} from '../store/lyricsScanQueueStore';

const COMPLETED_JOB_TTL_MS = 5 * 60 * 1000;

/**
 * Songs scanned at once.
 *
 * Deliberately a cap rather than "all of them". Each song already fires several
 * requests in parallel inside LyricaService, so a 50-song queue turned fully
 * loose is 150+ simultaneous hits on the same host — which earns 429s and ends
 * up slower than doing it politely, with a real risk of the API blocking the
 * device for a while.
 *
 * At 10 wide a 50-song queue completes in about five waves. With per-lookup
 * latency down around a second that is the ~7s the whole change was aiming for,
 * without hammering anyone.
 */
const MAX_CONCURRENT_SCANS = 10;

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
      const pending = Object.values(queue).filter(job => job.status === 'pending');
      if (pending.length === 0) break;

      const batch = pending.slice(0, MAX_CONCURRENT_SCANS);

      // Claim the whole wave synchronously, before the first await. Marking them
      // one at a time inside the async work would let a re-entrant call pick up
      // jobs this loop already owns and scan them twice.
      const { updateJob } = useLyricsScanQueueStore.getState();
      batch.forEach((job) => {
        cancelPruneTimer(job.songId);
        updateJob(job.songId, { status: 'scanning' });
        updateJob(job.songId, prev => ({
          attempts: prev.attempts + 1,
          log: appendLog(prev.log, 'Searching for lyrics...'),
        }));
      });

      // allSettled, not all: one song throwing must not abandon the other nine.
      await Promise.allSettled(batch.map(job => scanOneSong(job)));
    }
  } catch (error) {
    if (__DEV__) console.error('[ScanWorker] Queue processor error:', error);
  } finally {
    useLyricsScanQueueStore.getState().setProcessing(false);
  }
}

/** Fetch, parse and persist lyrics for a single already-claimed job. */
async function scanOneSong(job: ScanJob): Promise<void> {
  const { updateJob, removeFromQueue } = useLyricsScanQueueStore.getState();

  const fail = (message: string) => {
    updateJob(job.songId, prev => ({
      status: 'failed' as const,
      log: appendLog(prev.log, message),
    }));
  };

  try {
    const result = await lyricaService.fetchLyrics(
      job.title,
      job.artist,
      job.isForcedSynced,
      job.duration
    );

    if (!result || !result.lyrics) {
      fail(job.isForcedSynced ? 'No synced lyrics found' : 'No lyrics found');
      return;
    }

    const hasSynced = lyricaService.hasTimestamps(result.lyrics);
    const sourceName = result.source;
    const parsedLyrics = lyricaService.parseLrc(
      result.lyrics,
      result.metadata?.duration || job.duration
    );

    if (parsedLyrics.length === 0) {
      fail('Failed to parse lyrics');
      return;
    }

    const currentSong = await useSongsStore.getState().getSong(job.songId);
    if (!currentSong) {
      fail('Song not found in DB');
      return;
    }

    await useSongsStore.getState().updateSong({
      ...currentSong,
      lyrics: parsedLyrics,
      duration:
        result.metadata?.duration && result.metadata.duration > 0
          ? result.metadata.duration
          : currentSong.duration,
      lyricSource: sourceName,
      lyricsRaw: result.rawLyrics ?? result.lyrics,
      lyricsFormat: result.format,
      lyricsSyncType: result.syncType ?? (result.precision === 'word' ? 'richsync' : hasSynced ? 'linesync' : 'plain'),
      lyricsPrecision: result.precision,
    });

    updateJob(job.songId, prev => ({
      status: 'completed' as const,
      resultType: hasSynced ? 'synced' : 'plain',
      log: appendLog(prev.log, `Saved ${parsedLyrics.length} lines (${sourceName}, ${result.precision})`),
    }));

    schedulePruneTimer(job.songId, COMPLETED_JOB_TTL_MS, () => {
      removeFromQueue(job.songId);
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    if (__DEV__) console.error(`[ScanWorker] Error processing "${job.title}":`, error);
    fail(`Error: ${message}`);
  }
}
