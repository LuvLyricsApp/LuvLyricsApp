import React, { useCallback } from 'react';
import { View, Text, Pressable, StyleSheet, Animated as RNAnimated } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { Swipeable } from 'react-native-gesture-handler';
import { Song } from '../types/song';
import { useThemeColors, useIsDark } from '../contexts/ThemeContext';
import { useLyricsScanQueueStore } from '../store/lyricsScanQueueStore';
import { useIsSongLiked } from '../hooks/useIsSongLiked';
import { songHasAnyLyrics } from '../utils/lyricsState';

interface SongListItemProps {
  song: Song;
  onPress: (song: Song) => void;
  onLongPress: (song: Song) => void;
  addToScanQueue: (song: Song) => void;
}

export const SongListItem = React.memo(({ song, onPress, onLongPress, addToScanQueue }: SongListItemProps) => {
  const colors = useThemeColors();
  const isDark = useIsDark();
  const isLiked = useIsSongLiked(song.id);
  const scanJob = useLyricsScanQueueStore(state => state.queue[song.id]);
  const isScanning = scanJob?.status === 'scanning' || scanJob?.status === 'pending';
  const isCompleted = scanJob?.status === 'completed' || songHasAnyLyrics(song);
  const isFailed = scanJob?.status === 'failed';

  const cardBg = isDark ? 'rgba(255,255,255,0.05)' : colors.card;
  const cardPressedBg = isDark ? 'rgba(255,255,255,0.1)' : colors.cardHover;

  const handleSwipeActionPress = useCallback(() => {
    addToScanQueue(song);
  }, [addToScanQueue, song]);

  const handlePress = useCallback(() => {
    onPress(song);
  }, [onPress, song]);

  const handleLongPress = useCallback(() => {
    onLongPress(song);
  }, [onLongPress, song]);

  const renderRightActions = useCallback((_progress: RNAnimated.AnimatedInterpolation<number>, dragX: RNAnimated.AnimatedInterpolation<number>) => {
    const opacity = dragX.interpolate({ inputRange: [-60, 0], outputRange: [1, 0], extrapolate: 'clamp' });
    return (
      <Pressable style={styles.swipeAction} onPress={handleSwipeActionPress}>
        <RNAnimated.View style={[StyleSheet.absoluteFill, styles.swipeInnerContainer, { opacity }]}>
          <View style={styles.swipeIconContainer}>
            <Ionicons name="sparkles" size={24} color={colors.primary} />
          </View>
        </RNAnimated.View>
      </Pressable>
    );
  }, [colors, handleSwipeActionPress]);

  return (
    <Swipeable
      renderRightActions={renderRightActions}
      containerStyle={styles.swipeContainer}
      overshootRight={false}
      friction={2}
      rightThreshold={40}
    >
      <Pressable
        onPress={handlePress}
        onLongPress={handleLongPress}
        style={({ pressed }) => [
          styles.listItem,
          { backgroundColor: pressed ? cardPressedBg : cardBg },
          pressed && styles.pressedScale,
        ]}
        unstable_pressDelay={50}
      >
        <View style={styles.artworkContainer}>
          {song.coverImageUri ? (
            <Image source={{ uri: song.coverImageUri }} style={styles.artwork} contentFit="cover" cachePolicy="memory-disk" />
          ) : (
            <View style={[styles.artwork, styles.placeholderArtwork]}>
              <Ionicons name="musical-note" size={20} color={colors.textMuted} />
            </View>
          )}
          {isScanning && (
            <View style={styles.statusOverlay}>
              <Ionicons name="sync" size={14} color="#FFF" style={styles.spinningIcon} />
            </View>
          )}
        </View>

        <View style={styles.infoContainer}>
          <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={1}>{song.title}</Text>
          <View style={styles.row}>
            {isCompleted && <Ionicons name="checkmark-circle" size={12} color={colors.primary} style={{ marginRight: 4 }} />}
            {isFailed && <Ionicons name="alert-circle" size={12} color={colors.error} style={{ marginRight: 4 }} />}
            <Text style={[styles.artist, { color: colors.textSecondary }]} numberOfLines={1}>{song.artist || 'Unknown Artist'}</Text>
          </View>
        </View>

        <View style={styles.metaContainer}>
          <Text style={[styles.duration, { color: colors.textMuted }]}>
            {Math.floor(song.duration / 60)}:{(song.duration % 60).toString().padStart(2, '0')}
          </Text>
          {isLiked && <Ionicons name="heart" size={14} color={colors.primary} style={{ marginTop: 2 }} />}
        </View>
      </Pressable>
    </Swipeable>
  );
}, (prev, next) => (
  prev.song.id === next.song.id &&
  prev.song.title === next.song.title &&
  prev.song.artist === next.song.artist &&
  prev.song.coverImageUri === next.song.coverImageUri &&
  prev.song.lyrics === next.song.lyrics
));

const styles = StyleSheet.create({
  swipeContainer: { marginBottom: 8, overflow: 'hidden', borderRadius: 12 },
  listItem: { flexDirection: 'row', alignItems: 'center', height: 72, paddingHorizontal: 12, borderRadius: 12, gap: 12 },
  pressedScale: { transform: [{ scale: 0.98 }] },
  swipeAction: { marginBottom: 8, width: 70, height: 72, marginLeft: 8, borderRadius: 12, overflow: 'hidden' },
  swipeInnerContainer: { justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(255,100,100,0.1)' },
  swipeIconContainer: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.1)', justifyContent: 'center', alignItems: 'center' },
  artworkContainer: { width: 48, height: 48, borderRadius: 6, overflow: 'hidden', position: 'relative' },
  artwork: { width: '100%', height: '100%', backgroundColor: '#2A2A2A', borderRadius: 6 },
  placeholderArtwork: { justifyContent: 'center', alignItems: 'center' },
  statusOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  spinningIcon: { opacity: 0.9 },
  infoContainer: { flex: 1, justifyContent: 'center', height: '100%' },
  title: { fontSize: 15, fontWeight: '600', marginBottom: 2 },
  row: { flexDirection: 'row', alignItems: 'center' },
  artist: { fontSize: 13 },
  metaContainer: { alignItems: 'flex-end', justifyContent: 'center', gap: 4 },
  duration: { fontSize: 12, fontVariant: ['tabular-nums'] },
});
