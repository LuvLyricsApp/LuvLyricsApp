/**
 * Now Playing transport — Apple Music's layout.
 *
 *   Title / artist                         ( ••• ) ( ♥ )
 *   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *   0:42                                            -2:31
 *            ◀◀              ▶              ▶▶
 *   🔈 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 🔊
 *   ☰              [ speaker | timer ]               ❝
 *
 * White on the cover's own colours, no chrome of our own: the backdrop
 * (NowPlayingBackground) carries the look.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { View, Pressable, StyleSheet, Text, GestureResponderEvent } from 'react-native';
import * as Haptics from '../utils/haptics';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  DerivedValue,
  runOnJS,
  SharedValue,
  useAnimatedReaction,
  useDerivedValue,
  useSharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AppleSlider from './player/AppleSlider';
import { MorphIcon, NudgeIcon, SwapText, Tactile } from './allegra/motion';
import { PlayerType } from '../constants/allegraTheme';
import { formatTimeSV, isSeeking } from '../playback/positionBus';
import { NativeAudioPlayer } from '../services/NativeAudioPlayer';

interface NowPlayingControlsProps {
  animatedStyle: React.ComponentProps<typeof Animated.View>['style'];
  controlsVisible: boolean;
  storePlaying: boolean;
  currentSongTitle?: string;
  currentSongArtist?: string;
  isCurrentSongLiked: boolean;
  onTogglePlay: () => void;
  onSkipForward: () => void;
  onSkipBackward: () => void;
  onToggleLike: () => void;
  onToggleLyrics: () => void;
  positionSV: SharedValue<number>;
  durationSV: SharedValue<number>;
  onSeek: (seconds: number) => void | Promise<void>;
  showLyrics?: boolean;
  /** Opens the player menu; receives the press event for menu anchoring. */
  onMorePress?: (event: GestureResponderEvent) => void;
  onOpenQueue: () => void;
  onOpenTimer: () => void;
  /** Time left on the sleep timer ("12 min"), or null when it is off. */
  sleepLabel?: string | null;
  onArtistPress?: () => void;
  /** Lyrics view: drop the volume row so the lines get the room. */
  compact?: boolean;
}

const INK = '#ffffff';
const INK_SOFT = 'rgba(255,255,255,0.62)';

/** Motion is felt as well as seen: every transport tap gets a haptic tick. */
const tick = (kind: 'light' | 'medium' | 'success') => {
  const run = kind === 'success'
    ? Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    : Haptics.impactAsync(kind === 'medium' ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light);
  run.catch(() => {});
};

/** Elapsed on the left, remaining on the right; follows the finger while scrubbing. */
const TimeLabels: React.FC<{ display: DerivedValue<number>; durationSV: SharedValue<number> }> = ({ display, durationSV }) => {
  const [elapsed, setElapsed] = useState('0:00');
  const [remaining, setRemaining] = useState('-0:00');
  useAnimatedReaction(
    () => {
      const d = durationSV.value;
      const t = display.value * d;
      return `${formatTimeSV(t)}|-${formatTimeSV(Math.max(0, d - t))}`;
    },
    (next, prev) => {
      if (next === prev) return;
      const [a, b] = next.split('|');
      runOnJS(setElapsed)(a);
      runOnJS(setRemaining)(b);
    },
  );
  return (
    <View style={styles.timeRow}>
      <Text style={styles.time}>{elapsed}</Text>
      <Text style={styles.time}>{remaining}</Text>
    </View>
  );
};

/** The system media volume, kept in step with the hardware keys. */
const VolumeRow: React.FC = () => {
  const [available] = useState(() => NativeAudioPlayer.getVolume() !== null);
  const volume = useSharedValue(NativeAudioPlayer.getVolume() ?? 0);
  useEffect(() => {
    if (!available) return;
    const sub = NativeAudioPlayer.addListener('onVolumeChanged', (e: { volume?: number }) => {
      if (typeof e?.volume === 'number') volume.value = e.volume;
    });
    return () => sub.remove();
  }, [available, volume]);
  const set = useCallback((v: number) => {
    volume.value = v;
    NativeAudioPlayer.setVolume(v);
  }, [volume]);
  if (!available) return null;
  return (
    <View style={styles.volumeRow}>
      <Ionicons name="volume-low" size={18} color={INK_SOFT} />
      <AppleSlider progress={volume} onChange={set} onCommit={set} height={6} accessibilityLabel="Volume" style={styles.volumeSlider} />
      <Ionicons name="volume-high" size={20} color={INK_SOFT} />
    </View>
  );
};

const NowPlayingControls: React.FC<NowPlayingControlsProps> = ({
  animatedStyle,
  controlsVisible,
  storePlaying,
  currentSongTitle,
  currentSongArtist,
  isCurrentSongLiked,
  onTogglePlay,
  onSkipForward,
  onSkipBackward,
  onToggleLike,
  onToggleLyrics,
  positionSV,
  durationSV,
  onSeek,
  showLyrics = false,
  onMorePress,
  onOpenQueue,
  onOpenTimer,
  sleepLabel,
  onArtistPress,
  compact = false,
}) => {
  const insets = useSafeAreaInsets();
  const [backNudge, setBackNudge] = useState(0);
  const [forwardNudge, setForwardNudge] = useState(0);

  const progress = useDerivedValue(() => (durationSV.value > 0 ? positionSV.value / durationSV.value : 0));
  const seek = useCallback(async (fraction: number) => {
    const seconds = fraction * durationSV.value;
    isSeeking.value = true;
    positionSV.value = seconds;
    try {
      await onSeek(seconds);
    } finally {
      setTimeout(() => { isSeeking.value = false; }, 280);
    }
  }, [durationSV, positionSV, onSeek]);

  const output = useCallback(() => {
    tick('light');
    NativeAudioPlayer.openOutputSwitcher();
  }, []);

  return (
    <Animated.View style={[styles.container, animatedStyle]} pointerEvents={controlsVisible ? 'box-none' : 'none'}>
      {/* Only a whisper of shade — enough for white text over a bright canvas video. */}
      <LinearGradient colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.28)']} style={StyleSheet.absoluteFill} pointerEvents="none" />

      <View style={[styles.content, { paddingBottom: Math.max(insets.bottom, 12) + 6 }]}>
        <View style={styles.metaRow}>
          <Pressable style={styles.metaText} onPress={onArtistPress} disabled={!onArtistPress} accessibilityRole="button">
            <View style={styles.swapLine}>
              <SwapText style={styles.title} numberOfLines={1}>{currentSongTitle || 'Not playing'}</SwapText>
            </View>
            <View style={styles.swapLineSmall}>
              <SwapText style={styles.artist} numberOfLines={1}>{currentSongArtist || 'Unknown artist'}</SwapText>
            </View>
          </Pressable>

          <Tactile
            onPress={e => { tick('light'); (onMorePress ?? onToggleLyrics)(e); }}
            hitSlop={8}
            pressScale={0.88}
            accessibilityRole="button"
            accessibilityLabel="More"
            style={styles.roundGlass}
          >
            <Ionicons name="ellipsis-vertical" size={18} color={INK} />
          </Tactile>
          <Tactile
            onPress={() => { tick(isCurrentSongLiked ? 'light' : 'success'); onToggleLike(); }}
            hitSlop={8}
            pressScale={0.88}
            accessibilityRole="button"
            accessibilityLabel={isCurrentSongLiked ? 'Unlike' : 'Like'}
            style={styles.roundGlass}
          >
            <MorphIcon on={isCurrentSongLiked} onIcon="heart" offIcon="heart-outline" size={20} color={INK} />
          </Tactile>
        </View>

        <AppleSlider
          progress={progress}
          onCommit={seek}
          accessibilityLabel="Song position"
          style={styles.scrubber}
          renderBelow={display => <TimeLabels display={display} durationSV={durationSV} />}
        />

        <View style={styles.transport}>
          <Tactile
            onPress={() => { tick('light'); setBackNudge(n => n + 1); onSkipBackward(); }}
            hitSlop={12}
            pressScale={0.84}
            accessibilityRole="button"
            accessibilityLabel="Previous"
            style={styles.transportBtn}
          >
            <NudgeIcon name="play-back" size={42} color={INK} direction={-1} trigger={backNudge} />
          </Tactile>
          <Tactile
            onPress={() => { tick('medium'); onTogglePlay(); }}
            hitSlop={12}
            pressScale={0.86}
            accessibilityRole="button"
            accessibilityLabel={storePlaying ? 'Pause' : 'Play'}
            style={styles.transportBtn}
          >
            <MorphIcon on={storePlaying} onIcon="pause" offIcon="play" size={54} color={INK} offStyle={styles.playNudge} />
          </Tactile>
          <Tactile
            onPress={() => { tick('light'); setForwardNudge(n => n + 1); onSkipForward(); }}
            hitSlop={12}
            pressScale={0.84}
            accessibilityRole="button"
            accessibilityLabel="Next"
            style={styles.transportBtn}
          >
            <NudgeIcon name="play-forward" size={42} color={INK} direction={1} trigger={forwardNudge} />
          </Tactile>
        </View>

        {compact ? null : <VolumeRow />}

        <View style={styles.footer}>
          <Pressable onPress={() => { tick('light'); onOpenQueue(); }} hitSlop={10} style={styles.footerBtn} accessibilityRole="button" accessibilityLabel="Playing next">
            <Ionicons name="list" size={26} color={INK_SOFT} />
          </Pressable>

          <View style={styles.segment}>
            <Pressable onPress={output} style={({ pressed }) => [styles.segmentHalf, pressed && styles.segmentPressed]} accessibilityRole="button" accessibilityLabel="Play on another device">
              <MaterialCommunityIcons name="speaker" size={22} color={INK_SOFT} />
            </Pressable>
            <View style={styles.segmentDivider} />
            <Pressable onPress={() => { tick('light'); onOpenTimer(); }} style={({ pressed }) => [styles.segmentHalf, pressed && styles.segmentPressed]} accessibilityRole="button" accessibilityLabel="Sleep timer">
              <MaterialCommunityIcons name="timer-outline" size={21} color={sleepLabel ? INK : INK_SOFT} />
              {sleepLabel ? <Text style={styles.sleepText}>{sleepLabel}</Text> : null}
            </Pressable>
          </View>

          <Pressable
            onPress={() => { tick('light'); onToggleLyrics(); }}
            hitSlop={10}
            style={[styles.footerBtn, showLyrics && styles.footerBtnOn]}
            accessibilityRole="button"
            accessibilityLabel={showLyrics ? 'Hide lyrics' : 'Show lyrics'}
          >
            <MaterialCommunityIcons name="comment-quote-outline" size={24} color={showLyrics ? '#15151a' : INK_SOFT} />
          </Pressable>
        </View>
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: { position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 15, paddingTop: 40 },
  content: { paddingHorizontal: 28 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  metaText: { flex: 1 },
  swapLine: { height: 30, overflow: 'hidden' },
  swapLineSmall: { height: 24, overflow: 'hidden' },
  title: { ...PlayerType.title, color: INK, fontWeight: '700' },
  artist: { ...PlayerType.artist, color: INK_SOFT },
  roundGlass: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  scrubber: { marginTop: 18 },
  timeRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 },
  time: { fontWeight: '600', fontSize: 12, fontVariant: ['tabular-nums'], color: INK_SOFT },
  transport: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-evenly', marginTop: 14 },
  transportBtn: { width: 76, height: 72, alignItems: 'center', justifyContent: 'center' },
  // The play triangle's optical centre sits left of its box.
  playNudge: { marginLeft: 5 },
  volumeRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 14 },
  volumeSlider: { flex: 1 },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16 },
  footerBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  footerBtnOn: { backgroundColor: 'rgba(255,255,255,0.9)' },
  segment: { flexDirection: 'row', alignItems: 'center', height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.14)', overflow: 'hidden' },
  segmentHalf: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', minWidth: 64, height: 44, paddingHorizontal: 16, gap: 6 },
  segmentPressed: { backgroundColor: 'rgba(255,255,255,0.12)' },
  segmentDivider: { width: StyleSheet.hairlineWidth, height: 22, backgroundColor: 'rgba(255,255,255,0.3)' },
  sleepText: { color: INK, fontSize: 13, fontWeight: '600' },
});

export default React.memo(NowPlayingControls);
