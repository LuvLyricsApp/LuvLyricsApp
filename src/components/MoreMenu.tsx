/**
 * The "More" menu behind the ••• tab: everything that isn't one of the three
 * everyday tabs. It grows out of the button it belongs to (transform origin at
 * the bottom-right, spring), the page dims behind it, and the rows arrive 30ms
 * apart so the eye reads them top to bottom. The pill bar stays crisp above the
 * dim, and ••• turns into × while it is open.
 *
 * Reduce Motion: the card and rows just fade.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { BackHandler, Pressable, StyleSheet, Text, View, ViewStyle } from 'react-native';
import Animated, {
  EntryAnimationsValues,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { BlurIntensity, Glass, Motion, Signal } from '../constants/allegraTheme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

export interface MoreItem {
  key: string;
  label: string;
  icon: IconName;
}

/** What lives behind •••, in the order people reach for it. */
export const MORE_ITEMS: readonly MoreItem[] = [
  { key: 'Search', label: 'Search', icon: 'search' },
  { key: 'Library', label: 'Library', icon: 'library-outline' },
  { key: 'Downloads', label: 'Downloads', icon: 'arrow-down-circle-outline' },
  { key: 'AudioDownloader', label: 'Get songs', icon: 'cloud-download-outline' },
  { key: 'Settings', label: 'Settings', icon: 'settings-outline' },
];

const STAGGER_MS = 30;

const rowIn = (index: number) => (_v: EntryAnimationsValues) => {
  'worklet';
  const delay = 40 + index * STAGGER_MS;
  return {
    initialValues: { opacity: 0, transform: [{ translateY: 10 }] },
    animations: {
      opacity: withDelay(delay, withTiming(1, { duration: Motion.duration.base, easing: Motion.ease.decelerate })),
      transform: [{ translateY: withDelay(delay, withSpring(0, Motion.spring.tactile)) }],
    },
  };
};

interface MoreMenuProps {
  open: boolean;
  activeKey: string | null;
  /** Distance from the screen bottom to the top of the pill bar. */
  anchorBottom: number;
  /** Distance from the screen's right edge to the pill's right edge. */
  anchorRight: number;
  onSelect: (key: string) => void;
  onClose: () => void;
}

export const MoreMenu: React.FC<MoreMenuProps> = ({ open, activeKey, anchorBottom, anchorRight, onSelect, onClose }) => {
  const reduce = useReducedMotion();
  const progress = useSharedValue(0);
  const [mounted, setMounted] = useState(open);
  // A close that finishes after a quick reopen must not unmount the menu.
  const openRef = useRef(open);
  openRef.current = open;
  const unmountIfClosed = useCallback(() => { if (!openRef.current) setMounted(false); }, []);

  useEffect(() => {
    if (open) {
      setMounted(true);
      progress.value = reduce
        ? withTiming(1, { duration: Motion.duration.fast })
        : withSpring(1, Motion.spring.sheet);
    } else if (mounted) {
      progress.value = withTiming(0, { duration: Motion.duration.fast, easing: Motion.ease.accelerate }, done => {
        if (done) runOnJS(unmountIfClosed)();
      });
    }
  }, [open, reduce, mounted, progress, unmountIfClosed]);

  useEffect(() => {
    if (!open) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { onClose(); return true; });
    return () => sub.remove();
  }, [open, onClose]);

  const backdropStyle = useAnimatedStyle(() => ({ opacity: Math.min(1, progress.value) }));
  const cardStyle = useAnimatedStyle((): ViewStyle => {
    const p = progress.value;
    return reduce
      ? { opacity: p }
      : {
        opacity: Math.min(1, p * 1.4),
        transform: [{ translateY: (1 - p) * 14 }, { scale: 0.72 + 0.28 * p }],
      };
  });

  if (!mounted) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents={open ? 'auto' : 'none'}>
      <Animated.View style={[StyleSheet.absoluteFill, backdropStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close menu">
          <View style={styles.dim} />
        </Pressable>
      </Animated.View>

      <Animated.View
        style={[styles.card, { bottom: anchorBottom + 10, right: anchorRight }, cardStyle]}
        accessibilityRole="menu"
      >
        <BlurView intensity={BlurIntensity.sheet} tint="dark" style={StyleSheet.absoluteFill} />
        <View style={styles.cardTint} />
        {open ? MORE_ITEMS.map((item, i) => {
          const on = item.key === activeKey;
          return (
            <Animated.View key={item.key} entering={reduce ? undefined : rowIn(i)}>
              {i > 0 ? <View style={styles.rule} /> : null}
              <Pressable
                onPress={() => {
                  Haptics.selectionAsync().catch(() => {});
                  onSelect(item.key);
                }}
                accessibilityRole="menuitem"
                accessibilityState={{ selected: on }}
                style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
              >
                <Text style={[styles.label, on && styles.labelOn]}>{item.label}</Text>
                <Ionicons name={item.icon} size={20} color={on ? Signal.wave : Signal.inkSoft} />
              </Pressable>
            </Animated.View>
          );
        }) : null}
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  dim: { flex: 1, backgroundColor: 'rgba(4, 5, 7, 0.55)' },
  card: {
    position: 'absolute',
    width: 232,
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Glass.hairlineStrong,
    paddingVertical: 4,
    // Grows out of the ••• button, which sits at the pill's right end.
    transformOrigin: 'bottom right',
  },
  cardTint: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(20, 22, 27, 0.72)' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 48,
    paddingHorizontal: 18,
  },
  rowPressed: { backgroundColor: Glass.fillPressed },
  rule: { height: StyleSheet.hairlineWidth, marginLeft: 18, backgroundColor: Glass.hairline },
  label: { fontSize: 16, fontWeight: '500', color: Signal.ink },
  labelOn: { color: Signal.wave, fontWeight: '600' },
});

export default MoreMenu;

type TabState = BottomTabBarProps['state'];
type TabNavigation = BottomTabBarProps['navigation'];

/** Which menu entry the current screen belongs to, or null on an everyday tab. */
export const activeMoreKey = (state: TabState): string | null => {
  const route = state.routes[state.index];
  if (!route) return null;
  if (route.name === 'Library') {
    const nested = route.state?.routes?.[route.state.index ?? 0]?.name;
    return nested === 'Downloads' ? 'Downloads' : 'Library';
  }
  return MORE_ITEMS.some(i => i.key === route.name) ? route.name : null;
};

/** Open/close state and navigation for the ••• button; shared by both tab bars. */
export const useMoreMenu = (state: TabState, navigation: TabNavigation) => {
  const [open, setOpen] = useState(false);
  // Any navigation (a tab tap, a deep link, back) closes the menu.
  useEffect(() => { setOpen(false); }, [state.index, state.routes]);
  const toggle = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setOpen(o => !o);
  }, []);
  const close = useCallback(() => setOpen(false), []);
  const select = useCallback((key: string) => {
    setOpen(false);
    if (key === 'Library') navigation.navigate('Library', { screen: 'PlaylistsHome' });
    else if (key === 'Downloads') navigation.navigate('Library', { screen: 'Downloads' });
    else navigation.navigate(key);
  }, [navigation]);
  return { open, toggle, close, select, activeKey: activeMoreKey(state) };
};
