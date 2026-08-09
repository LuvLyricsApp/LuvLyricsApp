import { Song, UnifiedSong } from '../types/song';
import {
  SpotifyPlaylistSummary,
  SpotifyTrackRef,
  getSpotifyPlaylistSummary,
  getSpotifyPlaylistTracks,
  spotifyLinks,
} from './NativeSpotify';
import { searchMusic } from './MultiSourceSearchService';
import {
  addSongToPlaylistWithOrder,
  createPlaylist,
  getPlaylistSongs,
  updatePlaylist,
} from '../database/playlistQueries';
import { useSongsStore } from '../store/songsStore';
import { useDownloadQueueStore } from '../store/downloadQueueStore';

/**
 * Imports a Spotify playlist into a local playlist, and re-syncs it later.
 *
 * Two invariants carried over from the PixelPlayer implementation this is
 * ported from:
 *
 * 1. **Order is Spotify's.** Every track's slot is its index in the Spotify
 *    response — never re-sorted by title, id or download completion order.
 *    Tracks that fail to resolve are skipped, and the rest keep their relative
 *    positions.
 * 2. **Re-sync is incremental.** The native link store remembers which Spotify
 *    track URI became which local song, so a second run only resolves URIs it
 *    has never seen. That is what makes the Sync button cheap after the first
 *    import.
 *
 * The database writes stay here rather than in Kotlin because the songs and
 * playlists tables are owned by expo-sqlite on the JS side; a second writer
 * would mean duplicating the schema natively.
 */

export type SyncPhase = 'idle' | 'fetch' | 'resolve' | 'save' | 'done' | 'error';

export interface SpotifySyncProgress {
  phase: SyncPhase;
  playlistName: string;
  message: string;
  current: number;
  total: number;
  queued: number;
  reused: number;
  failed: number;
  localPlaylistId: string | null;
  error: string | null;
}

const idleProgress: SpotifySyncProgress = {
  phase: 'idle',
  playlistName: '',
  message: '',
  current: 0,
  total: 0,
  queued: 0,
  reused: 0,
  failed: 0,
  localPlaylistId: null,
  error: null,
};

type Listener = (progress: SpotifySyncProgress) => void;

let progress: SpotifySyncProgress = { ...idleProgress };
let running = false;
const listeners = new Set<Listener>();

const emit = (patch: Partial<SpotifySyncProgress>) => {
  progress = { ...progress, ...patch };
  listeners.forEach((listener) => listener(progress));
};

export const subscribeToSpotifySync = (listener: Listener): (() => void) => {
  listeners.add(listener);
  listener(progress);
  return () => { listeners.delete(listener); };
};

export const getSpotifySyncProgress = (): SpotifySyncProgress => progress;
export const isSpotifySyncRunning = (): boolean => running;

// ── matching ───────────────────────────────────────────────────────────────
// Ported verbatim in spirit from the Kotlin scorer: titles are compared with
// bracketed junk stripped, artists on a prefix overlap, and duration within a
// few seconds is a strong tiebreak between remixes and originals.

const normalize = (value: string): string =>
  value
    .toLowerCase()
    .replace(/\(.*?\)|\[.*?\]/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const titlesClose = (a: string, b: string): boolean => {
  if (a === b) return true;
  if (a.length < 3 || b.length < 3) return a === b;
  return a.includes(b) || b.includes(a);
};

const artistsOverlap = (a: string, b: string): boolean => {
  if (!a || !b) return false;
  return a.includes(b.slice(0, 10)) || b.includes(a.slice(0, 10));
};

/** Highest-scoring candidate, or null when nothing clears the bar. */
const pickBestMatch = (
  track: SpotifyTrackRef,
  candidates: UnifiedSong[],
): UnifiedSong | null => {
  const wantTitle = normalize(track.name);
  const wantArtist = normalize(track.artists);
  const wantSeconds = Math.round(track.durationMs / 1000);

  let best: UnifiedSong | null = null;
  let bestScore = 0;

  candidates.forEach((candidate) => {
    const title = normalize(candidate.title);
    const artist = normalize(candidate.artist);
    let score = 0;

    if (titlesClose(title, wantTitle)) score += 50;
    if (title.includes(wantTitle) || wantTitle.includes(title)) score += 20;
    if (wantArtist && artistsOverlap(artist, wantArtist)) score += 30;

    const seconds = candidate.duration ?? 0;
    if (wantSeconds > 0 && seconds > 0) {
      const diff = Math.abs(seconds - wantSeconds);
      if (diff <= 3) score += 15;
      else if (diff <= 8) score += 5;
    }

    // 50 is the floor: a title that does not match at all can never clear it,
    // so a wrong-but-popular search hit is dropped rather than downloaded.
    if (score >= 50 && score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  });

  return best;
};

/** Existing library song that already satisfies this Spotify track. */
const findInLibrary = (track: SpotifyTrackRef, library: Song[]): Song | null => {
  const wantTitle = normalize(track.name);
  const wantArtist = normalize(track.artists);
  return (
    library.find((song) => {
      const title = normalize(song.title);
      const artist = normalize(song.artist ?? '');
      return (
        titlesClose(title, wantTitle) &&
        (!wantArtist || artistsOverlap(artist, wantArtist))
      );
    }) ?? null
  );
};

// ── sync ───────────────────────────────────────────────────────────────────

/** Import a Spotify playlist, or refresh one already imported. */
export const importSpotifyPlaylist = async (
  playlist: SpotifyPlaylistSummary,
): Promise<void> => {
  if (running) {
    emit({ message: 'Another Spotify import is already running' });
    return;
  }
  running = true;
  progress = { ...idleProgress };

  try {
    emit({
      phase: 'fetch',
      playlistName: playlist.name,
      message: 'Fetching tracks from Spotify…',
    });

    const tracks = await getSpotifyPlaylistTracks(playlist.id);
    if (tracks.length === 0) {
      emit({ phase: 'error', error: 'Playlist is empty on Spotify', message: '' });
      return;
    }

    // Reuse the linked playlist when there is one, so a re-sync updates in
    // place instead of leaving a duplicate behind every time.
    const existingLocalId = spotifyLinks.getLocalPlaylistId(playlist.id);
    let localPlaylistId = existingLocalId;
    if (localPlaylistId) {
      await updatePlaylist(localPlaylistId, {
        name: playlist.name,
        coverImageUri: playlist.imageUrl ?? undefined,
      }).catch(() => { /* playlist may have been deleted locally; recreated below */ });
    }
    if (!localPlaylistId) {
      localPlaylistId = await createPlaylist(
        playlist.name,
        `Imported from Spotify · ${playlist.ownerName ?? ''}`.trim(),
        playlist.imageUrl ?? undefined,
      );
    }
    spotifyLinks.setLocalPlaylistId(playlist.id, localPlaylistId);

    const trackMap = { ...spotifyLinks.getTrackMap(playlist.id) };
    const library = useSongsStore.getState().songs;
    const alreadyInPlaylist = new Set(
      (await getPlaylistSongs(localPlaylistId).catch(() => [] as Song[])).map((s) => s.id),
    );
    const libraryIds = new Set(library.map((song) => song.id));

    const toDownload: UnifiedSong[] = [];
    const downloadOrders: number[] = [];
    let reused = 0;
    let failed = 0;

    emit({
      phase: 'resolve',
      total: tracks.length,
      message: 'Matching tracks…',
      localPlaylistId,
    });

    for (let index = 0; index < tracks.length; index += 1) {
      const track = tracks[index];
      emit({ current: index + 1, message: track.name, reused, failed });

      // 1. Already mapped and still present — just make sure it holds this slot.
      const mapped = trackMap[track.uri];
      if (mapped && libraryIds.has(mapped)) {
        if (!alreadyInPlaylist.has(mapped)) {
          await addSongToPlaylistWithOrder(localPlaylistId, mapped, index);
        }
        reused += 1;
        continue;
      }

      // 2. Something in the library already satisfies it.
      const libMatch = findInLibrary(track, library);
      if (libMatch) {
        trackMap[track.uri] = libMatch.id;
        if (!alreadyInPlaylist.has(libMatch.id)) {
          await addSongToPlaylistWithOrder(localPlaylistId, libMatch.id, index);
        }
        reused += 1;
        continue;
      }

      // 3. Search the providers and queue a download for this exact slot.
      const query = track.artists
        ? `${track.name} ${track.artists.split(',')[0].trim()}`
        : track.name;
      const candidates = await searchMusic(query, track.artists.split(',')[0]?.trim()).catch(
        () => [] as UnifiedSong[],
      );
      const best = pickBestMatch(track, candidates);
      if (best) {
        toDownload.push(best);
        downloadOrders.push(index);
      } else {
        failed += 1;
      }
    }

    emit({ phase: 'save', message: 'Queueing downloads…', reused, failed });

    if (toDownload.length > 0) {
      // sortOrders carries each track's Spotify index through the queue, so the
      // playlist lands in the right order no matter what sequence the downloads
      // actually finish in.
      useDownloadQueueStore
        .getState()
        .addToQueue(toDownload, localPlaylistId, downloadOrders);
    }

    spotifyLinks.setTrackMap(playlist.id, trackMap);
    spotifyLinks.setSnapshot(playlist.id, playlist.snapshotId);

    emit({
      phase: 'done',
      message:
        `${toDownload.length} queued · ${reused} already had · ${failed} not found` +
        ' · order kept',
      queued: toDownload.length,
      reused,
      failed,
      current: tracks.length,
      localPlaylistId,
    });

    await useSongsStore.getState().fetchSongs();
  } catch (error) {
    emit({
      phase: 'error',
      error: error instanceof Error ? error.message : 'Spotify import failed',
    });
  } finally {
    running = false;
  }
};

/**
 * Re-check a local playlist against its Spotify source. Used by the Sync button
 * on an already-imported playlist; new tracks added on Spotify get pulled in
 * and everything else is left alone.
 */
export const syncLinkedPlaylist = async (localPlaylistId: string): Promise<void> => {
  const spotifyPlaylistId = spotifyLinks.getSpotifyPlaylistId(localPlaylistId);
  if (!spotifyPlaylistId) {
    emit({ phase: 'error', error: 'This playlist is not linked to Spotify' });
    return;
  }
  const summary = await getSpotifyPlaylistSummary(spotifyPlaylistId);
  if (!summary) {
    emit({ phase: 'error', error: 'Could not read this playlist from Spotify' });
    return;
  }
  await importSpotifyPlaylist(summary);
};

/** True when this local playlist came from Spotify — drives the Sync button. */
export const isPlaylistLinkedToSpotify = (localPlaylistId: string): boolean =>
  !!spotifyLinks.getSpotifyPlaylistId(localPlaylistId);
