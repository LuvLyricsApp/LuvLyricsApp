import React, { useEffect, useCallback, useRef } from 'react';
import { Pressable, StyleSheet, View, Platform } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  interpolate,
  Easing,
  cancelAnimation,
} from 'react-native-reanimated';
import { useVoiceCommands } from '../hooks/useVoiceCommands';
import { useThemeColors, useIsDark } from '../contexts/ThemeContext';
import { Ionicons } from '@expo/vector-icons';

const BUTTON_SIZE = 56;
const PRIMARY = '#2F8CFF';
const PULSE_SIZE = BUTTON_SIZE + 28;

interface Props {
  style?: object;
  variant?: 'floating' | 'inline';
}

const INLINE_SIZE = 40;
const INLINE_PRIMARY = '#2F8CFF';

const HOLD_THRESHOLD = 300; // ms — under this = tap, over = hold-to-talk

export const VoiceMicButton: React.FC<Props> = ({ style, variant = 'floating' }) => {
  const isInline = variant === 'inline';
  const { isListening, audioLevel, startListening, stopListening, cancelListening } = useVoiceCommands();
  const isDark = useIsDark();
  const colors = useThemeColors();

  const pressStartRef = useRef<number>(0);
  const wasListeningOnPressRef = useRef<boolean>(false);

  // Pulse ring animation
  const pulseScale = useSharedValue(1);
  const pulseOpacity = useSharedValue(0);

  // Button scale on press
  const pressScale = useSharedValue(1);

  // Audio level bars (4 bars)
  const bar1 = useSharedValue(0.3);
  const bar2 = useSharedValue(0.3);
  const bar3 = useSharedValue(0.3);
  const bar4 = useSharedValue(0.3);

  useEffect(() => {
    if (isListening) {
      // Pulsing ring
      pulseScale.value = withRepeat(
        withSequence(
          withTiming(1.6, { duration: 800, easing: Easing.out(Easing.ease) }),
          withTiming(1, { duration: 0 })
        ),
        -1,
        false
      );
      pulseOpacity.value = withRepeat(
        withSequence(
          withTiming(0.5, { duration: 100 }),
          withTiming(0, { duration: 700, easing: Easing.out(Easing.ease) })
        ),
        -1,
        false
      );
      pressScale.value = withTiming(0.94, { duration: 100 });
    } else {
      cancelAnimation(pulseScale);
      cancelAnimation(pulseOpacity);
      pulseScale.value = withTiming(1, { duration: 200 });
      pulseOpacity.value = withTiming(0, { duration: 200 });
      pressScale.value = withTiming(1, { duration: 150 });

      // Reset bars
      [bar1, bar2, bar3, bar4].forEach(b => {
        b.value = withTiming(0.3, { duration: 200 });
      });
    }
  }, [isListening]);

  // Drive audio level bars from mic input
  useEffect(() => {
    if (!isListening) return;
    const lvl = audioLevel;
    bar1.value = withTiming(0.3 + lvl * 0.5, { duration: 80 });
    bar2.value = withTiming(0.3 + lvl * 0.9, { duration: 80 });
    bar3.value = withTiming(0.3 + lvl * 0.7, { duration: 80 });
    bar4.value = withTiming(0.3 + lvl * 0.4, { duration: 80 });
  }, [audioLevel, isListening]);

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
    opacity: pulseOpacity.value,
  }));

  const buttonStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pressScale.value }],
  }));

  const barStyle1 = useAnimatedStyle(() => ({
    height: interpolate(bar1.value, [0, 1], [4, 20]),
  }));
  const barStyle2 = useAnimatedStyle(() => ({
    height: interpolate(bar2.value, [0, 1], [4, 20]),
  }));
  const barStyle3 = useAnimatedStyle(() => ({
    height: interpolate(bar3.value, [0, 1], [4, 20]),
  }));
  const barStyle4 = useAnimatedStyle(() => ({
    height: interpolate(bar4.value, [0, 1], [4, 20]),
  }));

  // Hybrid: quick tap = toggle on/off, long press = hold-to-talk
  const onPressIn = useCallback(() => {
    pressStartRef.current = Date.now();
    wasListeningOnPressRef.current = isListening;
    if (!isListening) startListening();
  }, [isListening, startListening]);

  const onPressOut = useCallback(() => {
    const held = Date.now() - pressStartRef.current;
    if (held >= HOLD_THRESHOLD) stopListening();
  }, [stopListening]);

  const onPress = useCallback(() => {
    const held = Date.now() - pressStartRef.current;
    if (held < HOLD_THRESHOLD && wasListeningOnPressRef.current) stopListening();
  }, [stopListening]);

  const bgColor = isListening ? PRIMARY : (isDark ? '#1A1A2E' : '#FFFFFF');
  const iconColor = isListening ? '#FFFFFF' : (isDark ? 'rgba(255,255,255,0.75)' : colors.textMuted);
  const borderColor = isListening ? PRIMARY : (isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.10)');

  if (isInline) {
    // Neo-brutalism: high-contrast black & white only
    const brutalBg = isListening ? '#000000' : '#FFFFFF';
    const brutalBorder = isListening ? '#FFFFFF' : '#000000';
    const brutalIcon = isListening ? '#FFFFFF' : '#000000';

    return (
      <Pressable
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        onPress={onPress}
        style={style}
      >
        <View style={[styles.inlineButton, { backgroundColor: brutalBg, borderColor: brutalBorder }]}>
          {isListening ? (
            <View style={styles.inlineBarsContainer}>
              <Animated.View style={[styles.inlineBar, barStyle1, { backgroundColor: '#fff' }]} />
              <Animated.View style={[styles.inlineBar, barStyle2, { backgroundColor: '#fff' }]} />
              <Animated.View style={[styles.inlineBar, barStyle3, { backgroundColor: '#fff' }]} />
              <Animated.View style={[styles.inlineBar, barStyle4, { backgroundColor: '#fff' }]} />
            </View>
          ) : (
            <Ionicons name="mic" size={18} color={brutalIcon} />
          )}
        </View>
      </Pressable>
    );
  }

  return (
    <View style={[styles.wrapper, style]} pointerEvents="box-none">
      {/* Pulse ring — sits behind button */}
      <Animated.View
        style={[
          styles.pulse,
          { borderColor: PRIMARY },
          pulseStyle,
        ]}
        pointerEvents="none"
      />

      <Pressable
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        onPress={onPress}
        android_ripple={null}
      >
        <Animated.View
          style={[
            styles.button,
            {
              backgroundColor: bgColor,
              borderColor,
              shadowColor: isListening ? PRIMARY : '#000',
            },
            buttonStyle,
          ]}
        >
          {isListening ? (
            <View style={styles.barsContainer}>
              <Animated.View style={[styles.bar, barStyle1, { backgroundColor: '#fff' }]} />
              <Animated.View style={[styles.bar, barStyle2, { backgroundColor: '#fff' }]} />
              <Animated.View style={[styles.bar, barStyle3, { backgroundColor: '#fff' }]} />
              <Animated.View style={[styles.bar, barStyle4, { backgroundColor: '#fff' }]} />
            </View>
          ) : (
            <Ionicons name="mic" size={22} color={iconColor} />
          )}
        </Animated.View>
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    width: BUTTON_SIZE + 16,
    height: BUTTON_SIZE + 16,
  },
  pulse: {
    position: 'absolute',
    width: PULSE_SIZE,
    height: PULSE_SIZE,
    borderRadius: PULSE_SIZE / 2,
    borderWidth: 2,
  },
  button: {
    width: BUTTON_SIZE,
    height: BUTTON_SIZE,
    borderRadius: BUTTON_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 12,
  },
  barsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    height: 22,
  },
  bar: {
    width: 3,
    borderRadius: 2,
  },
  inlineButton: {
    width: INLINE_SIZE,
    height: INLINE_SIZE,
    borderRadius: INLINE_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2.5,
  },
  inlineBarsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    height: 16,
  },
  inlineBar: {
    width: 2.5,
    borderRadius: 1.5,
  },
});

export default VoiceMicButton;
