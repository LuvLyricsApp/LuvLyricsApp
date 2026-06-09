import { withDbWrite, withDbRead, esc } from './db';
import type { QueueItem } from '../store/downloadQueueStore';

export const insertJob = async (item: QueueItem): Promise<void> => {
  const songJson = esc(JSON.stringify(item.song));
  const now = new Date().toISOString();
  await withDbWrite(async (db) => {
    await db.execAsync(`
      INSERT OR REPLACE INTO download_jobs (id, song_json, status, progress, target_playlist_id, sort_order, error, created_at, updated_at)
      VALUES ('${item.id}', '${songJson}', '${item.status}', ${item.progress ?? 0}, ${item.targetPlaylistId ? `'${esc(item.targetPlaylistId)}'` : 'NULL'}, ${item.sortOrder ?? 0}, NULL, '${now}', '${now}')
    `);
  });
};

export const updateJobStatus = async (id: string, status: string, error?: string): Promise<void> => {
  await withDbWrite(async (db) => {
    await db.execAsync(`
      UPDATE download_jobs SET status = '${status}', error = ${error ? `'${esc(error)}'` : 'NULL'}, updated_at = '${new Date().toISOString()}'
      WHERE id = '${esc(id)}'
    `);
  });
};

export const deleteJob = async (id: string): Promise<void> => {
  await withDbWrite(async (db) => {
    await db.execAsync(`DELETE FROM download_jobs WHERE id = '${esc(id)}'`);
  });
};

export const deleteCompletedJobs = async (): Promise<void> => {
  await withDbWrite(async (db) => {
    await db.execAsync(`DELETE FROM download_jobs WHERE status = 'completed'`);
  });
};

export const loadAllJobs = async (): Promise<QueueItem[]> => {
  return withDbRead(async (db) => {
    const rows = await db.getAllAsync<{
      id: string;
      song_json: string;
      status: string;
      progress: number;
      target_playlist_id: string | null;
      sort_order: number;
      error: string | null;
    }>(`SELECT id, song_json, status, progress, target_playlist_id, sort_order, error FROM download_jobs ORDER BY created_at ASC`);

    return rows.map(row => {
      const wasActive = row.status === 'downloading' || row.status === 'staging';
      return {
        id: row.id,
        song: JSON.parse(row.song_json),
        // Any in-flight job when the app died gets reset to pending so BackgroundDownloader re-starts it
        status: wasActive ? 'pending' : (row.status as QueueItem['status']),
        progress: wasActive ? 0 : row.progress,
        stageStatus: wasActive ? 'Waiting...' : undefined,
        targetPlaylistId: row.target_playlist_id ?? undefined,
        sortOrder: row.sort_order,
        error: row.error ?? undefined,
      };
    });
  });
};
