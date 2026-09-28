/**
 * Getting a song going again after the native player gave up on it.
 *
 * Media3 reports why it stopped (`MainPlayer.onPlaybackError`), and `play()`
 * returns false when there is no player at all (the playback service was torn
 * down). Either way the transport already shows "paused" — this picks the song
 * back up where it stopped instead of making the listener skip away and back
 * (which also started it from zero):
 *
 *   expired   the CDN refused the link. Streamed links are signed and expire,
 *             so a stream song gets a fresh link first, then resumes.
 *   stall /   bytes stopped coming, or network retries ran out. One automatic
 *   network   retry with a fresh link (streams) — then it waits for a tap.
 *   error     a decoder or unknown failure: no automatic retry.
 *   released  the service is gone: nothing to resume until the listener taps
 *             play, which reloads the song at the same spot.
 */
import { resumeNextLoadAt, usePlayerStore } from '../store/playerStore';
import { usePlaybackModesStore } from '../store/playbackModesStore';
import { positionSV } from './positionBus';
import { Song, UnifiedSong } from '../types/song';
import { isStreamSongId, parseStreamId, streamUrlOf } from '../services/stream/streamSong';

export type PlaybackLoss = 'expired' | 'network' | 'stall' | 'error' | 'released' | 'tapped';

export interface RecoveryPlan {
  /** Fetch a new link for a streamed song before reloading. */
  refreshLink: boolean;
  /** Reload and keep playing now, without waiting for a tap. */
  resume: boolean;
}

/** Automatic resumes allowed per song inside `AUTO_WINDOW_MS`, so a dead song can't loop. */
export const MAX_AUTO_RESUMES = 2;
export const AUTO_WINDOW_MS = 60_000;

/**
 * What to do about a loss. `tapped` is the listener pressing play on a player
 * that no longer exists. `autoResumesLeft` counts down per song.
 */
export const planRecovery = (reason: PlaybackLoss, isStream: boolean, autoResumesLeft: number): RecoveryPlan => {
  switch (reason) {
    case 'tapped':
      return { refreshLink: false, resume: true };
    case 'expired':
    case 'stall':
    case 'network':
      return { refreshLink: isStream, resume: autoResumesLeft > 0 };
    case 'error':
    case 'released':
    default:
      return { refreshLink: false, resume: false };
  }
};

const norm = (s: string | undefined) => (s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

/**
 * The same song in fresh search results: exact provider id first, then the
 * same title by the same lead artist. Null when nothing is clearly the same song.
 */
export const pickSameSong = (song: Pick<Song, 'id' | 'title' | 'artist'>, results: UnifiedSong[]): UnifiedSong | null => {
  const parsed = parseStreamId(song.id);
  if (parsed) {
    const exact = results.find(r => r.id === parsed.providerId && r.source.toLowerCase() === parsed.source && streamUrlOf(r));
    if (exact) return exact;
  }
  const title = norm(song.title);
  const lead = norm((song.artist ?? '').split(/,|&/)[0]);
  return results.find(r => streamUrlOf(r) && norm(r.title) === title && (!lead || norm(r.artist).includes(lead))) ?? null;
};

const waitFor = async (check: () => boolean, timeoutMs: number): Promise<boolean> => {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (check()) return true;
    await new Promise(r => setTimeout(r, 100));
  }
  return check();
};

/** A new signed link for a streamed song, written into the current song and the queue. */
const refreshStreamLink = async (song: Song): Promise<boolean> => {
  const { searchMusic } = await import('../services/MultiSourceSearchService');
  const results = await searchMusic(`${song.title} ${song.artist ?? ''}`.trim()).catch(() => [] as UnifiedSong[]);
  const match = pickSameSong(song, results);
  const uri = match ? streamUrlOf(match) : '';
  if (!uri) return false;
  const state = usePlayerStore.getState();
  if (state.currentSongId !== song.id) return false;
  usePlayerStore.setState({
    currentSong: state.currentSong ? { ...state.currentSong, audioUri: uri } : state.currentSong,
    playlistQueue: state.playlistQueue?.map(s => (s.id === song.id ? { ...s, audioUri: uri } : s)) ?? null,
  });
  return true;
};

let inFlight = false;
const autoResumes = new Map<string, number[]>();

const autoResumesLeft = (songId: string, now: number): number => {
  const recent = (autoResumes.get(songId) ?? []).filter(t => now - t < AUTO_WINDOW_MS);
  autoResumes.set(songId, recent);
  return MAX_AUTO_RESUMES - recent.length;
};

/**
 * Reloads the current song at `at` seconds: the load effect in MiniPlayer
 * picks up the cleared `loadedAudioId`, seeks, then plays.
 */
const reloadAt = async (songId: string, at: number): Promise<boolean> => {
  // The loader seeks to `at` before it plays (takeResumePosition).
  resumeNextLoadAt(songId, at);
  usePlayerStore.getState().setLoadedAudioId(null);
  const loaded = await waitFor(() => usePlayerStore.getState().loadedAudioId === songId, 10_000);
  if (!loaded || usePlayerStore.getState().currentSongId !== songId) {
    resumeNextLoadAt(songId, 0);
    return false;
  }
  usePlayerStore.getState().requestPlayback(true);
  // A recreated player starts plain: put back repeat and tempo / pitch.
  const modes = usePlaybackModesStore.getState();
  if (modes.repeatOne) modes.setRepeatOne(true);
  if (modes.tempo !== 1 || modes.pitch !== 1) modes.setTempoPitch(modes.tempo, modes.pitch);
  return true;
};

/** Handles a playback loss; resolves to whether the song is playing again. */
export const recoverPlayback = async (reason: PlaybackLoss, position?: number): Promise<boolean> => {
  const song = usePlayerStore.getState().currentSong;
  if (!song || inFlight) return false;
  const now = Date.now();
  const plan = planRecovery(reason, isStreamSongId(song.id), autoResumesLeft(song.id, now));
  if (!plan.resume) return false;
  if (reason !== 'tapped') autoResumes.get(song.id)?.push(now);

  inFlight = true;
  try {
    const at = Math.max(0, position ?? positionSV.value);
    // A tap reloads the link it has (fast); if that link turns out to be
    // dead, the "expired" report comes back and fetches a fresh one.
    if (plan.refreshLink) await refreshStreamLink(song);
    if (usePlayerStore.getState().currentSongId !== song.id) return false;
    return await reloadAt(song.id, at);
  } finally {
    inFlight = false;
  }
};

/** Test hook. */
export const __resetRecovery = (): void => {
  inFlight = false;
  autoResumes.clear();
};
