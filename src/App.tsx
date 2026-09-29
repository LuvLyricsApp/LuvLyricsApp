/**
 * LyricFlow - Main App Entry Point
 */

import 'react-native-gesture-handler';
import React, { useEffect, useState } from 'react';
import { View, Animated, StyleSheet, Text, Pressable } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { RootNavigator } from './navigation';
import { initDatabase } from './database/db';
import { useSongsStore } from './store/songsStore';
import { usePlayerStore } from './store/playerStore';
import { DarkColors } from './constants/colors';
import { AppStrings } from './constants/uiStrings';
import { PlayerProvider } from './contexts/PlayerContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { setAudioModeAsync } from 'expo-audio';
import * as Font from 'expo-font';
import { Ionicons } from '@expo/vector-icons';
import { getPreloadedData } from './services/NativeStartup';
import { ensureSearchIndex } from './services/NativeSearch';
import { runWhenIdle } from './services/bootPhases';
import { isBatterySaverOn } from './utils/batterySaver';
import { SF_FONT_MAP } from './constants/fonts';

// ─── Music Equalizer Loader ───────────────────────────────────────────────────

// Each bar has a different dur (ms) so they animate out of phase, creating the equalizer effect
const LOADER_BARS = [
  { initH: 16, max: 44, min: 8,  dur: 550 },
  { initH: 36, max: 48, min: 12, dur: 420 },
  { initH: 52, max: 52, min: 18, dur: 360 },
  { initH: 28, max: 46, min: 10, dur: 490 },
  { initH: 10, max: 38, min: 6,  dur: 630 },
];

const LOADER_MAX = 52;

const BAR_COLORS = [
  'rgba(255,255,255,0.35)',
  'rgba(255,255,255,0.6)',
  '#EDEDED',
  'rgba(255,255,255,0.6)',
  'rgba(255,255,255,0.35)',
];

const MusicLoader: React.FC = () => {
  // Bars are fixed 52pt tall and scale on Y via the native driver: the loader
  // runs while JS is busiest (boot), so it must not need the JS thread.
  const anims = React.useRef(LOADER_BARS.map(b => new Animated.Value(b.initH / LOADER_MAX))).current;

  useEffect(() => {
    const loops = LOADER_BARS.map((cfg, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(anims[i], { toValue: cfg.max / LOADER_MAX, duration: cfg.dur, useNativeDriver: true }),
          Animated.timing(anims[i], { toValue: cfg.min / LOADER_MAX, duration: cfg.dur, useNativeDriver: true }),
        ])
      )
    );
    loops.forEach(l => l.start());
    return () => loops.forEach(l => l.stop());
  }, [anims]);

  return (
    <View style={loaderStyles.bars}>
      {anims.map((anim, i) => (
        <View key={i} style={loaderStyles.barTrack}>
          <Animated.View style={[loaderStyles.bar, { transform: [{ scaleY: anim }], backgroundColor: BAR_COLORS[i] }]} />
        </View>
      ))}
    </View>
  );
};

const loaderStyles = StyleSheet.create({
  bars:     { flexDirection: 'row', alignItems: 'flex-end', gap: 6, height: 56 },
  barTrack: { height: 56, justifyContent: 'flex-end' },
  bar:      { width: 6, height: LOADER_MAX, borderRadius: 3, transformOrigin: 'bottom' },
});

// ─── App ──────────────────────────────────────────────────────────────────────

const App: React.FC = () => {
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const fetchSongs = useSongsStore((state) => state.fetchSongs);

  useEffect(() => {
    const initialize = async () => {
      let retries = 3;
      let lastError: Error | null = null;

      while (retries > 0) {
        try {
          if (__DEV__) console.log(`[APP] Initialization attempt ${4 - retries}/3...`);

          // Parallel: preload native data + audio mode + fonts (all while Hermes parsed the bundle)
          const [preloaded] = await Promise.all([
            getPreloadedData(),
            setAudioModeAsync({
              allowsRecording: false,
              shouldPlayInBackground: true,
              playsInSilentMode: true,
              interruptionMode: 'doNotMix',
            }),
            Font.loadAsync({
              ...Ionicons.font,
              ...SF_FONT_MAP,
            }),
          ]);

          // Open the write connection (fast — Kotlin already opened read-only above)
          await initDatabase();

          const { usePlaylistStore } = await import('./store/playlistStore');

          if (preloaded && preloaded.songs.length > 0) {
            // Android fast path: data came from Kotlin preloader, no DB round-trips needed
            useSongsStore.setState({ songs: preloaded.songs, isLoading: false });
            if (preloaded.playlists.length > 0) {
              const defaultPl = preloaded.playlists.find(p => p.isDefault);
              usePlaylistStore.setState({
                playlists: preloaded.playlists,
                defaultPlaylistId: defaultPl?.id ?? null,
                isLoading: false,
              });
              // Background: populate likedSongIds Set (heart icons) without blocking render
              usePlaylistStore.getState().fetchPlaylists().catch(() => {});
            }
            if (preloaded.lastPlayedId) {
              const last = preloaded.songs.find(s => s.id === preloaded.lastPlayedId);
              if (last) usePlayerStore.getState().setInitialSong(last);
            }
          } else {
            // iOS / first-launch fallback — existing sequential path
            await fetchSongs();
            await usePlaylistStore.getState().fetchPlaylists();
            const lastPlayed = await import('./database/queries').then(m => m.getLastPlayedSong());
            if (lastPlayed) usePlayerStore.getState().setInitialSong(lastPlayed);
          }

          // Everything below waits for the first frame (see services/bootPhases).
          // Each job runs once touches have settled, staggered so they don't
          // land in a burst on the JS thread.

          // Restore downloads and lyrics scans that were in flight when the app was killed.
          runWhenIdle('download queue', () =>
            import('./store/downloadQueueStore').then(m => m.useDownloadQueueStore.getState().hydrateFromDb()));
          runWhenIdle('lyrics scan queue', () =>
            import('./store/lyricsScanQueueStore').then(m => m.useLyricsScanQueueStore.getState().hydrateFromDb()), 150);

          // Start the desktop bridge if it was on. It still starts by itself, just after the first frame.
          runWhenIdle('desktop bridge', () =>
            import('./store/desktopBridgeSettingsStore').then(m => m.useDesktopBridgeSettingsStore.getState().load()), 300);

          // Build or verify the FTS5 search index (Android only; no-op on iOS).
          runWhenIdle('search index', () => ensureSearchIndex(), 600);

          // Warm Luvs so the first open is instant. It syncs the library, asks
          // for taste picks over the network and fetches a feed, so it goes
          // last and is skipped under Battery Saver (opening Luvs loads it then).
          runWhenIdle('luvs warm-up', () => {
            if (isBatterySaverOn()) return;
            return import('./services/luvsEngine').then(m => m.luvsEngine.prefetch());
          }, 4000);

          // Playlist migration, likewise after the UI has rendered.
          runWhenIdle('playlist migration', async () => {
            const { migratePlaylistData } = await import('./database/db_migration');
            await migratePlaylistData();
          }, 900);

          if (__DEV__) console.log('[APP] Initialization successful');
          setIsReady(true);

          return; // Success - exit retry loop
        } catch (err) {
          lastError = err instanceof Error ? err : new Error('Unknown error');
          console.error(`[APP] Initialization error (attempt ${4 - retries}/3):`, err);
          
          retries--;
          if (retries > 0) {
            if (__DEV__) console.log(`[APP] Retrying in 2 seconds...`);
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
        }
      }

      // All retries failed
      console.error('[APP] Initialization failed after 3 attempts');
      setError(lastError?.message || 'Failed to initialize app. Please check your network connection and restart.');
      setIsReady(true); // Allow app to render with error state
    };

    initialize();
  }, [fetchSongs, retryKey]);

  if (!isReady) {
    return (
      <View style={styles.loadingContainer}>
        <StatusBar style="light" backgroundColor="#000" />
        <Ionicons name="musical-notes" size={48} color="#EDEDED" style={{ marginBottom: 20 }} />
        <Text style={styles.loadingTitle}>{AppStrings.appTitle}</Text>
        <Text style={styles.loadingSubtitle}>{AppStrings.loadingSubtitle}</Text>
        <View style={{ height: 48 }} />
        <MusicLoader />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.loadingContainer}>
        <StatusBar style="light" backgroundColor={DarkColors.background} />
        <Text style={styles.errorText}>{AppStrings.initializationFailed}</Text>
        <Text style={styles.errorMessage}>{error}</Text>
        <Pressable 
          style={styles.retryButton}
          onPress={() => {
            setError(null);
            setIsReady(false);
            setRetryKey(k => k + 1);
          }}
        >
          <Text style={styles.retryButtonText}>{AppStrings.retry}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={styles.container}>
      <SafeAreaProvider>
        <ThemeProvider>
          <StatusBar style="light" />
          <PlayerProvider>
            <RootNavigator />
          </PlayerProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
};
// Forced Refresh for Navigation Update

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: DarkColors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
    padding: 20,
  },
  loadingTitle: {
    fontSize: 36,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 6,
  },
  loadingSubtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.4)',
  },
  errorText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#ff6b6b',
    marginBottom: 12,
    textAlign: 'center',
  },
  errorMessage: {
    fontSize: 14,
    color: DarkColors.textSecondary,
    textAlign: 'center',
    marginBottom: 24,
    paddingHorizontal: 20,
  },
  retryButton: {
    backgroundColor: '#fff',
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#000',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default App;
