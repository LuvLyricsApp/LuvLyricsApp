/**
 * LyricFlow - Navigation Type Definitions
 */

import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { CompositeScreenProps } from '@react-navigation/native';

// Root Stack Navigator
export type RootStackParamList = {
  Main: undefined;
  NowPlaying: { songId: string };
  AddEditLyrics: { songId?: string }; // undefined = add new, string = edit existing
  Settings: undefined; // moved off the tab bar; reached from the Home header
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
  PlaylistDetail: { playlistId: string }; // Playlist detail screen
  CreatePlaylist: { playlistId?: string, initialName?: string } | undefined; // Create or Edit playlist modal
  AddToPlaylist: { songId?: string; playlistId?: string }; // NEW: Add song to playlist modal
};

// Bottom Tab Navigator
export type TabParamList = {
  Home: undefined; // Was Library
  Luvs: undefined;
  Library: undefined; // Was Playlists
  Search: undefined; // replaced Settings in the tab bar
};

// Screen Props
export type RootStackScreenProps<T extends keyof RootStackParamList> =
  NativeStackScreenProps<RootStackParamList, T>;

export type TabScreenProps<T extends keyof TabParamList> = CompositeScreenProps<
  BottomTabScreenProps<TabParamList, T>,
  NativeStackScreenProps<RootStackParamList>
>;
