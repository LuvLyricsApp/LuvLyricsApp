/**
 * Apple Music's slider, shared by the song scrubber and the volume bar.
 *
 * A thick rounded track with a soft white fill. Under the finger it swells
 * and brightens; tap anywhere to jump. The fill moves by transform and the
 * swell is scaleY, so dragging never re-runs layout.
 *
 * `progress` (0..1) is the outside value. While dragging — and until
 * `onCommit` resolves — the slider shows the finger's value instead, so a
 * seek never flashes back to the old position.
 */
import React, { useCallback } from 'react';
import { LayoutChangeEvent, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  DerivedValue,
  interpolate,
  runOnJS,
  SharedValue,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { Motion } from '../../constants/allegraTheme';

interface AppleSliderProps {
  progress: SharedValue<number> | DerivedValue<number>;
  onCommit: (value: number) => void | Promise<void>;
  /** Live value while dragging (volume follows the finger). */
  onChange?: (value: number) => void;
  height?: number;
  accessibilityLabel: string;
  style?: StyleProp<ViewStyle>;
  /** Rendered under the track with the value being shown (time labels). */
  renderBelow?: (display: DerivedValue<number>, active: DerivedValue<number>) => React.ReactNode;
}

const clamp01 = (v: number) => {
  'worklet';
  return Math.max(0, Math.min(1, v));
};

const AppleSlider: React.FC<AppleSliderProps> = ({
  progress, onCommit, onChange, height = 7, accessibilityLabel, style, renderBelow,
}) => {
  const width = useSharedValue(0);
  const dragging = useSharedValue(false);
  const settling = useSharedValue(false);
  const dragValue = useSharedValue(0);
  const grow = useSharedValue(0);

  const display = useDerivedValue(() => (dragging.value || settling.value ? dragValue.value : clamp01(progress.value)));
  const active = useDerivedValue(() => grow.value);

  const commit = useCallback(async (value: number) => {
    try {
      await onCommit(value);
    } finally {
      settling.value = false;
    }
  }, [onCommit, settling]);

  const at = (x: number) => {
    'worklet';
    return width.value > 0 ? clamp01(x / width.value) : 0;
  };

  const pan = Gesture.Pan()
    .activeOffsetX([-4, 4])
    .failOffsetY([-14, 14])
    .onStart(e => {
      dragValue.value = at(e.x);
      dragging.value = true;
      grow.value = withSpring(1, Motion.spring.tactile);
    })
    .onUpdate(e => {
      dragValue.value = at(e.x);
      if (onChange) runOnJS(onChange)(dragValue.value);
    })
    .onEnd(() => {
      settling.value = true;
      runOnJS(commit)(dragValue.value);
    })
    .onFinalize(() => {
      dragging.value = false;
      grow.value = withSpring(0, Motion.spring.tactile);
    });

  const tap = Gesture.Tap().onEnd(e => {
    dragValue.value = at(e.x);
    settling.value = true;
    if (onChange) runOnJS(onChange)(dragValue.value);
    runOnJS(commit)(dragValue.value);
  });

  const onLayout = (e: LayoutChangeEvent) => {
    width.value = e.nativeEvent.layout.width;
  };

  const trackStyle = useAnimatedStyle(() => ({
    transform: [{ scaleY: interpolate(grow.value, [0, 1], [1, 1.6]) }],
  }));
  const fillStyle = useAnimatedStyle(() => ({
    opacity: width.value > 0 ? interpolate(grow.value, [0, 1], [0.78, 1]) : 0,
    transform: [{ translateX: (display.value - 1) * width.value }],
  }));

  return (
    <View style={style}>
      <GestureDetector gesture={Gesture.Race(pan, tap)}>
        <View
          style={styles.hit}
          onLayout={onLayout}
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel={accessibilityLabel}
        >
          <Animated.View style={[styles.track, { height, borderRadius: height / 2 }, trackStyle]}>
            <Animated.View style={[styles.fill, fillStyle]} />
          </Animated.View>
        </View>
      </GestureDetector>
      {renderBelow ? renderBelow(display, active) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  hit: { height: 28, justifyContent: 'center' },
  track: { width: '100%', overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.22)' },
  fill: { width: '100%', height: '100%', backgroundColor: '#ffffff' },
});

export default AppleSlider;
