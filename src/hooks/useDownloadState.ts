/**
 * A catalog song's download state, live: every row showing the same song
 * reads the same queue item, so a song saved from one shelf ticks everywhere.
 * Each row only re-renders when its own queue item (or the library) changes.
 */
import { useDownloadQueueStore } from '../store/downloadQueueStore';
import { useSongsStore } from '../store/songsStore';
import { DownloadState, downloadStateOf, libraryKeys, matchKey } from '../utils/downloadState';

export interface DownloadTarget {
  id: string;
  title: string;
  artist?: string;
}

export function useDownloadState(song: DownloadTarget): DownloadState {
  const item = useDownloadQueueStore(s => s.queue.find(q => q.id === song.id));
  const inLibrary = useSongsStore(s => libraryKeys(s.songs).has(matchKey(song.title, song.artist)));
  return downloadStateOf(item, inLibrary);
}
