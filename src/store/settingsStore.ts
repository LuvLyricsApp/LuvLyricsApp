/**
 * LyricFlow - Settings Store (Zustand)
 * Manages user preferences with AsyncStorage persistence
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SortOption, ViewMode } from '../types/song';

type Theme = 'dark' | 'light' | 'auto';
type FontSize = 'small' | 'medium' | 'large';
type LineSpacing = 'compact' | 'normal' | 'relaxed';
type ScrollSpeed = 'slow' | 'medium' | 'fast';

interface SettingsState {
  // Appearance
  theme: Theme;
  defaultGradientId: string;
  lyricsFontSize: FontSize;
  lineSpacing: LineSpacing;
  
  // Playback
  scrollSpeed: ScrollSpeed;
  skipDuration: 10 | 15 | 30;
  keepScreenOn: boolean;
  showTimeRemaining: boolean;
  playInMiniPlayerOnly: boolean;
  miniPlayerStyle: 'bar' | 'island'; // New setting
  navBarStyle: 'classic' | 'modern-pill'; // NEW: Navbar style
  voiceMode: 'hold' | 'tap';
  micEnabled: boolean;
  autoHideControls: boolean; // Toggle for hiding controls after 3.5s
  libraryBackgroundMode: 'daily' | 'aurora' | 'current' | 'black' | 'grey' | 'theme-blue' | 'purest-black' | 'theme-subtle';
  islandBgMode: 'album-art' | 'song-gradient' | 'aurora' | 'purest-black' | 'grey' | 'theme-subtle' | 'theme-blue';
  classicBarBgMode: 'album-art' | 'song-gradient' | 'aurora' | 'purest-black' | 'grey' | 'theme-subtle' | 'theme-blue';
  animateBackground: boolean;
  libraryFocusMode: boolean; // Toggle for "Focus Mode" (Black Background)
  showPerformanceHUD: boolean; // Toggle for FPS counter
  applyThemeToOtherPages: boolean; // Option to apply theme to playlists and settings pages
  
  // Library
  defaultView: ViewMode;
  defaultSort: SortOption;
  showThumbnails: boolean;
  
  // Persistence
  playlistHistory: Record<string, string>; // playlistId -> lastSongId
  
  // Downloads
  downloadDirectoryUri: string | null;

  // Actions
  setTheme: (theme: Theme) => void;
  setDefaultGradient: (gradientId: string) => void;
  setLyricsFontSize: (size: FontSize) => void;
  setLineSpacing: (spacing: LineSpacing) => void;
  setScrollSpeed: (speed: ScrollSpeed) => void;
  setSkipDuration: (duration: 10 | 15 | 30) => void;
  setKeepScreenOn: (enabled: boolean) => void;
  setShowTimeRemaining: (show: boolean) => void;
  setPlayInMiniPlayerOnly: (enabled: boolean) => void;
  setMiniPlayerStyle: (style: 'bar' | 'island') => void; // New action
  setNavBarStyle: (style: 'classic' | 'modern-pill') => void; // NEW: Navbar action
  setVoiceMode: (mode: 'hold' | 'tap') => void;
  setMicEnabled: (enabled: boolean) => void;
  setAutoHideControls: (enabled: boolean) => void;
  setLibraryBackgroundMode: (mode: 'daily' | 'aurora' | 'current' | 'black' | 'grey' | 'theme-blue' | 'purest-black' | 'theme-subtle') => void;
  setIslandBgMode: (mode: 'album-art' | 'song-gradient' | 'aurora' | 'purest-black' | 'grey' | 'theme-subtle' | 'theme-blue') => void;
  setClassicBarBgMode: (mode: 'album-art' | 'song-gradient' | 'aurora' | 'purest-black' | 'grey' | 'theme-subtle' | 'theme-blue') => void;
  setAnimateBackground: (enabled: boolean) => void;
  setLibraryFocusMode: (enabled: boolean) => void;
  setShowPerformanceHUD: (enabled: boolean) => void;
  setDefaultView: (view: ViewMode) => void;
  setDefaultSort: (sort: SortOption) => void;
  setShowThumbnails: (show: boolean) => void;
  
  // History Actions
  updatePlaylistHistory: (playlistId: string, songId: string) => void;
  setDownloadDirectory: (uri: string | null) => void;
  setApplyThemeToOtherPages: (enabled: boolean) => void;

  // Quick pins (3 customizable shortcut slots on Settings home)
  quickPins: [string, string, string];
  setQuickPins: (pins: [string, string, string]) => void;

  // Advanced
  lyricsDelay: number;
  setLyricsDelay: (delay: number) => void;

  resetToDefaults: () => void;
}

const DEFAULT_SETTINGS = {
  theme: 'dark' as Theme,
  defaultGradientId: 'aurora',
  lyricsFontSize: 'medium' as FontSize,
  lineSpacing: 'normal' as LineSpacing,
  scrollSpeed: 'medium' as ScrollSpeed,
  skipDuration: 15 as const,
  keepScreenOn: true,
  showTimeRemaining: true,
  playInMiniPlayerOnly: false,
  miniPlayerStyle: 'island' as const, // Default to island as requested "like it was before"
  navBarStyle: 'modern-pill' as const, // Default to modern pill navbar
  voiceMode: 'tap' as const,
  micEnabled: true,
  autoHideControls: true, // Default enabled
  libraryBackgroundMode: 'daily' as const,
  islandBgMode: 'album-art' as const,
  classicBarBgMode: 'album-art' as const,
  animateBackground: true,
  libraryFocusMode: false, // Default disabled
  defaultView: 'grid' as ViewMode,
  defaultSort: 'recent' as SortOption,
  showThumbnails: true,
  showPerformanceHUD: false, // Default disabled
  downloadDirectoryUri: null,
  applyThemeToOtherPages: false,
  lyricsDelay: -1.2,
  quickPins: ['export', 'import', 'scan'] as [string, string, string],
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      // Default values
      ...DEFAULT_SETTINGS,
      
      // Appearance actions
      setTheme: (theme) => set({ theme }),
      setDefaultGradient: (defaultGradientId) => set({ defaultGradientId }),
      setLyricsFontSize: (lyricsFontSize) => set({ lyricsFontSize }),
      setLineSpacing: (lineSpacing) => set({ lineSpacing }),
      
      // Playback actions
      setScrollSpeed: (scrollSpeed) => set({ scrollSpeed }),
      setSkipDuration: (skipDuration) => set({ skipDuration }),
      setKeepScreenOn: (keepScreenOn) => set({ keepScreenOn }),
      setShowTimeRemaining: (showTimeRemaining) => set({ showTimeRemaining }),
      setPlayInMiniPlayerOnly: (playInMiniPlayerOnly) => set({ playInMiniPlayerOnly }),
      setMiniPlayerStyle: (miniPlayerStyle) => set({ miniPlayerStyle }),
      setNavBarStyle: (navBarStyle) => set({ navBarStyle }),
      setVoiceMode: (voiceMode) => set({ voiceMode }),
      setMicEnabled: (micEnabled) => set({ micEnabled }),
      setAutoHideControls: (autoHideControls) => set({ autoHideControls }),
      setLibraryBackgroundMode: (libraryBackgroundMode) => set({ libraryBackgroundMode }),
      setIslandBgMode: (islandBgMode) => set({ islandBgMode }),
      setClassicBarBgMode: (classicBarBgMode) => set({ classicBarBgMode }),
      setAnimateBackground: (animateBackground: boolean) => set({ animateBackground }),
      setLibraryFocusMode: (libraryFocusMode: boolean) => set({ libraryFocusMode }),
      setShowPerformanceHUD: (showPerformanceHUD: boolean) => set({ showPerformanceHUD }),
      setApplyThemeToOtherPages: (applyThemeToOtherPages: boolean) => set({ applyThemeToOtherPages }),
      
      // Library actions
      setDefaultView: (defaultView) => set({ defaultView }),
      setDefaultSort: (defaultSort) => set({ defaultSort }),
      setShowThumbnails: (showThumbnails) => set({ showThumbnails }),
      
      // History implementation
      playlistHistory: {},
      updatePlaylistHistory: (playlistId: string, songId: string) => set((state) => ({
          playlistHistory: {
              ...state.playlistHistory,
              [playlistId]: songId
          }
      })),
      
      setDownloadDirectory: (downloadDirectoryUri) => set({ downloadDirectoryUri }),

      // Quick pins
      setQuickPins: (quickPins) => set({ quickPins }),

      // Reset
      resetToDefaults: () => set(DEFAULT_SETTINGS),

      // Advanced
      lyricsDelay: -1.2,
      setLyricsDelay: (lyricsDelay) => set({ lyricsDelay }),
    }),
    {
      name: 'lyricflow-settings',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);

// Font size mappings for use in components
export const FONT_SIZE_MAP = {
  small: { current: 28, other: 18 },
  medium: { current: 34, other: 22 },
  large: { current: 42, other: 28 },
};

// Line height mappings
export const LINE_SPACING_MAP = {
  compact: 1.4,
  normal: 1.75,
  relaxed: 2.0,
};
