import React, { useCallback } from 'react';
import { View, Text, Pressable, StyleSheet, Image, GestureResponderEvent } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useIsSongLiked } from '../hooks/useIsSongLiked';
import { getGradientById } from '../constants/gradients';
import { Song } from '../types/song';

interface SearchResultItemProps {
  item: Song;
  onPress: (song: Song) => void;
  toggleLike: (id: string) => void;
  isDark: boolean;
  colors: {
    textPrimary: string;
    textSecondary: string;
    textMuted: string;
    card: string;
    cardHover: string;
    error: string;
  };
}

const SearchResultItem: React.FC<SearchResultItemProps> = React.memo(({ item, onPress, toggleLike, isDark, colors }) => {
  const isLiked = useIsSongLiked(item.id);

  const handlePress = useCallback(() => {
    onPress(item);
  }, [onPress, item]);

  const handleToggleLike = useCallback((e: GestureResponderEvent) => {
    e.stopPropagation();
    toggleLike(item.id);
  }, [toggleLike, item.id]);

  return (
    <Pressable
      style={[styles.resultItem, { backgroundColor: isDark ? 'transparent' : colors.card }]}
      onPress={handlePress}
    >
      <View style={[styles.resultThumbnail, { backgroundColor: isDark ? '#0B1F3A' : colors.cardHover }]}>
        {item.coverImageUri ? (
          <Image source={{ uri: item.coverImageUri }} style={StyleSheet.absoluteFill} />
        ) : (
          <View style={[styles.defaultResultThumbnail, { backgroundColor: isDark ? '#0B1F3A' : colors.cardHover }]}>
            <Ionicons name="disc" size={24} color={isDark ? 'rgba(255,255,255,0.3)' : colors.textMuted} />
          </View>
        )}
      </View>
      <View style={styles.resultInfo}>
        <Text style={[styles.resultTitle, { color: colors.textPrimary }]} numberOfLines={1}>
          {item.title}
        </Text>
        <Text style={[styles.resultSubtitle, { color: colors.textSecondary }]} numberOfLines={1}>
          Song • {item.artist || 'Unknown Artist'}
        </Text>
      </View>

      <Pressable
        onPress={handleToggleLike}
        style={({ pressed }) => [
          styles.heartGlow,
          pressed && { transform: [{ scale: 1.2 }] },
          {
            shadowColor: getGradientById(item.gradientId)?.colors[1] || '#fff',
            shadowOpacity: isLiked ? 0.8 : 0.3,
            shadowRadius: isLiked ? 8 : 2,
            elevation: isLiked ? 5 : 1,
          }
        ]}
        hitSlop={10}
      >
        <Ionicons
          name={isLiked ? "heart" : "heart-outline"}
          size={22}
          color={isLiked ? (isDark ? "#fff" : colors.error) : (isDark ? "rgba(255,255,255,0.6)" : colors.textMuted)}
        />
      </Pressable>

      <Ionicons name="play" size={20} color={colors.textSecondary} />
    </Pressable>
  );
});

const styles = StyleSheet.create({
  resultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 16,
  },
  resultThumbnail: {
    width: 48,
    height: 48,
    borderRadius: 8,
    overflow: 'hidden',
  },
  defaultResultThumbnail: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultInfo: {
    flex: 1,
  },
  resultTitle: {
    fontSize: 16,
    fontWeight: '500',
  },
  resultSubtitle: {
    fontSize: 14,
    marginTop: 2,
  },
  heartGlow: {
    padding: 8,
    marginRight: 8,
    shadowOffset: { width: 0, height: 0 },
  },
});

export default SearchResultItem;
