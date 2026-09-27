/**
 * Allegra-styled track row and loading shimmer for the Stream and Downloads
 * pages (the home blocks live in components/allegra/home.tsx). Everything
 * sits on the frosted material and the shared radius family.
 */
import React, { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { Glass, Motion, Radius, Signal, Space } from '../../constants/allegraTheme';
import { Fonts } from '../../constants/fonts';

const formatDuration = (seconds?: number): string => {
  if (!seconds || seconds <= 0) return '';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
};

interface TrackRowProps {
  title: string;
  artist?: string;
  artwork?: string;
  duration?: number;
  meta?: string;
  isCurrent?: boolean;
  onPress: () => void;
  onLongPress?: () => void;
  trailingIcon?: React.ComponentProps<typeof Ionicons>['name'];
  trailingLabel?: string;
  onTrailingPress?: () => void;
  /** 0..1 — shows a progress hairline under the row (downloads in flight). */
  progress?: number;
}

export const TrackRow: React.FC<TrackRowProps> = React.memo(({
  title,
  artist,
  artwork,
  duration,
  meta,
  isCurrent,
  onPress,
  onLongPress,
  trailingIcon,
  trailingLabel,
  onTrailingPress,
  progress,
}) => (
  <Pressable
    onPress={onPress}
    onLongPress={onLongPress}
    accessibilityRole="button"
    accessibilityLabel={`${title}${artist ? ` by ${artist}` : ''}`}
    style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
  >
    <View style={styles.rowArtWrap}>
      {artwork ? (
        <Image source={{ uri: artwork }} style={styles.rowArt} contentFit="cover" transition={Motion.duration.fast} />
      ) : (
        <View style={[styles.rowArt, styles.artFallback]}>
          <Ionicons name="musical-note" size={18} color={Signal.inkFaint} />
        </View>
      )}
      {isCurrent ? (
        <View style={styles.nowDot}>
          <Ionicons name="volume-medium" size={11} color={Signal.waveInk} />
        </View>
      ) : null}
    </View>
    <View style={styles.rowText}>
      <Text style={[styles.rowTitle, isCurrent && { color: Signal.wave }]} numberOfLines={1}>{title}</Text>
      <Text style={styles.rowMeta} numberOfLines={1}>
        {[artist, meta, formatDuration(duration)].filter(Boolean).join(' · ')}
      </Text>
      {progress !== undefined ? (
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { transform: [{ scaleX: Math.max(0.02, Math.min(1, progress)) }] }]} />
        </View>
      ) : null}
    </View>
    {trailingIcon && onTrailingPress ? (
      <Pressable
        onPress={onTrailingPress}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel={trailingLabel ?? 'More'}
        style={({ pressed }) => [styles.trailing, pressed && styles.pressed]}
      >
        <Ionicons name={trailingIcon} size={22} color={Signal.inkSoft} />
      </Pressable>
    ) : null}
  </Pressable>
));

/** Opacity-only shimmer — the one motion Reduce Motion keeps (as a still). */
export const ShimmerBlock: React.FC<{ width: number | `${number}%`; height: number; radius?: number }> = ({ width, height, radius = Radius.well }) => {
  const reduce = useReducedMotion();
  const opacity = useSharedValue(0.45);
  useEffect(() => {
    if (reduce) return;
    opacity.value = withRepeat(withTiming(0.9, { duration: Motion.duration.cinematic * 1.4, easing: Motion.ease.standard }), -1, true);
  }, [opacity, reduce]);
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return <Animated.View style={[{ width, height, borderRadius: radius, backgroundColor: Glass.fillLight }, style]} />;
};

export const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Space.md + 4,
    paddingVertical: 8,
    gap: Space.sm,
    minHeight: 64,
  },
  rowPressed: {
    backgroundColor: Glass.fillLight,
  },
  rowArtWrap: {
    width: 48,
    height: 48,
  },
  rowArt: {
    width: 48,
    height: 48,
    borderRadius: Radius.thumb,
    backgroundColor: Signal.bgSubtle,
  },
  artFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Signal.bgSubtle,
  },
  nowDot: {
    position: 'absolute',
    right: -4,
    bottom: -4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: Signal.wave,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Signal.bg,
  },
  rowText: {
    flex: 1,
  },
  rowTitle: {
    fontFamily: Fonts.interSemiBold,
    fontSize: 16,
    color: Signal.ink,
    letterSpacing: -0.2,
  },
  rowMeta: {
    fontFamily: Fonts.interRegular,
    fontSize: 13,
    color: Signal.inkMuted,
    marginTop: 2,
  },
  progressTrack: {
    height: 2,
    borderRadius: 1,
    marginTop: 6,
    overflow: 'hidden',
    backgroundColor: Glass.fillLight,
  },
  progressFill: {
    height: 2,
    width: '100%',
    backgroundColor: Signal.wave,
    // Scale from the left edge so progress animates as a transform, not width.
    transformOrigin: 'left',
  },
  trailing: {
    width: 44,
    height: 44,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.8,
    transform: [{ scale: Motion.pressScale }],
  },
});
