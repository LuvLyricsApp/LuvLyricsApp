import React, { memo } from 'react';
import { StyleSheet, Pressable } from 'react-native';
import Animated, {
  useAnimatedStyle,
  withTiming,
  withSpring,
  Easing,
  SharedValue,
} from 'react-native-reanimated';
import { useThemeColors } from '../contexts/ThemeContext';
import { useSettingsStore, FONT_SIZE_MAP, LINE_SPACING_MAP } from '../store/settingsStore';

interface LyricsLineProps {
  text: string;
  activeIndexSV: SharedValue<number>;
  index: number;
  onPress?: () => void;
}

export const LyricsLine: React.FC<LyricsLineProps> = memo(({
  text,
  activeIndexSV,
  index,
  onPress,
}) => {
  const colors = useThemeColors();
  const lyricsFontSize = useSettingsStore(state => state.lyricsFontSize);
  const lineSpacing = useSettingsStore(state => state.lineSpacing);
  const fontSizes = FONT_SIZE_MAP[lyricsFontSize];
  const lh = LINE_SPACING_MAP[lineSpacing];

  // Use active font size for all lines — scale transform handles the inactive shrink.
  // fontSize/lineHeight must NOT live in useAnimatedStyle: they trigger a layout
  // recalculation on every line change, which stalls the UI thread.
  const fontSize = fontSizes.current;
  const lineHeight = fontSize * lh;

  // Capture color strings as primitives so worklet can use them
  const colorCurrent = colors.lyricCurrent;
  const colorPrevious = colors.lyricPrevious;
  const colorUpcoming = colors.lyricUpcoming;

  const animatedStyle = useAnimatedStyle(() => {
    const isActive = activeIndexSV.value === index;
    const isPrevious = activeIndexSV.value > index;
    const dist = Math.abs(activeIndexSV.value - index);
    const targetOpacity = isActive
      ? 1
      : isPrevious
        ? 0.4
        : Math.max(0.5 - dist * 0.05, 0.2);

    // translateY: inactive lines sit 6px below, active line springs up to natural position.
    return {
      transform: [{ translateY: withSpring(isActive ? 0 : 6, { damping: 20, stiffness: 260, mass: 0.7 }) }],
      opacity: withTiming(targetOpacity, { duration: 180, easing: Easing.out(Easing.quad) }),
      color: isActive ? colorCurrent : isPrevious ? colorPrevious : colorUpcoming,
    };
  });

  return (
    <Pressable style={styles.container} onPress={onPress}>
      <Animated.Text style={[
        styles.text,
        { fontSize, lineHeight, fontWeight: '800' },
        animatedStyle,
      ]}>
        {text}
      </Animated.Text>
    </Pressable>
  );
});

LyricsLine.displayName = 'LyricsLine';

const styles = StyleSheet.create({
  container: {
    paddingVertical: 12,
    paddingHorizontal: 8,
  },
  text: {
    textAlign: 'left',
    letterSpacing: -0.5,
  },
});

export default LyricsLine;
