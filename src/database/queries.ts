/**
 * LyricFlow - Database CRUD Operations
 */

import { 
  closeDatabase, 
  getDatabase, 
  withDbRead,
  withDbWrite,
  withDbSafe,
  esc
} from './db';
import * as SQLite from 'expo-sqlite';
import * as FileSystem from 'expo-file-system/legacy';
import { Song, LyricLine } from '../types/song';
import { normalizeLyrics } from '../utils/timestampParser';

const LOG_PREFIX = '[QUERIES]';

const log = (msg: string, data?: any) => {
  if (__DEV__) console.log(`${LOG_PREFIX} ${msg}`, data ?? '');
};


export const getAllSongs = async (): Promise<Song[]> => {
  return withDbRead(async (db) => {
    const songsRows = await db.getAllAsync<{
      id: string;
      title: string;
      artist: string | null;
      album: string | null;
      gradient_id: string;
      duration: number;
      date_created: string;
      date_modified: string;
      play_count: number;
      last_played: string | null;
      scroll_speed: number;
      cover_image_uri: string | null;
      lyrics_align: string | null;
      text_case: string | null;
      audio_uri: string | null;
      is_liked: number | null;
      is_hidden: number | null;
    }>('SELECT * FROM songs WHERE is_hidden = 0 ORDER BY date_created DESC');
    
    return songsRows.map((row) => ({
      id: row.id,
      title: row.title,
      artist: row.artist ?? undefined,
      album: row.album ?? undefined,
      gradientId: row.gradient_id,
      duration: row.duration,
      dateCreated: row.date_created,
      dateModified: row.date_modified,
      playCount: row.play_count,
      lastPlayed: row.last_played ?? undefined,
      lyrics: [],
      scrollSpeed: row.scroll_speed ?? 50,
      coverImageUri: row.cover_image_uri ?? undefined,
      lyricsAlign: (row.lyrics_align as 'left' | 'center' | 'right') ?? 'left',
      textCase: (row.text_case as 'normal' | 'uppercase' | 'titlecase' | 'sentencecase') ?? 'titlecase',
      audioUri: row.audio_uri ?? undefined,
      isLiked: row.is_liked === 1,
      isHidden: row.is_hidden === 1,
    }));
  });
};

export const getHiddenSongs = async (): Promise<Song[]> => {
  return withDbRead(async (db) => {
    const songsRows = await db.getAllAsync<{
      id: string;
      title: string;
      artist: string | null;
      album: string | null;
      gradient_id: string;
      duration: number;
      date_created: string;
      date_modified: string;
      play_count: number;
      last_played: string | null;
      scroll_speed: number;
      cover_image_uri: string | null;
      lyrics_align: string | null;
      text_case: string | null;
      audio_uri: string | null;
      is_liked: number | null;
      is_hidden: number | null;
    }>('SELECT * FROM songs WHERE is_hidden = 1 ORDER BY date_created DESC');
    
    return songsRows.map((row) => ({
      id: row.id,
      title: row.title,
      artist: row.artist ?? undefined,
      album: row.album ?? undefined,
      gradientId: row.gradient_id,
      duration: row.duration,
      dateCreated: row.date_created,
      dateModified: row.date_modified,
      playCount: row.play_count,
      lastPlayed: row.last_played ?? undefined,
      lyrics: [],
      scrollSpeed: row.scroll_speed ?? 50,
      coverImageUri: row.cover_image_uri ?? undefined,
      lyricsAlign: (row.lyrics_align as 'left' | 'center' | 'right') ?? 'left',
      textCase: (row.text_case as 'normal' | 'uppercase' | 'titlecase' | 'sentencecase') ?? 'titlecase',
      audioUri: row.audio_uri ?? undefined,
      isLiked: row.is_liked === 1,
      isHidden: row.is_hidden === 1,
    }));
  });
};

export const getSongById = async (id: string): Promise<Song | null> => {
  const db = await getDatabase();
  
  const songRow = await db.getFirstAsync<{
    id: string;
    title: string;
    artist: string | null;
    album: string | null;
    gradient_id: string;
    duration: number;
    date_created: string;
    date_modified: string;
    play_count: number;
    last_played: string | null;
    scroll_speed: number;
    cover_image_uri: string | null;
    lyrics_align: string | null;
    text_case: string | null;
    audio_uri: string | null;
    is_liked: number | null;
    is_hidden: number | null;
  }>('SELECT * FROM songs WHERE id = ?', [id]);
  
  if (!songRow) return null;
  
  const lyricsRows = await db.getAllAsync<{
    id: number;
    timestamp: number;
    text: string;
    line_order: number;
  }>('SELECT * FROM lyrics WHERE song_id = ? ORDER BY line_order', [id]);
  
  return {
    id: songRow.id,
    title: songRow.title,
    artist: songRow.artist ?? undefined,
    album: songRow.album ?? undefined,
    gradientId: songRow.gradient_id,
    duration: songRow.duration,
    dateCreated: songRow.date_created,
    dateModified: songRow.date_modified,
    playCount: songRow.play_count,
    lastPlayed: songRow.last_played ?? undefined,
    scrollSpeed: songRow.scroll_speed ?? 50,
    coverImageUri: songRow.cover_image_uri ?? undefined,
    lyricsAlign: (songRow.lyrics_align as 'left' | 'center' | 'right') ?? 'left',
    textCase: (songRow.text_case as 'normal' | 'uppercase' | 'titlecase' | 'sentencecase') ?? 'titlecase',
    audioUri: songRow.audio_uri ?? undefined,
    isLiked: songRow.is_liked === 1,
    isHidden: songRow.is_hidden === 1,
    lyrics: normalizeLyrics(lyricsRows.map((row) => ({
      id: row.id,
      timestamp: row.timestamp,
      text: row.text,
      lineOrder: row.line_order,
    }))),
  };
};

export const insertSong = async (song: Song): Promise<void> => {
  log(`insertSong() called for: ${song.title}`);
  
  await withDbWrite(async (db) => {
    log(`Inserting song: ${song.id}`);
    
    const sql = `
      INSERT OR REPLACE INTO songs (id, title, artist, album, gradient_id, duration, date_created, date_modified, play_count, scroll_speed, lyrics_align, text_case, audio_uri, is_liked, cover_image_uri)
      VALUES ('${song.id}', '${esc(song.title)}', ${song.artist ? `'${esc(song.artist)}'` : 'NULL'}, ${song.album ? `'${esc(song.album)}'` : 'NULL'}, '${song.gradientId}', ${song.duration}, '${song.dateCreated}', '${song.dateModified}', ${song.playCount}, ${song.scrollSpeed ?? 50}, '${song.lyricsAlign ?? 'left'}', '${song.textCase ?? 'titlecase'}', ${song.audioUri ? `'${esc(song.audioUri)}'` : 'NULL'}, ${song.isLiked ? 1 : 0}, ${song.coverImageUri ? `'${esc(song.coverImageUri)}'` : 'NULL'});
    `;
    
    await db.execAsync(sql);
    
    const normalizedLyrics = normalizeLyrics(song.lyrics);
    log(`Inserting ${normalizedLyrics.length} lyrics...`);
    
    for (const lyric of normalizedLyrics) {
      await db.execAsync(`INSERT INTO lyrics (song_id, timestamp, text, line_order) VALUES ('${song.id}', ${lyric.timestamp}, '${esc(lyric.text)}', ${lyric.lineOrder});`);
    }
    
    log(`insertSong() completed`);
  });
};

export const updateSong = async (song: Song): Promise<void> => {
  log(`updateSong() called for: ${song.title}`);
  
  await withDbWrite(async (db) => {
    log(`Updating song: ${song.id}`);
    
    await db.execAsync(`
      UPDATE songs SET title = '${esc(song.title)}', artist = ${song.artist ? `'${esc(song.artist)}'` : 'NULL'}, album = ${song.album ? `'${esc(song.album)}'` : 'NULL'}, gradient_id = '${song.gradientId}', duration = ${song.duration}, date_modified = '${song.dateModified}', scroll_speed = ${song.scrollSpeed ?? 50}, lyrics_align = '${song.lyricsAlign ?? 'left'}', text_case = '${song.textCase ?? 'titlecase'}', cover_image_uri = ${song.coverImageUri ? `'${esc(song.coverImageUri)}'` : 'NULL'}, audio_uri = ${song.audioUri ? `'${esc(song.audioUri)}'` : 'NULL'}, is_liked = ${song.isLiked ? 1 : 0} WHERE id = '${song.id}';
    `);
    
    // Only update lyrics if provided
    if (song.lyrics && song.lyrics.length > 0) {
      await db.execAsync(`DELETE FROM lyrics WHERE song_id = '${song.id}';`);
      
      log(`Inserting ${song.lyrics.length} lyrics for song ${song.id}`);
      const normalizedLyrics = normalizeLyrics(song.lyrics);
      log(`Normalized to ${normalizedLyrics.length} lines`);
      
      // OPTIMIZATION: Batch Insert in Transaction to prevent locking
      // Construct a single large INSERT statement (SQLite limit usually 1MB+, safe for lyrics)
      if (normalizedLyrics.length > 0) {
          const values = normalizedLyrics.map(lyric => 
              `('${song.id}', ${lyric.timestamp}, '${esc(lyric.text)}', ${lyric.lineOrder})`
          ).join(',');
          
          await db.execAsync(`
             INSERT INTO lyrics (song_id, timestamp, text, line_order) 
             VALUES ${values};
          `);
      }
    }
    
    log(`updateSong() completed`);
  });
};

export const deleteSong = async (id: string): Promise<void> => {
  try {
    const song = await getSongById(id);
    if (song) {
      // 1. Delete physical files from disk if they are in the app's document directory
      if (song.audioUri && song.audioUri.includes(FileSystem.documentDirectory!)) {
        try {
          if (__DEV__) console.log(`[QUERIES] Deleting physical audio file: ${song.audioUri}`);
          await FileSystem.deleteAsync(song.audioUri, { idempotent: true });
        } catch {
          if (__DEV__) console.warn('[QUERIES] Failed to delete audio file, it might not exist');
        }
      }
      
      if (song.coverImageUri && (song.coverImageUri.includes(FileSystem.documentDirectory!) || song.coverImageUri.includes('file:///'))) {
        try {
          if (__DEV__) console.log(`[QUERIES] Deleting physical cover image: ${song.coverImageUri}`);
          await FileSystem.deleteAsync(song.coverImageUri, { idempotent: true });
        } catch {
          if (__DEV__) console.warn('[QUERIES] Failed to delete cover image');
        }
      }
    }

    await withDbSafe(async (db) => {
      // 2. Delete from database
      await db.execAsync(`DELETE FROM lyrics WHERE song_id = '${id}';`);
      await db.execAsync(`DELETE FROM songs WHERE id = '${id}';`);
    });
  } catch (error) {
    if (__DEV__) console.error('[QUERIES] deleteSong failed during file or DB cleanup:', error);
    throw error;
  }
};

export const hideSong = async (id: string, hide: boolean): Promise<void> => {
  await withDbSafe(async (db) => {
    await db.execAsync(`UPDATE songs SET is_hidden = ${hide ? 1 : 0} WHERE id = '${id}';`);
  });
};

export const updatePlayStats = async (id: string): Promise<void> => {
  await withDbSafe(async (db) => {
    await db.execAsync(`UPDATE songs SET play_count = play_count + 1, last_played = '${new Date().toISOString()}' WHERE id = '${id}';`);
  });
};

export const searchSongs = async (query: string): Promise<Song[]> => {
  const db = await getDatabase();
  const searchTerm = `%${query}%`;
  
  const songIds = await db.getAllAsync<{ id: string }>(
    `SELECT DISTINCT s.id FROM songs s
     LEFT JOIN lyrics l ON s.id = l.song_id
     WHERE s.title LIKE ? OR s.artist LIKE ? OR s.album LIKE ? OR l.text LIKE ?
     ORDER BY s.date_created DESC`,
    [searchTerm, searchTerm, searchTerm, searchTerm]
  );
  
  const songs: Song[] = [];
  for (const { id } of songIds) {
    const song = await getSongById(id);
    if (song) songs.push(song);
  }
  
  return songs;
};

export const getAllSongsWithLyrics = async (): Promise<Song[]> => {
  const db = await getDatabase();
  
  const songsRows = await db.getAllAsync<{ id: string }>(
    'SELECT id FROM songs ORDER BY title'
  );
  
  const songs: Song[] = [];
  for (const { id } of songsRows) {
    const song = await getSongById(id);
    if (song) songs.push(song);
  }
  
  return songs;
};

export const clearAllData = async (): Promise<void> => {
  const db = await getDatabase();
  await db.execAsync('DELETE FROM lyrics; DELETE FROM songs;');
};

export const getLastPlayedSong = async (): Promise<Song | null> => {
  const db = await getDatabase();
  const songRow = await db.getFirstAsync<{ id: string }>('SELECT id FROM songs WHERE last_played IS NOT NULL ORDER BY last_played DESC LIMIT 1');
  
  if (songRow) {
      return getSongById(songRow.id);
  }
  return null;
};
