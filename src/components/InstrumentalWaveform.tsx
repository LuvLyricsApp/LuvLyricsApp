import React, { useEffect, useState } from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedReaction,
  runOnJS,
  withRepeat,
  withTiming,
  withDelay,
  withSequence,
  Easing,
  cancelAnimation,
  SharedValue,
} from 'react-native-reanimated';

interface InstrumentalWaveformProps {
  active: boolean;
  /** Compact for inactive rows; larger when the line is current. */
  size?: 'sm' | 'md' | 'lg';
  style?: ViewStyle;
}

const EASE = Easing.inOut(Easing.sin);

type BarSpec = { min: number; max: number; duration: number; delay: number };

const SPECS: BarSpec[] = [
  { min: 8, max: 22, duration: 420, delay: 0 },
  { min: 12, max: 34, duration: 360, delay: 80 },
  { min: 16, max: 42, duration: 300, delay: 40 },
  { min: 12, max: 34, duration: 380, delay: 120 },
  { min: 8, max: 22, duration: 440, delay: 60 },
];

function Bar({
  active,
  min,
  max,
  duration,
  delay,
  scale,
}: BarSpec & { active: boolean; scale: number }) {
  const h = useSharedValue(min * scale);

  useEffect(() => {
    cancelAnimation(h);
    if (active) {
      h.value = min * scale;
      h.value = withDelay(
        delay,
        withRepeat(
          withSequence(
            withTiming(max * scale, { duration, easing: EASE }),
            withTiming(min * scale, { duration, easing: EASE }),
          ),
          -1,
          false,
        ),
      );
    } else {
      h.value = withTiming(Math.max(4, min * scale * 0.45), {
        duration: 280,
        easing: Easing.out(Easing.quad),
      });
    }
  }, [active, min, max, duration, delay, scale, h]);

  const style = useAnimatedStyle(() => ({
    height: h.value,
    opacity: active ? 1 : 0.35,
  }));

  return <Animated.View style={[styles.bar, active && styles.activeBar, style]} />;
}

/**
 * Equalizer bars shown in place of "[INSTRUMENTAL]" lyric lines.
 * Active = dancing; inactive = quiet resting bars.
 */
const InstrumentalWaveform: React.FC<InstrumentalWaveformProps> = ({
  active,
  size = 'md',
  style,
}) => {
  const scale = size === 'lg' ? 1.15 : size === 'sm' ? 0.75 : 1;
  const rowH = size === 'lg' ? 52 : size === 'sm' ? 32 : 44;

  return (
    <View style={[styles.container, { height: rowH }, style]} accessibilityLabel="Instrumental">
      {SPECS.map((spec, i) => (
        <Bar key={i} active={active} scale={scale} {...spec} />
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    minWidth: 72,
    paddingVertical: 4,
  },
  bar: {
    width: 4,
    backgroundColor: 'rgba(255,255,255,0.28)',
    borderRadius: 3,
  },
  activeBar: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#FFFFFF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.55,
    shadowRadius: 6,
  },
});

export default InstrumentalWaveform;

/**
 * Bridge a Reanimated active-index to React state — the waveform needs a real
 * boolean, not a shared value. Shared by every lyric renderer.
 */
export function useIsActiveLine(activeIndexSV: SharedValue<number>, index: number): boolean {
  const [isActive, setIsActive] = useState(false);
  useAnimatedReaction(
    () => activeIndexSV.value === index,
    (next, prev) => {
      if (next !== prev) runOnJS(setIsActive)(next);
    },
    [index],
  );
  return isActive;
}

/** Detect instrumental / music-break markers so UI can swap text for the EQ. */
export function isInstrumentalLyric(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  // [INSTRUMENTAL], [Instrumental Break], Instrumental, ♪ Instrumental ♪, etc.
  const stripped = t
    .replace(/^[\s[(【♪🎵🎤]+/, '')
    .replace(/[\s\])】♪🎵🎤]+$/, '')
    .trim();
  return /^(instrumental)(\s+(break|interlude|solo|outro|intro|section))?$/i.test(stripped);
}
