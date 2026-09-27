// Regression: songsStore used to import playerStore at init to register a songs
// getter. When playerStore loaded first, that back-edge ran while playerStore was
// half-initialised — a TDZ throw on web, and on Hermes the getter was silently
// reset to null, so library auto-next could never rebuild its queue.
//
// Module-graph stubs only (as in playerStore.test.ts); nothing here reads SQLite.
jest.mock('../database/queries', () => ({
  getSongById: jest.fn().mockResolvedValue(null),
  updatePlayStats: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('./settingsStore', () => ({
  useSettingsStore: { getState: () => ({ updatePlaylistHistory: jest.fn() }) },
}));
jest.mock('./dailyStatsStore', () => ({
  useDailyStatsStore: { getState: () => ({ incrementDailyPlay: jest.fn() }) },
}));
jest.mock('../services/NativeSearch', () => ({ nativeSearch: {} }));
jest.mock('../services/NativeAudioPlayer', () => ({
  NativeAudioPlayer: {
    isAvailable: () => false,
    prepareNext: jest.fn(),
    seekToNextIfReady: jest.fn().mockResolvedValue(false),
  },
}));

import type { Song } from '../types/song';

const song = (id: string): Song => ({
  id,
  title: id,
  gradientId: 'dynamic',
  duration: 100,
  dateCreated: '',
  dateModified: '',
  playCount: 0,
  lyrics: [],
  audioUri: `file:///${id}.mp3`,
});

it('library auto-next rebuilds its queue even when playerStore loads first', async () => {
  // Load order matters: playerStore first, exactly the case that used to break.
  const { usePlayerStore, playerControls } = require('./playerStore');
  const { useSongsStore } = require('./songsStore');
  playerControls.play = jest.fn();

  useSongsStore.setState({ songs: [song('a'), song('b'), song('c')] });
  usePlayerStore.setState({ currentPlaylistId: 'library', currentSongId: 'a', playlistQueue: null, currentQueueIndex: -1 });

  await usePlayerStore.getState().nextInPlaylist();

  const state = usePlayerStore.getState();
  expect(state.playlistQueue?.map((s: Song) => s.id)).toEqual(['a', 'b', 'c']);
  expect(state.currentSongId).toBe('b');
});
