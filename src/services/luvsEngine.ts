/**
 * Single entry point the Luvs UI talks to.
 *
 * The engine is Kotlin (LuvsEngineModule): Saavn search, ranking, filtering, feed
 * state and preference persistence all run natively. Feeds are written into
 * useLuvsFeedStore so the React components stay backend-agnostic. Before each
 * page the engine also gets recommendations from the listener's streaming
 * (luvsTaste.ts), which it weaves in alongside its artist discovery.
 *
 * Android-only. Every call is inert elsewhere, so iOS renders the empty state
 * rather than crashing — until a Swift port lands.
 */

import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo-modules-core';
import { Song, UnifiedSong } from '../types/song';
import { useLuvsFeedStore } from '../store/luvsFeedStore';
import { useSongsStore } from '../store/songsStore';
import { useStreamHistoryStore } from '../store/streamHistoryStore';
import { recommendFor } from './stream/recommend';
import { loadTaste } from './luvsTaste';

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

  /** Streaming-taste recommendations, woven into the next pages (newer binaries only). */
  setTasteCandidates?(songs: {
    id: string;
    title: string;
    artist: string;
    highResArt: string;
    downloadUrl: string;
    source: string;
    duration?: number | null;
    language?: string | null;
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
// shows an empty feed instead of crashing.
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

// Longest a feed call waits for YouTube Music. A slower answer still lands in
// the cache and joins the next page.
const TASTE_WAIT_MS = 3500;

/**
 * Hands the engine what the listener's streaming says they like (Echo Music's
 * radio-from-your-plays, see luvsTaste.ts) before it builds a page.
 */
async function pushTaste(module: LuvsEngineNativeModule): Promise<void> {
  if (!module.setTasteCandidates) return;
  const request = loadTaste(
    useStreamHistoryStore.getState().plays,
    useSongsStore.getState().songs,
    (seed, limit) => recommendFor(seed, limit),
  );
  const songs = await Promise.race([
    request.catch(() => [] as UnifiedSong[]),
    new Promise<null>(resolve => setTimeout(() => resolve(null), TASTE_WAIT_MS)),
  ]);
  if (!songs || songs.length === 0) return;
  module.setTasteCandidates(
    songs.map(s => ({
      id: s.id,
      title: s.title,
      artist: s.artist,
      highResArt: s.highResArt,
      downloadUrl: s.streamUrl || s.downloadUrl,
      source: s.source,
      duration: s.duration ?? null,
      language: s.language ?? null,
    })),
  );
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
    if (!native) return [];
    syncLibrary(native);
    await pushTaste(native);
    useLuvsFeedStore.getState().setCurrentIndex(0);
    return commitFeed(await native.refresh());
  },

  async loadMore(): Promise<UnifiedSong[]> {
    if (!native) return [];
    syncLibrary(native);
    await pushTaste(native);
    // Kotlin sends only the new page; appending here keeps bridge traffic flat
    // instead of growing with every page.
    const page = await native.loadMore();
    if (page.length === 0) return useLuvsFeedStore.getState().feedSongs;
    const merged = [...useLuvsFeedStore.getState().feedSongs, ...page];
    useLuvsFeedStore.getState().setFeedSongs(merged);
    return merged;
  },

  async prefetch(): Promise<void> {
    if (!native) return;
    syncLibrary(native);
    await pushTaste(native);
    commitFeed(await native.prefetch());
  },

  async discoverSimilar(songId: string): Promise<void> {
    if (!native) return;
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
