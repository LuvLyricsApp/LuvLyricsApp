import { withDbWrite, withDbRead, esc } from './db';
import type { ScanJob } from '../store/lyricsScanQueueStore';

export const upsertScanJob = async (job: ScanJob): Promise<void> => {
  const now = new Date().toISOString();
  await withDbWrite(async (db) => {
    await db.execAsync(`
      INSERT OR REPLACE INTO lyrics_scan_jobs
        (song_id, title, artist, duration, status, attempts, is_forced_synced, created_at, updated_at)
      VALUES (
        '${esc(job.songId)}',
        '${esc(job.title)}',
        '${esc(job.artist)}',
        ${job.duration},
        '${job.status}',
        ${job.attempts},
        ${job.isForcedSynced ? 1 : 0},
        '${now}',
        '${now}'
      )
    `);
  });
};

export const updateScanJobStatus = async (
  songId: string,
  status: ScanJob['status'],
  attempts: number
): Promise<void> => {
  await withDbWrite(async (db) => {
    await db.execAsync(`
      UPDATE lyrics_scan_jobs
      SET status = '${status}', attempts = ${attempts}, updated_at = '${new Date().toISOString()}'
      WHERE song_id = '${esc(songId)}'
    `);
  });
};

export const deleteScanJob = async (songId: string): Promise<void> => {
  await withDbWrite(async (db) => {
    await db.execAsync(`DELETE FROM lyrics_scan_jobs WHERE song_id = '${esc(songId)}'`);
  });
};

export const loadPendingScanJobs = async (): Promise<ScanJob[]> => {
  // Write the scanning→pending correction back to the DB so a second cold start
  // doesn't see stale 'scanning' rows and reset attempts unnecessarily
  await withDbWrite(async (db) => {
    await db.execAsync(
      `UPDATE lyrics_scan_jobs SET status = 'pending', attempts = 0, updated_at = '${new Date().toISOString()}' WHERE status = 'scanning'`
    );
  });

  return withDbRead(async (db) => {
    const rows = await db.getAllAsync<{
      song_id: string;
      title: string;
      artist: string;
      duration: number;
      status: string;
      attempts: number;
      is_forced_synced: number;
      created_at: string;
    }>(`
      SELECT song_id, title, artist, duration, status, attempts, is_forced_synced, created_at
      FROM lyrics_scan_jobs
      WHERE status IN ('pending', 'scanning', 'failed')
      ORDER BY created_at ASC
    `);

    const now = Date.now();
    return rows.map(row => {
      const wasScanning = row.status === 'scanning';
      return {
        songId: row.song_id,
        title: row.title,
        artist: row.artist,
        duration: row.duration,
        status: wasScanning ? ('pending' as const) : (row.status as ScanJob['status']),
        attempts: wasScanning ? 0 : row.attempts,
        isForcedSynced: row.is_forced_synced === 1,
        log: ['Restored from storage'],
        createdAt: new Date(row.created_at).getTime() || now,
        updatedAt: now,
      };
    });
  });
};

export const pruneOldFailedJobs = async (maxAgeMs: number): Promise<void> => {
  const cutoff = new Date(Date.now() - maxAgeMs).toISOString();
  await withDbWrite(async (db) => {
    await db.execAsync(
      `DELETE FROM lyrics_scan_jobs WHERE status = 'failed' AND updated_at < '${cutoff}'`
    );
  });
};
