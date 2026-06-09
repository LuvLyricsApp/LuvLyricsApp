import { withDbWrite, withDbRead, esc } from './db';
import {
  insertJob,
  updateJobStatus,
  deleteJob,
  deleteCompletedJobs,
  loadAllJobs,
} from './downloadQueueQueries';
import type { QueueItem } from '../store/downloadQueueStore';

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

const baseSong = {
  id: 'song-1',
  title: 'Test Song',
  artist: 'Test Artist',
  highResArt: 'https://example.com/art.jpg',
  downloadUrl: 'https://example.com/song.mp3',
  source: 'Saavn' as const,
};

const baseItem: QueueItem = {
  id: 'song-1',
  song: baseSong,
  status: 'pending',
  progress: 0,
};

describe('insertJob', () => {
  it('calls withDbWrite with INSERT OR REPLACE', async () => {
    await insertJob(baseItem);
    expect(withDbWrite).toHaveBeenCalledTimes(1);
    expect(mockExecAsync).toHaveBeenCalledTimes(1);
    const sql: string = mockExecAsync.mock.calls[0][0];
    expect(sql).toContain('INSERT OR REPLACE INTO download_jobs');
    expect(sql).toContain("'song-1'");
    expect(sql).toContain("'pending'");
  });

  it('inserts NULL for targetPlaylistId when not provided', async () => {
    await insertJob(baseItem);
    const sql: string = mockExecAsync.mock.calls[0][0];
    expect(sql).toContain('NULL');
  });

  it('inserts quoted targetPlaylistId when provided', async () => {
    await insertJob({ ...baseItem, targetPlaylistId: 'pl-42' });
    const sql: string = mockExecAsync.mock.calls[0][0];
    expect(sql).toContain("'pl-42'");
  });

  it('escapes single quotes in song JSON (title)', async () => {
    const song = { ...baseSong, title: "It's a Song" };
    await insertJob({ ...baseItem, song });
    const sql: string = mockExecAsync.mock.calls[0][0];
    expect(sql).toContain("It''s a Song");
  });

  it('escapes single quotes in targetPlaylistId', async () => {
    await insertJob({ ...baseItem, targetPlaylistId: "pl'weird" });
    const sql: string = mockExecAsync.mock.calls[0][0];
    expect(sql).toContain("pl''weird");
  });

  it('uses sortOrder 0 when not provided', async () => {
    await insertJob(baseItem);
    const sql: string = mockExecAsync.mock.calls[0][0];
    expect(sql).toContain(', 0,');
  });

  it('uses provided sortOrder', async () => {
    await insertJob({ ...baseItem, sortOrder: 7 });
    const sql: string = mockExecAsync.mock.calls[0][0];
    expect(sql).toContain(', 7,');
  });
});

describe('updateJobStatus', () => {
  it('calls withDbWrite and updates status', async () => {
    await updateJobStatus('song-1', 'downloading');
    expect(withDbWrite).toHaveBeenCalledTimes(1);
    const sql: string = mockExecAsync.mock.calls[0][0];
    expect(sql).toContain('UPDATE download_jobs');
    expect(sql).toContain("'downloading'");
    expect(sql).toContain("'song-1'");
  });

  it('sets error to NULL when no error provided', async () => {
    await updateJobStatus('song-1', 'failed');
    const sql: string = mockExecAsync.mock.calls[0][0];
    expect(sql).toContain('error = NULL');
  });

  it('inserts a quoted error string when error is provided', async () => {
    await updateJobStatus('song-1', 'failed', 'Network timeout');
    const sql: string = mockExecAsync.mock.calls[0][0];
    expect(sql).toContain("'Network timeout'");
  });

  it('escapes single quotes in the error string', async () => {
    await updateJobStatus('song-1', 'failed', "couldn't connect");
    const sql: string = mockExecAsync.mock.calls[0][0];
    expect(sql).toContain("couldn''t connect");
  });
});

describe('deleteJob', () => {
  it('calls withDbWrite and deletes by id', async () => {
    await deleteJob('song-1');
    expect(withDbWrite).toHaveBeenCalledTimes(1);
    const sql: string = mockExecAsync.mock.calls[0][0];
    expect(sql).toContain('DELETE FROM download_jobs');
    expect(sql).toContain("'song-1'");
  });

  it('escapes single quotes in song id', async () => {
    await deleteJob("song'weird");
    const sql: string = mockExecAsync.mock.calls[0][0];
    expect(sql).toContain("song''weird");
  });
});

describe('deleteCompletedJobs', () => {
  it('deletes only rows with status = completed', async () => {
    await deleteCompletedJobs();
    expect(withDbWrite).toHaveBeenCalledTimes(1);
    const sql: string = mockExecAsync.mock.calls[0][0];
    expect(sql).toContain('DELETE FROM download_jobs');
    expect(sql).toContain("status = 'completed'");
  });
});

describe('loadAllJobs', () => {
  it('returns empty array when there are no rows', async () => {
    mockGetAllAsync.mockResolvedValue([]);
    const result = await loadAllJobs();
    expect(result).toEqual([]);
  });

  it('resets downloading rows to pending with progress = 0', async () => {
    mockGetAllAsync.mockResolvedValue([{
      id: 'song-1',
      song_json: JSON.stringify(baseSong),
      status: 'downloading',
      progress: 60,
      target_playlist_id: null,
      sort_order: 0,
      error: null,
    }]);
    const [item] = await loadAllJobs();
    expect(item.status).toBe('pending');
    expect(item.progress).toBe(0);
    expect(item.stageStatus).toBe('Waiting...');
  });

  it('resets staging rows to pending', async () => {
    mockGetAllAsync.mockResolvedValue([{
      id: 'song-1',
      song_json: JSON.stringify(baseSong),
      status: 'staging',
      progress: 15,
      target_playlist_id: null,
      sort_order: 0,
      error: null,
    }]);
    const [item] = await loadAllJobs();
    expect(item.status).toBe('pending');
    expect(item.progress).toBe(0);
  });

  it('keeps paused rows as-is', async () => {
    mockGetAllAsync.mockResolvedValue([{
      id: 'song-1',
      song_json: JSON.stringify(baseSong),
      status: 'paused',
      progress: 40,
      target_playlist_id: null,
      sort_order: 0,
      error: null,
    }]);
    const [item] = await loadAllJobs();
    expect(item.status).toBe('paused');
    expect(item.progress).toBe(40);
  });

  it('keeps failed rows as-is with their error', async () => {
    mockGetAllAsync.mockResolvedValue([{
      id: 'song-1',
      song_json: JSON.stringify(baseSong),
      status: 'failed',
      progress: 0,
      target_playlist_id: null,
      sort_order: 0,
      error: 'timeout',
    }]);
    const [item] = await loadAllJobs();
    expect(item.status).toBe('failed');
    expect(item.error).toBe('timeout');
  });

  it('maps null error to undefined', async () => {
    mockGetAllAsync.mockResolvedValue([{
      id: 'song-1',
      song_json: JSON.stringify(baseSong),
      status: 'pending',
      progress: 0,
      target_playlist_id: null,
      sort_order: 0,
      error: null,
    }]);
    const [item] = await loadAllJobs();
    expect(item.error).toBeUndefined();
  });

  it('maps target_playlist_id to targetPlaylistId', async () => {
    mockGetAllAsync.mockResolvedValue([{
      id: 'song-1',
      song_json: JSON.stringify(baseSong),
      status: 'pending',
      progress: 0,
      target_playlist_id: 'pl-1',
      sort_order: 5,
      error: null,
    }]);
    const [item] = await loadAllJobs();
    expect(item.targetPlaylistId).toBe('pl-1');
    expect(item.sortOrder).toBe(5);
  });

  it('maps null target_playlist_id to undefined', async () => {
    mockGetAllAsync.mockResolvedValue([{
      id: 'song-1',
      song_json: JSON.stringify(baseSong),
      status: 'pending',
      progress: 0,
      target_playlist_id: null,
      sort_order: 0,
      error: null,
    }]);
    const [item] = await loadAllJobs();
    expect(item.targetPlaylistId).toBeUndefined();
  });

  it('parses song_json back to the original song object', async () => {
    mockGetAllAsync.mockResolvedValue([{
      id: 'song-1',
      song_json: JSON.stringify(baseSong),
      status: 'pending',
      progress: 0,
      target_playlist_id: null,
      sort_order: 0,
      error: null,
    }]);
    const [item] = await loadAllJobs();
    expect(item.song).toEqual(baseSong);
  });

  it('queries with ORDER BY created_at ASC', async () => {
    mockGetAllAsync.mockResolvedValue([]);
    await loadAllJobs();
    const sql: string = mockGetAllAsync.mock.calls[0][0];
    expect(sql).toContain('ORDER BY created_at ASC');
  });

  it('does not set stageStatus for kept-as-is rows', async () => {
    mockGetAllAsync.mockResolvedValue([{
      id: 'song-1',
      song_json: JSON.stringify(baseSong),
      status: 'paused',
      progress: 0,
      target_playlist_id: null,
      sort_order: 0,
      error: null,
    }]);
    const [item] = await loadAllJobs();
    expect(item.stageStatus).toBeUndefined();
  });
});
