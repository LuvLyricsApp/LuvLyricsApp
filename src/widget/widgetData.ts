/**
 * What the home-screen widgets show, kept as one small JSON snapshot.
 *
 * Widgets render in a headless JS task that may run with no app UI (and so
 * with empty stores) — they read this snapshot instead. The app writes it
 * whenever the song, play state, like or playlists change (useWidgetSync).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'luvlyrics-widget-snapshot';

export interface WidgetSong {
  id: string;
  title: string;
  artist: string;
  /** http(s) or file:// — both decode natively. */
  cover?: string;
}

export interface WidgetPlaylist {
  id: string;
  name: string;
  cover?: string;
  songCount: number;
  songs: WidgetSong[];
}

export interface WidgetSnapshot {
  song: WidgetSong | null;
  isPlaying: boolean;
  liked: boolean;
  /** Seconds, sampled when written; the widget can't tick on its own. */
  position: number;
  duration: number;
  playlists: WidgetPlaylist[];
  /** Which playlist the playlist widget shows (cycled from the widget). */
  playlistIndex: number;
}

export const EMPTY_SNAPSHOT: WidgetSnapshot = {
  song: null,
  isPlaying: false,
  liked: false,
  position: 0,
  duration: 0,
  playlists: [],
  playlistIndex: 0,
};

/** Songs listed per playlist — a widget list is a glance, not the library. */
export const WIDGET_PLAYLIST_SONGS = 25;

export const readSnapshot = async (): Promise<WidgetSnapshot> => {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? { ...EMPTY_SNAPSHOT, ...(JSON.parse(raw) as Partial<WidgetSnapshot>) } : EMPTY_SNAPSHOT;
  } catch {
    return EMPTY_SNAPSHOT;
  }
};

export const writeSnapshot = async (next: WidgetSnapshot): Promise<void> => {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // A widget that can't be refreshed keeps its last frame; never throw.
  }
};

/** Only covers the native widget renderer can decode. */
export const widgetCover = (uri?: string | null): string | undefined =>
  uri && /^(https?:|file:)/.test(uri) ? uri : undefined;

/** Deep links the widgets open. Handled in useWidgetLinks. */
export const widgetLink = {
  playSong: (playlistId: string, songId: string) =>
    `lyricflow://widget/play?playlist=${encodeURIComponent(playlistId)}&song=${encodeURIComponent(songId)}`,
  playPlaylist: (playlistId: string) => `lyricflow://widget/play?playlist=${encodeURIComponent(playlistId)}`,
  nowPlaying: () => 'lyricflow://widget/now-playing',
  share: () => 'lyricflow://widget/share',
};

export const formatClock = (seconds: number): string => {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
