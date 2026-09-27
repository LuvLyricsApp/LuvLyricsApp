/**
 * Now Playing transport — Apple Music layout, Allegra material.
 *
 *   Title / artist on the left, like + more on the right,
 *   a flush full-width scrubber, then three large transport glyphs.
 *
 * No opaque card: the controls float on a scrim over the canvas / artwork so
 * the atmosphere reaches the bottom edge. Play/pause wears the stable
 * chartreuse action color; liked state wears coral.
 */
import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet, GestureResponderEvent } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { SharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import TimelineScrubber from './TimelineScrubber';
import { MorphIcon, NudgeIcon, SwapText, Tactile } from './allegra/motion';
import { Glass, PlayerType, Radius, Signal, Space } from '../constants/allegraTheme';
import { CanvasSource } from '../services/canvas/types';

const CANVAS_LABEL: Record<CanvasSource, string> = {
  EchoCanvas: 'Echo',
  ArtistVideo: 'ArchiveTune',
  Tidal: 'Tidal',
  AppleMusic: 'Apple Music',
};

interface NowPlayingControlsProps {
  animatedStyle: React.ComponentProps<typeof Animated.View>['style'];
  controlsVisible: boolean;
  isDark: boolean;
  colors: {
    textPrimary: string;
    textSecondary: string;
    card: string;
  };
  coverImageUri?: string;
  storePlaying: boolean;
  currentSongTitle?: string;
  currentSongArtist?: string;
  isCurrentSongLiked: boolean;
  playButtonStyle: React.ComponentProps<typeof Animated.View>['style'];
  onTogglePlay: () => void;
  onSkipForward: () => void;
  onSkipBackward: () => void;
  onToggleLike: () => void;
  onToggleLyrics: () => void;
  positionSV: SharedValue<number>;
  durationSV: SharedValue<number>;
  onSeek: (seconds: number) => void;
  showLyrics?: boolean;
  /** Set while a motion canvas is on screen; shown as a small source chip. */
  canvasSource?: CanvasSource | null;
  /** Opens the player menu; receives the press event for menu anchoring. */
  onMorePress?: (event: GestureResponderEvent) => void;
}

/** Motion is felt as well as seen: every transport tap gets a haptic tick. */
const tick = (kind: 'light' | 'medium' | 'success') => {
  const run = kind === 'success'
    ? Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    : Haptics.impactAsync(kind === 'medium' ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light);
  run.catch(() => {});
};

const NowPlayingControls: React.FC<NowPlayingControlsProps> = ({
  animatedStyle,
  controlsVisible,
  isDark,
  colors,
  storePlaying,
  currentSongTitle,
  currentSongArtist,
  isCurrentSongLiked,
  playButtonStyle,
  onTogglePlay,
  onSkipForward,
  onSkipBackward,
  onToggleLike,
  onToggleLyrics,
  positionSV,
  durationSV,
  onSeek,
  showLyrics = true,
  canvasSource,
  onMorePress,
}) => {
  const insets = useSafeAreaInsets();
  const [backNudge, setBackNudge] = useState(0);
  const [forwardNudge, setForwardNudge] = useState(0);
  // Over artwork and canvas the player is always a dark room; light mode only
  // softens the scrim.
  const ink = isDark ? Signal.ink : colors.textPrimary;
  const inkMuted = isDark ? 'rgba(244, 241, 234, 0.62)' : colors.textSecondary;
  const scrim = isDark
    ? ['rgba(7, 8, 11, 0)', 'rgba(7, 8, 11, 0.55)', 'rgba(7, 8, 11, 0.88)'] as const
    : ['rgba(242, 242, 247, 0)', 'rgba(242, 242, 247, 0.7)', 'rgba(242, 242, 247, 0.95)'] as const;

  return (
    <Animated.View style={[styles.container, animatedStyle]} pointerEvents={controlsVisible ? 'auto' : 'none'}>
      <LinearGradient colors={scrim} locations={[0, 0.35, 1]} style={StyleSheet.absoluteFill} pointerEvents="none" />

      <View style={[styles.content, { paddingBottom: Math.max(insets.bottom, Space.md) + Space.xs }]}>
        {canvasSource ? (
          <View style={styles.canvasChip} accessibilityLabel={`Motion artwork from ${CANVAS_LABEL[canvasSource]}`}>
            <View style={styles.canvasDot} />
            <Text style={styles.canvasChipText}>CANVAS · {CANVAS_LABEL[canvasSource].toUpperCase()}</Text>
          </View>
        ) : null}

        <View style={styles.metaRow}>
          <View style={styles.metaText}>
            <View style={styles.swapLine}>
              <SwapText style={[styles.title, { color: ink }]} numberOfLines={1}>
                {currentSongTitle || 'Not playing'}
              </SwapText>
            </View>
            <View style={styles.swapLineSmall}>
              <SwapText style={[styles.artist, { color: inkMuted }]} numberOfLines={1}>
                {currentSongArtist || 'Unknown Artist'}
              </SwapText>
            </View>
          </View>

          <Tactile
            onPress={() => { tick(isCurrentSongLiked ? 'light' : 'success'); onToggleLike(); }}
            hitSlop={10}
            pressScale={0.88}
            accessibilityRole="button"
            accessibilityLabel={isCurrentSongLiked ? 'Unlike' : 'Like'}
            style={styles.roundGlass}
          >
            <MorphIcon on={isCurrentSongLiked} onIcon="heart" offIcon="heart-outline" size={20} color={isCurrentSongLiked ? Signal.accent : ink} />
          </Tactile>
          <Tactile
            onPress={e => { tick('light'); (onMorePress ?? onToggleLyrics)(e); }}
            hitSlop={10}
            pressScale={0.88}
            accessibilityRole="button"
            accessibilityLabel="More"
            style={styles.roundGlass}
          >
            <Ionicons name="ellipsis-horizontal" size={20} color={ink} />
          </Tactile>
        </View>

        <View style={styles.scrubber}>
          <TimelineScrubber currentTime={positionSV} duration={durationSV} onSeek={onSeek} variant="classic" />
        </View>

        <View style={styles.transport}>
          <Tactile
            onPress={() => { tick('light'); setBackNudge(n => n + 1); onSkipBackward(); }}
            hitSlop={12}
            pressScale={0.86}
            accessibilityRole="button"
            accessibilityLabel="Previous"
            style={styles.transportBtn}
          >
            <NudgeIcon name="play-back" size={38} color={ink} direction={-1} trigger={backNudge} />
          </Tactile>

          <Tactile
            onPress={() => { tick('medium'); onTogglePlay(); }}
            pressScale={0.9}
            accessibilityRole="button"
            accessibilityLabel={storePlaying ? 'Pause' : 'Play'}
            style={styles.playBtn}
          >
            <Animated.View style={playButtonStyle}>
              <MorphIcon on={storePlaying} onIcon="pause" offIcon="play" size={36} color={Signal.waveInk} offStyle={styles.playGlyphNudge} />
            </Animated.View>
          </Tactile>

          <Tactile
            onPress={() => { tick('light'); setForwardNudge(n => n + 1); onSkipForward(); }}
            hitSlop={12}
            pressScale={0.86}
            accessibilityRole="button"
            accessibilityLabel="Next"
            style={styles.transportBtn}
          >
            <NudgeIcon name="play-forward" size={38} color={ink} direction={1} trigger={forwardNudge} />
          </Tactile>
        </View>

        <View style={styles.footerRow}>
          <Pressable
            onPress={onToggleLyrics}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={showLyrics ? 'Hide lyrics' : 'Show lyrics'}
            style={({ pressed }) => [
              styles.footerBtn,
              showLyrics && styles.footerBtnActive,
              pressed && styles.pressed,
            ]}
          >
            <Ionicons name="chatbox-ellipses" size={20} color={showLyrics ? Signal.waveInk : inkMuted} />
          </Pressable>
        </View>
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 15,
    paddingTop: 72,
  },
  content: {
    paddingHorizontal: Space.lg,
  },
  canvasChip: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Radius.pill,
    backgroundColor: Glass.fill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Glass.hairline,
    marginBottom: Space.sm,
  },
  canvasDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Signal.wave,
  },
  canvasChipText: {
    ...PlayerType.meta,
    fontSize: 9,
    color: Signal.inkSoft,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
  },
  swapLine: {
    height: 28,
    overflow: 'hidden',
  },
  swapLineSmall: {
    height: 24,
    marginTop: 2,
    overflow: 'hidden',
  },
  metaText: {
    flex: 1,
  },
  title: {
    ...PlayerType.title,
  },
  artist: {
    ...PlayerType.artist,
    marginTop: 2,
  },
  roundGlass: {
    width: 36,
    height: 36,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Glass.fillLight,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Glass.hairline,
  },
  scrubber: {
    marginTop: Space.md,
    marginHorizontal: -Space.xs,
  },
  transport: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-evenly',
    marginTop: Space.sm,
  },
  transportBtn: {
    width: 64,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playBtn: {
    width: 76,
    height: 76,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Signal.wave,
  },
  playGlyphNudge: {
    // The play triangle's optical centre sits left of its box.
    marginLeft: 4,
  },
  pressed: {
    transform: [{ scale: 0.94 }],
    opacity: 0.85,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: Space.md,
  },
  footerBtn: {
    width: 44,
    height: 44,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerBtnActive: {
    backgroundColor: Signal.wave,
  },
});

export default React.memo(NowPlayingControls);
