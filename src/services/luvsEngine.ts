/**
 * Single entry point the Luvs UI talks to.
 *
 * Android runs the Kotlin engine (LuvsEngineModule) — Saavn search, ranking,
 * filtering, feed state and preference persistence are all native. Every other
 * platform falls back to the TypeScript engine, which stays the reference
 * implementation until the Swift port lands.
 *
 * Either way the resulting feed is written into useLuvsFeedStore, so React
 * components never need to know which backend produced it.
 */

import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo-modules-core';
import { Song, UnifiedSong } from '../types/song';
import { useLuvsFeedStore } from '../store/luvsFeedStore';
import { useSongsStore } from '../store/songsStore';
import { luvsRecommendationEngine } from './LuvsRecommendationEngine';

export interface LuvInteractionPayload {
  songId: string;
  title: string;
  artist: string;
  timestamp: number;
  watchDuration: number;
  totalDuration: number;
  liked: boolean;
  skipped: boolean;
}

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

  setCurrentIndex(index: number): void;
  setLanguages(languages: string[]): void;
  recordInteraction(interaction: LuvInteractionPayload): void;
  markSeen(songId: string): void;
}

// Null on iOS and on any Android build predating the module, so a stale binary
// degrades to the JS engine instead of crashing.
const native: LuvsEngineNativeModule | null =
  Platform.OS === 'android'
    ? (requireOptionalNativeModule('LuvsEngine') as LuvsEngineNativeModule | null)
    : null;

let librarySynced = false;

/**
 * Kotlin needs the library for local-file swapping and for seeding artist
 * preferences. The catalogue lives in expo-sqlite on the JS side, so the engine
 * gets a snapshot rather than reading that database directly.
 */
function syncLibrary(module: LuvsEngineNativeModule): void {
  const songs: Song[] = useSongsStore.getState().songs;
  if (librarySynced && songs.length === 0) return;
  module.setLibrary(
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
  librarySynced = true;
}

function commitFeed(songs: UnifiedSong[]): UnifiedSong[] {
  if (songs.length > 0) {
    useLuvsFeedStore.getState().setFeedSongs(songs);
  }
  return songs;
}

export const luvsEngine = {
  async refresh(): Promise<UnifiedSong[]> {
    if (!native) return luvsRecommendationEngine.refreshRecommendation();
    syncLibrary(native);
    useLuvsFeedStore.getState().setCurrentIndex(0);
    return commitFeed(await native.refresh());
  },

  async loadMore(): Promise<UnifiedSong[]> {
    if (!native) return luvsRecommendationEngine.loadMoreSongs();
    syncLibrary(native);
    // Kotlin returns the whole feed with the new page already appended and deduped.
    return commitFeed(await native.loadMore());
  },

  async prefetch(): Promise<void> {
    if (!native) {
      await luvsRecommendationEngine.prefetch();
      return;
    }
    syncLibrary(native);
    commitFeed(await native.prefetch());
  },

  async discoverSimilar(songId: string): Promise<void> {
    if (!native) {
      await luvsRecommendationEngine.discoverSimilar(songId);
      return;
    }
    commitFeed(await native.discoverSimilar(songId));
  },

  /** Keeps Kotlin's cursor aligned so discoverSimilar splices at the right card. */
  setCurrentIndex(index: number): void {
    native?.setCurrentIndex(index);
  },

  recordInteraction(interaction: LuvInteractionPayload): void {
    native?.recordInteraction(interaction);
  },

  /** Language selection is the one preference the Settings UI writes. */
  setLanguages(languages: string[]): void {
    native?.setLanguages(languages);
  },
};
