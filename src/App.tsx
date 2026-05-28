/**
 * LyricFlow - Main App Entry Point
 */

import 'react-native-gesture-handler';
import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator, StyleSheet, Text, Pressable } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { RootNavigator } from './navigation';
import { initDatabase } from './database/db';
import { useSongsStore } from './store/songsStore';
import { usePlayerStore } from './store/playerStore';
import { Colors } from './constants/colors';
import { PlayerProvider } from './contexts/PlayerContext';
import { setAudioModeAsync } from 'expo-audio';
import * as Font from 'expo-font';
import { Ionicons } from '@expo/vector-icons';

const App: React.FC = () => {
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fetchSongs = useSongsStore((state) => state.fetchSongs);

  useEffect(() => {
    const initialize = async () => {
      let retries = 3;
      let lastError: Error | null = null;

      while (retries > 0) {
        try {
          if (__DEV__) console.log(`[APP] Initialization attempt ${4 - retries}/3...`);

          // Initialize Audio Mode for background/remote controls
          await setAudioModeAsync({
            allowsRecording: false,
            shouldPlayInBackground: true,
            playsInSilentMode: true,
            interruptionMode: 'doNotMix',
          });

          // Preload Icons
          await Font.loadAsync(Ionicons.font);

          // Initialize database
          await initDatabase();
          
          // Fetch initial songs
          await fetchSongs();
          
          // Initialize Playlists & Liked Songs Cache
          const { usePlaylistStore } = await import('./store/playlistStore');
          await usePlaylistStore.getState().fetchPlaylists();
          
          // Restore Last Played Song
          const lastPlayed = await import('./database/queries').then(m => m.getLastPlayedSong());
          if (lastPlayed) {
              usePlayerStore.getState().setInitialSong(lastPlayed);
          }

          // Start desktop bridge if previously enabled
          import('./store/desktopBridgeSettingsStore')
            .then(m => m.useDesktopBridgeSettingsStore.getState().load())
            .catch(initError => { if (__DEV__) console.error(initError); });

          // Pre-fetch Luvs for instant playback
          import('./services/LuvsRecommendationEngine')
            .then(m => m.luvsRecommendationEngine.prefetch())
            .catch(initError => { if (__DEV__) console.error(initError); });

          if (__DEV__) console.log('[APP] Initialization successful');
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
          if (__DEV__) console.error(`[APP] Initialization error (attempt ${4 - retries}/3):`, err);
          
          retries--;
          if (retries > 0) {
            if (__DEV__) console.log(`[APP] Retrying in 2 seconds...`);
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
        }
      }

      // All retries failed
      if (__DEV__) console.error('[APP] Initialization failed after 3 attempts');
      setError(lastError?.message || 'Failed to initialize app. Please check your network connection and restart.');
      setIsReady(true); // Allow app to render with error state
    };

    initialize();
  }, []);

  if (!isReady) {
    return (
      <View style={styles.loadingContainer}>
        <StatusBar style="light" backgroundColor={Colors.background} />
        <ActivityIndicator size="large" color="#fff" />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.loadingContainer}>
        <StatusBar style="light" backgroundColor={Colors.background} />
        <Text style={styles.errorText}>⚠️ Initialization Failed</Text>
        <Text style={styles.errorMessage}>{error}</Text>
        <Pressable 
          style={styles.retryButton}
          onPress={() => {
            setError(null);
            setIsReady(false);
            // Force re-mount to trigger useEffect
            setTimeout(() => {}, 0);
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
        <StatusBar style="light" />
        <PlayerProvider>
          <RootNavigator />
        </PlayerProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
};
// Forced Refresh for Navigation Update

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.background,
    padding: 20,
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
    color: Colors.textSecondary,
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
