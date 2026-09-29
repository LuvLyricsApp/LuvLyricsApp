/**
 * The download control beside a catalog song. It follows the song through
 * the queue on its own, so any number can run at once and each row tells the
 * truth:
 *
 *   idle         arrow — tap to save
 *   queued       a turning arc while it waits for a slot
 *   downloading  a ring that fills with progress; tap to pause
 *   paused       the ring stays where it stopped; tap to carry on
 *   saved        a filled tick (it pops in when the download lands)
 *   failed       retry
 *
 * The same song anywhere on screen reads the same state. Transforms, opacity
 * and the ring's dash offset only.
 */
import React, { useEffect, useRef } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle } from 'react-native-svg';
import Animated, {
  cancelAnimation,
  Easing,
  FadeOut,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSpring,
  withTiming,
  ZoomIn,
} from 'react-native-reanimated';
import { Motion, Signal } from '../../constants/allegraTheme';
import { useDownloadState, DownloadTarget } from '../../hooks/useDownloadState';
import { useDownloadQueueStore } from '../../store/downloadQueueStore';
import * as Haptics from '../../utils/haptics';
import type { DownloadPhase } from '../../utils/downloadState';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const SIZE = 24;
const STROKE = 2;
const R = (SIZE - STROKE) / 2;
const C = 2 * Math.PI * R;
const TRACK = 'rgba(244, 241, 234, 0.22)';

const LABEL: Record<DownloadPhase, string> = {
  idle: 'Download',
  queued: 'Waiting to download',
  downloading: 'Downloading, tap to pause',
  paused: 'Paused, tap to carry on',
  saved: 'Downloaded',
  failed: 'Download failed, tap to retry',
};

const Glyph: React.FC<{ phase: DownloadPhase }> = ({ phase }) => {
  switch (phase) {
    case 'idle':
      return <Ionicons name="arrow-down-circle-outline" size={SIZE} color={Signal.inkMuted} />;
    case 'downloading':
      return <View style={styles.stop} />;
    case 'paused':
      return <Ionicons name="arrow-down" size={12} color={Signal.wave} />;
    case 'saved':
      return <Ionicons name="checkmark-circle" size={SIZE} color={Signal.wave} />;
    case 'failed':
      return <Ionicons name="refresh" size={16} color={Signal.accent} />;
    default:
      return null;
  }
};

export const DownloadButton: React.FC<{
  song: DownloadTarget;
  /** Starts the download (the caller adds it to the queue, with its own toast). */
  onSave: () => void;
}> = ({ song, onSave }) => {
  const { phase, progress } = useDownloadState(song);
  const ringed = phase === 'queued' || phase === 'downloading' || phase === 'paused';

  // The ring eases between the store's throttled progress ticks.
  const fill = useSharedValue(progress);
  useEffect(() => {
    fill.value = withTiming(progress, { duration: 260, easing: Easing.out(Easing.quad) });
  }, [progress, fill]);
  const ringProps = useAnimatedProps(() => ({ strokeDashoffset: C * (1 - fill.value) }));

  // Waiting: a short arc turns until a slot frees up.
  const spin = useSharedValue(0);
  useEffect(() => {
    if (phase === 'queued') {
      spin.value = 0;
      spin.value = withRepeat(withTiming(360, { duration: 900, easing: Easing.linear }), -1, false);
    } else {
      cancelAnimation(spin);
      spin.value = 0;
    }
  }, [phase, spin]);
  const spinStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.value}deg` }] }));

  // Glyphs animate in only on a change seen here — a row scrolling into view
  // (or a saved song turning up in a suggestion) just shows its state.
  const live = useRef(false);
  useEffect(() => { live.current = true; }, []);
  const enter = live.current ? ZoomIn.duration(Motion.duration.fast) : undefined;
  // The tick overshoots a little when a download lands.
  const tickEnter = live.current ? ZoomIn.springify().stiffness(520).damping(14) : undefined;

  const press = () => {
    const store = useDownloadQueueStore.getState();
    switch (phase) {
      case 'idle':
        onSave();
        return;
      case 'downloading':
        Haptics.selectionAsync().catch(() => {});
        store.pauseItem(song.id);
        return;
      case 'paused':
        Haptics.selectionAsync().catch(() => {});
        store.resumeItem(song.id);
        return;
      case 'failed':
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        store.retryItem(song.id);
        return;
      default:
        // Waiting or already on the phone: a nudge, nothing to do.
        Haptics.selectionAsync().catch(() => {});
    }
  };

  // The press sinks and springs back like every other control.
  const sink = useSharedValue(1);
  const sinkStyle = useAnimatedStyle(() => ({ transform: [{ scale: sink.value }] }));

  return (
    <Pressable
      onPress={press}
      onPressIn={() => { sink.value = withSpring(0.86, Motion.spring.tactile); }}
      onPressOut={() => { sink.value = withSpring(1, Motion.spring.tactile); }}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={`${LABEL[phase]}: ${song.title}`}
      style={styles.hit}
    >
      <Animated.View style={[styles.box, sinkStyle]}>
        {ringed ? (
          <Animated.View style={[StyleSheet.absoluteFill, styles.center]} entering={enter} exiting={FadeOut.duration(Motion.duration.fast)}>
            <Svg width={SIZE} height={SIZE}>
              <Circle cx={SIZE / 2} cy={SIZE / 2} r={R} stroke={TRACK} strokeWidth={STROKE} fill="none" />
            </Svg>
            <Animated.View style={[StyleSheet.absoluteFill, styles.center, spinStyle]}>
              <Svg width={SIZE} height={SIZE} style={styles.ring}>
                {phase === 'queued' ? (
                  <Circle
                    cx={SIZE / 2}
                    cy={SIZE / 2}
                    r={R}
                    stroke={Signal.wave}
                    strokeWidth={STROKE}
                    strokeLinecap="round"
                    fill="none"
                    strokeDasharray={`${C * 0.22} ${C}`}
                  />
                ) : (
                  <AnimatedCircle
                    cx={SIZE / 2}
                    cy={SIZE / 2}
                    r={R}
                    stroke={Signal.wave}
                    strokeWidth={STROKE}
                    strokeLinecap="round"
                    fill="none"
                    strokeDasharray={C}
                    animatedProps={ringProps}
                  />
                )}
              </Svg>
            </Animated.View>
          </Animated.View>
        ) : null}
        <Animated.View
          key={phase}
          style={[StyleSheet.absoluteFill, styles.center]}
          entering={phase === 'saved' ? tickEnter : enter}
          exiting={FadeOut.duration(Motion.duration.instant)}
        >
          <Glyph phase={phase} />
        </Animated.View>
      </Animated.View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  hit: { paddingHorizontal: 6, paddingVertical: 8 },
  box: { width: SIZE, height: SIZE },
  center: { alignItems: 'center', justifyContent: 'center' },
  // Start the ring at 12 o'clock.
  ring: { transform: [{ rotate: '-90deg' }] },
  stop: { width: 8, height: 8, borderRadius: 2, backgroundColor: Signal.wave },
});

export default DownloadButton;
