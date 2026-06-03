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
import { PlayerProvider } from './contexts/PlayerContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { setAudioModeAsync } from 'expo-audio';
import * as Font from 'expo-font';
import { Ionicons } from '@expo/vector-icons';
import { getPreloadedData } from './services/NativeStartup';
import { ensureSearchIndex } from './services/NativeSearch';

// ─── Music Equalizer Loader ───────────────────────────────────────────────────

// Each bar has a different dur (ms) so they animate out of phase, creating the equalizer effect
const LOADER_BARS = [
  { initH: 16, max: 44, min: 8,  dur: 550 },
  { initH: 36, max: 48, min: 12, dur: 420 },
  { initH: 52, max: 52, min: 18, dur: 360 },
  { initH: 28, max: 46, min: 10, dur: 490 },
  { initH: 10, max: 38, min: 6,  dur: 630 },
];

const BAR_COLORS = [
  'rgba(255,255,255,0.35)',
  'rgba(255,255,255,0.6)',
  '#2F8CFF',
  'rgba(255,255,255,0.6)',
  'rgba(255,255,255,0.35)',
];

const MusicLoader: React.FC = () => {
  const anims = React.useRef(LOADER_BARS.map(b => new Animated.Value(b.initH))).current;

  useEffect(() => {
    const loops = LOADER_BARS.map((cfg, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(anims[i], { toValue: cfg.max, duration: cfg.dur, useNativeDriver: false }),
          Animated.timing(anims[i], { toValue: cfg.min, duration: cfg.dur, useNativeDriver: false }),
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
          <Animated.View style={[loaderStyles.bar, { height: anim, backgroundColor: BAR_COLORS[i] }]} />
        </View>
      ))}
    </View>
  );
};

const loaderStyles = StyleSheet.create({
  bars:     { flexDirection: 'row', alignItems: 'flex-end', gap: 6, height: 56 },
  barTrack: { height: 56, justifyContent: 'flex-end' },
  bar:      { width: 6, borderRadius: 3 },
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
          console.log(`[APP] Initialization attempt ${4 - retries}/3...`);

          // Parallel: preload native data + audio mode + fonts (all while Hermes parsed the bundle)
          const [preloaded] = await Promise.all([
            getPreloadedData(),
            setAudioModeAsync({
              allowsRecording: false,
              shouldPlayInBackground: true,
              playsInSilentMode: true,
              interruptionMode: 'doNotMix',
            }),
            Font.loadAsync(Ionicons.font),
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

          // Start desktop bridge if previously enabled
          import('./store/desktopBridgeSettingsStore').then(m => m.useDesktopBridgeSettingsStore.getState().load()).catch(console.error);

          // Pre-fetch Luvs for instant playback
          import('./services/LuvsRecommendationEngine').then(m => m.luvsRecommendationEngine.prefetch()).catch(console.error);

          // Build/verify FTS5 search index in background (Android only; no-op on iOS)
          ensureSearchIndex().catch(() => {});

          console.log('[APP] Initialization successful');
          setIsReady(true);
          
          // Run playlist migration AFTER UI renders (prevents startup freeze)
          import('react-native').then(({ InteractionManager }) => {
            InteractionManager.runAfterInteractions(async () => {
              const { migratePlaylistData } = await import('./database/db_migration');
              await migratePlaylistData();
            });
          });

          return; // Success - exit retry loop
        } catch (err) {
          lastError = err instanceof Error ? err : new Error('Unknown error');
          console.error(`[APP] Initialization error (attempt ${4 - retries}/3):`, err);
          
          retries--;
          if (retries > 0) {
            console.log(`[APP] Retrying in 2 seconds...`);
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
        <Ionicons name="musical-notes" size={48} color="#2F8CFF" style={{ marginBottom: 20 }} />
        <Text style={styles.loadingTitle}>LuvLyrics</Text>
        <Text style={styles.loadingSubtitle}>Your music, your lyrics</Text>
        <View style={{ height: 48 }} />
        <MusicLoader />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.loadingContainer}>
        <StatusBar style="light" backgroundColor={DarkColors.background} />
        <Text style={styles.errorText}>⚠️ Initialization Failed</Text>
        <Text style={styles.errorMessage}>{error}</Text>
        <Pressable 
          style={styles.retryButton}
          onPress={() => {
            setError(null);
            setIsReady(false);
            setRetryKey(k => k + 1);
          }}
        >
          <Text style={styles.retryButtonText}>Retry</Text>
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
    letterSpacing: -0.8,
    marginBottom: 6,
  },
  loadingSubtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.4)',
    letterSpacing: 0.2,
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
