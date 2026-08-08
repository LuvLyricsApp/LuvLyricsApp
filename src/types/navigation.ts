/**
 * LyricFlow - Navigation Type Definitions
 */

import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { CompositeScreenProps } from '@react-navigation/native';

// Root Stack Navigator
export type RootStackParamList = {
  Main: undefined;
  AddEditLyrics: { songId?: string }; // undefined = add new, string = edit existing
  AudioDownloader: {
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
  YoutubeBrowser: undefined;
  LuvsVault: undefined; // Luvs liked songs vault
  CreatePlaylist: { playlistId?: string, initialName?: string } | undefined; // Create or Edit playlist modal
  AddToPlaylist: { songId?: string; playlistId?: string }; // NEW: Add song to playlist modal
};

// Bottom Tab Navigator
export type TabParamList = {
  Home: undefined; // Was Library
  Luvs: undefined;
  Library: undefined; // Was Playlists
  Search: undefined; // replaced Settings in the tab bar
  Settings: undefined; // hidden route so Settings retains the bottom navigation
};

/**
 * Stack nested inside the Library tab. PlaylistDetail lives here rather than on the
 * root stack so the tab bar and mini player stay on screen while you are inside a
 * playlist — a root-stack sibling covers the tab navigator entirely.
 */
export type LibraryStackParamList = {
  PlaylistsHome: undefined;
  PlaylistDetail: { playlistId: string };
};

// Screen Props
export type RootStackScreenProps<T extends keyof RootStackParamList> =
  NativeStackScreenProps<RootStackParamList, T>;

export type TabScreenProps<T extends keyof TabParamList> = CompositeScreenProps<
  BottomTabScreenProps<TabParamList, T>,
  NativeStackScreenProps<RootStackParamList>
>;
