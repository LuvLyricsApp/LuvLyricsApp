import { withDbWrite, withDbRead, esc } from './db';
import { upsertScanJob, updateScanJobStatus, deleteScanJob, loadPendingScanJobs, pruneOldFailedJobs } from './scanQueueQueries';
import type { ScanJob } from '../store/lyricsScanQueueStore';

jest.mock('./db', () => ({
  withDbWrite: jest.fn(),
  withDbRead: jest.fn(),
  esc: (val: string) => val.replace(/'/g, "''"),
}));

const mockExecAsync = jest.fn().mockResolvedValue(undefined);
const mockGetAllAsync = jest.fn();

const mockDb = {
  execAsync: mockExecAsync,
  getAllAsync: mockGetAllAsync,
};

beforeEach(() => {
  jest.clearAllMocks();
  (withDbWrite as jest.Mock).mockImplementation(async (op: (db: typeof mockDb) => Promise<void>) => op(mockDb));
  (withDbRead as jest.Mock).mockImplementation(async (op: (db: typeof mockDb) => Promise<unknown>) => op(mockDb));
});

const baseJob: ScanJob = {
  songId: 'song-1',
  title: 'Test Song',
  artist: 'Test Artist',
  duration: 180,
  status: 'pending',
  attempts: 0,
  log: ['Queued'],
  createdAt: 1000000,
  updatedAt: 1000000,
};

describe('upsertScanJob', () => {
  it('calls withDbWrite and inserts the job', async () => {
    await upsertScanJob(baseJob);
    expect(withDbWrite).toHaveBeenCalledTimes(1);
    expect(mockExecAsync).toHaveBeenCalledTimes(1);
    const sql: string = mockExecAsync.mock.calls[0][0];
    expect(sql).toContain('INSERT OR REPLACE INTO lyrics_scan_jobs');
    expect(sql).toContain("'song-1'");
    expect(sql).toContain("'Test Song'");
    expect(sql).toContain("'Test Artist'");
    expect(sql).toContain('180');
    expect(sql).toContain("'pending'");
  });

  it('sets is_forced_synced = 1 when isForcedSynced is true', async () => {
    await upsertScanJob({ ...baseJob, isForcedSynced: true });
    const sql: string = mockExecAsync.mock.calls[0][0];
    expect(sql).toContain('1,\n');
  });

  it('sets is_forced_synced = 0 when isForcedSynced is falsy', async () => {
    await upsertScanJob({ ...baseJob, isForcedSynced: false });
    const sql: string = mockExecAsync.mock.calls[0][0];
    expect(sql).toContain('0,\n');
  });

  it('escapes single quotes in title and artist', async () => {
    await upsertScanJob({ ...baseJob, title: "It's a Song", artist: "O'Brien" });
    const sql: string = mockExecAsync.mock.calls[0][0];
    expect(sql).toContain("It''s a Song");
    expect(sql).toContain("O''Brien");
  });
});

describe('updateScanJobStatus', () => {
  it('calls withDbWrite and updates status and attempts', async () => {
    await updateScanJobStatus('song-1', 'scanning', 1);
    expect(withDbWrite).toHaveBeenCalledTimes(1);
    const sql: string = mockExecAsync.mock.calls[0][0];
    expect(sql).toContain('UPDATE lyrics_scan_jobs');
    expect(sql).toContain("'scanning'");
    expect(sql).toContain('attempts = 1');
    expect(sql).toContain("'song-1'");
  });

  it('escapes single quotes in songId', async () => {
    await updateScanJobStatus("song'weird", 'failed', 3);
    const sql: string = mockExecAsync.mock.calls[0][0];
    expect(sql).toContain("song''weird");
  });
});

describe('deleteScanJob', () => {
  it('calls withDbWrite and deletes the row', async () => {
    await deleteScanJob('song-1');
    expect(withDbWrite).toHaveBeenCalledTimes(1);
    const sql: string = mockExecAsync.mock.calls[0][0];
    expect(sql).toContain('DELETE FROM lyrics_scan_jobs');
    expect(sql).toContain("'song-1'");
  });
});

describe('loadPendingScanJobs', () => {
  it('returns empty array when there are no rows', async () => {
    mockGetAllAsync.mockResolvedValue([]);
    const result = await loadPendingScanJobs();
    expect(result).toEqual([]);
  });

  it('resets scanning jobs to pending with attempts = 0', async () => {
    mockGetAllAsync.mockResolvedValue([
      {
        song_id: 'song-1',
        title: 'Scanning Song',
        artist: 'Artist',
        duration: 200,
        status: 'scanning',
        attempts: 2,
        is_forced_synced: 0,
        created_at: new Date(1000).toISOString(),
      },
    ]);
    const [job] = await loadPendingScanJobs();
    expect(job.status).toBe('pending');
    expect(job.attempts).toBe(0);
    expect(job.log).toEqual(['Restored from storage']);
  });

  it('keeps pending jobs as-is', async () => {
    mockGetAllAsync.mockResolvedValue([
      {
        song_id: 'song-2',
        title: 'Pending Song',
        artist: 'Artist',
        duration: 180,
        status: 'pending',
        attempts: 1,
        is_forced_synced: 1,
        created_at: new Date(2000).toISOString(),
      },
    ]);
    const [job] = await loadPendingScanJobs();
    expect(job.status).toBe('pending');
    expect(job.attempts).toBe(1);
    expect(job.isForcedSynced).toBe(true);
  });

  it('keeps failed jobs as-is', async () => {
    mockGetAllAsync.mockResolvedValue([
      {
        song_id: 'song-3',
        title: 'Failed Song',
        artist: 'Artist',
        duration: 220,
        status: 'failed',
        attempts: 3,
        is_forced_synced: 0,
        created_at: new Date(3000).toISOString(),
      },
    ]);
    const [job] = await loadPendingScanJobs();
    expect(job.status).toBe('failed');
    expect(job.attempts).toBe(3);
  });

  it('maps is_forced_synced = 1 to isForcedSynced = true', async () => {
    mockGetAllAsync.mockResolvedValue([
      {
        song_id: 'song-4',
        title: 'Forced',
        artist: 'Artist',
        duration: 150,
        status: 'pending',
        attempts: 0,
        is_forced_synced: 1,
        created_at: new Date(4000).toISOString(),
      },
    ]);
    const [job] = await loadPendingScanJobs();
    expect(job.isForcedSynced).toBe(true);
  });

  it('maps is_forced_synced = 0 to isForcedSynced = false', async () => {
    mockGetAllAsync.mockResolvedValue([
      {
        song_id: 'song-5',
        title: 'Normal',
        artist: 'Artist',
        duration: 150,
        status: 'pending',
        attempts: 0,
        is_forced_synced: 0,
        created_at: new Date(5000).toISOString(),
      },
    ]);
    const [job] = await loadPendingScanJobs();
    expect(job.isForcedSynced).toBe(false);
  });

  it('queries only pending/scanning/failed statuses', async () => {
    mockGetAllAsync.mockResolvedValue([]);
    await loadPendingScanJobs();
    const sql: string = mockGetAllAsync.mock.calls[0][0];
    expect(sql).toContain("status IN ('pending', 'scanning', 'failed')");
  });

  it('writes scanning→pending correction back to the DB', async () => {
    mockGetAllAsync.mockResolvedValue([]);
    await loadPendingScanJobs();
    expect(mockExecAsync).toHaveBeenCalledTimes(1);
    const sql: string = mockExecAsync.mock.calls[0][0];
    expect(sql).toContain("SET status = 'pending'");
    expect(sql).toContain("WHERE status = 'scanning'");
  });
});

describe('pruneOldFailedJobs', () => {
  it('calls withDbWrite and deletes failed rows older than maxAgeMs', async () => {
    await pruneOldFailedJobs(30 * 24 * 60 * 60 * 1000);
    expect(withDbWrite).toHaveBeenCalledTimes(1);
    expect(mockExecAsync).toHaveBeenCalledTimes(1);
    const sql: string = mockExecAsync.mock.calls[0][0];
    expect(sql).toContain('DELETE FROM lyrics_scan_jobs');
    expect(sql).toContain("status = 'failed'");
    expect(sql).toContain('updated_at <');
  });
});
