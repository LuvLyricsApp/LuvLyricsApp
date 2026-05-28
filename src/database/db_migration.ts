/**
 * Playlist Data Migration
 * One-time migration to create default "Liked Songs" playlist
 */

import { getDatabase } from './db';

const log = (msg: string, data?: any) => {
  if (__DEV__) console.log(`[DB] ${msg}`, data ?? '');
};

/**
 * One-time migration: Migrate existing liked songs to default playlist
 * CRITICAL: Must be called AFTER app renders via InteractionManager
 */
export const migratePlaylistData = async (): Promise<void> => {
  try {
    const database = await getDatabase();
    
    // Check if default playlist already exists
    const existing = await database.getAllAsync<{ id: string }>(
      'SELECT id FROM playlists WHERE is_default = 1 LIMIT 1'
    );
    
    if (existing.length > 0) {
      log('[MIGRATION] Default playlist already exists, skipping migration');
      return;
    }
    
    log('[MIGRATION] Creating default "Liked Songs" playlist...');
    
    const defaultPlaylistId = 'default_liked';
    const now = new Date().toISOString();
    
    // Single transaction: create playlist + bulk migrate liked songs
    await database.execAsync(`
      BEGIN TRANSACTION;
      
      INSERT OR IGNORE INTO playlists (id, name, description, is_default, sort_order, date_created, date_modified)
      VALUES ('${defaultPlaylistId}', 'Liked Songs', 'Your favorite tracks', 1, 0, '${now}', '${now}');
      
      INSERT OR IGNORE INTO playlist_songs (playlist_id, song_id, added_at, sort_order)
      SELECT '${defaultPlaylistId}', id, '${now}', 0
      FROM songs WHERE is_liked = 1;
      
      COMMIT;
    `);
    
    const count = await database.getAllAsync<{ count: number }>(
      `SELECT COUNT(*) as count FROM playlist_songs WHERE playlist_id = '${defaultPlaylistId}'`
    );
    
    log(`[MIGRATION] Successfully migrated ${count[0]?.count || 0} liked songs to default playlist`);
  } catch (error) {
    log('[MIGRATION] Failed to migrate playlist data:', error);
    // Don't throw - migration failure shouldn't crash the app
  }
};
