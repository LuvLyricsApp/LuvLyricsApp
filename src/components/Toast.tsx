import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Animated, StyleSheet, Text, View, Pressable, Easing } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSettingsStore } from '../store/settingsStore';
import { Frosted } from './allegra/Frosted';
import { Signal } from '../constants/allegraTheme';

interface ToastProps {
  visible: boolean;
  message: string;
  type?: 'success' | 'error' | 'info';
  onDismiss: () => void;
  /** Auto-hide delay in ms. Default 4000. */
  duration?: number;
}

const ENTER_MS = 280;
const EXIT_MS = 240;
const DEFAULT_DURATION = 4000;
const SLIDE = 16; // short, calm slide — no spring bounce

/**
 * Single professional toast: one fade+slide in, hold ~4s, fade out.
 * Replaces glitchy multi-bounce springs and re-entrant effect loops.
 */
export const Toast: React.FC<ToastProps> = ({
  visible,
  message,
  type = 'success',
  onDismiss,
  duration = DEFAULT_DURATION,
}) => {
  const insets = useSafeAreaInsets();
  const isIsland = useSettingsStore(state => state.miniPlayerStyle === 'island');

  // Stay mounted through the exit animation (parent often flips visible=false).
  const [mounted, setMounted] = useState(false);
  const [displayMessage, setDisplayMessage] = useState(message);
  const [displayType, setDisplayType] = useState(type);

  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(isIsland ? SLIDE : -SLIDE)).current;
  const progress = useRef(new Animated.Value(1)).current;

  const animRef = useRef<Animated.CompositeAnimation | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dismissingRef = useRef(false);
  // Generation token — ignore stale timers / animation callbacks.
  const genRef = useRef(0);
  // Lock entry direction for this show cycle so mid-toast style flips don't re-animate.
  const fromBottomRef = useRef(isIsland);
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  const clearAnims = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (animRef.current) {
      animRef.current.stop();
      animRef.current = null;
    }
  }, []);

  const runExit = useCallback((gen: number) => {
    if (dismissingRef.current && gen === genRef.current) return;
    dismissingRef.current = true;
    clearAnims();

    const exitY = fromBottomRef.current ? SLIDE : -SLIDE;
    const anim = Animated.parallel([
      Animated.timing(opacity, {
        toValue: 0,
        duration: EXIT_MS,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: exitY,
        duration: EXIT_MS,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]);
    animRef.current = anim;
    anim.start(({ finished }) => {
      if (gen !== genRef.current) return;
      setMounted(false);
      dismissingRef.current = false;
      if (finished) onDismissRef.current();
    });
  }, [clearAnims, opacity, translateY]);

  const runEnter = useCallback(
    (nextMessage: string, nextType: ToastProps['type'], gen: number, holdMs: number) => {
      clearAnims();
      dismissingRef.current = false;
      fromBottomRef.current = isIsland;
      setDisplayMessage(nextMessage);
      setDisplayType(nextType ?? 'success');
      setMounted(true);

      const enterY = fromBottomRef.current ? SLIDE : -SLIDE;
      opacity.setValue(0);
      translateY.setValue(enterY);
      progress.setValue(1);

      const anim = Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: ENTER_MS,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: 0,
          duration: ENTER_MS,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(progress, {
          toValue: 0,
          duration: holdMs,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
      ]);
      animRef.current = anim;
      anim.start();

      timerRef.current = setTimeout(() => {
        if (gen !== genRef.current) return;
        runExit(gen);
      }, holdMs);
    },
    [clearAnims, isIsland, opacity, progress, runExit, translateY]
  );

  useEffect(() => {
    if (visible) {
      genRef.current += 1;
      const gen = genRef.current;
      runEnter(message, type, gen, duration);
      return () => {
        // StrictMode / unmount: stop timers so nothing double-fires.
        if (gen === genRef.current) clearAnims();
      };
    }

    if (mounted && !dismissingRef.current) {
      genRef.current += 1;
      runExit(genRef.current);
    }
    return undefined;
    // Only react to show/hide, message replacement, and hold length.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, message, duration]);

  useEffect(() => () => clearAnims(), [clearAnims]);

  if (!mounted) return null;

  const isError = displayType === 'error';
  const isInfo = displayType === 'info';
  const accent = isError ? Signal.accent : isInfo ? Signal.vibeBlue : Signal.wave;
  const iconName =
    displayType === 'success'
      ? 'checkmark-circle'
      : displayType === 'error'
        ? 'alert-circle'
        : 'information-circle';

  const positionStyle = fromBottomRef.current
    ? { bottom: insets.bottom + 88, left: 20, right: 20 }
    : { top: insets.top + 12, left: 20, right: 20 };

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[
        styles.wrap,
        positionStyle,
        { opacity, transform: [{ translateY }] },
      ]}
    >
      <Pressable
        onPress={() => {
          genRef.current += 1;
          runExit(genRef.current);
        }}
        style={styles.card}
        accessibilityRole="alert"
        accessibilityLiveRegion="polite"
      >
        <Frosted radius={22} intensity={55} tint={0.5} />
        <View style={styles.row}>
          <View style={[styles.iconDot, { backgroundColor: `${accent}22` }]}>
            <Ionicons name={iconName} size={18} color={accent} />
          </View>
          <Text style={styles.text} numberOfLines={3}>
            {displayMessage}
          </Text>
        </View>
        <View style={styles.progressTrack}>
          <Animated.View
            style={[
              styles.progressFill,
              {
                backgroundColor: accent,
                // scaleX on the native driver: the countdown keeps moving even
                // while JS is busy, and never re-runs layout.
                transform: [{ scaleX: progress }],
              },
            ]}
          />
        </View>
      </Pressable>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    zIndex: 9999,
    alignItems: 'center',
  },
  // Allegra's floating glass: a frosted capsule, lit edge, no drop shadow.
  card: {
    maxWidth: 420,
    borderRadius: 22,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingLeft: 10,
    paddingRight: 16,
    paddingVertical: 10,
  },
  iconDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    flexShrink: 1,
    color: Signal.ink,
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 19,
  },
  progressTrack: {
    height: 2,
    marginHorizontal: 16,
    marginBottom: 1,
    borderRadius: 1,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  progressFill: {
    width: '100%',
    height: '100%',
    transformOrigin: 'left',
  },
});
