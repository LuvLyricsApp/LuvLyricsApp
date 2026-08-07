/**
 * Single entry point the Luvs UI talks to.
 *
 * Android runs the Kotlin engine (network, ranking, filtering, persistence all
 * native). Everything else falls back to the TypeScript engine, which stays the
 * reference implementation until the Swift port lands.
 *
 * Either way the resulting feed is written into useLuvsFeedStore, so the React
 * components never need to know which backend produced it.
 */

import { UnifiedSong } from '../types/song';
import { useLuvsFeedStore } from '../store/luvsFeedStore';
import { useSongsStore } from '../store/songsStore';
import { luvsRecommendationEngine } from './LuvsRecommendationEngine';
import { luvsNativeEngine, isNativeEngineAvailable, pushLibrarySnapshot } from './LuvsNativeEngine';

export const usingNativeLuvsEngine = isNativeEngineAvailable;

let librarySynced = false;

/**
 * Kotlin needs the library for local-file swapping and for seeding artist
 * preferences. Sent once per session — re-sent only if the library grew.
 */
function syncLibrary(): void {
  if (!isNativeEngineAvailable) return;
  const songs = useSongsStore.getState().songs;
  if (librarySynced && songs.length === 0) return;
  pushLibrarySnapshot(songs);
  librarySynced = true;
}

function commitFeed(songs: UnifiedSong[]): UnifiedSong[] {
  if (songs.length > 0) {
    useLuvsFeedStore.getState().setFeedSongs(songs);
  }
  return songs;
}

export const luvsEngine = {
  native: isNativeEngineAvailable,

  async refresh(): Promise<UnifiedSong[]> {
    if (!isNativeEngineAvailable) {
      return luvsRecommendationEngine.refreshRecommendation();
    }
    syncLibrary();
    useLuvsFeedStore.getState().setCurrentIndex(0);
    return commitFeed(await luvsNativeEngine.refresh());
  },

  async loadMore(): Promise<UnifiedSong[]> {
    if (!isNativeEngineAvailable) {
      return luvsRecommendationEngine.loadMoreSongs();
    }
    syncLibrary();
    // Kotlin returns the whole feed with the new page already appended and deduped.
    return commitFeed(await luvsNativeEngine.loadMore());
  },

  async prefetch(): Promise<void> {
    if (!isNativeEngineAvailable) {
      await luvsRecommendationEngine.prefetch();
      return;
    }
    syncLibrary();
    commitFeed(await luvsNativeEngine.prefetch());
  },

  async discoverSimilar(songId: string): Promise<void> {
    if (!isNativeEngineAvailable) {
      await luvsRecommendationEngine.discoverSimilar(songId);
      return;
    }
    commitFeed(await luvsNativeEngine.discoverSimilar(songId));
  },

  /** Keeps Kotlin's cursor aligned so discoverSimilar splices at the right card. */
  setCurrentIndex(index: number): void {
    if (isNativeEngineAvailable) luvsNativeEngine.setCurrentIndex(index);
  },

  recordInteraction(interaction: {
    songId: string;
    title: string;
    artist: string;
    timestamp: number;
    watchDuration: number;
    totalDuration: number;
    liked: boolean;
    skipped: boolean;
  }): void {
    if (isNativeEngineAvailable) luvsNativeEngine.recordInteraction(interaction);
  },

  /** Language selection is the one preference the Settings UI writes. */
  setLanguages(languages: string[]): void {
    if (isNativeEngineAvailable) luvsNativeEngine.setLanguages(languages);
  },
};
