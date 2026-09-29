/**
 * Artists the listener follows from an artist page. Local only (no account):
 * followed artists get their own shelf on Stream.
 */
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface FollowedArtist {
  browseId: string;
  name: string;
  thumbnail?: string;
  followedAt: number;
}

interface FollowedArtistsState {
  artists: FollowedArtist[];
  toggle: (artist: Omit<FollowedArtist, 'followedAt'>) => void;
}

export const useFollowedArtistsStore = create<FollowedArtistsState>()(
  persist(
    set => ({
      artists: [],
      toggle: artist =>
        set(state =>
          state.artists.some(a => a.browseId === artist.browseId)
            ? { artists: state.artists.filter(a => a.browseId !== artist.browseId) }
            : { artists: [{ ...artist, followedAt: Date.now() }, ...state.artists].slice(0, 200) },
        ),
    }),
    { name: 'luvlyrics-followed-artists', storage: createJSONStorage(() => AsyncStorage) },
  ),
);
