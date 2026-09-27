/**
 * Recent searches, kept across launches. Newest first, de-duplicated
 * case-insensitively, capped so the list stays a glance, not a log.
 */
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

const MAX_RECENT = 10;

interface SearchHistoryState {
  recent: string[];
  remember: (query: string) => void;
  forget: (query: string) => void;
  clear: () => void;
}

export const useSearchHistoryStore = create<SearchHistoryState>()(
  persist(
    set => ({
      recent: [],
      remember: query => {
        const q = query.trim();
        if (!q) return;
        set(s => ({
          recent: [q, ...s.recent.filter(r => r.toLowerCase() !== q.toLowerCase())].slice(0, MAX_RECENT),
        }));
      },
      forget: query => set(s => ({ recent: s.recent.filter(r => r !== query) })),
      clear: () => set({ recent: [] }),
    }),
    { name: 'luvlyrics-search-history', storage: createJSONStorage(() => AsyncStorage) },
  ),
);
