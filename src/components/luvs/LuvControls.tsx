/**
 * The pieces around the Luvs taste map: the action buttons (a press sinks,
 * overshoots and settles on a spring, with a haptic), the heart burst on a
 * Luv, the equaliser on the playing card and the scrubber for the clip.
 * Transforms and opacity only.
 */
import React, { useCallback, useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import TimelineScrubber from '../TimelineScrubber';
import { luvsBufferManager } from '../../services/LuvsBufferManager';
import { Glass, Motion, Signal } from '../../constants/allegraTheme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

// ─── Heart burst ─────────────────────────────────────────────────────────────
const BURST_ANGLES = [270, 315, 0, 45, 90, 135, 180, 225];

const HeartParticle: React.FC<{ angle: number; trigger: number }> = ({ angle, trigger }) => {
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const op = useSharedValue(0);
  const sc = useSharedValue(0);
  useEffect(() => {
    if (trigger === 0) return;
    const rad = (angle * Math.PI) / 180;
    tx.value = 0; ty.value = 0; op.value = 0; sc.value = 0;
    tx.value = withTiming(Math.cos(rad) * 58, { duration: 520, easing: Easing.out(Easing.cubic) });
    ty.value = withTiming(Math.sin(rad) * 58, { duration: 520, easing: Easing.out(Easing.cubic) });
    op.value = withSequence(withTiming(1, { duration: 80 }), withTiming(0, { duration: 420, easing: Easing.out(Easing.quad) }));
    sc.value = withSequence(withSpring(1.5, { damping: 8, stiffness: 280 }), withTiming(0.3, { duration: 300 }));
  }, [trigger, angle, tx, ty, op, sc]);
  const style = useAnimatedStyle(() => ({
    opacity: op.value,
    transform: [{ translateX: tx.value }, { translateY: ty.value }, { scale: sc.value }] as const,
  }));
  return (
    <Animated.View style={[styles.particle, style]} pointerEvents="none">
      <Ionicons name="heart" size={12} color={Signal.accent} />
    </Animated.View>
  );
};

const HeartBurst: React.FC<{ trigger: number }> = ({ trigger }) => (
  <View style={styles.burst} pointerEvents="none">
    {BURST_ANGLES.map(a => <HeartParticle key={a} angle={a} trigger={trigger} />)}
  </View>
);

// ─── Action button ───────────────────────────────────────────────────────────
export const LuvAction: React.FC<{
  icon: IconName;
  label: string;
  onPress: () => void;
  /** Filled when the action is on (liked, saved). */
  on?: boolean;
  tint?: string;
  burst?: number;
  disabled?: boolean;
}> = ({ icon, label, onPress, on = false, tint = Signal.wave, burst = 0, disabled = false }) => {
  const sc = useSharedValue(1);
  const glow = useSharedValue(on ? 1 : 0);
  useEffect(() => {
    glow.value = withTiming(on ? 1 : 0, { duration: Motion.duration.base });
  }, [on, glow]);
  const press = useCallback(() => {
    sc.value = withSequence(
      withSpring(0.8, { damping: 14, stiffness: 600 }),
      withSpring(1.1, { damping: 8, stiffness: 320 }),
      withSpring(1, Motion.spring.tactile),
    );
    onPress();
  }, [onPress, sc]);
  const circle = useAnimatedStyle(() => ({ transform: [{ scale: sc.value }] }));
  const fill = useAnimatedStyle(() => ({ opacity: glow.value }));
  return (
    <Pressable
      onPress={disabled ? undefined : press}
      onPressIn={() => { sc.value = withSpring(0.9, Motion.spring.tactile); }}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: on, disabled }}
      hitSlop={6}
      style={[styles.cell, disabled && styles.disabled]}
    >
      <Animated.View style={[styles.circle, circle]}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.fill, { backgroundColor: tint }, fill]} />
        {burst ? <HeartBurst trigger={burst} /> : null}
        <Ionicons name={icon} size={24} color={on && tint === Signal.wave ? Signal.waveInk : Signal.ink} />
      </Animated.View>
      <Text style={styles.label} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
};

// ─── Equaliser ───────────────────────────────────────────────────────────────
const EQ_MAX = 15;
export const EqBars: React.FC<{ active: boolean }> = ({ active }) => {
  const h1 = useSharedValue(3);
  const h2 = useSharedValue(3);
  const h3 = useSharedValue(3);
  useEffect(() => {
    if (active) {
      h1.value = withRepeat(withSequence(withTiming(13, { duration: 280 }), withTiming(3, { duration: 280 })), -1, false);
      h2.value = withRepeat(withSequence(withTiming(7, { duration: 200 }), withTiming(15, { duration: 320 }), withTiming(3, { duration: 240 })), -1, false);
      h3.value = withRepeat(withSequence(withTiming(15, { duration: 380 }), withTiming(3, { duration: 320 })), -1, false);
    } else {
      [h1, h2, h3].forEach(h => { cancelAnimation(h); h.value = withTiming(3, { duration: 250 }); });
    }
  }, [active, h1, h2, h3]);
  const s1 = useAnimatedStyle(() => ({ transform: [{ scaleY: h1.value / EQ_MAX }] }));
  const s2 = useAnimatedStyle(() => ({ transform: [{ scaleY: h2.value / EQ_MAX }] }));
  const s3 = useAnimatedStyle(() => ({ transform: [{ scaleY: h3.value / EQ_MAX }] }));
  return (
    <View style={styles.eq}>
      <Animated.View style={[styles.eqBar, s1]} />
      <Animated.View style={[styles.eqBar, s2]} />
      <Animated.View style={[styles.eqBar, s3]} />
    </View>
  );
};

// ─── Scrubber ────────────────────────────────────────────────────────────────
/** The playing clip's position, from the Luvs audio pool (seconds). */
export const LuvScrubber: React.FC<{ onScrubbing?: (on: boolean) => void }> = ({ onScrubbing }) => {
  const position = useSharedValue(0);
  const duration = useSharedValue(0);
  useEffect(() => {
    luvsBufferManager.setStatusUpdateCallback(status => {
      if (status.isLoaded) {
        position.value = (status.positionMillis || 0) / 1000;
        duration.value = (status.durationMillis || 0) / 1000;
      }
    });
  }, [position, duration]);
  return (
    <View style={styles.scrubber}>
      <TimelineScrubber
        currentTime={position}
        duration={duration}
        onSeek={t => luvsBufferManager.seekTo(t * 1000)}
        onScrubStart={() => { onScrubbing?.(true); luvsBufferManager.pause(); }}
        onScrubEnd={() => { onScrubbing?.(false); luvsBufferManager.resume(); }}
        variant="classic"
      />
    </View>
  );
};

const styles = StyleSheet.create({
  cell: { alignItems: 'center', width: 72 },
  disabled: { opacity: 0.45 },
  circle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Glass.fillLight,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Glass.hairlineStrong,
  },
  fill: { borderRadius: 26 },
  label: { color: Signal.inkSoft, fontSize: 12, fontWeight: '600', marginTop: 6 },
  burst: { position: 'absolute', width: 20, height: 20, alignItems: 'center', justifyContent: 'center' },
  particle: { position: 'absolute', width: 20, height: 20, alignItems: 'center', justifyContent: 'center' },
  eq: { flexDirection: 'row', alignItems: 'flex-end', gap: 3, height: EQ_MAX },
  eqBar: { width: 3, height: EQ_MAX, borderRadius: 1.5, backgroundColor: Signal.wave, transformOrigin: 'bottom' },
  scrubber: { height: 46, justifyContent: 'center' },
});
