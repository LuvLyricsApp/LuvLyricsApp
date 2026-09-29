/**
 * Streamed songs the listener has liked but that are still downloading.
 *
 * A streamed song has no library row to like, so liking one saves it (a
 * download) and remembers the like here, by the same title + lead-artist key
 * the library matching uses. The heart shows it liked straight away; when the
 * download lands in the library the like is applied to the new row, which is
 * what puts it in Liked songs. Never persisted: a like is only worth carrying
 * across the few seconds of a download.
 */
import { create } from 'zustand';

interface StreamLikesState {
  pending: string[];
  add: (key: string) => void;
  remove: (key: string) => void;
  /** Removes the key and says whether it was there. */
  take: (key: string) => boolean;
}

export const useStreamLikesStore = create<StreamLikesState>((set, get) => ({
  pending: [],
  add: key => set(s => (s.pending.includes(key) ? s : { pending: [...s.pending, key] })),
  remove: key => set(s => (s.pending.includes(key) ? { pending: s.pending.filter(k => k !== key) } : s)),
  take: key => {
    if (!get().pending.includes(key)) return false;
    set(s => ({ pending: s.pending.filter(k => k !== key) }));
    return true;
  },
}));
