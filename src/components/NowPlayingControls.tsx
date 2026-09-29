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
  Easing,
  runOnJS,
  SharedValue,
  cancelAnimation,
  useAnimatedReaction,
  useAnimatedStyle,
  useDerivedValue,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useIsFocused } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AppleSlider from './player/AppleSlider';
import { MorphIcon, NudgeIcon, Tactile } from './allegra/motion';
import { SwapMarquee } from './allegra/Marquee';
import { PlayerType } from '../constants/allegraTheme';
import { formatTimeSV, isSeeking } from '../playback/positionBus';
import { NativeAudioPlayer } from '../services/NativeAudioPlayer';
import { useSettingsStore } from '../store/settingsStore';
import { lastSongDirection } from '../store/playerStore';

interface NowPlayingControlsProps {
  animatedStyle: React.ComponentProps<typeof Animated.View>['style'];
  controlsVisible: boolean;
  storePlaying: boolean;
  currentSongTitle?: string;
  currentSongArtist?: string;
  isCurrentSongLiked: boolean;
  /** Liked, but a streamed song is still downloading into Liked songs. */
  isLikeSaving?: boolean;
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
  /** Up next (0 closed .. 1 open): title, scrubber and transport ride up above the panel, the rest fades. */
  upNext?: SharedValue<number>;
  /** The Up next panel's top edge when open, in the player's frame. */
  upNextTop?: number;
  upNextOpen?: boolean;
}

const INK = '#ffffff';
const INK_SOFT = 'rgba(255,255,255,0.62)';
/** Echo's secondary text on the player: near white, not grey. */
const INK_META = 'rgba(255,255,255,0.86)';

/** Motion is felt as well as seen: every transport tap gets a haptic tick. */
const tick = (kind: 'light' | 'medium' | 'success') => {
  const run = kind === 'success'
    ? Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    : Haptics.impactAsync(kind === 'medium' ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light);
  run.catch(() => {});
};

/** Elapsed on the left, the song's length on the right (Echo); follows the finger while scrubbing. */
const TimeLabels: React.FC<{ display: DerivedValue<number>; durationSV: SharedValue<number> }> = ({ display, durationSV }) => {
  const [elapsed, setElapsed] = useState('0:00');
  const [remaining, setRemaining] = useState('0:00');
  useAnimatedReaction(
    () => {
      const d = durationSV.value;
      const t = display.value * d;
      return `${formatTimeSV(t)}|${formatTimeSV(d)}`;
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

/** The heart breathes while a streamed song saves into Liked songs. */
const SavingPulse: React.FC<{ saving: boolean; children: React.ReactNode }> = ({ saving, children }) => {
  const reduce = useReducedMotion();
  const o = useSharedValue(1);
  useEffect(() => {
    cancelAnimation(o);
    if (saving && !reduce) {
      o.value = withRepeat(withSequence(withTiming(0.4, { duration: 600, easing: Easing.inOut(Easing.quad) }), withTiming(1, { duration: 600, easing: Easing.inOut(Easing.quad) })), -1);
    } else {
      o.value = withTiming(1, { duration: 160 });
    }
    return () => cancelAnimation(o);
  }, [saving, reduce, o]);
  const style = useAnimatedStyle(() => ({ opacity: o.value }));
  return <Animated.View style={style}>{children}</Animated.View>;
};

const NowPlayingControls: React.FC<NowPlayingControlsProps> = ({
  animatedStyle,
  controlsVisible,
  storePlaying,
  currentSongTitle,
  currentSongArtist,
  isCurrentSongLiked,
  isLikeSaving = false,
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
  upNext,
  upNextTop = 0,
  upNextOpen = false,
}) => {
  const insets = useSafeAreaInsets();
  // Where the transport's bottom edge sits in the player, so Up next can lift
  // it to just above the panel whatever the screen size.
  const boxY = useSharedValue(0);
  const transportEnd = useSharedValue(0);
  const liftStyle = useAnimatedStyle(() => {
    const p = upNext ? upNext.value : 0;
    const bottom = boxY.value + CONTAINER_PAD_TOP + transportEnd.value;
    const lift = transportEnd.value > 0 ? Math.min(0, upNextTop - 6 - bottom) : 0;
    return { transform: [{ translateY: p * lift }] };
  });
  const lowerStyle = useAnimatedStyle(() => ({ opacity: 1 - Math.min(1, (upNext ? upNext.value : 0) * 2.5) }));
  const shadeStyle = useAnimatedStyle(() => ({ opacity: 1 - Math.min(1, (upNext ? upNext.value : 0) * 2.5) }));
  // Long titles scroll only while this screen is the one in front.
  const focused = useIsFocused();
  // Read at render: when the title changes this is the way the skip went.
  const songDirection = lastSongDirection();
  const hideVolume = useSettingsStore(s => s.appleMusicInspired && s.hidePlayerVolume);
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
    <Animated.View
      style={[styles.container, animatedStyle]}
      pointerEvents={controlsVisible ? 'box-none' : 'none'}
      onLayout={e => { boxY.value = e.nativeEvent.layout.y; }}
    >
      {/* Only a whisper of shade — enough for white text over a bright canvas video. */}
      <Animated.View style={[StyleSheet.absoluteFill, shadeStyle]} pointerEvents="none">
        <LinearGradient colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.28)']} style={StyleSheet.absoluteFill} />
      </Animated.View>

      {/* Echo keeps the bottom row a clear step above the system bar. */}
      <Animated.View style={[styles.content, { paddingBottom: Math.max(insets.bottom, 16) + 14 }, liftStyle]} pointerEvents="box-none">
        <View style={styles.metaRow}>
          <Pressable style={styles.metaText} onPress={onArtistPress} disabled={!onArtistPress} accessibilityRole="button">
            <View style={styles.swapLine}>
              <SwapMarquee style={styles.title} direction={songDirection} active={focused}>{currentSongTitle || 'Not playing'}</SwapMarquee>
            </View>
            <View style={styles.swapLineSmall}>
              <SwapMarquee style={styles.artist} direction={songDirection} active={focused}>{currentSongArtist || 'Unknown artist'}</SwapMarquee>
            </View>
          </Pressable>

          <Tactile
            onPress={e => { tick('light'); (onMorePress ?? onToggleLyrics)(e); }}
            hitSlop={8}
            pressScale={0.88}
            accessibilityRole="button"
            accessibilityLabel="Song options"
            style={styles.roundGlass}
          >
            <Ionicons name="ellipsis-vertical" size={18} color={INK} />
          </Tactile>
          <Tactile
            onPress={() => { tick(isCurrentSongLiked ? 'light' : 'success'); onToggleLike(); }}
            hitSlop={8}
            pressScale={0.88}
            accessibilityRole="button"
            accessibilityLabel={isLikeSaving ? 'Saving to Liked songs, tap to cancel' : isCurrentSongLiked ? 'Unlike' : 'Like'}
            style={styles.roundGlass}
          >
            <SavingPulse saving={isLikeSaving}>
              <MorphIcon on={isCurrentSongLiked} onIcon="heart" offIcon="heart-outline" size={20} color={INK} />
            </SavingPulse>
          </Tactile>
        </View>

        <AppleSlider
          progress={progress}
          onCommit={seek}
          height={10}
          accessibilityLabel="Song position"
          style={styles.scrubber}
          renderBelow={display => <TimeLabels display={display} durationSV={durationSV} />}
        />

        <View style={styles.transport} onLayout={e => { transportEnd.value = e.nativeEvent.layout.y + e.nativeEvent.layout.height; }}>
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

        <Animated.View style={lowerStyle} pointerEvents={upNextOpen ? 'none' : 'box-none'}>
        {compact || hideVolume ? null : <VolumeRow />}

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
        </Animated.View>
      </Animated.View>
    </Animated.View>
  );
};

const CONTAINER_PAD_TOP = 40;

const styles = StyleSheet.create({
  container: { position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 15, paddingTop: CONTAINER_PAD_TOP },
  content: { paddingHorizontal: 28 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  metaText: { flex: 1 },
  swapLine: { height: 30, overflow: 'hidden' },
  swapLineSmall: { height: 24, overflow: 'hidden' },
  title: { ...PlayerType.title, color: INK, fontWeight: '700' },
  artist: { ...PlayerType.artist, color: INK_META },
  roundGlass: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  // Echo's rhythm: 24 between the title and the bar, 24 under the times,
  // ~30 between the transport and the bottom row.
  scrubber: { marginTop: 24 },
  timeRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8, paddingHorizontal: 4 },
  time: { fontWeight: '600', fontSize: 13, fontVariant: ['tabular-nums'], color: INK_META },
  transport: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-evenly', marginTop: 18 },
  transportBtn: { width: 76, height: 72, alignItems: 'center', justifyContent: 'center' },
  // The play triangle's optical centre sits left of its box.
  playNudge: { marginLeft: 5 },
  volumeRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 14 },
  volumeSlider: { flex: 1 },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 26 },
  footerBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  footerBtnOn: { backgroundColor: 'rgba(255,255,255,0.9)' },
  segment: { flexDirection: 'row', alignItems: 'center', height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.14)', overflow: 'hidden' },
  segmentHalf: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', minWidth: 64, height: 44, paddingHorizontal: 16, gap: 6 },
  segmentPressed: { backgroundColor: 'rgba(255,255,255,0.12)' },
  segmentDivider: { width: StyleSheet.hairlineWidth, height: 22, backgroundColor: 'rgba(255,255,255,0.3)' },
  sleepText: { color: INK, fontSize: 13, fontWeight: '600' },
});

export default React.memo(NowPlayingControls);
