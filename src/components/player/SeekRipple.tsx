/**
 * YouTube Music's double-tap answer on the cover: the tapped half lights up
 * behind a curved edge with the arrows and how far it went ("10 seconds" when
 * the taps keep coming), then fades. Opacity and transform only.
 */
import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withSequence, withTiming } from 'react-native-reanimated';
import { Motion } from '../../constants/allegraTheme';

export interface SeekPulse {
  side: -1 | 1;
  /** Seconds moved in this run of taps. */
  seconds: number;
  /** Bumped on every double-tap, so the same side and total still replay. */
  n: number;
}

const HOLD_MS = 650;

const Half: React.FC<{ side: -1 | 1; pulse: SeekPulse | null; width: number; height: number }> = ({ side, pulse, width, height }) => {
  const shown = useSharedValue(0);
  const nudge = useSharedValue(0);
  const mine = pulse && pulse.side === side ? pulse : null;
  useEffect(() => {
    if (!mine) {
      shown.value = withTiming(0, { duration: Motion.duration.fast });
      return;
    }
    shown.value = withSequence(
      withTiming(1, { duration: Motion.duration.instant }),
      withDelay(HOLD_MS, withTiming(0, { duration: Motion.duration.slow, easing: Motion.ease.standard })),
    );
    nudge.value = withSequence(withTiming(side * 6, { duration: 90 }), withTiming(0, { duration: 180, easing: Motion.ease.decelerate }));
  }, [mine, side, shown, nudge]);
  const wash = useAnimatedStyle(() => ({ opacity: shown.value }));
  const mark = useAnimatedStyle(() => ({ opacity: shown.value, transform: [{ translateX: nudge.value }] }));
  // A circle much taller than the stage, so only its curved inner edge shows.
  const d = height * 1.6;
  const half = width / 2;
  return (
    <View style={[styles.half, side < 0 ? { left: 0 } : { right: 0 }, { width: half, height }]} pointerEvents="none">
      <Animated.View
        style={[
          styles.wash,
          { width: d, height: d, borderRadius: d / 2, top: (height - d) / 2 },
          side < 0 ? { right: half * 0.12 } : { left: half * 0.12 },
          wash,
        ]}
      />
      <Animated.View style={[styles.mark, mark]}>
        <Ionicons name={side < 0 ? 'play-back' : 'play-forward'} size={26} color="#fff" />
        <Text style={styles.label}>{mine ? `${mine.seconds} seconds` : ''}</Text>
      </Animated.View>
    </View>
  );
};

const SeekRipple: React.FC<{ pulse: SeekPulse | null; width: number; height: number }> = ({ pulse, width, height }) => (
  <View style={[styles.layer, { height }]} pointerEvents="none">
    <Half side={-1} pulse={pulse} width={width} height={height} />
    <Half side={1} pulse={pulse} width={width} height={height} />
  </View>
);

const styles = StyleSheet.create({
  layer: { position: 'absolute', top: 0, left: 0, right: 0 },
  half: { position: 'absolute', top: 0, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  wash: { position: 'absolute', backgroundColor: 'rgba(255,255,255,0.14)' },
  mark: { alignItems: 'center', gap: 6 },
  label: { color: '#fff', fontSize: 14, fontWeight: '600' },
});

export default React.memo(SeekRipple);
