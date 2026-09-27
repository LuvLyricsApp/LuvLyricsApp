import React, { memo, useMemo } from 'react';
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
import InstrumentalWaveform, { isInstrumentalLyric, useIsActiveLine } from './InstrumentalWaveform';
import { Fonts } from '../constants/fonts';

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
  const isInstrumental = useMemo(() => isInstrumentalLyric(text), [text]);
  const isActiveLine = useIsActiveLine(activeIndexSV, index);

  // Apple Music style: bold active line, regular the rest.
  // One-time JS swap per line activation (useIsActiveLine re-renders) —
  // not per-frame, so layout cost is fine.
  const fontFamily = isActiveLine ? Fonts.lyricsActive : Fonts.lyrics;
  const fontWeight = isActiveLine ? Fonts.lyricsActiveWeight : Fonts.lyricsWeight;

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

  const instrumentStyle = useAnimatedStyle(() => {
    const isActive = activeIndexSV.value === index;
    return {
      transform: [{ translateY: withSpring(isActive ? 0 : 6, { damping: 20, stiffness: 260, mass: 0.7 }) }],
      opacity: withTiming(isActive ? 1 : 0.35, { duration: 180 }),
    };
  });

  return (
    <Pressable style={styles.container} onPress={onPress}>
      {isInstrumental ? (
        <Animated.View style={[styles.instrumental, instrumentStyle]}>
          <InstrumentalWaveform active={isActiveLine} size={isActiveLine ? 'lg' : 'md'} />
        </Animated.View>
      ) : (
        <Animated.Text style={[
          styles.text,
          { fontFamily, fontWeight, fontSize, lineHeight },
          animatedStyle,
        ]}>
          {text}
        </Animated.Text>
      )}
    </Pressable>
  );
});

LyricsLine.displayName = 'LyricsLine';

const styles = StyleSheet.create({
  container: {
    paddingVertical: 12,
    paddingHorizontal: 8,
    alignItems: 'center',
  },
  instrumental: {
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  text: {
    textAlign: 'left',
  },
});

export default LyricsLine;
