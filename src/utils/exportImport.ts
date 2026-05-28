/**
 * LyricFlow - Export/Import Utilities
 */

import * as FileSystem from 'expo-file-system/legacy';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import { Song } from '../types/song';
import { getAllSongsWithLyrics, insertSong, clearAllData } from '../database/queries';

// Export format version for compatibility
const EXPORT_VERSION = '1.0';

/**
 * Sanitizes a string for safe use as a filename across
 * Windows, iOS, and Android.
 *
 * - Replaces reserved chars: \ / : * ? " < > |
 * - Removes control characters (0x00-0x1f, 0x7f)
 * - Trims trailing dots and spaces (Windows path bug)
 * - Truncates to 200 chars to stay well under FS limits
 * - Avoids Windows reserved device names
 * - Falls back to 'export' if the result collapses to empty
 */
export function sanitizeFilename(name: string): string {
  const RESERVED = /[\\/:*?"<>|]/g;
  const CONTROL = /[\x00-\x1f\x7f]/g;
  const WINDOWS_DEVICE_NAME =
    /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;

  let safe = name
    .replace(RESERVED, '_')
    .replace(CONTROL, '')
    .replace(/[\s.]+$/, '')
    .trim();

  if (safe.length > 200) {
    safe = safe.slice(0, 200).replace(/[\s.]+$/, '').trim();
  }

  if (!safe || WINDOWS_DEVICE_NAME.test(safe)) {
    return 'export';
  }

  return safe;
}

interface ExportData {
  version: string;
  exportDate: string;
  songs: Song[];
}

/**
 * Export all songs to JSON file
 * @returns File URI of exported file
 */
export const exportAllSongs = async (): Promise<string> => {
  const songs = await getAllSongsWithLyrics();
  const exportDate = new Date().toISOString();

  const exportData: ExportData = {
    version: EXPORT_VERSION,
    exportDate,
    songs,
  };

  const jsonString = JSON.stringify(exportData, null, 2);
  const fileName = `${sanitizeFilename(`lyricflow-backup-${exportDate}`)}.json`;
  const fileUri = FileSystem.documentDirectory + fileName;

  await FileSystem.writeAsStringAsync(fileUri, jsonString, {
    encoding: FileSystem.EncodingType.UTF8,
  });

  return fileUri;
};

/**
 * Share exported file
 * @param fileUri - URI of file to share
 */
export const shareExportedFile = async (fileUri: string): Promise<void> => {
  const isAvailable = await Sharing.isAvailableAsync();

  if (isAvailable) {
    await Sharing.shareAsync(fileUri, {
      mimeType: 'application/json',
      dialogTitle: 'Export LyricFlow Backup',
    });
  } else {
    throw new Error('Sharing is not available on this device');
  }
};

/**
 * Import songs from JSON file content
 * @returns Number of songs imported
 */
export const importSongsFromJson = async (): Promise<number> => {
  try {
    const result = await DocumentPicker.getDocumentAsync({
      type: 'application/json',
      copyToCacheDirectory: true,
    });

    if (result.canceled || !result.assets || result.assets.length === 0) {
      return 0;
    }

    const fileUri = result.assets[0].uri;
    const jsonContent = await FileSystem.readAsStringAsync(fileUri);
    const data = JSON.parse(jsonContent) as ExportData;

    // Validate format
    if (!data.version || !data.songs || !Array.isArray(data.songs)) {
      throw new Error('Invalid backup file format');
    }

    // Insert songs
    let importedCount = 0;
    for (const song of data.songs) {
      try {
        // Check if song exists to decide on update vs insert or skip
        // For simplicity in this offline app, we'll try to insert and ignore clashes or generate new IDs if needed
        // But better user experience is to skip duplicates based on ID
        await insertSong(song);
        importedCount++;
      } catch (error) {
        // ID conflict likely, skip or handle
        if (__DEV__) console.warn(`Skipping song ${song.title} due to import error`, error);
      }
    }

    return importedCount;
  } catch (error) {
    if (__DEV__) console.error('Import failed:', error);
    throw error;
  }
};

/**
 * Get storage usage info
 * @returns Object with total size in bytes and formatted string
 */
export const getStorageInfo = async (): Promise<{ bytes: number; formatted: string }> => {
  const docDir = FileSystem.documentDirectory;
  if (!docDir) return { bytes: 0, formatted: '0 KB' };

  try {
    const info = await FileSystem.getInfoAsync(docDir);
    const bytes = info.exists && 'size' in info ? info.size : 0;

    // Format bytes
    if (bytes < 1024) return { bytes, formatted: `${bytes} B` };
    if (bytes < 1024 * 1024) return { bytes, formatted: `${(bytes / 1024).toFixed(1)} KB` };
    return { bytes, formatted: `${(bytes / (1024 * 1024)).toFixed(1)} MB` };
  } catch {
    return { bytes: 0, formatted: '0 KB' };
  }
};
