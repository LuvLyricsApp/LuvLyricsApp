/**
 * Streaming a catalog song without downloading it.
 *
 * The player queue speaks `Song` (the SQLite library shape). A streamed track
 * becomes a transient Song whose `audioUri` is the provider's CDN URL and whose
 * id carries a `stream:` prefix, so nothing ever mistakes it for a library row.
 */
import { Song, UnifiedSong } from '../../types/song';

export const STREAM_QUEUE_ID = 'stream';
const PREFIX = 'stream:';

export const streamIdFor = (song: Pick<UnifiedSong, 'id' | 'source'>): string =>
  `${PREFIX}${song.source.toLowerCase()}:${song.id}`;

export const isStreamSongId = (id: string | null | undefined): boolean => !!id && id.startsWith(PREFIX);

/** `stream:saavn:abc` -> { source: 'saavn', providerId: 'abc' } */
export const parseStreamId = (id: string): { source: string; providerId: string } | null => {
  if (!isStreamSongId(id)) return null;
  const rest = id.slice(PREFIX.length);
  const sep = rest.indexOf(':');
  if (sep <= 0) return null;
  return { source: rest.slice(0, sep), providerId: rest.slice(sep + 1) };
};

export const streamUrlOf = (song: UnifiedSong): string => song.streamUrl || song.downloadUrl || '';

export const toStreamSong = (song: UnifiedSong, now: string = new Date().toISOString()): Song => ({
  id: streamIdFor(song),
  title: song.title,
  artist: song.artist,
  gradientId: 'dynamic',
  duration: song.duration ?? 0,
  dateCreated: now,
  dateModified: now,
  playCount: 0,
  lyrics: [],
  coverImageUri: song.highResArt || song.thumbnail || undefined,
  audioUri: streamUrlOf(song),
  lyricSource: undefined,
});

/** Keeps the first occurrence of each track; drops tracks with nothing to play. */
export const dedupeStreamable = (songs: UnifiedSong[], exclude: Iterable<string> = []): UnifiedSong[] => {
  const seen = new Set<string>(exclude);
  const out: UnifiedSong[] = [];
  for (const s of songs) {
    if (!s.id || !streamUrlOf(s)) continue;
    const key = streamIdFor(s);
    // Same song re-uploaded under another id: match on title + artist too.
    const soft = `${s.title.trim().toLowerCase()}|${s.artist.trim().toLowerCase()}`;
    if (seen.has(key) || seen.has(soft)) continue;
    seen.add(key);
    seen.add(soft);
    out.push(s);
  }
  return out;
};

/** Remote URLs are streams; anything else (file://, content://, bare paths) is on the device. */
export const isOnDevice = (uri: string | undefined | null): boolean => !!uri && !/^https?:\/\//i.test(uri);
