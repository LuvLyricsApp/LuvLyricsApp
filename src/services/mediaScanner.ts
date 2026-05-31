/**
 * LyricFlow - Media Library Scanner
 * Scans and imports local audio files
 */

import * as MediaLibrary from 'expo-media-library';
import { generateId } from '../utils/formatters';
import { DEFAULT_GRADIENT_ID } from '../constants/gradients';
import { Song } from '../types/song';
import { handleAsyncError } from '../utils/errorHandler';

export interface AudioFile {
  id: string;
  filename: string;
  uri: string;
  duration: number;
  albumId?: string;
  album?: string;
  artist?: string;
  albumArt?: string;
}

export const requestMediaLibraryPermissions = async (): Promise<boolean> => {
  const { status } = await MediaLibrary.requestPermissionsAsync();
  return status === 'granted';
};

export const scanAudioFiles = async (): Promise<AudioFile[]> => {
  try {
    const hasPermission = await requestMediaLibraryPermissions();
    if (!hasPermission) {
      throw new Error('Media library permission denied');
    }

    const media = await MediaLibrary.getAssetsAsync({
      mediaType: 'audio',
      first: 1000,
    });

    return media.assets.map(asset => ({
      id: asset.id,
      filename: asset.filename,
      uri: asset.uri,
      duration: asset.duration,
      albumId: asset.albumId,
      album: (asset as any).album, // Might not be in types but often present in runtime
      artist: undefined,
      albumArt: undefined,
    }));
  } catch (error) {
    handleAsyncError('mediaScanner.scanAudioFiles', error);
    throw error;
  }
};

export const convertAudioFileToSong = (audioFile: AudioFile): Song => {
  const now = new Date().toISOString();
  const title = audioFile.filename.replace(/\.[^/.]+$/, ''); // Remove extension

  return {
    id: generateId(),
    title,
    artist: audioFile.artist || audioFile.album || 'Unknown Artist',
    album: audioFile.album,
    gradientId: DEFAULT_GRADIENT_ID,
    duration: Math.floor(audioFile.duration),
    dateCreated: now,
    dateModified: now,
    playCount: 0,
    lyrics: [],
    audioUri: audioFile.uri,
    coverImageUri: audioFile.albumArt,
  };
};
