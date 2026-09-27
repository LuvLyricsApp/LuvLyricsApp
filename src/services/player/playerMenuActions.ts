/**
 * What the Now Playing ••• menu does (Echo Music's PlayerMenu, on LuvLyrics'
 * player). Each action reports back in plain words for a toast.
 */
import { Share } from 'react-native';
import { playerControls, prepareNextInQueue, usePlayerStore } from '../../store/playerStore';
import { Song, UnifiedSong } from '../../types/song';
import { defaultDeps, findSeedVideoId } from '../stream/recommend';
import { StreamService } from '../stream/StreamService';
import { isOnDevice, isStreamSongId } from '../stream/streamSong';
import { NativeAudioPlayer } from '../NativeAudioPlayer';
import { positionSV } from '../../playback/positionBus';

/** The catalog shape recommend/resolve work with, for any song in the player. */
export const seedFor = (song: Song): UnifiedSong => StreamService.catalogFor(song.id) ?? {
  id: song.id,
  title: song.title,
  artist: song.artist ?? '',
  highResArt: song.coverImageUri ?? '',
  downloadUrl: song.audioUri ?? 'local',
  source: 'Local',
  duration: song.duration,
};

/** The song's YouTube Music id (what Echo and YouTube Music links use), or null. */
export const youtubeIdFor = async (song: Song): Promise<string | null> => {
  if (song.youtubeVideoId) return song.youtubeVideoId;
  return findSeedVideoId(seedFor(song), defaultDeps).catch(() => null);
};

export const shareSong = async (song: Song): Promise<void> => {
  const id = await youtubeIdFor(song);
  const line = `${song.title}${song.artist ? ` — ${song.artist}` : ''}`;
  const message = id ? `${line}\nhttps://music.youtube.com/watch?v=${id}` : line;
  await Share.share({ message }).catch(() => undefined);
};

/** Shuffles what's left after the current song. Returns how many moved. */
export const shuffleUpcoming = (): number => {
  const s = usePlayerStore.getState();
  const queue = s.playlistQueue;
  if (!queue) return 0;
  const at = Math.max(0, s.currentQueueIndex);
  const rest = queue.slice(at + 1);
  if (rest.length < 2) return 0;
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }
  s.updateQueue([...queue.slice(0, at + 1), ...rest]);
  // Media3 may already have staged the old "next".
  prepareNextInQueue();
  return rest.length;
};

const waitFor = async (check: () => boolean, timeoutMs: number): Promise<boolean> => {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    if (check()) return true;
    await new Promise(r => setTimeout(r, 100));
  }
  return check();
};

/**
 * Echo's "Refetch": load the current song's audio again and carry on from the
 * same spot — for a stream that stalled or a file that played garbled.
 */
export const refetchCurrent = async (): Promise<boolean> => {
  const s = usePlayerStore.getState();
  const id = s.currentSongId;
  if (!id) return false;
  const at = positionSV.value;
  const wasPlaying = s.isPlaying;
  s.setLoadedAudioId(null);
  const loaded = await waitFor(() => usePlayerStore.getState().loadedAudioId === id, 10_000);
  if (!loaded || usePlayerStore.getState().currentSongId !== id) return false;
  // Scrub/seek pattern: seek, then resume only if the user was playing.
  playerControls.seekTo(at);
  usePlayerStore.getState().requestPlayback(wasPlaying);
  return true;
};

export const canSetRingtone = (song: Song): boolean =>
  NativeAudioPlayer.isAvailable() && !isStreamSongId(song.id) && isOnDevice(song.audioUri);

export const setAsRingtone = async (song: Song): Promise<string> => {
  if (!song.audioUri) return 'This song isn’t saved on the phone';
  const result = await NativeAudioPlayer.setRingtone(song.audioUri, song.title);
  switch (result) {
    case 'ok': return `“${song.title}” is your ringtone`;
    case 'permission': return 'Allow LuvLyrics to modify system settings, then try again';
    case 'unsupported': return 'Setting a ringtone needs Android 10 or later';
    case 'missing': return 'Couldn’t find the song file';
    default: return 'Couldn’t set the ringtone';
  }
};
