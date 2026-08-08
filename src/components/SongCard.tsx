/**
 * LyricFlow - Song Card Component
 */

import React, { memo } from 'react';
import { StyleSheet, View, Text, Pressable, Image, GestureResponderEvent, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getGradientById, GRADIENTS } from '../constants/gradients';
import { useThemeColors, useIsDark } from '../contexts/ThemeContext';
import { useIsSongLiked } from '../hooks/useIsSongLiked';
import { formatSongSubtitle } from '../utils/formatters';
import Animated, {
  useSharedValue, useAnimatedStyle, withTiming, withSequence, interpolate
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';

interface SongCardProps {
  id: string;
  title: string;
  artist?: string;
  album?: string;
  gradientId: string;
  coverImageUri?: string;
  duration?: number;
  isLiked?: boolean;
  onPress: () => void;
  onLongPress?: () => void;
  onLikePress?: () => void;
  onMagicPress?: () => void;
}

export const SongCard: React.FC<SongCardProps> = memo(({
  id, title, artist, album, gradientId, coverImageUri, duration, isLiked: isLikedProp,
  onPress, onLongPress, onLikePress, onMagicPress,
}) => {
  const colors = useThemeColors();
  const isDark = useIsDark();
  const storeLiked = useIsSongLiked(id);
  const isLiked = id ? storeLiked : isLikedProp;
  const gradient = getGradientById(gradientId) ?? GRADIENTS[0];
  const glowColor = gradient.colors[1] || gradient.colors[0];
  const subtitle = formatSongSubtitle(artist, album);
  const durationText = duration
    ? `${Math.floor(duration / 60)}:${String(Math.floor(duration % 60)).padStart(2, '0')}`
    : '';

  const flipRotation = useSharedValue(0);
  const cardScale = useSharedValue(1);
  const lastTapRef = React.useRef<number>(0);
  const tapCountRef = React.useRef<number>(0);
  const timerRef = React.useRef<NodeJS.Timeout | null>(null);
  const isFlippedRef = React.useRef(false);

  const toggleFlip = () => {
    const nextState = !isFlippedRef.current;
    isFlippedRef.current = nextState;
    flipRotation.value = withTiming(nextState ? 180 : 0, { duration: 500 });
  };

  const handlePressIn = () => { cardScale.value = withTiming(0.96, { duration: 100 }); };
  const handlePressOut = () => { cardScale.value = withTiming(1, { duration: 100 }); };

  const handlePress = () => {
    const now = Date.now();
    const delay = 250;
    if (now - lastTapRef.current < delay) { tapCountRef.current += 1; } else { tapCountRef.current = 1; }
    lastTapRef.current = now;
    if (cardScale.value === 1) {
      cardScale.value = withSequence(withTiming(0.96, { duration: 50 }), withTiming(1, { duration: 100 }));
    }
    if (timerRef.current) clearTimeout(timerRef.current);
    if (tapCountRef.current === 3) {
      tapCountRef.current = 0;
      toggleFlip();
    } else {
      timerRef.current = setTimeout(() => {
        if (tapCountRef.current === 1) {
          if (isFlippedRef.current) { if (onMagicPress) onMagicPress(); toggleFlip(); } else { onPress(); }
        }
        tapCountRef.current = 0;
      }, delay);
    }
  };

  const frontAnimatedStyle = useAnimatedStyle(() => {
    const rotateY = `${interpolate(flipRotation.value, [0, 180], [0, 180])}deg`;
    return {
      transform: [{ perspective: 1000 }, { rotateY }, { scale: cardScale.value }],
      opacity: interpolate(flipRotation.value, [85, 95], [1, 0]),
      zIndex: flipRotation.value < 90 ? 1 : 0,
      backfaceVisibility: 'hidden',
    } as ViewStyle;
  });

  const backAnimatedStyle = useAnimatedStyle(() => {
    const rotateY = `${interpolate(flipRotation.value, [0, 180], [180, 360])}deg`;
    return {
      transform: [{ perspective: 1000 }, { rotateY }, { scale: cardScale.value }],
      opacity: interpolate(flipRotation.value, [85, 95], [0, 1]),
      zIndex: flipRotation.value > 90 ? 1 : 0,
      backfaceVisibility: 'hidden',
    } as ViewStyle;
  });

  const handleHeartPress = (e: GestureResponderEvent) => {
    e.stopPropagation();
    onLikePress?.();
  };

  const thumbnailBg = isDark ? '#1A1A1A' : colors.cardHover;

  return (
    <Pressable
      style={styles.container}
      onPress={handlePress}
      onLongPress={onLongPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      delayLongPress={500}
      unstable_pressDelay={70}
    >
      <View>
        <Animated.View style={[styles.face, frontAnimatedStyle]}>
          <View style={[styles.thumbnailContainer, { backgroundColor: thumbnailBg }]}>
            {coverImageUri ? (
              <Image source={{ uri: coverImageUri }} style={styles.thumbnail} />
            ) : (
              <View style={[styles.defaultThumbnail, { backgroundColor: thumbnailBg }]}>
                <Ionicons name="disc" size={48} color={isDark ? 'rgba(255,255,255,0.3)' : colors.textMuted} />
              </View>
            )}
            <Pressable
              style={({ pressed }) => [styles.heartButton, pressed && { opacity: 0.7 }]}
              onPress={handleHeartPress}
              hitSlop={10}
            >
              <View style={[styles.heartGlow, { shadowColor: glowColor, shadowOpacity: isLiked ? 0.8 : 0.4, shadowRadius: isLiked ? 8 : 2, elevation: isLiked ? 5 : 2 }]}>
                <Ionicons name={isLiked ? 'heart' : 'heart-outline'} size={22} color={isLiked ? '#fff' : 'rgba(255,255,255,0.7)'} />
              </View>
            </Pressable>
          </View>
        </Animated.View>

        <Animated.View style={[styles.face, styles.backFace, backAnimatedStyle]}>
          <View style={[styles.thumbnailContainer, { width: '100%', height: undefined, aspectRatio: 1, backgroundColor: '#000' }]}>
            {coverImageUri ? (
              <Image source={{ uri: coverImageUri }} style={StyleSheet.absoluteFill} blurRadius={15} />
            ) : (
              <LinearGradient colors={['#333', '#111']} style={StyleSheet.absoluteFill} />
            )}
            <View style={{ ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)' }} />
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="sparkles" size={42} color="#FFF" />
              <Text style={{ color: '#fff', fontSize: 10, marginTop: 8, fontWeight: '900', letterSpacing: 1 }}>MAGIC LYRICS</Text>
              <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 9, marginTop: 2 }}>TAP TO SEARCH</Text>
            </View>
          </View>
        </Animated.View>
      </View>

      <View style={styles.info}>
        <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={1}>{title}</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]} numberOfLines={1}>{subtitle}</Text>
        {durationText.length > 0 && <Text style={[styles.duration, { color: colors.textMuted }]}>{durationText}</Text>}
      </View>
    </Pressable>
  );
});

SongCard.displayName = 'SongCard';

const styles = StyleSheet.create({
  container: { flex: 1, gap: 8 },
  face: { backfaceVisibility: 'hidden' },
  backFace: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' },
  thumbnailContainer: { aspectRatio: 1, borderRadius: 8, overflow: 'hidden' },
  defaultThumbnail: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  thumbnail: { flex: 1 },
  info: { gap: 2, marginTop: 8 },
  title: { fontSize: 14, fontWeight: '700', letterSpacing: -0.2 },
  subtitle: { fontSize: 12 },
  duration: { fontSize: 11, marginTop: 2 },
  heartButton: { position: 'absolute', top: 8, right: 8, zIndex: 5 },
  heartGlow: { backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: 15, padding: 4, shadowOffset: { width: 0, height: 0 } },
});

export default SongCard;
