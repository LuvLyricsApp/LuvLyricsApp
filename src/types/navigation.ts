/**
 * LyricFlow - Navigation Type Definitions
 */

import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { CompositeScreenProps, NavigatorScreenParams } from '@react-navigation/native';

// Root Stack Navigator
export type RootStackParamList = {
  Main: NavigatorScreenParams<TabParamList> | undefined;
  NowPlaying: { songId: string };
  AddEditLyrics: { songId?: string }; // undefined = add new, string = edit existing
  YoutubeBrowser: undefined;
  LuvsVault: undefined; // Luvs liked songs vault
  CreatePlaylist: { playlistId?: string, initialName?: string } | undefined; // Create or Edit playlist modal
  AddToPlaylist: { songId?: string; playlistId?: string }; // NEW: Add song to playlist modal
};

/** Params for the audio downloader, which lives inside the tab navigator. */
export type AudioDownloaderParams = {
  fromBrowser?: boolean;
  videoTitle?: string;
  videoAuthor?: string;
  videoId?: string;
  audioUrl?: string;
  audioBitrate?: number;
  audioFormat?: string;
  thumbnail?: string;
  lengthSeconds?: number;
  voiceQuery?: string;
  autoDownload?: boolean;
} | undefined;

// Bottom Tab Navigator
export type TabParamList = {
  Home: undefined; // Was Library
  Stream: undefined; // catalog streaming + Echo-style home feed
  Luvs: undefined;
  Library: NavigatorScreenParams<LibraryStackParamList> | undefined; // Was Playlists
  Search: undefined; // replaced Settings in the tab bar
  // Pushed screens without a tab icon. They live in the tab navigator so the
  // bottom bar stays on screen, as in Spotify and Apple Music (see VISIBLE_TABS).
  Settings: undefined;
  AudioDownloader: AudioDownloaderParams;
};

/**
 * Stack nested inside the Library tab. PlaylistDetail lives here rather than on the
 * root stack so the tab bar and mini player stay on screen while you are inside a
 * playlist — a root-stack sibling covers the tab navigator entirely.
 */
export type LibraryStackParamList = {
  PlaylistsHome: undefined;
  PlaylistDetail: { playlistId: string };
  Downloads: undefined;
};

// Screen Props
export type RootStackScreenProps<T extends keyof RootStackParamList> =
  NativeStackScreenProps<RootStackParamList, T>;

export type TabScreenProps<T extends keyof TabParamList> = CompositeScreenProps<
  BottomTabScreenProps<TabParamList, T>,
  NativeStackScreenProps<RootStackParamList>
>;
