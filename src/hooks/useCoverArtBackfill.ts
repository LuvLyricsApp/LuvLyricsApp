import { useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSongsStore } from '../store/songsStore';
import { searchMusic } from '../services/MultiSourceSearchService';
import { catalogSource, findCover, itunesSource } from '../services/covers/CoverArtResolver';

const ATTEMPTS_KEY = 'luvlyrics-cover-attempts';
const RETRY_AFTER_MS = 7 * 24 * 60 * 60 * 1000;
const START_DELAY_MS = 4000; // let startup, the library and the first play settle first
const MAX_PER_SESSION = 40;
const CONCURRENCY = 2;

const sources = [itunesSource, catalogSource(q => searchMusic(q))];

let running = false;
let doneThisSession = 0;

async function runBackfill(): Promise<void> {
  if (running || doneThisSession >= MAX_PER_SESSION) return;
  running = true;
  try {
    let attempts: Record<string, number> = {};
    try {
      attempts = JSON.parse((await AsyncStorage.getItem(ATTEMPTS_KEY)) ?? '{}') as Record<string, number>;
    } catch {
      attempts = {};
    }
    const now = Date.now();
    const pending = useSongsStore.getState().songs
      .filter(s => !s.coverImageUri && !s.isHidden && s.artist && s.artist !== 'Unknown Artist')
      .filter(s => !attempts[s.id] || now - attempts[s.id] > RETRY_AFTER_MS)
      // Most-played first: the covers people actually see.
      .sort((a, b) => b.playCount - a.playCount)
      .slice(0, MAX_PER_SESSION - doneThisSession);

    let cursor = 0;
    const worker = async () => {
      while (cursor < pending.length) {
        const song = pending[cursor++];
        const hit = await findCover({ title: song.title, artist: song.artist, duration: song.duration }, sources);
        attempts[song.id] = Date.now();
        doneThisSession++;
        if (hit) await useSongsStore.getState().patchCover(song.id, hit.artwork).catch(() => {});
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, pending.length) }, worker));
    await AsyncStorage.setItem(ATTEMPTS_KEY, JSON.stringify(attempts)).catch(() => {});
  } finally {
    running = false;
  }
}

/**
 * Mount once (RootNavigator). Quietly fills in real cover art for library songs
 * that have none, a few at a time, most-played first. Misses are remembered for
 * a week so offline launches don't hammer the lookup services.
 */
export const useCoverArtBackfill = (): void => {
  const songCount = useSongsStore(s => s.songs.length);
  useEffect(() => {
    if (songCount === 0) return;
    const timer = setTimeout(() => { runBackfill().catch(() => {}); }, START_DELAY_MS);
    return () => clearTimeout(timer);
  }, [songCount]);
};
