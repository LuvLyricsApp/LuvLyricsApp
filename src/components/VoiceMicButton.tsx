/**
 * The mic in the middle of the tab bar. It answers every stage of a voice
 * search with its own motion, so a finger on it always knows what's happening:
 *
 *   idle       a frosted glass bead: translucent body, specular cap, lit rim
 *   press      sinks under the finger (spring) + a firm haptic
 *   listening  blooms into the signal colour and grows slightly; a halo tracks
 *              the voice level, a slow ring pulses outward, bars dance inside
 *   thinking   after release, an arc circles the disc while results load
 *   error      a short shake and a red flash
 *
 * Transform and opacity only — colour changes are cross-faded layers, never an
 * animated backgroundColor. Reduce Motion keeps the state changes, drops the
 * pulse, spin and shake.
 */
import React, { useCallback, useEffect, useRef } from 'react';
import { Platform, Pressable, StyleSheet, View, ViewStyle } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useVoiceCommands } from '../hooks/useVoiceCommands';
import { useSettingsStore } from '../store/settingsStore';
import { useVoiceSearchStore } from '../store/voiceSearchStore';
import { Motion, Signal } from '../constants/allegraTheme';

interface Props {
  style?: object;
  variant?: 'floating' | 'inline';
}

// Long-press threshold: 600ms feels natural for hold-to-talk
const LONG_PRESS_MS = 600;
const BAR_SHAPE = [0.55, 1, 0.75, 0.45];
const ERROR_RED = '#ff5a4f';

const Bar: React.FC<{ level: number; weight: number; active: boolean; size: number }> = ({ level, weight, active, size }) => {
  const h = useSharedValue(0.45);
  useEffect(() => {
    h.value = withSpring(active ? 0.45 + Math.min(1, level) * 0.55 * weight : 0.45, Motion.spring.tactile);
  }, [level, weight, active, h]);
  const style = useAnimatedStyle(() => ({ transform: [{ scaleY: h.value }] }));
  return <Animated.View style={[styles.bar, { height: size * 0.42, width: Math.max(2.5, size * 0.065) }, style]} />;
};

export const VoiceMicButton: React.FC<Props> = ({ style, variant = 'floating' }) => {
  const size = variant === 'inline' ? 44 : 56;
  const { isListening: hookListening, audioLevel, error, startListening, stopListening } = useVoiceCommands();
  const phase = useVoiceSearchStore(s => s.phase);
  const voiceMode = useSettingsStore(s => s.voiceMode ?? 'tap');
  const reduce = useReducedMotion();

  const isListening = hookListening || phase === 'listening';
  const isThinking = phase === 'searching';
  const isTapMode = voiceMode === 'tap';

  const wasListeningOnPressRef = useRef(false);
  const isHoldRef = useRef(false);

  // ── Motion values ──────────────────────────────────────────────────────
  const press = useSharedValue(1);      // finger-down sink
  const bloom = useSharedValue(0);      // 0 idle → 1 listening (colour + size)
  const halo = useSharedValue(0);       // live voice level
  const pulse = useSharedValue(0);      // slow outward ring, 0→1 repeating
  const spin = useSharedValue(0);       // thinking arc rotation
  const arc = useSharedValue(0);        // thinking arc visibility
  const shake = useSharedValue(0);
  const flash = useSharedValue(0);      // error tint

  useEffect(() => {
    bloom.value = withSpring(isListening ? 1 : 0, Motion.spring.tactile);
    if (isListening) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      if (!reduce) {
        pulse.value = 0;
        pulse.value = withRepeat(withTiming(1, { duration: 1400, easing: Easing.out(Easing.quad) }), -1, false);
      }
    } else {
      cancelAnimation(pulse);
      pulse.value = withTiming(0, { duration: Motion.duration.fast });
      halo.value = withTiming(0, { duration: Motion.duration.fast });
    }
  }, [isListening, reduce, bloom, pulse, halo]);

  useEffect(() => {
    if (isListening) halo.value = withSpring(Math.min(1, audioLevel), Motion.spring.tactile);
  }, [audioLevel, isListening, halo]);

  useEffect(() => {
    arc.value = withTiming(isThinking ? 1 : 0, { duration: Motion.duration.base });
    if (isThinking && !reduce) {
      spin.value = 0;
      spin.value = withRepeat(withTiming(1, { duration: 900, easing: Easing.linear }), -1, false);
    } else {
      cancelAnimation(spin);
    }
  }, [isThinking, reduce, arc, spin]);

  useEffect(() => {
    if (!error) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    flash.value = withSequence(withTiming(1, { duration: Motion.duration.instant }), withTiming(0, { duration: 900 }));
    if (!reduce) {
      shake.value = withSequence(
        withTiming(-5, { duration: 45 }), withTiming(5, { duration: 45 }),
        withTiming(-3, { duration: 45 }), withTiming(0, { duration: 45 }),
      );
    }
  }, [error, reduce, flash, shake]);

  const discStyle = useAnimatedStyle((): ViewStyle => ({
    transform: [{ translateX: shake.value }, { scale: press.value * (1 + 0.1 * bloom.value) }],
  }));
  const idleLayer = useAnimatedStyle(() => ({ opacity: 1 - bloom.value }));
  const liveLayer = useAnimatedStyle(() => ({ opacity: bloom.value }));
  const errorLayer = useAnimatedStyle(() => ({ opacity: flash.value }));
  const haloStyle = useAnimatedStyle(() => ({
    opacity: bloom.value * (0.18 + 0.22 * halo.value),
    transform: [{ scale: 1 + 0.12 * bloom.value + 0.26 * halo.value }],
  }));
  const pulseStyle = useAnimatedStyle(() => ({
    opacity: bloom.value * 0.45 * (1 - pulse.value),
    transform: [{ scale: 1 + 0.4 * pulse.value }],
  }));
  const arcStyle = useAnimatedStyle(() => ({
    opacity: arc.value,
    transform: [{ rotate: `${spin.value * 360}deg` }],
  }));

  // ── Press handling (tap-to-toggle or hold-to-talk, per Settings) ──────────
  const onPressIn = useCallback(() => {
    press.value = withSpring(0.86, Motion.spring.tactile);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    isHoldRef.current = false;
    wasListeningOnPressRef.current = isListening;
    if (!isListening) startListening();
  }, [isListening, startListening, press]);

  const onLongPress = useCallback(() => {
    if (isTapMode) return;
    isHoldRef.current = true;
  }, [isTapMode]);

  const onPressOut = useCallback(() => {
    press.value = withSpring(1, Motion.spring.tactile);
    if (!isTapMode && isHoldRef.current) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      stopListening();
    }
  }, [isTapMode, stopListening, press]);

  const onPress = useCallback(() => {
    // Tap mode: a second tap stops. Hold mode: a quick tap while listening is
    // the safety valve that stops too.
    if (wasListeningOnPressRef.current) stopListening();
  }, [stopListening]);

  // Rings are larger than the disc but never change the layout: they sit
  // centred on it and spill over, so the tab bar keeps its height.
  const ring = size + 14;
  const ringBox = { width: ring, height: ring, borderRadius: ring / 2, top: (size - ring) / 2, left: (size - ring) / 2 };
  const iconSize = Math.round(size * 0.44);
  const label = isListening
    ? 'Stop listening'
    : isTapMode ? 'Voice search. Tap and say a song' : 'Voice search. Hold and say a song';

  return (
    <View style={[styles.wrap, { width: size, height: size }, style]} pointerEvents="box-none">
      <Animated.View pointerEvents="none" style={[styles.ring, ringBox, pulseStyle]} />
      <Animated.View pointerEvents="none" style={[styles.halo, ringBox, haloStyle]} />
      <Animated.View pointerEvents="none" style={[styles.arc, ringBox, arcStyle]} />

      <Pressable
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        onPress={onPress}
        onLongPress={onLongPress}
        delayLongPress={LONG_PRESS_MS}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ busy: isThinking, expanded: isListening }}
      >
        <Animated.View style={[styles.disc, { width: size, height: size, borderRadius: size / 2 }, discStyle]}>
          {/* Glass body: frosted on iOS (real blur is cheap there); on Android a
              translucent pane — a live blur on always-visible chrome would
              re-render with every scroll frame. */}
          <Animated.View style={[StyleSheet.absoluteFill, styles.idle, idleLayer]}>
            {Platform.OS === 'ios' ? <BlurView intensity={30} tint="light" style={StyleSheet.absoluteFill} /> : null}
          </Animated.View>
          <Animated.View style={[StyleSheet.absoluteFill, styles.live, liveLayer]} />
          <Animated.View style={[StyleSheet.absoluteFill, styles.error, errorLayer]} />
          {/* Gloss: a specular cap on top and a faint lift at the bottom edge —
              what makes a flat disc read as a glass bead. */}
          <LinearGradient
            pointerEvents="none"
            colors={['rgba(255, 255, 255, 0.42)', 'rgba(255, 255, 255, 0.08)', 'rgba(255, 255, 255, 0)', 'rgba(255, 255, 255, 0.12)']}
            locations={[0, 0.45, 0.72, 1]}
            style={StyleSheet.absoluteFill}
          />
          <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.rim, { borderRadius: size / 2 }]} />
          <Animated.View style={[styles.glyph, idleLayer]}>
            <Ionicons name="mic" size={iconSize} color={Signal.ink} />
          </Animated.View>
          <Animated.View style={[styles.glyph, styles.bars, liveLayer]}>
            {BAR_SHAPE.map((w, i) => (
              <Bar key={i} weight={w} level={audioLevel} active={isListening} size={size} />
            ))}
          </Animated.View>
        </Animated.View>
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },
  ring: {
    position: 'absolute',
    borderWidth: 1.5,
    borderColor: Signal.wave,
  },
  halo: { position: 'absolute', backgroundColor: Signal.wave },
  // A quarter arc: one bright side of a transparent ring, spun.
  arc: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: 'transparent',
    borderTopColor: Signal.wave,
    borderRightColor: 'rgba(217, 230, 106, 0.35)',
  },
  disc: {
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  idle: { backgroundColor: 'rgba(255, 255, 255, 0.16)' },
  // Slightly translucent so the gloss and rim still read as glass when lit.
  live: { backgroundColor: 'rgba(217, 230, 106, 0.92)' },
  // Lit from above: bright top edge, soft sides, almost none at the bottom.
  rim: {
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.18)',
    borderTopColor: 'rgba(255, 255, 255, 0.55)',
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
  },
  error: { backgroundColor: ERROR_RED },
  glyph: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  bars: { flexDirection: 'row', gap: 3 },
  bar: { borderRadius: 2, backgroundColor: Signal.waveInk },
});

export default VoiceMicButton;
