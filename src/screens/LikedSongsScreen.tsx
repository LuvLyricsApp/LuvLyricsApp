/**
 * LyricFlow - Liked Songs Screen
 * Display all liked songs
 */

import React from 'react';
import { StyleSheet, View, Text, FlatList, Pressable, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useSongsStore } from '../store/songsStore';
import { usePlayerStore } from '../store/playerStore';
import { LikedSongsStrings } from '../constants/uiStrings';
import { useSettingsStore } from '../store/settingsStore';
import { AuroraHeader } from '../components';
import { useThemeColors } from '../contexts/ThemeContext';
import { DarkColors } from '../constants/colors';
import { formatTime } from '../utils/formatters';
import { RootStackParamList } from '../types/navigation';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

export const LikedSongsScreen: React.FC = () => {
  const colors = useThemeColors();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const songs = useSongsStore(state => state.songs);
  const setCurrentSong = useSongsStore(state => state.setCurrentSong);
  const toggleLike = useSongsStore(state => state.toggleLike);
  const playerCurrentSong = usePlayerStore(state => state.currentSong);
  const setMiniPlayerHidden = usePlayerStore(state => state.setMiniPlayerHidden);
  const playInMiniPlayerOnly = useSettingsStore(state => state.playInMiniPlayerOnly);
  
  const likedSongs = songs.filter(s => s.isLiked);

  // Visibility Management: Hide MiniPlayer when Liked Songs is open
  useFocusEffect(
    React.useCallback(() => {
      setMiniPlayerHidden(true);
    }, [setMiniPlayerHidden])
  );

  const handleSongPress = (song: any) => {
    const isCurrentlyPlaying = playerCurrentSong?.id === song.id;

    if (playInMiniPlayerOnly) {
      if (isCurrentlyPlaying) {
        // Second tap: Open NowPlayingScreen
        navigation.navigate('NowPlaying', { songId: song.id });
      } else {
        // First tap: Play in mini player
        setCurrentSong(song);
        usePlayerStore.getState().loadSong(song.id);
      }
    } else {
      // Default: Always navigate
      setCurrentSong(song);
      navigation.navigate('NowPlaying', { songId: song.id });
      usePlayerStore.getState().loadSong(song.id);
    }
  };

  return (
    <View style={styles.container}>
      <AuroraHeader palette="library" />
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.header}>
          <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="chevron-back" size={28} color={colors.textPrimary} />
          </Pressable>
          <Text style={styles.title}>{LikedSongsStrings.likedSongs}</Text>
          <View style={{ width: 40 }} />
        </View>

        {likedSongs.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="heart-outline" size={80} color="rgba(255,255,255,0.2)" />
            <Text style={styles.emptyTitle}>{LikedSongsStrings.noLikedSongsYet}</Text>
            <Text style={styles.emptySubtitle}>Songs you like will appear here</Text>
          </View>
        ) : (
          <FlatList
            data={likedSongs}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            renderItem={({ item }) => (
              <Pressable style={styles.songItem} onPress={() => handleSongPress(item)}>
                <View style={styles.thumbnail}>
                  {item.coverImageUri ? (
                    <Image source={{ uri: item.coverImageUri }} style={styles.image} />
                  ) : (
                    <Ionicons name="disc" size={24} color="rgba(255,255,255,0.3)" />
                  )}
                </View>
                <View style={styles.songInfo}>
                  <Text style={styles.songTitle} numberOfLines={1}>{item.title}</Text>
                  <Text style={styles.songArtist} numberOfLines={1}>
                    {item.artist || 'Unknown Artist'}
                  </Text>
                </View>
                
                {/* Heart Toggle */}
                <Pressable 
                  onPress={() => toggleLike(item.id)}
                  style={({ pressed }) => [
                    styles.heartButton,
                    pressed && { transform: [{ scale: 1.2 }] }
                  ]}
                  hitSlop={10}
                >
                  <Ionicons name="heart" size={24} color="#fff" />
                </Pressable>

                <Text style={styles.duration}>{formatTime(item.duration)}</Text>
              </Pressable>
            )}
          />
        )}
      </SafeAreaView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: DarkColors.background,
  },
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: DarkColors.textPrimary,
  },
  list: {
    paddingHorizontal: 16,
    paddingBottom: 100,
  },
  songItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 12,
  },
  thumbnail: {
    width: 48,
    height: 48,
    borderRadius: 6,
    backgroundColor: '#0B1F3A',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  songInfo: {
    flex: 1,
  },
  songTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: DarkColors.textPrimary,
  },
  songArtist: {
    fontSize: 14,
    color: DarkColors.textSecondary,
    marginTop: 2,
  },
  duration: {
    fontSize: 14,
    color: DarkColors.textSecondary,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 100,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: DarkColors.textPrimary,
    marginTop: 16,
  },
  emptySubtitle: {
    fontSize: 14,
    color: DarkColors.textSecondary,
    marginTop: 8,
  },
  heartButton: {
    padding: 8,
    marginRight: 8,
  }
});

export default LikedSongsScreen;
