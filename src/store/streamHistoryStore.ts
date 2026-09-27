/**
 * What the listener streamed recently. Seeds the Stream home feed ("Keep
 * listening", Quick Picks radio seeds) the way Echo Music seeds from its
 * local play history.
 */
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { UnifiedSong } from '../types/song';

const MAX_HISTORY = 60;

export interface StreamPlay {
  song: UnifiedSong;
  playedAt: number;
  plays: number;
}

interface StreamHistoryState {
  plays: StreamPlay[];
  recordPlay: (song: UnifiedSong) => void;
  clear: () => void;
}

export const useStreamHistoryStore = create<StreamHistoryState>()(
  persist(
    set => ({
      plays: [],
      recordPlay: song =>
        set(state => {
          const prev = state.plays.find(p => p.song.id === song.id && p.song.source === song.source);
          const rest = state.plays.filter(p => p !== prev);
          // Drop per-download selection fields; only catalog metadata is worth keeping.
          const meta: UnifiedSong = { ...song, selectedQuality: undefined, selectedLyrics: undefined, selectedCoverUri: undefined };
          const entry: StreamPlay = { song: meta, playedAt: Date.now(), plays: (prev?.plays ?? 0) + 1 };
          return { plays: [entry, ...rest].slice(0, MAX_HISTORY) };
        }),
      clear: () => set({ plays: [] }),
    }),
    {
      name: 'luvlyrics-stream-history',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
