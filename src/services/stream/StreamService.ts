/**
 * Plays catalog songs straight from the provider CDN through the normal player
 * queue (Media3 on Android handles remote URLs and gapless staging), and keeps
 * a streaming session alive the way Echo Music does:
 *
 *   - synced lyrics are fetched for the playing stream song (Echo cascade),
 *   - the queue auto-extends before it runs out ("autoplay") with YouTube
 *     Music's automix for the song, resolved to catalog audio (recommend.ts),
 *   - every stream is recorded to seed the home feed.
 */
import { prepareNextInQueue, usePlayerStore } from '../../store/playerStore';
import { useStreamHistoryStore } from '../../store/streamHistoryStore';
import { useDownloadQueueStore } from '../../store/downloadQueueStore';
import { UnifiedSong } from '../../types/song';
import { recommendFor } from './recommend';
import { lyricaService } from '../LyricaService';
import {
  dedupeStreamable,
  isStreamSongId,
  STREAM_QUEUE_ID,
  toStreamSong,
} from './streamSong';

/** Catalog metadata for each stream id, so radio and history can find the source song. */
const catalog = new Map<string, UnifiedSong>();
const remember = (songs: UnifiedSong[]) => {
  for (const s of songs) catalog.set(toStreamSong(s).id, s);
};

export const StreamService = {
  /** Replace the queue with `songs` and start playing at `index`. */
  play(songs: UnifiedSong[], index = 0): void {
    const playable = dedupeStreamable(songs);
    if (playable.length === 0) return;
    const target = songs[index];
    const startIndex = Math.max(0, target ? playable.findIndex(s => s.id === target.id && s.source === target.source) : 0);
    remember(playable);
    const queue = playable.map(s => toStreamSong(s));
    usePlayerStore.getState().setPlaylistQueue(STREAM_QUEUE_ID, queue, startIndex);
  },

  /** Adds songs right after the current one (or starts playback when idle). */
  playNext(song: UnifiedSong): void {
    const state = usePlayerStore.getState();
    if (!state.playlistQueue || state.currentPlaylistId !== STREAM_QUEUE_ID) {
      StreamService.play([song], 0);
      return;
    }
    remember([song]);
    const item = toStreamSong(song);
    const queue = state.playlistQueue.filter(s => s.id !== item.id);
    const at = Math.max(0, queue.findIndex(s => s.id === state.currentSongId)) + 1;
    queue.splice(at, 0, item);
    state.updateQueue(queue);
    // Media3 may already have staged the old "next" for gapless advance.
    prepareNextInQueue();
  },

  /**
   * "Save" for a streamed song: queue it for download so it lands in the
   * library with lyrics and art. Returns false when the song is unknown.
   */
  save(songOrStreamId: UnifiedSong | string): boolean {
    const meta = typeof songOrStreamId === 'string' ? catalog.get(songOrStreamId) : songOrStreamId;
    if (!meta) return false;
    useDownloadQueueStore.getState().addToQueue([meta]);
    return true;
  },

  catalogFor(streamId: string): UnifiedSong | undefined {
    return catalog.get(streamId);
  },

  /**
   * Called whenever the current song changes. Records history, loads lyrics
   * and tops up the radio. Safe to call repeatedly for the same song.
   */
  async onSongChanged(streamId: string | null): Promise<void> {
    if (!isStreamSongId(streamId) || !streamId) return;
    const meta = catalog.get(streamId);
    if (meta) useStreamHistoryStore.getState().recordPlay(meta);
    await Promise.all([loadLyrics(streamId, meta), extendRadio(streamId)]);
  },
};

const lyricsInFlight = new Set<string>();

async function loadLyrics(streamId: string, meta: UnifiedSong | undefined): Promise<void> {
  const current = usePlayerStore.getState().currentSong;
  if (!current || current.id !== streamId || current.lyrics.length > 0 || lyricsInFlight.has(streamId)) return;
  lyricsInFlight.add(streamId);
  try {
    const result = await lyricaService.fetchLyrics(current.title, current.artist ?? '', false, meta?.duration ?? current.duration);
    if (!result) return;
    const lyrics = lyricaService.parseLrc(result.lyrics, meta?.duration ?? current.duration);
    if (lyrics.length === 0) return;
    const state = usePlayerStore.getState();
    // A skip while fetching must not paint these lyrics on the next song.
    if (state.currentSong?.id === streamId) state.updateCurrentSong({ lyrics, lyricSource: result.source });
    if (state.playlistQueue) {
      state.updateQueue(state.playlistQueue.map(s => (s.id === streamId ? { ...s, lyrics, lyricSource: result.source } : s)));
    }
  } catch {
    // Lyrics are a nice-to-have for a stream; playback carries on without them.
  } finally {
    lyricsInFlight.delete(streamId);
  }
}

const RADIO_THRESHOLD = 2; // extend when this few songs remain after the current one
let radioInFlight = false;

async function extendRadio(streamId: string): Promise<void> {
  const state = usePlayerStore.getState();
  const queue = state.playlistQueue;
  if (!queue || state.currentPlaylistId !== STREAM_QUEUE_ID || radioInFlight) return;
  const idx = queue.findIndex(s => s.id === streamId);
  if (idx < 0 || queue.length - 1 - idx > RADIO_THRESHOLD) return;

  const seed = catalog.get(streamId);
  if (!seed) return;

  radioInFlight = true;
  try {
    const recs = await recommendFor(seed);
    const latest = usePlayerStore.getState();
    if (!latest.playlistQueue || latest.currentPlaylistId !== STREAM_QUEUE_ID) return;
    const queued = latest.playlistQueue.flatMap(s => [s.id, `${s.title.trim().toLowerCase()}|${(s.artist ?? '').trim().toLowerCase()}`]);
    const fresh = dedupeStreamable(recs, queued);
    if (fresh.length === 0) return;
    remember(fresh);
    latest.updateQueue([...latest.playlistQueue, ...fresh.map(s => toStreamSong(s))]);
    // If this was the last song, Media3 staged a wrap-around to the queue head.
    prepareNextInQueue();
  } finally {
    radioInFlight = false;
  }
}
