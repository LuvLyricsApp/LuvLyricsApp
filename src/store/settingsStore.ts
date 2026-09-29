/**
 * LyricFlow - Settings Store (Zustand)
 * Manages user preferences with AsyncStorage persistence
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SortOption, ViewMode } from '../types/song';

type Theme = 'dark' | 'light' | 'auto';
export type LyricsAlign = 'left' | 'center' | 'right';
type LineSpacing = 'compact' | 'normal' | 'relaxed';
type ScrollSpeed = 'slow' | 'medium' | 'fast';

/** The pill's own material: Echo's two, plus Apple-style liquid glass and plain black. */
export type MiniPlayerBackground = 'glow' | 'tint' | 'glass' | 'black';
/**
 * 'blend' is Apple + glow: the Apple Music room, gliding into the glow when lyrics open.
 * 'aura' is our own: YouTube Music's wash and artwork card, with the live shader
 * drifting through the top half in the cover's colours.
 */
export type PlayerBackground = 'blend' | 'apple' | 'youtube' | 'aura';

/** The two styles that show the artwork as a card instead of a full-bleed cover. */
export const isCardPlayerBackground = (value: PlayerBackground): boolean => value === 'youtube' || value === 'aura';
/**
 * Behind every screen: the live shader, the lite frosted glass tinted by the
 * song, or the glow (the mini player's animated glow across the top, black below).
 */
export type AppBackground = 'shader' | 'glass' | 'glow';

/**
 * Stored settings from before "Glow animated" was retired still say 'glow';
 * the closest look left is Apple + glow. Anything unknown gets the default.
 */
export const normalizePlayerBackground = (value: unknown): PlayerBackground =>
  (value === 'apple' || value === 'youtube' || value === 'aura' ? value : 'blend');

export const normalizeMiniPlayerBackground = (value: unknown): MiniPlayerBackground =>
  (value === 'tint' || value === 'glass' || value === 'black' ? value : 'glow');

interface SettingsState {
  // Appearance
  theme: Theme;
  defaultGradientId: string;
  /** Lyric text size in points (LYRICS_SIZE_MIN..MAX). */
  lyricsSize: number;
  /** Where lyric lines sit; a song's own centre/right alignment (lyrics editor) wins. */
  lyricsAlign: LyricsAlign;
  lineSpacing: LineSpacing;
  
  // Playback
  scrollSpeed: ScrollSpeed;
  skipDuration: 10 | 15 | 30;
  keepScreenOn: boolean;
  hapticsEnabled: boolean;
  showTimeRemaining: boolean;
  playInMiniPlayerOnly: boolean;
  miniPlayerStyle: 'bar' | 'island'; // New setting
  navBarStyle: 'classic' | 'modern-pill'; // NEW: Navbar style
  voiceMode: 'hold' | 'tap';
  micEnabled: boolean;
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
  setLyricsSize: (size: number) => void;
  setLyricsAlign: (align: LyricsAlign) => void;
  setLineSpacing: (spacing: LineSpacing) => void;
  setScrollSpeed: (speed: ScrollSpeed) => void;
  setSkipDuration: (duration: 10 | 15 | 30) => void;
  setKeepScreenOn: (enabled: boolean) => void;
  setHapticsEnabled: (enabled: boolean) => void;
  setShowTimeRemaining: (show: boolean) => void;
  setPlayInMiniPlayerOnly: (enabled: boolean) => void;
  setMiniPlayerStyle: (style: 'bar' | 'island') => void; // New action
  setNavBarStyle: (style: 'classic' | 'modern-pill') => void; // NEW: Navbar action
  setVoiceMode: (mode: 'hold' | 'tap') => void;
  setMicEnabled: (enabled: boolean) => void;
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

  // Beta
  ytVideoPreview: boolean;
  setYtVideoPreview: (enabled: boolean) => void;
  youtubeApiKey: string;
  setYoutubeApiKey: (key: string) => void;

  // Canvas: looping motion artwork behind the player (Echo Music providers)
  canvasEnabled: boolean;
  appBackground: AppBackground;
  setAppBackground: (v: AppBackground) => void;
  /** Echo's mini player background: 'glow' (Glow animated) or 'tint' (calm cover tone). */
  miniPlayerBackground: MiniPlayerBackground;
  /** Echo's "Apple Music inspired" player: full-bleed cover. Off = a floating artwork card. */
  appleMusicInspired: boolean;
  /** Echo's "Hide volume slider" (Apple Music player only). */
  hidePlayerVolume: boolean;
  /** 'blend' = Apple Music for the cover, Glow animated once lyrics open; 'youtube' = YouTube Music's colour wash with an artwork card; 'aura' = that wash with the live shader across the top half. */
  playerBackground: PlayerBackground;
  setMiniPlayerBackground: (v: MiniPlayerBackground) => void;
  setAppleMusicInspired: (v: boolean) => void;
  setHidePlayerVolume: (v: boolean) => void;
  setPlayerBackground: (v: PlayerBackground) => void;
  /** The artwork as a spinning record (Settings → Player → Record). */
  playerVinyl: boolean;
  setPlayerVinyl: (v: boolean) => void;
  /** YouTube Music / Shader wash players: the cover runs full-bleed instead of a card (tap the cover). */
  playerCoverFull: boolean;
  setPlayerCoverFull: (v: boolean) => void;
  setCanvasEnabled: (enabled: boolean) => void;
  /** Your own Apple MusicKit developer token — unlocks Apple motion artwork. */
  appleMusicToken: string;
  setAppleMusicToken: (token: string) => void;
  /** Optional Tidal client token — unlocks Tidal video covers. */
  tidalToken: string;
  setTidalToken: (token: string) => void;

  /** Luvs clips open on the song's hook instead of the intro (Spotify-style). */
  luvsStartAtHook: boolean;
  setLuvsStartAtHook: (enabled: boolean) => void;

  resetToDefaults: () => void;
}

const DEFAULT_SETTINGS = {
  theme: 'dark' as Theme,
  defaultGradientId: 'aurora',
  lyricsSize: 28,
  lyricsAlign: 'left' as LyricsAlign,
  lineSpacing: 'normal' as LineSpacing,
  scrollSpeed: 'medium' as ScrollSpeed,
  skipDuration: 15 as const,
  keepScreenOn: true,
  hapticsEnabled: true,
  showTimeRemaining: true,
  playInMiniPlayerOnly: false,
  miniPlayerStyle: 'bar' as const, // the island mini player is retired; see TabNavigator
  navBarStyle: 'modern-pill' as const, // Default to modern pill navbar
  voiceMode: 'hold' as const,
  micEnabled: true,
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
  ytVideoPreview: false,
  youtubeApiKey: '',
  canvasEnabled: true,
  appBackground: 'shader' as AppBackground,
  miniPlayerBackground: 'glow' as MiniPlayerBackground,
  appleMusicInspired: true,
  hidePlayerVolume: false,
  playerBackground: 'blend' as PlayerBackground,
  playerVinyl: false,
  playerCoverFull: false,
  appleMusicToken: '',
  tidalToken: '',
  luvsStartAtHook: true,
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      // Default values
      ...DEFAULT_SETTINGS,
      
      // Appearance actions
      setTheme: (theme) => set({ theme }),
      setDefaultGradient: (defaultGradientId) => set({ defaultGradientId }),
      setLyricsSize: (size) => set({ lyricsSize: clampLyricsSize(size) }),
      setLyricsAlign: (lyricsAlign) => set({ lyricsAlign }),
      setLineSpacing: (lineSpacing) => set({ lineSpacing }),
      
      // Playback actions
      setScrollSpeed: (scrollSpeed) => set({ scrollSpeed }),
      setSkipDuration: (skipDuration) => set({ skipDuration }),
      setKeepScreenOn: (keepScreenOn) => set({ keepScreenOn }),
      setHapticsEnabled: (hapticsEnabled) => set({ hapticsEnabled }),
      setShowTimeRemaining: (showTimeRemaining) => set({ showTimeRemaining }),
      setPlayInMiniPlayerOnly: (playInMiniPlayerOnly) => set({ playInMiniPlayerOnly }),
      setMiniPlayerStyle: (miniPlayerStyle) => set({ miniPlayerStyle }),
      setNavBarStyle: (navBarStyle) => set({ navBarStyle }),
      setVoiceMode: (voiceMode) => set({ voiceMode }),
      setMicEnabled: (micEnabled) => set({ micEnabled }),
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

      // Beta
      ytVideoPreview: false,
      setYtVideoPreview: (ytVideoPreview) => set({ ytVideoPreview }),
      youtubeApiKey: '',
      setYoutubeApiKey: (youtubeApiKey) => set({ youtubeApiKey }),

      canvasEnabled: true,
      setCanvasEnabled: (canvasEnabled) => set({ canvasEnabled }),
      appBackground: 'shader',
      setAppBackground: (appBackground) => set({ appBackground }),
      miniPlayerBackground: 'glow',
      setMiniPlayerBackground: (miniPlayerBackground) => set({ miniPlayerBackground }),
      appleMusicInspired: true,
      // As in Echo: turning the Apple Music player on also picks its background.
      setAppleMusicInspired: (appleMusicInspired) => set(s => (appleMusicInspired && isCardPlayerBackground(s.playerBackground) ? { appleMusicInspired, playerBackground: 'blend' } : { appleMusicInspired })),
      hidePlayerVolume: false,
      setHidePlayerVolume: (hidePlayerVolume) => set({ hidePlayerVolume }),
      playerBackground: 'blend',
      setPlayerBackground: (playerBackground) => set({ playerBackground }),
      playerVinyl: false,
      setPlayerVinyl: (playerVinyl) => set({ playerVinyl }),
      playerCoverFull: false,
      setPlayerCoverFull: (playerCoverFull) => set({ playerCoverFull }),
      appleMusicToken: '',
      setAppleMusicToken: (appleMusicToken) => set({ appleMusicToken: appleMusicToken.trim() }),
      tidalToken: '',
      setTidalToken: (tidalToken) => set({ tidalToken: tidalToken.trim() }),
      luvsStartAtHook: true,
      setLuvsStartAtHook: (luvsStartAtHook) => set({ luvsStartAtHook }),
    }),
    {
      name: 'lyricflow-settings',
      storage: createJSONStorage(() => AsyncStorage),
      version: 3,
      migrate: (persisted, version) => {
        const state = (persisted ?? {}) as Partial<SettingsState> & { lyricsFontSize?: string };
        const { lyricsFontSize, ...rest } = state;
        return {
          ...rest,
          // v3: the Small / Medium / Large text size became a size in points.
          lyricsSize: version < 3
            ? LYRICS_PRESET_SIZE[lyricsFontSize as keyof typeof LYRICS_PRESET_SIZE] ?? 28
            : clampLyricsSize(state.lyricsSize ?? 28),
          lyricsAlign: state.lyricsAlign ?? 'left',
          playerBackground: normalizePlayerBackground(state.playerBackground),
          miniPlayerBackground: normalizeMiniPlayerBackground(state.miniPlayerBackground),
          // v2: hold-to-talk became the default. The old default was 'tap',
          // which kept listening after the finger lifted.
          voiceMode: version < 2 ? 'hold' : state.voiceMode ?? 'hold',
        } as SettingsState;
      },
    }
  )
);

/** Settings → Lyrics → Text size, in points. */
export const LYRICS_SIZE_MIN = 20;
export const LYRICS_SIZE_MAX = 44;
export const clampLyricsSize = (size: number): number =>
  Math.round(Math.min(LYRICS_SIZE_MAX, Math.max(LYRICS_SIZE_MIN, Number.isFinite(size) ? size : 28)));
/** The old presets, for settings saved before sizes were custom. */
const LYRICS_PRESET_SIZE = { small: 24, medium: 28, large: 34 } as const;

/** Settings → Lyrics → Line spacing: the space above and below each line. */
export const LYRICS_LINE_GAP = { compact: 10, normal: 16, relaxed: 24 } as const;

/** The lyric text style the settings ask for. */
export const lyricsTextStyle = (
  size: number,
  spacing: keyof typeof LYRICS_LINE_GAP,
  align: LyricsAlign = 'left',
): { fontSize: number; lineHeight: number; marginVertical: number; textAlign: LyricsAlign } => {
  const fontSize = clampLyricsSize(size);
  return {
    fontSize,
    lineHeight: Math.round(fontSize * 1.22),
    marginVertical: LYRICS_LINE_GAP[spacing] ?? LYRICS_LINE_GAP.normal,
    textAlign: align,
  };
};
