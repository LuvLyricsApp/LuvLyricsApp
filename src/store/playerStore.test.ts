jest.mock('../database/queries', () => ({
  getSongById: jest.fn().mockResolvedValue(null),
}));

jest.mock('./songsStore', () => ({
  useSongsStore: {
    getState: jest.fn(() => ({
      songs: [],
      setCurrentSong: jest.fn(),
    })),
    setState: jest.fn(),
  },
}));

jest.mock('./settingsStore', () => ({
  useSettingsStore: {
    getState: jest.fn(() => ({
      updatePlaylistHistory: jest.fn(),
    })),
  },
}));

import { usePlayerStore, playerControls, registerSongsGetter } from './playerStore';
import * as queries from '../database/queries';
import { useSongsStore } from './songsStore';
import { Song } from '../types/song';

const makeSong = (id: string, overrides: Partial<Song> = {}): Song => ({
  id,
  title: `Song ${id}`,
  artist: 'Test Artist',
  album: 'Test Album',
  gradientId: 'dynamic',
  duration: 180,
  dateCreated: '2024-01-01T00:00:00.000Z',
  dateModified: '2024-01-01T00:00:00.000Z',
  playCount: 0,
  lyrics: [],
  ...overrides,
});

const resetState = () =>
  usePlayerStore.setState({
    currentSongId: null,
    currentSong: null,
    loadedAudioId: null,
    showTransliteration: false,
    hideMiniPlayer: false,
    miniPlayerHiddenSources: new Set(),
    playlistQueue: null,
    currentPlaylistId: null,
    currentQueueIndex: -1,
    isPlaying: false,
  });

describe('playerStore — simple state mutations', () => {
  beforeEach(() => {
    resetState();
    jest.clearAllMocks();
  });

  afterEach(resetState);

  describe('setIsPlaying', () => {
    it('sets isPlaying to true', () => {
      usePlayerStore.getState().setIsPlaying(true);
      expect(usePlayerStore.getState().isPlaying).toBe(true);
    });

    it('sets isPlaying to false', () => {
      usePlayerStore.setState({ isPlaying: true });
      usePlayerStore.getState().setIsPlaying(false);
      expect(usePlayerStore.getState().isPlaying).toBe(false);
    });
  });

  describe('setInitialSong', () => {
    it('sets currentSong and currentSongId without triggering audio load', () => {
      const song = makeSong('s1');
      usePlayerStore.getState().setInitialSong(song);
      expect(usePlayerStore.getState().currentSong).toEqual(song);
      expect(usePlayerStore.getState().currentSongId).toBe('s1');
    });
  });

  describe('setLoadedAudioId', () => {
    it('updates loadedAudioId', () => {
      usePlayerStore.getState().setLoadedAudioId('s1');
      expect(usePlayerStore.getState().loadedAudioId).toBe('s1');
    });

    it('clears loadedAudioId to null', () => {
      usePlayerStore.setState({ loadedAudioId: 's1' });
      usePlayerStore.getState().setLoadedAudioId(null);
      expect(usePlayerStore.getState().loadedAudioId).toBeNull();
    });
  });

  describe('updateCurrentSong', () => {
    it('merges partial updates into the current song', () => {
      const song = makeSong('s1');
      usePlayerStore.setState({ currentSong: song });
      usePlayerStore.getState().updateCurrentSong({ isLiked: true, title: 'Updated Title' });
      expect(usePlayerStore.getState().currentSong?.isLiked).toBe(true);
      expect(usePlayerStore.getState().currentSong?.title).toBe('Updated Title');
      expect(usePlayerStore.getState().currentSong?.artist).toBe('Test Artist');
    });

    it('is a no-op when currentSong is null', () => {
      usePlayerStore.getState().updateCurrentSong({ isLiked: true });
      expect(usePlayerStore.getState().currentSong).toBeNull();
    });
  });

  describe('toggleShowTransliteration', () => {
    it('flips false → true', () => {
      usePlayerStore.getState().toggleShowTransliteration();
      expect(usePlayerStore.getState().showTransliteration).toBe(true);
    });

    it('flips true → false', () => {
      usePlayerStore.setState({ showTransliteration: true });
      usePlayerStore.getState().toggleShowTransliteration();
      expect(usePlayerStore.getState().showTransliteration).toBe(false);
    });
  });

  describe('setMiniPlayerHiddenSource', () => {
    it('hides mini player when a source is added', () => {
      usePlayerStore.getState().setMiniPlayerHiddenSource('nowplaying', true);
      expect(usePlayerStore.getState().hideMiniPlayer).toBe(true);
      expect(usePlayerStore.getState().miniPlayerHiddenSources.has('nowplaying')).toBe(true);
    });

    it('shows mini player once all sources are removed', () => {
      usePlayerStore.getState().setMiniPlayerHiddenSource('nowplaying', true);
      usePlayerStore.getState().setMiniPlayerHiddenSource('nowplaying', false);
      expect(usePlayerStore.getState().hideMiniPlayer).toBe(false);
    });

    it('stays hidden while multiple sources remain', () => {
      usePlayerStore.getState().setMiniPlayerHiddenSource('a', true);
      usePlayerStore.getState().setMiniPlayerHiddenSource('b', true);
      usePlayerStore.getState().setMiniPlayerHiddenSource('a', false);
      expect(usePlayerStore.getState().hideMiniPlayer).toBe(true);
      expect(usePlayerStore.getState().miniPlayerHiddenSources.has('b')).toBe(true);
    });

    it('removing a non-existent source is a no-op', () => {
      usePlayerStore.getState().setMiniPlayerHiddenSource('ghost', false);
      expect(usePlayerStore.getState().hideMiniPlayer).toBe(false);
    });
  });

  describe('setMiniPlayerHidden (legacy)', () => {
    it('hides mini player via the manual source', () => {
      usePlayerStore.getState().setMiniPlayerHidden(true);
      expect(usePlayerStore.getState().hideMiniPlayer).toBe(true);
      expect(usePlayerStore.getState().miniPlayerHiddenSources.has('manual')).toBe(true);
    });

    it('shows mini player by removing the manual source', () => {
      usePlayerStore.getState().setMiniPlayerHidden(true);
      usePlayerStore.getState().setMiniPlayerHidden(false);
      expect(usePlayerStore.getState().hideMiniPlayer).toBe(false);
    });
  });

  describe('reset', () => {
    it('clears all playback state', () => {
      usePlayerStore.setState({
        currentSongId: 'x',
        currentSong: makeSong('x'),
        loadedAudioId: 'x',
        playlistQueue: [makeSong('a')],
        currentPlaylistId: 'pl-1',
        currentQueueIndex: 2,
        isPlaying: true,
      });

      usePlayerStore.getState().reset();

      const state = usePlayerStore.getState();
      expect(state.currentSongId).toBeNull();
      expect(state.currentSong).toBeNull();
      expect(state.loadedAudioId).toBeNull();
      expect(state.playlistQueue).toBeNull();
      expect(state.currentPlaylistId).toBeNull();
      expect(state.currentQueueIndex).toBe(-1);
    });
  });
});

describe('playerStore — queue management', () => {
  beforeEach(() => {
    resetState();
    jest.clearAllMocks();
    // Prevent loadSong from actually querying DB in queue tests
    (queries.getSongById as jest.Mock).mockResolvedValue(null);
    (useSongsStore.getState as jest.Mock).mockReturnValue({
      songs: [],
      setCurrentSong: jest.fn(),
    });
  });

  afterEach(resetState);

  describe('setPlaylistQueue', () => {
    it('sets queue, index, currentSong, forces isPlaying', () => {
      const songs = [makeSong('a'), makeSong('b'), makeSong('c')];
      usePlayerStore.getState().setPlaylistQueue('pl-1', songs, 1);
      const state = usePlayerStore.getState();
      expect(state.playlistQueue).toEqual(songs);
      expect(state.currentPlaylistId).toBe('pl-1');
      expect(state.currentQueueIndex).toBe(1);
      expect(state.currentSong).toEqual(songs[1]);
      expect(state.currentSongId).toBe('b');
      expect(state.isPlaying).toBe(true);
    });

    it('sets currentSong and currentSongId from the start index', () => {
      const songs = [makeSong('a'), makeSong('b')];
      usePlayerStore.getState().setPlaylistQueue('pl-1', songs, 0);
      expect(usePlayerStore.getState().currentSong?.id).toBe('a');
    });
  });

  describe('updateQueue', () => {
    it('replaces the queue and re-anchors the index to the current song', () => {
      const songs = [makeSong('a'), makeSong('b'), makeSong('c')];
      usePlayerStore.setState({ playlistQueue: songs, currentSongId: 'c', currentQueueIndex: 2 });

      const reordered = [makeSong('c'), makeSong('a'), makeSong('b')];
      usePlayerStore.getState().updateQueue(reordered);

      expect(usePlayerStore.getState().playlistQueue).toEqual(reordered);
      // 'c' moved from index 2 to index 0
      expect(usePlayerStore.getState().currentQueueIndex).toBe(0);
    });

    it('keeps the current index when the current song is not in the new queue', () => {
      const songs = [makeSong('a'), makeSong('b')];
      usePlayerStore.setState({ playlistQueue: songs, currentSongId: 'x', currentQueueIndex: 1 });

      const newQueue = [makeSong('c'), makeSong('d')];
      usePlayerStore.getState().updateQueue(newQueue);

      expect(usePlayerStore.getState().currentQueueIndex).toBe(1);
    });

    it('handles no currentSongId gracefully', () => {
      usePlayerStore.setState({ currentSongId: null, currentQueueIndex: 0 });
      const newQueue = [makeSong('a'), makeSong('b')];
      usePlayerStore.getState().updateQueue(newQueue);
      expect(usePlayerStore.getState().playlistQueue).toEqual(newQueue);
    });
  });

  describe('removeFromQueue', () => {
    it('removes the song from the queue', () => {
      const songs = [makeSong('a'), makeSong('b'), makeSong('c')];
      usePlayerStore.setState({
        playlistQueue: songs,
        currentSongId: 'a',
        currentSong: songs[0],
        currentQueueIndex: 0,
      });
      usePlayerStore.getState().removeFromQueue('b');
      expect(usePlayerStore.getState().playlistQueue?.map(s => s.id)).toEqual(['a', 'c']);
    });

    it('clears currentSong when the currently-playing song is removed', () => {
      const songs = [makeSong('a'), makeSong('b')];
      usePlayerStore.setState({
        playlistQueue: songs,
        currentSongId: 'a',
        currentSong: songs[0],
        currentQueueIndex: 0,
      });
      usePlayerStore.getState().removeFromQueue('a');
      expect(usePlayerStore.getState().currentSong).toBeNull();
      expect(usePlayerStore.getState().currentSongId).toBeNull();
      expect(usePlayerStore.getState().currentQueueIndex).toBe(-1);
    });

    it('decrements currentQueueIndex when a song before the current is removed', () => {
      const songs = [makeSong('a'), makeSong('b'), makeSong('c')];
      usePlayerStore.setState({
        playlistQueue: songs,
        currentSongId: 'c',
        currentSong: songs[2],
        currentQueueIndex: 2,
      });
      usePlayerStore.getState().removeFromQueue('a'); // index 0, before current
      expect(usePlayerStore.getState().currentQueueIndex).toBe(1);
    });

    it('does not change currentQueueIndex when a song after the current is removed', () => {
      const songs = [makeSong('a'), makeSong('b'), makeSong('c')];
      usePlayerStore.setState({
        playlistQueue: songs,
        currentSongId: 'a',
        currentSong: songs[0],
        currentQueueIndex: 0,
      });
      usePlayerStore.getState().removeFromQueue('c'); // index 2, after current
      expect(usePlayerStore.getState().currentQueueIndex).toBe(0);
    });

    it('sets playlistQueue to null when the last song (non-playing) is removed', () => {
      const songs = [makeSong('a'), makeSong('b')];
      // currently playing 'b', remove 'a' leaving only 'b', then remove 'b' indirectly
      usePlayerStore.setState({
        playlistQueue: [makeSong('lonely')],
        currentSongId: 'other',
        currentSong: makeSong('other'),
        currentQueueIndex: 5,
      });
      usePlayerStore.getState().removeFromQueue('lonely');
      expect(usePlayerStore.getState().playlistQueue).toBeNull();
    });

    it('sets currentPlaylistId to null when queue becomes empty', () => {
      const songs = [makeSong('a')];
      usePlayerStore.setState({
        playlistQueue: songs,
        currentSongId: 'other',
        currentSong: makeSong('other'),
        currentPlaylistId: 'pl-1',
        currentQueueIndex: 5,
      });
      usePlayerStore.getState().removeFromQueue('a');
      expect(usePlayerStore.getState().currentPlaylistId).toBeNull();
    });

    it('is a no-op when playlistQueue is null', () => {
      usePlayerStore.setState({ playlistQueue: null });
      expect(() => usePlayerStore.getState().removeFromQueue('x')).not.toThrow();
    });
  });

  describe('clearPlaylistQueue', () => {
    it('resets all queue-related state', () => {
      usePlayerStore.setState({
        playlistQueue: [makeSong('a')],
        currentPlaylistId: 'pl-1',
        currentQueueIndex: 0,
      });
      usePlayerStore.getState().clearPlaylistQueue();
      const state = usePlayerStore.getState();
      expect(state.playlistQueue).toBeNull();
      expect(state.currentPlaylistId).toBeNull();
      expect(state.currentQueueIndex).toBe(-1);
    });
  });
});

describe('playerStore — nextInPlaylist / previousInPlaylist', () => {
  beforeEach(() => {
    resetState();
    jest.clearAllMocks();
    (queries.getSongById as jest.Mock).mockResolvedValue(null);
    (useSongsStore.getState as jest.Mock).mockReturnValue({
      songs: [],
      setCurrentSong: jest.fn(),
    });
  });

  afterEach(resetState);

  describe('nextInPlaylist', () => {
    it('advances to the next song', async () => {
      const songs = [makeSong('a'), makeSong('b'), makeSong('c')];
      usePlayerStore.setState({ playlistQueue: songs, currentQueueIndex: 0, currentSongId: 'a' });
      await usePlayerStore.getState().nextInPlaylist();
      expect(usePlayerStore.getState().currentQueueIndex).toBe(1);
      expect(usePlayerStore.getState().currentSongId).toBe('b');
    });

    it('wraps around from the last song to the first', async () => {
      const songs = [makeSong('a'), makeSong('b')];
      usePlayerStore.setState({ playlistQueue: songs, currentQueueIndex: 1, currentSongId: 'b' });
      await usePlayerStore.getState().nextInPlaylist();
      expect(usePlayerStore.getState().currentQueueIndex).toBe(0);
      expect(usePlayerStore.getState().currentSongId).toBe('a');
    });

    it('forces isPlaying = true on advance', async () => {
      const songs = [makeSong('a'), makeSong('b')];
      usePlayerStore.setState({
        playlistQueue: songs,
        currentQueueIndex: 0,
        currentSongId: 'a',
        isPlaying: false,
      });
      await usePlayerStore.getState().nextInPlaylist();
      expect(usePlayerStore.getState().isPlaying).toBe(true);
    });

    it('does nothing when queue is null and playlist is not library', async () => {
      usePlayerStore.setState({
        playlistQueue: null,
        currentPlaylistId: 'pl-1',
        currentSongId: 'a',
      });
      await usePlayerStore.getState().nextInPlaylist();
      expect(usePlayerStore.getState().currentSongId).toBe('a');
    });

    it('does nothing when queue is null and there is no playlist', async () => {
      usePlayerStore.setState({
        playlistQueue: null,
        currentPlaylistId: null,
        currentSongId: 'a',
      });
      await usePlayerStore.getState().nextInPlaylist();
      expect(usePlayerStore.getState().currentSongId).toBe('a');
    });

    it('rebuilds queue from registered songs getter when in library mode', async () => {
      const songs = [makeSong('a'), makeSong('b'), makeSong('c')];
      registerSongsGetter(() => songs);
      usePlayerStore.setState({
        playlistQueue: null,
        currentPlaylistId: 'library',
        currentSongId: 'a',
        currentQueueIndex: -1,
      });
      await usePlayerStore.getState().nextInPlaylist();
      // Should rebuild queue from getter and advance to song at index 1 ('b')
      expect(usePlayerStore.getState().currentSongId).toBe('b');
    });

    it('does nothing when in library mode with empty songs getter', async () => {
      registerSongsGetter(() => []);
      usePlayerStore.setState({
        playlistQueue: null,
        currentPlaylistId: 'library',
        currentSongId: 'a',
      });
      await usePlayerStore.getState().nextInPlaylist();
      expect(usePlayerStore.getState().currentSongId).toBe('a');
    });
  });

  describe('previousInPlaylist', () => {
    it('goes to the previous song', () => {
      const songs = [makeSong('a'), makeSong('b'), makeSong('c')];
      usePlayerStore.setState({ playlistQueue: songs, currentQueueIndex: 2, currentSongId: 'c' });
      usePlayerStore.getState().previousInPlaylist();
      expect(usePlayerStore.getState().currentQueueIndex).toBe(1);
      expect(usePlayerStore.getState().currentSongId).toBe('b');
    });

    it('wraps around from the first song to the last', () => {
      const songs = [makeSong('a'), makeSong('b'), makeSong('c')];
      usePlayerStore.setState({ playlistQueue: songs, currentQueueIndex: 0, currentSongId: 'a' });
      usePlayerStore.getState().previousInPlaylist();
      expect(usePlayerStore.getState().currentQueueIndex).toBe(2);
      expect(usePlayerStore.getState().currentSongId).toBe('c');
    });

    it('forces isPlaying = true', () => {
      const songs = [makeSong('a'), makeSong('b')];
      usePlayerStore.setState({
        playlistQueue: songs,
        currentQueueIndex: 1,
        currentSongId: 'b',
        isPlaying: false,
      });
      usePlayerStore.getState().previousInPlaylist();
      expect(usePlayerStore.getState().isPlaying).toBe(true);
    });

    it('is a no-op when queue is null', () => {
      usePlayerStore.setState({ playlistQueue: null, currentSongId: 'a' });
      expect(() => usePlayerStore.getState().previousInPlaylist()).not.toThrow();
      expect(usePlayerStore.getState().currentSongId).toBe('a');
    });

    it('is a no-op when queue is empty', () => {
      usePlayerStore.setState({ playlistQueue: [], currentSongId: 'a' });
      expect(() => usePlayerStore.getState().previousInPlaylist()).not.toThrow();
    });
  });
});

describe('playerStore — loadSong', () => {
  beforeEach(() => {
    resetState();
    jest.clearAllMocks();
  });

  afterEach(resetState);

  it('sets currentSongId immediately using the cached song', async () => {
    const song = makeSong('s1');
    (useSongsStore.getState as jest.Mock).mockReturnValue({
      songs: [song],
      setCurrentSong: jest.fn(),
    });
    (queries.getSongById as jest.Mock).mockResolvedValue(song);

    await usePlayerStore.getState().loadSong('s1');

    expect(usePlayerStore.getState().currentSongId).toBe('s1');
  });

  it('merges full song details (lyrics) from DB after optimistic update', async () => {
    const lite = makeSong('s1');
    const full = makeSong('s1', { lyrics: [{ id: 1, timestamp: 0, text: 'Hello', lineOrder: 0 }] });
    (useSongsStore.getState as jest.Mock).mockReturnValue({
      songs: [lite],
      setCurrentSong: jest.fn(),
    });
    (queries.getSongById as jest.Mock).mockResolvedValue(full);

    await usePlayerStore.getState().loadSong('s1');

    expect(usePlayerStore.getState().currentSong?.lyrics).toHaveLength(1);
  });

  it('does not overwrite currentSong from DB when currentSongId changed mid-load', async () => {
    const songA = makeSong('a');
    const songAFull = makeSong('a', { lyrics: [{ id: 1, timestamp: 0, text: 'from DB', lineOrder: 0 }] });
    const songB = makeSong('b');
    // No cached song so the optimistic set() is skipped — only the DB path runs
    (useSongsStore.getState as jest.Mock).mockReturnValue({
      songs: [],
      setCurrentSong: jest.fn(),
    });
    // Simulate: while getSongById is awaited, another song starts playing
    (queries.getSongById as jest.Mock).mockImplementation(async () => {
      usePlayerStore.setState({ currentSongId: 'b', currentSong: songB });
      return songAFull;
    });

    await usePlayerStore.getState().loadSong('a');

    // The DB result for 'a' must NOT overwrite currentSong now pointing at 'b'
    expect(usePlayerStore.getState().currentSongId).toBe('b');
    expect(usePlayerStore.getState().currentSong?.id).toBe('b');
    expect(usePlayerStore.getState().currentSong?.lyrics).toHaveLength(0);
  });

  it('handles a missing cached song gracefully (no crash)', async () => {
    (useSongsStore.getState as jest.Mock).mockReturnValue({
      songs: [],
      setCurrentSong: jest.fn(),
    });
    (queries.getSongById as jest.Mock).mockResolvedValue(null);

    await expect(usePlayerStore.getState().loadSong('s1')).resolves.not.toThrow();
  });
});
