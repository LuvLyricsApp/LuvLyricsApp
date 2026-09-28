/**
 * Listen Together ↔ the player — Echo Music's ListenTogetherManager on
 * LuvLyrics' player.
 *
 * Whoever may control the room (the host, or everyone when the host allows
 * it) broadcasts: track changes, play / pause with the position, seeks, and a
 * PLAY heartbeat every 10s while playing so drift heals.
 *
 * Everyone else follows: a new track is resolved to catalog audio (Echo sends
 * YouTube Music ids; we play the same song through `resolver.ts`, or a copy
 * already on the phone), loaded paused, then `buffer_ready` tells the server;
 * when everyone is ready (`buffer_complete`) the pending position and play
 * state apply together. Play/pause/seek within 2–3s of where we already are
 * are ignored, as in Echo, so small drift doesn't stutter.
 */
import { playerControls, usePlayerStore } from '../../store/playerStore';
import { useSongsStore } from '../../store/songsStore';
import { useListenTogetherStore } from '../../store/listenTogetherStore';
import { positionSV, durationSV } from '../../playback/positionBus';
import { Song } from '../../types/song';
import { searchMusic } from '../MultiSourceSearchService';
import { resolveToCatalog } from '../ytmusic/resolver';
import { StreamService } from '../stream/StreamService';
import { isStreamSongId } from '../stream/streamSong';
import { youtubeIdFor } from '../player/playerMenuActions';
import {
  canControl,
  onListenTogetherEvent,
  requestSync,
  sendBufferReady,
  sendPlaybackAction,
  ListenTogetherEvent,
} from './client';
import { PlaybackActionPayload, PlaybackActions, TrackInfo } from './protocol';
import { NativeAudioPlayer } from '../NativeAudioPlayer';

const POSITION_TOLERANCE_MS = 2000;
const PLAYBACK_POSITION_TOLERANCE_MS = 3000;
const SYNC_DEBOUNCE_THRESHOLD_MS = 1000;
const HEARTBEAT_MS = 10_000;
/** Echo asks for a fresh sync this long after a guest reconnects. */
const SMART_RESYNC_DELAY_MS = 1000;
const LOAD_TIMEOUT_MS = 12_000;

// ── Bookkeeping ────────────────────────────────────────────────────────────
/** While we apply a remote change, our own store updates must not be broadcast. */
let muteBroadcastUntil = 0;
const isMuted = () => Date.now() < muteBroadcastUntil;
const holdSync = (ms: number) => { muteBroadcastUntil = Math.max(muteBroadcastUntil, Date.now() + ms); };
/** Right after we send an action the server echoes it; don't apply our own (Echo: 300ms). */
let ignoreIncomingUntil = 0;

let lastSyncedTrackId: string | null = null;
let lastSyncedPlaying: boolean | null = null;
let lastSyncActionTime = 0;
/** Bumps on every track we start applying; stale async work checks it. */
let generation = 0;
let bufferingTrackId: string | null = null;
let bufferCompleteFor: string | null = null;
let pending: { trackId: string; playing: boolean; positionMs: number } | null = null;

/** Our song id ↔ room track id, both ways. */
const trackIdBySong = new Map<string, string>();
const songIdByTrack = new Map<string, string>();

const room = () => useListenTogetherStore.getState();
const inRoom = () => room().room !== null;
const player = () => usePlayerStore.getState();
const positionMs = () => Math.round(Math.max(0, positionSV.value) * 1000);

// ── Player commands (Scrub/seek pattern: seek, then set the play state) ─────
const seekMs = (ms: number) => { playerControls.seekTo(ms / 1000); };
const setPlaying = (playing: boolean) => { player().requestPlayback(playing); };

// ── Host side ──────────────────────────────────────────────────────────────
const trackInfoFor = async (song: Song): Promise<TrackInfo> => {
  let id = trackIdBySong.get(song.id);
  if (!id) {
    // Echo listeners play by YouTube Music id; fall back to ours.
    id = (await youtubeIdFor(song)) ?? song.id;
    trackIdBySong.set(song.id, id);
    songIdByTrack.set(id, song.id);
  }
  const seconds = player().currentSongId === song.id && durationSV.value > 0 ? durationSV.value : song.duration;
  const cover = song.coverImageUri && /^https:\/\//.test(song.coverImageUri) ? song.coverImageUri : null;
  return {
    id,
    title: song.title,
    artist: song.artist ?? '',
    album: song.album ?? null,
    duration: seconds > 0 ? Math.round(seconds * 1000) : 180_000,
    thumbnail: cover,
  };
};

const sendAction = (payload: PlaybackActionPayload) => {
  if (!canControl()) return;
  ignoreIncomingUntil = Date.now() + 300;
  sendPlaybackAction(payload);
};

const broadcastTrack = async (song: Song, alsoPlay: boolean): Promise<void> => {
  const info = await trackInfoFor(song);
  if (!inRoom() || player().currentSongId !== song.id) return; // skipped meanwhile
  lastSyncedTrackId = song.id;
  lastSyncedPlaying = false;
  sendAction({ action: PlaybackActions.CHANGE_TRACK, track_info: info, queue_title: 'Listen together' });
  if (alsoPlay && player().isPlaying) {
    lastSyncedPlaying = true;
    sendAction({ action: PlaybackActions.PLAY, position: positionMs() });
  }
};

/** Room opened, someone joined, we became host: tell the room where we are. */
const announceCurrent = () => {
  const song = player().currentSong;
  if (!song || !canControl()) return;
  broadcastTrack(song, true).catch(() => {});
};

let lastPositionMs = 0;
let lastPositionAt = 0;
let lastPositionSong: string | null = null;

/** Seeks don't pass through the store, so spot them as a jump in position. */
const watchForSeeks = () => {
  const now = Date.now();
  const pos = positionMs();
  const songId = player().currentSongId;
  if (songId === lastPositionSong && lastPositionAt > 0 && !isMuted()) {
    const expected = lastPositionMs + (player().isPlaying ? now - lastPositionAt : 0);
    if (Math.abs(pos - expected) > 2500 && canControl() && inRoom()) {
      sendAction({ action: PlaybackActions.SEEK, position: pos });
    }
  }
  lastPositionMs = pos;
  lastPositionAt = now;
  lastPositionSong = songId;
};

// ── Guest side ─────────────────────────────────────────────────────────────
const norm = (s: string | undefined | null) => (s ?? '').toLowerCase().replace(/\(.*?\)|\[.*?\]/g, '').replace(/[^a-z0-9\u0080-￿]+/g, ' ').trim();

/** A copy on the phone plays instantly and offline — prefer it. */
const localCopyOf = (track: TrackInfo): Song | undefined => {
  const title = norm(track.title);
  const artist = norm(track.artist.split(/,|&/)[0]);
  return useSongsStore.getState().songs.find(s => s.audioUri && norm(s.title) === title && norm(s.artist).includes(artist));
};

/** Starts `track` playing through our player; resolves to its song id. */
const startTrack = async (track: TrackInfo): Promise<string | null> => {
  const known = songIdByTrack.get(track.id);
  if (known && player().currentSongId === known) return known;

  const local = localCopyOf(track);
  if (local) {
    player().setPlaylistQueue('listen-together', [local], 0);
    songIdByTrack.set(track.id, local.id);
    trackIdBySong.set(local.id, track.id);
    return local.id;
  }

  if (isStreamSongId(track.id)) {
    const meta = StreamService.catalogFor(track.id);
    if (meta) {
      StreamService.play([meta], 0);
      songIdByTrack.set(track.id, track.id);
      trackIdBySong.set(track.id, track.id);
      return player().currentSongId;
    }
  }

  const match = await resolveToCatalog(
    {
      videoId: track.id,
      title: track.title,
      artists: track.artist.split(/\s*(?:,|&)\s*/).filter(Boolean),
      album: track.album ?? undefined,
      duration: track.duration > 0 ? Math.round(track.duration / 1000) : undefined,
      thumbnail: track.thumbnail ?? undefined,
    },
    q => searchMusic(q),
  ).catch(() => null);
  if (!match) return null;
  StreamService.play([match], 0);
  const id = player().currentSongId;
  if (id) {
    songIdByTrack.set(track.id, id);
    trackIdBySong.set(id, track.id);
  }
  return id;
};

const waitForLoad = async (songId: string, gen: number): Promise<boolean> => {
  const until = Date.now() + LOAD_TIMEOUT_MS;
  while (Date.now() < until) {
    if (gen !== generation) return false;
    if (player().loadedAudioId === songId && durationSV.value > 0) return true;
    await new Promise(r => setTimeout(r, 100));
  }
  return player().loadedAudioId === songId;
};

const applyPendingIfReady = () => {
  if (!pending || bufferCompleteFor !== pending.trackId) return;
  const { playing, positionMs: target } = pending;
  holdSync(1200);
  const tolerance = playing && player().isPlaying ? PLAYBACK_POSITION_TOLERANCE_MS : POSITION_TOLERANCE_MS;
  if (Math.abs(positionMs() - target) > tolerance) seekMs(target);
  setPlaying(playing);
  pending = null;
  bufferingTrackId = null;
  bufferCompleteFor = null;
};

/**
 * Load `track` and hold it at `position`. With `bypassBuffer` (joining or
 * resyncing mid-song) apply play state as soon as it's loaded; otherwise wait
 * for the room's buffer_complete like Echo.
 */
const applyTrack = async (track: TrackInfo, playing: boolean, position: number, bypassBuffer: boolean) => {
  const gen = ++generation;
  bufferingTrackId = track.id;
  bufferCompleteFor = null;
  holdSync(LOAD_TIMEOUT_MS);
  const songId = await startTrack(track);
  if (gen !== generation) return;
  if (!songId) {
    room().announce(`Couldn’t find “${track.title}” to play`);
    muteBroadcastUntil = 0;
    return;
  }
  const ready = await waitForLoad(songId, gen);
  if (gen !== generation) return;
  // Loaded: shorten the load-time hold to the settle window (holdSync only extends).
  muteBroadcastUntil = Date.now() + 1500;
  if (bypassBuffer || !ready) {
    seekMs(position);
    setPlaying(playing);
    pending = null;
    bufferingTrackId = null;
    return;
  }
  setPlaying(false);
  pending = { trackId: track.id, playing, positionMs: position };
  sendBufferReady(track.id);
  applyPendingIfReady();
};

const onCurrentTrack = (trackId: string | undefined | null): boolean => {
  if (!trackId) return false;
  const songId = songIdByTrack.get(trackId);
  return !!songId && songId === player().currentSongId;
};

const handlePlayback = (action: PlaybackActionPayload) => {
  const now = Date.now();
  switch (action.action) {
    case PlaybackActions.PLAY: {
      const base = action.position ?? 0;
      const adjusted = action.server_time ? base + Math.max(0, now - action.server_time) : base;
      if (bufferingTrackId) {
        if (pending) pending = { ...pending, playing: true, positionMs: adjusted };
        applyPendingIfReady();
        return;
      }
      // We drifted onto another song (a skip on this phone): go back to the room's.
      const current = room().room?.current_track;
      if (current && !onCurrentTrack(current.id)) {
        applyTrack(current, true, adjusted, true).catch(() => {});
        return;
      }
      const diff = Math.abs(positionMs() - adjusted);
      const playingNow = player().isPlaying;
      if (playingNow && diff < POSITION_TOLERANCE_MS && now - lastSyncActionTime < SYNC_DEBOUNCE_THRESHOLD_MS) return;
      holdSync(800);
      if (playingNow) {
        if (diff > PLAYBACK_POSITION_TOLERANCE_MS) seekMs(adjusted);
      } else {
        if (diff > POSITION_TOLERANCE_MS) seekMs(adjusted);
        setPlaying(true);
      }
      lastSyncActionTime = now;
      return;
    }
    case PlaybackActions.PAUSE: {
      const pos = action.position ?? 0;
      if (bufferingTrackId) {
        if (pending) pending = { ...pending, playing: false, positionMs: pos };
        applyPendingIfReady();
        return;
      }
      const diff = Math.abs(positionMs() - pos);
      if (!player().isPlaying && diff < POSITION_TOLERANCE_MS && now - lastSyncActionTime < SYNC_DEBOUNCE_THRESHOLD_MS) return;
      holdSync(800);
      if (player().isPlaying) setPlaying(false);
      if (diff > POSITION_TOLERANCE_MS) seekMs(pos);
      lastSyncActionTime = now;
      return;
    }
    case PlaybackActions.SEEK: {
      const pos = action.position ?? 0;
      if (now - lastSyncActionTime < SYNC_DEBOUNCE_THRESHOLD_MS) return;
      if (Math.abs(positionMs() - pos) > POSITION_TOLERANCE_MS) {
        holdSync(800);
        const wasPlaying = player().isPlaying;
        seekMs(pos);
        setPlaying(wasPlaying);
        lastSyncActionTime = now;
      }
      return;
    }
    case PlaybackActions.CHANGE_TRACK: {
      if (!action.track_info) return;
      lastSyncActionTime = 0;
      applyTrack(action.track_info, false, 0, false).catch(() => {});
      return;
    }
    case PlaybackActions.SKIP_NEXT:
      holdSync(1500);
      player().nextInPlaylist().catch(() => {});
      return;
    case PlaybackActions.SKIP_PREV:
      holdSync(1500);
      player().previousInPlaylist();
      return;
    case PlaybackActions.SET_VOLUME:
      applyHostVolume(action.volume);
      return;
    default:
      // Queue edits: our guests follow the host's current song, not a
      // mirrored queue, so there is nothing to do.
      return;
  }
};

// ── Host volume (Echo's "Sync host volume") ────────────────────────────────
/** A guest takes the host's volume (0–1) when the setting is on. */
function applyHostVolume(volume: number | null | undefined) {
  if (!room().syncHostVolume || !followsRoom()) return;
  if (typeof volume !== 'number' || !Number.isFinite(volume)) return;
  NativeAudioPlayer.setVolume(Math.max(0, Math.min(1, volume)));
}

let lastSentVolume: number | null = null;
/** The host's volume moved: send it, ignoring changes under 1%. */
function onHostVolume(volume: number) {
  if (!inRoom() || room().role !== 'host' || !room().syncHostVolume) return;
  const v = Math.max(0, Math.min(1, volume));
  if (lastSentVolume !== null && Math.abs(lastSentVolume - v) < 0.01) return;
  lastSentVolume = v;
  sendAction({ action: PlaybackActions.SET_VOLUME, volume: v });
}

const followsRoom = () => inRoom() && !canControl();

const handleEvent = (event: ListenTogetherEvent) => {
  switch (event.kind) {
    case 'room_created':
      lastSyncedTrackId = player().currentSongId;
      lastSyncedPlaying = player().isPlaying;
      announceCurrent();
      startHeartbeat();
      return;
    case 'join_approved': {
      const s = event.payload.state;
      applyHostVolume(s.volume);
      if (s.current_track) {
        const elapsed = s.is_playing ? Math.max(0, Date.now() - s.last_update) : 0;
        applyTrack(s.current_track, s.is_playing, s.position + elapsed, false).catch(() => {});
      }
      return;
    }
    case 'reconnected': {
      if (event.payload.is_host) {
        startHeartbeat();
        const local = player().currentSongId;
        if (local && trackIdBySong.get(local) !== event.payload.state.current_track?.id) announceCurrent();
        else if (player().isPlaying) setTimeout(() => sendAction({ action: PlaybackActions.PLAY, position: positionMs() }), 500);
      } else {
        const s = event.payload.state;
        applyHostVolume(s.volume);
        if (s.current_track) {
          const elapsed = s.is_playing ? Math.max(0, Date.now() - s.last_update) : 0;
          applyTrack(s.current_track, s.is_playing, s.position + elapsed, true).catch(() => {});
        }
        // Echo's smart resync: the state carried by the reconnect can be a
        // moment old, so ask the host for a fresh one once settled.
        if (room().smartResync) {
          setTimeout(() => { if (followsRoom()) requestSync(); }, SMART_RESYNC_DELAY_MS);
        }
      }
      return;
    }
    case 'sync_state': {
      if (!followsRoom()) return;
      const s = event.payload;
      if (!s.current_track) return;
      const at = s.is_playing ? s.position + Math.max(0, Date.now() - s.last_update) : s.position;
      applyTrack(s.current_track, s.is_playing, at, true).catch(() => {});
      return;
    }
    case 'playback':
      if (Date.now() < ignoreIncomingUntil) return; // our own action echoed back
      handlePlayback(event.payload);
      return;
    case 'buffer_complete':
      if (bufferingTrackId === event.trackId) {
        bufferCompleteFor = event.trackId;
        applyPendingIfReady();
      }
      return;
    case 'user_joined':
      if (room().role === 'host') announceCurrent();
      return;
    case 'host_changed':
      if (room().role === 'host') {
        announceCurrent();
        startHeartbeat();
      }
      return;
    case 'room_settings_changed':
      return;
    case 'left':
      stopHeartbeat();
      pending = null;
      bufferingTrackId = null;
      generation++;
      return;
  }
};

// ── Heartbeat (host) ───────────────────────────────────────────────────────
let heartbeat: ReturnType<typeof setInterval> | null = null;
function startHeartbeat() {
  if (heartbeat) return;
  heartbeat = setInterval(() => {
    if (!inRoom()) { stopHeartbeat(); return; }
    if (room().role === 'host' && player().isPlaying && player().loadedAudioId === player().currentSongId) {
      sendAction({ action: PlaybackActions.PLAY, position: positionMs() });
    }
  }, HEARTBEAT_MS);
}
function stopHeartbeat() {
  if (heartbeat) clearInterval(heartbeat);
  heartbeat = null;
}

/** Mounted once (RootNavigator). Returns a teardown. */
export const startListenTogetherSync = (): (() => void) => {
  const offEvents = onListenTogetherEvent(handleEvent);

  // Broadcast our own changes while we may control the room.
  const offStore = usePlayerStore.subscribe((state, prev) => {
    if (!inRoom() || !canControl() || isMuted()) return;
    if (state.currentSongId !== prev.currentSongId && state.currentSong && state.currentSongId !== lastSyncedTrackId) {
      broadcastTrack(state.currentSong, true).catch(() => {});
      return;
    }
    if (state.isPlaying !== prev.isPlaying && state.currentSongId === lastSyncedTrackId) {
      if (state.isPlaying) {
        lastSyncedPlaying = true;
        sendAction({ action: PlaybackActions.PLAY, position: positionMs() });
      } else if (lastSyncedPlaying) {
        lastSyncedPlaying = false;
        sendAction({ action: PlaybackActions.PAUSE, position: positionMs() });
      }
    }
  });

  const seekWatch = setInterval(() => { if (inRoom()) watchForSeeks(); }, 1000);
  const volumeSub = NativeAudioPlayer.addListener('onVolumeChanged', (e: { volume?: number }) => {
    if (typeof e?.volume === 'number') onHostVolume(e.volume);
  });

  return () => {
    offEvents();
    offStore();
    volumeSub.remove();
    clearInterval(seekWatch);
    stopHeartbeat();
  };
};
