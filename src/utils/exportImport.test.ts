jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///documents/',
  writeAsStringAsync: jest.fn(),
  readAsStringAsync: jest.fn(),
  getInfoAsync: jest.fn().mockResolvedValue({ exists: false }),
  EncodingType: {
    UTF8: 'utf8',
  },
}));

jest.mock('expo-document-picker', () => ({
  getDocumentAsync: jest.fn(),
}));

jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn(),
  shareAsync: jest.fn(),
}));

jest.mock('../database/queries', () => ({
  getAllSongsWithLyrics: jest.fn(),
  insertSong: jest.fn(),
  clearAllData: jest.fn(),
}));

import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { getAllSongsWithLyrics } from '../database/queries';
import { exportAllSongs, sanitizeFilename, serializeLrc, exportSongAsLrc, shareExportedFile } from './exportImport';

const mockedWriteAsStringAsync = jest.mocked(FileSystem.writeAsStringAsync);
const mockedGetAllSongsWithLyrics = jest.mocked(getAllSongsWithLyrics);

describe('sanitizeFilename', () => {
  it('leaves clean names untouched', () => {
    expect(sanitizeFilename('lyricflow-backup-1234567890')).toBe('lyricflow-backup-1234567890');
  });

  it('replaces colon', () => {
    expect(sanitizeFilename('My Song: Vol. 2')).toBe('My Song_ Vol. 2');
  });

  it('replaces forward slash', () => {
    expect(sanitizeFilename('AC/DC Greatest')).toBe('AC_DC Greatest');
  });

  it('replaces backslash', () => {
    expect(sanitizeFilename('path\\to\\song')).toBe('path_to_song');
  });

  it('replaces all Windows-reserved characters', () => {
    expect(sanitizeFilename('a\\b/c:d*e?f"g<h>i|j')).toBe('a_b_c_d_e_f_g_h_i_j');
  });

  it('strips control characters', () => {
    expect(sanitizeFilename('Song\x00Name\x1f')).toBe('SongName');
  });

  it('trims trailing spaces', () => {
    expect(sanitizeFilename('My Song   ')).toBe('My Song');
  });

  it('trims trailing dots', () => {
    expect(sanitizeFilename('My Song...')).toBe('My Song');
  });

  it('trims mixed trailing dots and spaces', () => {
    expect(sanitizeFilename('My Song . . ')).toBe('My Song');
  });

  it('truncates names over 200 characters', () => {
    const result = sanitizeFilename('a'.repeat(250));
    expect(result.length).toBeLessThanOrEqual(200);
  });

  it('does not end with a dot after truncation', () => {
    const result = sanitizeFilename('a'.repeat(198) + '..');
    expect(result.endsWith('.')).toBe(false);
  });

  it('returns fallback for empty string', () => {
    expect(sanitizeFilename('')).toBe('export');
  });

  it('returns fallback when input is only dots and spaces', () => {
    expect(sanitizeFilename('   ...')).toBe('export');
  });

  it('returns fallback for Windows device names', () => {
    expect(sanitizeFilename('CON')).toBe('export');
    expect(sanitizeFilename('LPT1.txt')).toBe('export');
  });

  it('produces identical output on repeated calls', () => {
    const input = 'Tum Hi Ho: Reprise / Final*';
    expect(sanitizeFilename(input)).toBe(sanitizeFilename(input));
  });
});

describe('serializeLrc', () => {
  const syncedLyrics = [
    { id: 1, timestamp: 62.5, text: 'Hello world', lineOrder: 0 },
    { id: 2, timestamp: 65.0, text: 'Second line', lineOrder: 1 },
    { id: 3, timestamp: 68.05, text: 'Third line', lineOrder: 2 },
  ];

  const plainLyrics = [
    { id: 1, timestamp: 0, text: 'Hello world', lineOrder: 0 },
    { id: 2, timestamp: 0, text: 'Second line', lineOrder: 1 },
  ];

  it('serializes synced lyrics with [mm:ss.xx] format', () => {
    const song = { title: 'Test', artist: 'Tester', lyrics: syncedLyrics } as any;
    const result = serializeLrc(song);
    expect(result).toBe('[01:02.50]Hello world\n[01:05.00]Second line\n[01:08.05]Third line');
  });

  it('serializes plain lyrics as plain text lines', () => {
    const song = { title: 'Test', artist: 'Tester', lyrics: plainLyrics } as any;
    const result = serializeLrc(song);
    expect(result).toBe('Hello world\nSecond line');
  });

  it('returns empty string for empty lyrics', () => {
    const song = { title: 'Test', artist: 'Tester', lyrics: [] } as any;
    expect(serializeLrc(song)).toBe('');
  });

  it('handles special characters in lyrics text', () => {
    const lyrics = [{ id: 1, timestamp: 1.0, text: 'Line with < & " quotes', lineOrder: 0 }];
    const song = { title: 'Test', artist: 'Tester', lyrics } as any;
    expect(serializeLrc(song)).toContain('Line with < & " quotes');
  });
});

describe('exportSongAsLrc', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    jest.mocked(FileSystem.writeAsStringAsync).mockReset();
  });

  it('writes LRC content to a sanitized filename', async () => {
    jest.mocked(FileSystem.writeAsStringAsync).mockResolvedValue();

    const song = {
      id: 's1',
      title: 'Test Song',
      artist: 'Test Artist',
      lyrics: [
        { id: 1, timestamp: 10.0, text: 'Line one', lineOrder: 0 },
      ],
    } as any;

    const fileUri = await exportSongAsLrc(song);

    expect(fileUri).toBe('file:///documents/Test Artist - Test Song.lrc');
    expect(jest.mocked(FileSystem.writeAsStringAsync)).toHaveBeenCalledWith(
      'file:///documents/Test Artist - Test Song.lrc',
      '[00:10.00]Line one',
      { encoding: FileSystem.EncodingType.UTF8 }
    );
  });

  it('uses fallback for missing artist/title', async () => {
    jest.mocked(FileSystem.writeAsStringAsync).mockResolvedValue();

    const song = {
      id: 's2',
      title: '',
      artist: '',
      lyrics: [],
    } as any;

    const fileUri = await exportSongAsLrc(song);

    expect(fileUri).toMatch(/Unknown Artist - Unknown Title\.lrc$/);
  });

  it('sanitizes special characters in filename', async () => {
    jest.mocked(FileSystem.writeAsStringAsync).mockResolvedValue();

    const song = {
      id: 's3',
      title: 'Song: Reprise/Final',
      artist: 'AC/DC',
      lyrics: [],
    } as any;

    const fileUri = await exportSongAsLrc(song);

    expect(fileUri).toContain('AC_DC - Song_ Reprise_Final.lrc');
  });
});

describe('shareExportedFile', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('uses default JSON mime type when not specified', async () => {
    jest.mocked(Sharing.isAvailableAsync).mockResolvedValue(true);
    const shareAsync = jest.mocked(Sharing.shareAsync).mockResolvedValue();

    await shareExportedFile('file:///test.json');

    expect(shareAsync).toHaveBeenCalledWith('file:///test.json', {
      mimeType: 'application/json',
      dialogTitle: 'Export LyricFlow Backup',
    });
  });

  it('accepts custom mime type and dialog title', async () => {
    jest.mocked(Sharing.isAvailableAsync).mockResolvedValue(true);
    const shareAsync = jest.mocked(Sharing.shareAsync).mockResolvedValue();

    await shareExportedFile('file:///test.lrc', 'text/plain', 'Export LRC File');

    expect(shareAsync).toHaveBeenCalledWith('file:///test.lrc', {
      mimeType: 'text/plain',
      dialogTitle: 'Export LRC File',
    });
  });

  it('throws when sharing is unavailable', async () => {
    jest.mocked(Sharing.isAvailableAsync).mockResolvedValue(false);

    await expect(shareExportedFile('file:///test.lrc')).rejects.toThrow('Sharing is not available on this device');
  });
});

describe('exportSongAsLrc dedup', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    jest.mocked(FileSystem.writeAsStringAsync).mockReset();
  });

  it('appends (1) suffix when file already exists', async () => {
    jest.mocked(FileSystem.getInfoAsync)
      .mockResolvedValueOnce({ exists: true } as any)
      .mockResolvedValueOnce({ exists: false } as any);
    jest.mocked(FileSystem.writeAsStringAsync).mockResolvedValue();

    const song = {
      id: 's1',
      title: 'Test Song',
      artist: 'Test Artist',
      lyrics: [],
    } as any;

    const fileUri = await exportSongAsLrc(song);

    expect(fileUri).toBe('file:///documents/Test Artist - Test Song (1).lrc');
  });

  it('increments suffix until a free name is found', async () => {
    jest.mocked(FileSystem.getInfoAsync)
      .mockResolvedValueOnce({ exists: true } as any)
      .mockResolvedValueOnce({ exists: true } as any)
      .mockResolvedValueOnce({ exists: false } as any);
    jest.mocked(FileSystem.writeAsStringAsync).mockResolvedValue();

    const song = {
      id: 's2',
      title: 'Test Song',
      artist: 'Test Artist',
      lyrics: [],
    } as any;

    const fileUri = await exportSongAsLrc(song);

    expect(fileUri).toBe('file:///documents/Test Artist - Test Song (2).lrc');
  });
});

describe('exportAllSongs', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    mockedWriteAsStringAsync.mockReset();
    mockedGetAllSongsWithLyrics.mockReset();
  });

  it('writes the export payload to a sanitized filename', async () => {
    mockedGetAllSongsWithLyrics.mockResolvedValue([
      {
        id: 'song-1',
        title: 'Test Song',
        artist: 'Test Artist',
        lyrics: 'Hello world',
      },
    ] as any);
    mockedWriteAsStringAsync.mockResolvedValue();
    jest.spyOn(Date.prototype, 'toISOString').mockReturnValue('2026-05-17T10:11:12.345Z');

    const fileUri = await exportAllSongs();

    expect(fileUri).toBe('file:///documents/lyricflow-backup-2026-05-17T10_11_12.345Z.json');
    expect(mockedWriteAsStringAsync).toHaveBeenCalledWith(
      'file:///documents/lyricflow-backup-2026-05-17T10_11_12.345Z.json',
      expect.stringContaining('"exportDate": "2026-05-17T10:11:12.345Z"'),
      { encoding: FileSystem.EncodingType.UTF8 }
    );
  });
});
