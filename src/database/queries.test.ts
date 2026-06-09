jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///app/documents/',
  deleteAsync: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../utils/timestampParser', () => ({
  normalizeLyrics: (lines: unknown[]) => lines,
}));

jest.mock('./db', () => ({
  getDatabase: jest.fn(),
  withDbRead: jest.fn(),
  withDbWrite: jest.fn(),
  withDbSafe: jest.fn(),
}));

import { getDatabase, withDbRead, withDbWrite, withDbSafe } from './db';
import * as FileSystem from 'expo-file-system/legacy';
import {
  getAllSongs,
  getHiddenSongs,
  getSongById,
  insertSong,
  updateSong,
  deleteSong,
  hideSong,
  updatePlayStats,
  searchSongs,
  getLastPlayedSong,
  clearAllData,
} from './queries';
import { Song } from '../types/song';

const mockRunAsync = jest.fn().mockResolvedValue(undefined);
const mockExecAsync = jest.fn().mockResolvedValue(undefined);
const mockGetAllAsync = jest.fn().mockResolvedValue([]);
const mockGetFirstAsync = jest.fn().mockResolvedValue(null);

const mockDb = {
  runAsync: mockRunAsync,
  execAsync: mockExecAsync,
  getAllAsync: mockGetAllAsync,
  getFirstAsync: mockGetFirstAsync,
};

beforeEach(() => {
  jest.clearAllMocks();
  (getDatabase as jest.Mock).mockResolvedValue(mockDb);
  (withDbRead as jest.Mock).mockImplementation(async (op: (db: typeof mockDb) => Promise<unknown>) => op(mockDb));
  (withDbWrite as jest.Mock).mockImplementation(async (op: (db: typeof mockDb) => Promise<unknown>) => op(mockDb));
  (withDbSafe as jest.Mock).mockImplementation(async (op: (db: typeof mockDb) => Promise<unknown>) => op(mockDb));
  mockGetAllAsync.mockResolvedValue([]);
  mockGetFirstAsync.mockResolvedValue(null);
});

const baseSongRow = {
  id: 'song-1',
  title: 'Test Song',
  artist: 'Test Artist',
  album: 'Test Album',
  gradient_id: 'dynamic',
  duration: 180,
  date_created: '2024-01-01T00:00:00.000Z',
  date_modified: '2024-01-01T00:00:00.000Z',
  play_count: 5,
  last_played: '2024-06-01T00:00:00.000Z',
  scroll_speed: 50,
  cover_image_uri: null,
  lyrics_align: 'left',
  text_case: 'titlecase',
  audio_uri: null,
  is_liked: 0,
  is_hidden: 0,
};

const makeSong = (overrides: Partial<Song> = {}): Song => ({
  id: 'song-1',
  title: 'Test Song',
  artist: 'Test Artist',
  album: 'Test Album',
  gradientId: 'dynamic',
  duration: 180,
  dateCreated: '2024-01-01T00:00:00.000Z',
  dateModified: '2024-01-01T00:00:00.000Z',
  playCount: 0,
  lyrics: [],
  ...overrides,
});

// ─── getAllSongs ──────────────────────────────────────────────────────────────

describe('getAllSongs', () => {
  it('returns an empty array when there are no songs', async () => {
    mockGetAllAsync.mockResolvedValue([]);
    const result = await getAllSongs();
    expect(result).toEqual([]);
  });

  it('queries only non-hidden songs (is_hidden = 0)', async () => {
    mockGetAllAsync.mockResolvedValue([]);
    await getAllSongs();
    const sql: string = mockGetAllAsync.mock.calls[0][0];
    expect(sql).toContain('is_hidden = 0');
  });

  it('maps snake_case DB columns to camelCase Song fields', async () => {
    mockGetAllAsync.mockResolvedValue([baseSongRow]);
    const [song] = await getAllSongs();
    expect(song.id).toBe('song-1');
    expect(song.gradientId).toBe('dynamic');
    expect(song.dateCreated).toBe('2024-01-01T00:00:00.000Z');
    expect(song.dateModified).toBe('2024-01-01T00:00:00.000Z');
    expect(song.playCount).toBe(5);
    expect(song.lastPlayed).toBe('2024-06-01T00:00:00.000Z');
  });

  it('converts is_liked = 1 to isLiked = true', async () => {
    mockGetAllAsync.mockResolvedValue([{ ...baseSongRow, is_liked: 1 }]);
    const [song] = await getAllSongs();
    expect(song.isLiked).toBe(true);
  });

  it('converts is_liked = 0 to isLiked = false', async () => {
    mockGetAllAsync.mockResolvedValue([{ ...baseSongRow, is_liked: 0 }]);
    const [song] = await getAllSongs();
    expect(song.isLiked).toBe(false);
  });

  it('maps null artist to undefined', async () => {
    mockGetAllAsync.mockResolvedValue([{ ...baseSongRow, artist: null }]);
    const [song] = await getAllSongs();
    expect(song.artist).toBeUndefined();
  });

  it('maps null album to undefined', async () => {
    mockGetAllAsync.mockResolvedValue([{ ...baseSongRow, album: null }]);
    const [song] = await getAllSongs();
    expect(song.album).toBeUndefined();
  });

  it('maps null last_played to undefined', async () => {
    mockGetAllAsync.mockResolvedValue([{ ...baseSongRow, last_played: null }]);
    const [song] = await getAllSongs();
    expect(song.lastPlayed).toBeUndefined();
  });

  it('maps null cover_image_uri to undefined', async () => {
    mockGetAllAsync.mockResolvedValue([{ ...baseSongRow, cover_image_uri: null }]);
    const [song] = await getAllSongs();
    expect(song.coverImageUri).toBeUndefined();
  });

  it('defaults scroll_speed to 50 when null', async () => {
    mockGetAllAsync.mockResolvedValue([{ ...baseSongRow, scroll_speed: null }]);
    const [song] = await getAllSongs();
    expect(song.scrollSpeed).toBe(50);
  });

  it('defaults lyricsAlign to left when null', async () => {
    mockGetAllAsync.mockResolvedValue([{ ...baseSongRow, lyrics_align: null }]);
    const [song] = await getAllSongs();
    expect(song.lyricsAlign).toBe('left');
  });

  it('returns lyrics as empty array (list query does not load lyrics)', async () => {
    mockGetAllAsync.mockResolvedValue([baseSongRow]);
    const [song] = await getAllSongs();
    expect(song.lyrics).toEqual([]);
  });

  it('orders results by date_created DESC', async () => {
    mockGetAllAsync.mockResolvedValue([]);
    await getAllSongs();
    const sql: string = mockGetAllAsync.mock.calls[0][0];
    expect(sql).toContain('ORDER BY date_created DESC');
  });
});

// ─── getHiddenSongs ───────────────────────────────────────────────────────────

describe('getHiddenSongs', () => {
  it('queries only hidden songs (is_hidden = 1)', async () => {
    mockGetAllAsync.mockResolvedValue([]);
    await getHiddenSongs();
    const sql: string = mockGetAllAsync.mock.calls[0][0];
    expect(sql).toContain('is_hidden = 1');
  });

  it('maps is_hidden = 1 to isHidden = true', async () => {
    mockGetAllAsync.mockResolvedValue([{ ...baseSongRow, is_hidden: 1 }]);
    const [song] = await getHiddenSongs();
    expect(song.isHidden).toBe(true);
  });

  it('returns an empty array when no hidden songs exist', async () => {
    mockGetAllAsync.mockResolvedValue([]);
    const result = await getHiddenSongs();
    expect(result).toEqual([]);
  });
});

// ─── getSongById ──────────────────────────────────────────────────────────────

describe('getSongById', () => {
  it('returns null when the song does not exist', async () => {
    mockGetFirstAsync.mockResolvedValue(null);
    const result = await getSongById('missing');
    expect(result).toBeNull();
  });

  it('maps the song row to a Song object', async () => {
    mockGetFirstAsync.mockResolvedValue(baseSongRow);
    mockGetAllAsync.mockResolvedValue([]);
    const song = await getSongById('song-1');
    expect(song).not.toBeNull();
    expect(song!.id).toBe('song-1');
    expect(song!.gradientId).toBe('dynamic');
    expect(song!.isLiked).toBe(false);
  });

  it('attaches lyrics from the lyrics table', async () => {
    mockGetFirstAsync.mockResolvedValue(baseSongRow);
    mockGetAllAsync.mockResolvedValue([
      { id: 1, timestamp: 0, text: 'Hello world', line_order: 0 },
      { id: 2, timestamp: 5.5, text: 'Second line', line_order: 1 },
    ]);
    const song = await getSongById('song-1');
    expect(song!.lyrics).toHaveLength(2);
    expect(song!.lyrics[0].text).toBe('Hello world');
    expect(song!.lyrics[1].timestamp).toBe(5.5);
  });

  it('maps null audio_uri to undefined', async () => {
    mockGetFirstAsync.mockResolvedValue({ ...baseSongRow, audio_uri: null });
    mockGetAllAsync.mockResolvedValue([]);
    const song = await getSongById('song-1');
    expect(song!.audioUri).toBeUndefined();
  });

  it('queries using a parameterized id (not string concat)', async () => {
    mockGetFirstAsync.mockResolvedValue(null);
    await getSongById("song'injection");
    const query: string = mockGetFirstAsync.mock.calls[0][0];
    const params: unknown[] = mockGetFirstAsync.mock.calls[0][1];
    // The SQL must use a placeholder, not interpolated value
    expect(query).toContain('?');
    expect(params).toContain("song'injection");
  });
});

// ─── insertSong ───────────────────────────────────────────────────────────────

describe('insertSong', () => {
  it('inserts the song with a parameterized query', async () => {
    const song = makeSong();
    await insertSong(song);
    expect(mockRunAsync).toHaveBeenCalledTimes(1);
    const [sql, params] = mockRunAsync.mock.calls[0];
    expect(sql).toContain('INSERT OR REPLACE INTO songs');
    expect(params).toContain('song-1');
    expect(params).toContain('Test Song');
  });

  it('inserts is_liked = 1 for liked songs', async () => {
    await insertSong(makeSong({ isLiked: true }));
    const params: unknown[] = mockRunAsync.mock.calls[0][1];
    expect(params).toContain(1);
  });

  it('inserts is_liked = 0 for non-liked songs', async () => {
    await insertSong(makeSong({ isLiked: false }));
    const params: unknown[] = mockRunAsync.mock.calls[0][1];
    expect(params).toContain(0);
  });

  it('inserts null for missing artist', async () => {
    await insertSong(makeSong({ artist: undefined }));
    const params: unknown[] = mockRunAsync.mock.calls[0][1];
    expect(params).toContain(null);
  });

  it('inserts each lyric line after the song row', async () => {
    const song = makeSong({
      lyrics: [
        { id: 1, timestamp: 0, text: 'Line 1', lineOrder: 0 },
        { id: 2, timestamp: 5, text: 'Line 2', lineOrder: 1 },
      ],
    });
    await insertSong(song);
    // First call = song insert, subsequent calls = lyric inserts
    expect(mockRunAsync).toHaveBeenCalledTimes(3);
    const lyricSql: string = mockRunAsync.mock.calls[1][0];
    expect(lyricSql).toContain('INSERT INTO lyrics');
  });

  it('inserts no lyrics when song has no lyrics', async () => {
    await insertSong(makeSong({ lyrics: [] }));
    // Only the song INSERT, no lyric INSERTs
    expect(mockRunAsync).toHaveBeenCalledTimes(1);
  });

  it('defaults scrollSpeed to 50 when not provided', async () => {
    await insertSong(makeSong({ scrollSpeed: undefined }));
    const params: unknown[] = mockRunAsync.mock.calls[0][1];
    expect(params).toContain(50);
  });
});

// ─── updateSong ───────────────────────────────────────────────────────────────

describe('updateSong', () => {
  it('calls withDbWrite with an UPDATE statement', async () => {
    await updateSong(makeSong());
    expect(withDbWrite).toHaveBeenCalledTimes(1);
    const sql: string = mockRunAsync.mock.calls[0][0];
    expect(sql).toContain('UPDATE songs SET');
    expect(sql).toContain('WHERE id = ?');
  });

  it('uses parameterized query (song id in params, not interpolated)', async () => {
    await updateSong(makeSong());
    const params: unknown[] = mockRunAsync.mock.calls[0][1];
    expect(params[params.length - 1]).toBe('song-1');
  });

  it('deletes and re-inserts lyrics when lyrics are provided', async () => {
    const song = makeSong({ lyrics: [{ id: 1, timestamp: 0, text: 'Hello', lineOrder: 0 }] });
    await updateSong(song);
    const calls = mockRunAsync.mock.calls.map((c: [string, ...unknown[]]) => c[0]);
    expect(calls.some((sql: string) => sql.includes('DELETE FROM lyrics'))).toBe(true);
    expect(calls.some((sql: string) => sql.includes('INSERT INTO lyrics'))).toBe(true);
  });

  it('does not touch lyrics when lyrics array is empty', async () => {
    await updateSong(makeSong({ lyrics: [] }));
    const calls = mockRunAsync.mock.calls.map((c: [string, ...unknown[]]) => c[0]);
    expect(calls.some((sql: string) => sql.includes('DELETE FROM lyrics'))).toBe(false);
  });

  it('sets is_liked = 1 for liked songs', async () => {
    await updateSong(makeSong({ isLiked: true }));
    const params: unknown[] = mockRunAsync.mock.calls[0][1];
    expect(params).toContain(1);
  });
});

// ─── deleteSong ───────────────────────────────────────────────────────────────

describe('deleteSong', () => {
  it('deletes lyrics and song rows from the DB', async () => {
    // getSongById uses getDatabase() — returns the song with no files to delete
    mockGetFirstAsync.mockResolvedValue({ ...baseSongRow, audio_uri: null, cover_image_uri: null });
    mockGetAllAsync.mockResolvedValue([]);

    await deleteSong('song-1');

    const runCalls = mockRunAsync.mock.calls.map((c: [string, ...unknown[]]) => c[0]);
    expect(runCalls.some((sql: string) => sql.includes('DELETE FROM lyrics'))).toBe(true);
    expect(runCalls.some((sql: string) => sql.includes('DELETE FROM songs'))).toBe(true);
  });

  it('deletes the audio file when it lives inside documentDirectory', async () => {
    const audioUri = 'file:///app/documents/music/song-1.mp3';
    mockGetFirstAsync.mockResolvedValue({ ...baseSongRow, audio_uri: audioUri, cover_image_uri: null });
    mockGetAllAsync.mockResolvedValue([]);

    await deleteSong('song-1');

    expect(FileSystem.deleteAsync).toHaveBeenCalledWith(audioUri, { idempotent: true });
  });

  it('does not call deleteAsync for an audio URI outside documentDirectory', async () => {
    const audioUri = 'content://media/external/audio/1234';
    mockGetFirstAsync.mockResolvedValue({ ...baseSongRow, audio_uri: audioUri, cover_image_uri: null });
    mockGetAllAsync.mockResolvedValue([]);

    await deleteSong('song-1');

    expect(FileSystem.deleteAsync).not.toHaveBeenCalled();
  });

  it('deletes the cover image when it lives inside documentDirectory', async () => {
    const coverUri = 'file:///app/documents/covers/song-1.jpg';
    mockGetFirstAsync.mockResolvedValue({ ...baseSongRow, audio_uri: null, cover_image_uri: coverUri });
    mockGetAllAsync.mockResolvedValue([]);

    await deleteSong('song-1');

    expect(FileSystem.deleteAsync).toHaveBeenCalledWith(coverUri, { idempotent: true });
  });

  it('still deletes DB rows even when the song is not found (getSongById returns null)', async () => {
    mockGetFirstAsync.mockResolvedValue(null);

    await deleteSong('ghost-song');

    const runCalls = mockRunAsync.mock.calls.map((c: [string, ...unknown[]]) => c[0]);
    expect(runCalls.some((sql: string) => sql.includes('DELETE FROM songs'))).toBe(true);
  });
});

// ─── hideSong ────────────────────────────────────────────────────────────────

describe('hideSong', () => {
  it('sets is_hidden = 1 when hide = true', async () => {
    await hideSong('song-1', true);
    const params: unknown[] = mockRunAsync.mock.calls[0][1];
    expect(params[0]).toBe(1);
    expect(params[1]).toBe('song-1');
  });

  it('sets is_hidden = 0 when hide = false', async () => {
    await hideSong('song-1', false);
    const params: unknown[] = mockRunAsync.mock.calls[0][1];
    expect(params[0]).toBe(0);
  });

  it('uses a parameterized query', async () => {
    await hideSong('song-1', true);
    const sql: string = mockRunAsync.mock.calls[0][0];
    expect(sql).toContain('UPDATE songs SET is_hidden = ?');
    expect(sql).toContain('WHERE id = ?');
  });
});

// ─── updatePlayStats ─────────────────────────────────────────────────────────

describe('updatePlayStats', () => {
  it('increments play_count and updates last_played', async () => {
    await updatePlayStats('song-1');
    const sql: string = mockRunAsync.mock.calls[0][0];
    expect(sql).toContain('play_count = play_count + 1');
    expect(sql).toContain('last_played = ?');
    expect(sql).toContain('WHERE id = ?');
  });

  it('passes the song id as a parameter', async () => {
    await updatePlayStats('song-1');
    const params: unknown[] = mockRunAsync.mock.calls[0][1];
    expect(params[params.length - 1]).toBe('song-1');
  });
});

// ─── searchSongs ─────────────────────────────────────────────────────────────

describe('searchSongs', () => {
  it('searches title, artist, album, and lyrics text', async () => {
    mockGetAllAsync.mockResolvedValue([]);
    await searchSongs('hello');
    const sql: string = mockGetAllAsync.mock.calls[0][0];
    expect(sql).toContain('s.title LIKE ?');
    expect(sql).toContain('s.artist LIKE ?');
    expect(sql).toContain('s.album LIKE ?');
    expect(sql).toContain('l.text LIKE ?');
  });

  it('wraps the query in % wildcards for LIKE matching', async () => {
    mockGetAllAsync.mockResolvedValue([]);
    await searchSongs('hello');
    const params: unknown[] = mockGetAllAsync.mock.calls[0][1];
    expect(params).toContain('%hello%');
  });

  it('returns an empty array when there are no matches', async () => {
    mockGetAllAsync.mockResolvedValue([]);
    const result = await searchSongs('zzznomatch');
    expect(result).toEqual([]);
  });

  it('uses DISTINCT to avoid duplicate results from lyrics join', async () => {
    mockGetAllAsync.mockResolvedValue([]);
    await searchSongs('hello');
    const sql: string = mockGetAllAsync.mock.calls[0][0];
    expect(sql.toUpperCase()).toContain('DISTINCT');
  });
});

// ─── getLastPlayedSong ────────────────────────────────────────────────────────

describe('getLastPlayedSong', () => {
  it('returns null when no song has been played', async () => {
    mockGetFirstAsync.mockResolvedValue(null);
    const result = await getLastPlayedSong();
    expect(result).toBeNull();
  });

  it('fetches the song with the most recent last_played', async () => {
    // First getFirstAsync call returns the { id } row; second call (via getSongById) returns the full song row
    mockGetFirstAsync
      .mockResolvedValueOnce({ id: 'song-1' })
      .mockResolvedValueOnce(baseSongRow);
    mockGetAllAsync.mockResolvedValue([]);

    const song = await getLastPlayedSong();
    expect(song).not.toBeNull();
    expect(song!.id).toBe('song-1');
  });

  it('queries with ORDER BY last_played DESC LIMIT 1', async () => {
    mockGetFirstAsync.mockResolvedValue(null);
    await getLastPlayedSong();
    const sql: string = mockGetFirstAsync.mock.calls[0][0];
    expect(sql).toContain('ORDER BY last_played DESC');
    expect(sql).toContain('LIMIT 1');
  });
});

// ─── clearAllData ─────────────────────────────────────────────────────────────

describe('clearAllData', () => {
  it('deletes all rows from lyrics and songs tables', async () => {
    await clearAllData();
    const sql: string = mockExecAsync.mock.calls[0][0];
    expect(sql).toContain('DELETE FROM lyrics');
    expect(sql).toContain('DELETE FROM songs');
  });
});
