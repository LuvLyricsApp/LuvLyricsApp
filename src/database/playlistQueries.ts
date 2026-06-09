/**
 * Playlist CRUD Operations
 */

import { withDbRead, withDbWrite } from './db';
import { Playlist, Song } from '../types/song';
import { getSongById } from './queries';

const log = (msg: string, data?: any) => {
  if (__DEV__) console.log(`[PLAYLIST_QUERIES] ${msg}`, data ?? '');
};

/**
 * Get all playlists with song counts
 */
export const getAllPlaylists = async (): Promise<Playlist[]> => {
  return withDbRead(async (db) => {
    const rows = await db.getAllAsync<any>(`
      SELECT 
        p.id,
        p.name,
        p.description,
        p.cover_image_uri as coverImageUri,
        p.is_default as isDefault,
        p.sort_order as sortOrder,
        p.date_created as dateCreated,
        p.date_modified as dateModified,
        COUNT(ps.song_id) as songCount
      FROM playlists p
      LEFT JOIN playlist_songs ps ON p.id = ps.playlist_id
      GROUP BY p.id
      ORDER BY p.is_default DESC, p.sort_order ASC, p.date_created DESC
    `);

    return rows.map(row => ({
      ...row,
      isDefault: row.isDefault === 1,
    }));
  });
};

/**
 * Create a new playlist 
 */
export const createPlaylist = async (
  name: string, 
  description?: string, 
  coverUri?: string
): Promise<string> => {
  return withDbWrite(async (db) => {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    await db.runAsync(
      `INSERT INTO playlists (id, name, description, cover_image_uri, is_default, sort_order, date_created, date_modified)
       VALUES (?, ?, ?, ?, 0, 0, ?, ?)`,
      [id, name, description || null, coverUri || null, now, now]
    );

    log(`Created playlist: ${name} (${id})`);
    return id;
  });
};

/**
 * Update playlist metadata
 */
export const updatePlaylist = async (
  id: string,
  updates: { name?: string; description?: string; coverImageUri?: string }
): Promise<void> => {
  return withDbWrite(async (db) => {
    const { name, description, coverImageUri } = updates;
    const now = new Date().toISOString();

    const setClauses: string[] = [];
    const values: any[] = [];

    if (name !== undefined) {
      setClauses.push('name = ?');
      values.push(name);
    }
    if (description !== undefined) {
      setClauses.push('description = ?');
      values.push(description);
    }
    if (coverImageUri !== undefined) {
      setClauses.push('cover_image_uri = ?');
      values.push(coverImageUri);
    }

    setClauses.push('date_modified = ?');
    values.push(now);

    values.push(id);

    await db.runAsync(
      `UPDATE playlists SET ${setClauses.join(', ')} WHERE id = ?`,
      values
    );

    log(`Updated playlist: ${id}`);
  });
};

/**
 * Delete a playlist (cannot delete default)
 */
export const deletePlaylist = async (id: string): Promise<void> => {
  return withDbWrite(async (db) => {
    // Check if it's the default playlist
    const playlist = await db.getFirstAsync<{ is_default: number }>(
      'SELECT is_default FROM playlists WHERE id = ?',
      [id]
    );

    if (playlist?.is_default === 1) {
      throw new Error('Cannot delete the default "Liked Songs" playlist');
    }

    await db.runAsync('DELETE FROM playlists WHERE id = ?', [id]);
    log(`Deleted playlist: ${id}`);
  });
};

/**
 * Get all songs in a playlist
 */
export const getPlaylistSongs = async (playlistId: string): Promise<Song[]> => {
  return withDbRead(async (db) => {
    const rows = await db.getAllAsync<{ song_id: string }>(`
      SELECT song_id
      FROM playlist_songs
      WHERE playlist_id = ?
      ORDER BY sort_order ASC, added_at DESC
    `, [playlistId]);

    // Fetch full song data for each ID
    const songs = await Promise.all(
      rows.map(row => getSongById(row.song_id))
    );

    return songs.filter((s): s is Song => s !== null);
  });
};

/**
 * Add a song to a playlist
 */
export const addSongToPlaylist = async (
  playlistId: string,
  songId: string
): Promise<void> => {
  return addSongToPlaylistWithOrder(playlistId, songId, 0);
};

/**
 * Add a song to a playlist with a specific sort order
 */
export const addSongToPlaylistWithOrder = async (
  playlistId: string,
  songId: string,
  sortOrder: number
): Promise<void> => {
  return withDbWrite(async (db) => {
    const now = new Date().toISOString();

    await db.runAsync(
      `INSERT OR IGNORE INTO playlist_songs (playlist_id, song_id, added_at, sort_order)
       VALUES (?, ?, ?, ?)`,
      [playlistId, songId, now, sortOrder]
    );

    // Update playlist modified date
    await db.runAsync(
      'UPDATE playlists SET date_modified = ? WHERE id = ?',
      [now, playlistId]
    );

    log(`Added song ${songId} to playlist ${playlistId} at order ${sortOrder}`);
  });
};

/**
 * Add multiple songs to a playlist (Batch)
 */
export const addSongsToPlaylist = async (
  playlistId: string,
  songIds: string[]
): Promise<void> => {
  return withDbWrite(async (db) => {
    const now = new Date().toISOString();
    
    await db.execAsync('BEGIN TRANSACTION');
    try {
        for (const songId of songIds) {
            await db.runAsync(
              `INSERT OR IGNORE INTO playlist_songs (playlist_id, song_id, added_at, sort_order)
               VALUES (?, ?, ?, 0)`,
              [playlistId, songId, now]
            );
        }

        // Update playlist modified date
        await db.runAsync(
          'UPDATE playlists SET date_modified = ? WHERE id = ?',
          [now, playlistId]
        );
        
        await db.execAsync('COMMIT');
        log(`Batch added ${songIds.length} songs to playlist ${playlistId}`);
    } catch (error) {
        await db.execAsync('ROLLBACK');
        throw error;
    }
  });
};

/**
 * Remove a song from a playlist
 */
export const removeSongFromPlaylist = async (
  playlistId: string,
  songId: string
): Promise<void> => {
  return withDbWrite(async (db) => {
    await db.runAsync(
      'DELETE FROM playlist_songs WHERE playlist_id = ? AND song_id = ?',
      [playlistId, songId]
    );

    const now = new Date().toISOString();
    await db.runAsync(
      'UPDATE playlists SET date_modified = ? WHERE id = ?',
      [now, playlistId]
    );

    log(`Removed song ${songId} from playlist ${playlistId}`);
  });
};

/**
 * Check if a song is in a playlist
 */
export const isSongInPlaylist = async (
  playlistId: string,
  songId: string
): Promise<boolean> => {
  return withDbRead(async (db) => {
    const row = await db.getFirstAsync<{ count: number }>(
      'SELECT COUNT(*) as count FROM playlist_songs WHERE playlist_id = ? AND song_id = ?',
      [playlistId, songId]
    );

    return (row?.count ?? 0) > 0;
  });
};

/**
 * Get the default "Liked Songs" playlist ID
 */
export const getDefaultPlaylistId = async (): Promise<string | null> => {
  return withDbRead(async (db) => {
    const row = await db.getFirstAsync<{ id: string }>(
      'SELECT id FROM playlists WHERE is_default = 1 LIMIT 1'
    );

    return row?.id ?? null;
  });
};

/**
 * Update song order after drag-and-drop reordering
 */
export const updateSongOrder = async (
  playlistId: string,
  reorderedSongIds: string[]
): Promise<void> => {
  return withDbWrite(async (db) => {
    await db.execAsync('BEGIN TRANSACTION');
    
    try {
      for (let i = 0; i < reorderedSongIds.length; i++) {
        await db.runAsync(
          'UPDATE playlist_songs SET sort_order = ? WHERE playlist_id = ? AND song_id = ?',
          [i, playlistId, reorderedSongIds[i]]
        );
      }
      
      await db.execAsync('COMMIT');
      
      const now = new Date().toISOString();
      await db.runAsync(
        'UPDATE playlists SET date_modified = ? WHERE id = ?',
        [now, playlistId]
      );
      
      log(`Updated song order for playlist ${playlistId} (${reorderedSongIds.length} songs)`);
    } catch (error) {
      await db.execAsync('ROLLBACK');
      throw error;
    }
  });
};

