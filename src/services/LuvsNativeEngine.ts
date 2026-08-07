/**
 * JS binding for the native Kotlin Luvs backend (LuvsEngineModule).
 *
 * The engine — Saavn search, ranking, filtering, feed state and preference
 * persistence — lives in Kotlin. This file is only a typed pass-through.
 *
 * Android-only. `isNativeEngineAvailable` is false on iOS and on any build that
 * predates the module, so callers can keep the JS engine as a fallback until the
 * Swift port lands.
 */

import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo-modules-core';
import { UnifiedSong } from '../types/song';
import { Song } from '../types/song';

interface LuvsEngineNativeModule {
  setLibrary(songs: {
    id: string;
    title: string;
    artist: string;
    coverImageUri?: string | null;
    audioUri?: string | null;
    duration?: number | null;
    hasLyrics: boolean;
  }[]): void;

  refresh(): Promise<UnifiedSong[]>;
  loadMore(): Promise<UnifiedSong[]>;
  prefetch(): Promise<UnifiedSong[]>;
  discoverSimilar(songId: string): Promise<UnifiedSong[]>;

  getFeed(): UnifiedSong[];
  setCurrentIndex(index: number): void;
  getCurrentIndex(): number;

  getLanguages(): { language: string; weight: number }[];
  setLanguages(languages: string[]): void;
  setLanguageWeight(language: string, weight: number): void;

  recordInteraction(interaction: {
    songId: string;
    title: string;
    artist: string;
    timestamp: number;
    watchDuration: number;
    totalDuration: number;
    liked: boolean;
    skipped: boolean;
  }): void;

  markSeen(songId: string): void;
  addMagicLike(songId: string): void;
  getTopArtists(limit: number): string[];
  clearPreferences(): void;
}

const nativeEngine: LuvsEngineNativeModule | null =
  Platform.OS === 'android'
    ? (requireOptionalNativeModule('LuvsEngine') as LuvsEngineNativeModule | null)
    : null;

export const isNativeEngineAvailable = nativeEngine !== null;

/**
 * Hands the library to Kotlin. The catalogue lives in expo-sqlite on the JS side,
 * so the engine gets a snapshot rather than reading that database directly.
 */
export function pushLibrarySnapshot(songs: Song[]): void {
  if (!nativeEngine) return;
  nativeEngine.setLibrary(
    songs.map(s => ({
      id: s.id,
      title: s.title,
      artist: s.artist ?? '',
      coverImageUri: s.coverImageUri ?? null,
      audioUri: s.audioUri ?? null,
      duration: s.duration ?? null,
      hasLyrics: (s.lyrics?.length ?? 0) > 0,
    })),
  );
}

export const luvsNativeEngine = {
  available: isNativeEngineAvailable,

  refresh: () => nativeEngine?.refresh() ?? Promise.resolve([]),
  loadMore: () => nativeEngine?.loadMore() ?? Promise.resolve([]),
  prefetch: () => nativeEngine?.prefetch() ?? Promise.resolve([]),
  discoverSimilar: (songId: string) => nativeEngine?.discoverSimilar(songId) ?? Promise.resolve([]),

  getFeed: () => nativeEngine?.getFeed() ?? [],
  setCurrentIndex: (index: number) => nativeEngine?.setCurrentIndex(index),

  getLanguages: () => nativeEngine?.getLanguages() ?? [],
  setLanguages: (languages: string[]) => nativeEngine?.setLanguages(languages),

  recordInteraction: (interaction: Parameters<LuvsEngineNativeModule['recordInteraction']>[0]) =>
    nativeEngine?.recordInteraction(interaction),

  markSeen: (songId: string) => nativeEngine?.markSeen(songId),
  addMagicLike: (songId: string) => nativeEngine?.addMagicLike(songId),
  getTopArtists: (limit = 10) => nativeEngine?.getTopArtists(limit) ?? [],
  clearPreferences: () => nativeEngine?.clearPreferences(),
};
