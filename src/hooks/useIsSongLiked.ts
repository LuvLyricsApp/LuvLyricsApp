import { usePlaylistStore } from '../store/playlistStore';
import { useSongsStore } from '../store/songsStore';
import { useStreamLikesStore } from '../store/streamLikesStore';
import { useDownloadQueueStore } from '../store/downloadQueueStore';
import { libraryLookup, matchKey } from '../utils/downloadState';

export interface LikeState {
  /** Show the heart filled. */
  liked: boolean;
  /** Liked, but the streamed song is still downloading into the library. */
  saving: boolean;
}

/**
 * The heart's state. For a song in the library the single source of truth is
 * playlistStore.likedSongIds (so it can't drift from the toggle path). A
 * streamed song has no row of its own: it counts as liked when its copy in the
 * library is, or while its like is waiting on the download that will create it.
 */
export function useSongLikeState(song: { id: string; title: string; artist?: string } | null | undefined): LikeState {
  const id = song?.id;
  const stream = !!id && id.startsWith('stream:');
  const key = stream && song ? matchKey(song.title, song.artist) : null;

  const rowLiked = usePlaylistStore(state => (id ? state.likedSongIds.has(id) : false));
  const libraryId = useSongsStore(state => (key ? libraryLookup(state.songs).get(key)?.id : undefined));
  const libraryLiked = usePlaylistStore(state => (libraryId ? state.likedSongIds.has(libraryId) : false));
  const waiting = useStreamLikesStore(state => (key ? state.pending.includes(key) : false));
  // A like only waits while its download is really in flight; a cancelled or
  // failed one lets go of the heart.
  const downloading = useDownloadQueueStore(state => (
    id ? state.queue.some(q => q.id === id && q.status !== 'completed' && q.status !== 'failed') : false
  ));

  const saving = waiting && downloading && !libraryLiked;
  return { liked: rowLiked || libraryLiked || saving, saving };
}

/** Whether a song is liked. Pass the song, not just its id, to get streamed songs right. */
export function useIsSongLiked(songId: string | undefined, song?: { title: string; artist?: string } | null): boolean {
  return useSongLikeState(songId && song ? { id: songId, title: song.title, artist: song.artist } : songId ? { id: songId, title: '' } : null).liked;
}
