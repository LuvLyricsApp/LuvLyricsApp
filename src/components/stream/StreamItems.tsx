/**
 * Allegra-styled building blocks for the Stream and Downloads pages: a track
 * row, an artwork card, a section header and a loading shimmer. Everything
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

const formatDuration = (seconds?: number): string => {
  if (!seconds || seconds <= 0) return '';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
};

export const SectionHeader: React.FC<{ title: string; subtitle?: string; action?: string; onAction?: () => void }> = ({
  title,
  subtitle,
  action,
  onAction,
}) => (
  <View style={styles.sectionHeader}>
    <View style={{ flex: 1 }}>
      {subtitle ? <Text style={styles.sectionEyebrow}>{subtitle.toUpperCase()}</Text> : null}
      <Text style={styles.sectionTitle} numberOfLines={1}>{title}</Text>
    </View>
    {action && onAction ? (
      <Pressable onPress={onAction} hitSlop={8} accessibilityRole="button" style={({ pressed }) => [styles.sectionAction, pressed && styles.pressed]}>
        <Text style={styles.sectionActionText}>{action}</Text>
      </Pressable>
    ) : null}
  </View>
);

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

interface ArtworkCardProps {
  title: string;
  subtitle?: string;
  eyebrow?: string;
  artwork?: string;
  size?: number;
  onPress: () => void;
  onLongPress?: () => void;
}

export const ArtworkCard: React.FC<ArtworkCardProps> = React.memo(({ title, subtitle, eyebrow, artwork, size = 148, onPress, onLongPress }) => (
  <Pressable
    onPress={onPress}
    onLongPress={onLongPress}
    accessibilityRole="button"
    accessibilityLabel={title}
    style={({ pressed }) => [{ width: size }, pressed && styles.pressed]}
  >
    <View style={[styles.cardArtFrame, { width: size, height: size }]}>
      {artwork ? (
        <Image source={{ uri: artwork }} style={StyleSheet.absoluteFill} contentFit="cover" transition={Motion.duration.base} />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.artFallback]}>
          <Ionicons name="musical-notes" size={size * 0.24} color={Signal.inkFaint} />
        </View>
      )}
      <View style={styles.cardPlay}>
        <Ionicons name="play" size={14} color={Signal.waveInk} style={{ marginLeft: 2 }} />
      </View>
    </View>
    {eyebrow ? <Text style={styles.cardEyebrow} numberOfLines={1}>{eyebrow}</Text> : null}
    <Text style={styles.cardTitle} numberOfLines={1}>{title}</Text>
    {subtitle ? <Text style={styles.cardSubtitle} numberOfLines={1}>{subtitle}</Text> : null}
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
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: Space.md + 4,
    marginTop: Space.xl,
    marginBottom: Space.sm,
  },
  sectionEyebrow: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.9,
    color: Signal.inkMuted,
    marginBottom: 2,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.5,
    color: Signal.ink,
  },
  sectionAction: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radius.pill,
    backgroundColor: Glass.fillLight,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Glass.hairline,
  },
  sectionActionText: {
    fontSize: 13,
    fontWeight: '700',
    color: Signal.inkSoft,
  },
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
    fontSize: 16,
    fontWeight: '600',
    color: Signal.ink,
    letterSpacing: -0.2,
  },
  rowMeta: {
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
  cardArtFrame: {
    borderRadius: Radius.art,
    overflow: 'hidden',
    backgroundColor: Signal.bgSubtle,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Glass.hairline,
  },
  cardPlay: {
    position: 'absolute',
    right: 8,
    bottom: 8,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: Signal.wave,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardEyebrow: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
    color: Signal.wave,
    marginTop: 8,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: Signal.ink,
    marginTop: 6,
  },
  cardSubtitle: {
    fontSize: 12,
    color: Signal.inkMuted,
    marginTop: 2,
  },
  pressed: {
    opacity: 0.8,
    transform: [{ scale: Motion.pressScale }],
  },
});
