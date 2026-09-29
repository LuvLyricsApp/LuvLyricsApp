/**
 * A cover's corner mark for a catalog song that is on the phone (a tick) or on
 * its way there (a small filling ring), so a saved song is recognisable in any
 * shelf, not only in rows with a download button. Nothing shows otherwise.
 */
import React, { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle } from 'react-native-svg';
import Animated, { Easing, FadeOut, useAnimatedProps, useSharedValue, withTiming, ZoomIn } from 'react-native-reanimated';
import { Motion, Signal } from '../../constants/allegraTheme';
import { useDownloadState, DownloadTarget } from '../../hooks/useDownloadState';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export const SavedBadge: React.FC<{ song: DownloadTarget; small?: boolean }> = ({ song, small = false }) => {
  const { phase, progress } = useDownloadState(song);
  const size = small ? 16 : 22;
  const stroke = 2;
  const r = (size - stroke) / 2 - 1.5;
  const c = 2 * Math.PI * r;

  const fill = useSharedValue(progress);
  useEffect(() => {
    fill.value = withTiming(progress, { duration: 260, easing: Easing.out(Easing.quad) });
  }, [progress, fill]);
  const ringProps = useAnimatedProps(() => ({ strokeDashoffset: c * (1 - Math.max(0.06, fill.value)) }));

  // Only a change seen here animates; a cover scrolling into view just shows it.
  const live = useRef(false);
  useEffect(() => { live.current = true; }, []);

  const busy = phase === 'queued' || phase === 'downloading' || phase === 'paused';
  if (phase !== 'saved' && !busy) return null;
  return (
    <Animated.View
      key={busy ? 'busy' : 'saved'}
      entering={live.current ? ZoomIn.duration(Motion.duration.fast) : undefined}
      exiting={FadeOut.duration(Motion.duration.instant)}
      pointerEvents="none"
      style={[styles.badge, small ? styles.small : styles.large, { width: size, height: size, borderRadius: size / 2 }]}
    >
      {busy ? (
        <Svg width={size} height={size} style={styles.ring}>
          <Circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(244,241,234,0.25)" strokeWidth={stroke} fill="none" />
          <AnimatedCircle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={Signal.wave}
            strokeWidth={stroke}
            strokeLinecap="round"
            fill="none"
            strokeDasharray={c}
            animatedProps={ringProps}
          />
        </Svg>
      ) : (
        <View style={styles.center}>
          <Ionicons name="checkmark" size={small ? 11 : 14} color={Signal.waveInk} />
        </View>
      )}
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  badge: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(10, 11, 14, 0.72)',
  },
  small: { right: 3, bottom: 3 },
  large: { right: 6, bottom: 6 },
  center: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
    backgroundColor: Signal.wave,
  },
  ring: { transform: [{ rotate: '-90deg' }] },
});

export default SavedBadge;
