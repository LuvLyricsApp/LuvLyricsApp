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
  flush(): void;
}

// Null on iOS and on any Android build predating the module, so a stale binary
// degrades to the JS engine instead of crashing.
const native: LuvsEngineNativeModule | null =
  Platform.OS === 'android'
    ? (requireOptionalNativeModule('LuvsEngine') as LuvsEngineNativeModule | null)
    : null;

// Cheap change-detector for the library snapshot. Serialising a few hundred songs
// across the bridge on every feed call is the single most expensive thing this
// module can do, so it only happens when the catalogue actually changed.
let lastLibrarySignature = '';

/**
 * Kotlin needs the library for local-file swapping and for seeding artist
 * preferences. The catalogue lives in expo-sqlite on the JS side, so the engine
 * gets a snapshot rather than reading that database directly.
 */
function syncLibrary(module: LuvsEngineNativeModule): void {
  const songs: Song[] = useSongsStore.getState().songs;
  const signature = `${songs.length}:${songs[songs.length - 1]?.id ?? ''}`;
  if (signature === lastLibrarySignature) return;

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
  lastLibrarySignature = signature;
}

function commitFeed(songs: UnifiedSong[]): UnifiedSong[] {
  if (songs.length > 0) {
    useLuvsFeedStore.getState().setFeedSongs(songs);
  }
  return songs;
}

export const luvsEngine = {
  /** True when Kotlin owns ranking — lets callers skip the JS store's duplicate work. */
  isNative: native !== null,

  async refresh(): Promise<UnifiedSong[]> {
    if (!native) return luvsRecommendationEngine.refreshRecommendation();
    syncLibrary(native);
    useLuvsFeedStore.getState().setCurrentIndex(0);
    return commitFeed(await native.refresh());
  },

  async loadMore(): Promise<UnifiedSong[]> {
    if (!native) return luvsRecommendationEngine.loadMoreSongs();
    syncLibrary(native);
    // Kotlin sends only the new page; appending here keeps bridge traffic flat
    // instead of growing with every page.
    const page = await native.loadMore();
    if (page.length === 0) return useLuvsFeedStore.getState().feedSongs;
    const merged = [...useLuvsFeedStore.getState().feedSongs, ...page];
    useLuvsFeedStore.getState().setFeedSongs(merged);
    return merged;
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

  /** Forces deferred ranking + persistence out. Call when leaving the feed. */
  flush(): void {
    native?.flush();
  },

  /** Language selection is the one preference the Settings UI writes. */
  setLanguages(languages: string[]): void {
    native?.setLanguages(languages);
  },
};
