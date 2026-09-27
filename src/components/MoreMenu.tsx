/**
 * The "More" menu behind the ••• tab: everything that isn't one of the three
 * everyday tabs. Laid out like iOS's medium-size context menus — three big
 * tiles for the places people jump to most, then rows with a one-line hint.
 *
 * Real frosted glass (see allegra/Frosted — blur on Android too), tinted by the
 * playing cover. It grows out of the button it belongs to (transform origin at
 * the bottom-right, spring), the page blurs and dims behind it, and tiles then
 * rows arrive 30ms apart. The pill bar stays crisp above the dim, and ••• turns
 * into × while it is open.
 *
 * Reduce Motion: the card and rows just fade.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { BackHandler, Pressable, StyleSheet, Text, View, ViewStyle } from 'react-native';
import Animated, {
  EntryAnimationsValues,
  LayoutAnimation,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { create } from 'zustand';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from '../utils/haptics';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Glass, Motion, Signal } from '../constants/allegraTheme';
import { usePlayerStore } from '../store/playerStore';
import Frosted from './allegra/Frosted';
import { Tactile } from './allegra/motion';
import { useArtworkPalette } from './allegra/useArtworkPalette';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

export interface MoreItem {
  key: string;
  label: string;
  icon: IconName;
  /** Rows carry a one-line hint; tiles don't. */
  hint?: string;
}

/** The three places people jump to most — big tiles across the top. */
export const MORE_TILES: readonly MoreItem[] = [
  { key: 'Search', label: 'Search', icon: 'search' },
  { key: 'Playlists', label: 'Playlists', icon: 'albums-outline' },
  { key: 'AudioDownloader', label: 'Get songs', icon: 'cloud-download-outline' },
];

/** Less frequent destinations, listed below the tiles. */
export const MORE_ROWS: readonly MoreItem[] = [
  { key: 'Settings', label: 'Settings', icon: 'settings-outline', hint: 'Playback, lyrics, look' },
];

/** Everything behind •••, in the order people reach for it. */
export const MORE_ITEMS: readonly MoreItem[] = [...MORE_TILES, ...MORE_ROWS];

const STAGGER_MS = 30;
const RADIUS = 26;

const riseIn = (index: number) => (_v: EntryAnimationsValues): LayoutAnimation => {
  'worklet';
  const delay = 50 + index * STAGGER_MS;
  return {
    initialValues: { opacity: 0, transform: [{ translateY: 10 }, { scale: 0.94 }] },
    animations: {
      opacity: withDelay(delay, withTiming(1, { duration: Motion.duration.base, easing: Motion.ease.decelerate })),
      transform: [
        { translateY: withDelay(delay, withSpring(0, Motion.spring.tactile)) },
        { scale: withDelay(delay, withSpring(1, Motion.spring.tactile)) },
      ],
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
  // The glass picks up the playing cover's colours.
  const cover = usePlayerStore(s => s.currentSong?.coverImageUri);
  const palette = useArtworkPalette(cover);

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
        transform: [{ translateY: (1 - p) * 16 }, { scale: 0.7 + 0.3 * p }],
      };
  });

  if (!mounted) return null;

  const choose = (key: string) => {
    Haptics.selectionAsync().catch(() => {});
    onSelect(key);
  };

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents={open ? 'auto' : 'none'}>
      <Animated.View style={[StyleSheet.absoluteFill, backdropStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close menu">
          <Frosted radius={0} intensity={22} tint={0.18} edge={false} />
          {/* Deepest where the menu is, so it lifts off the page. */}
          <LinearGradient
            colors={['rgba(4, 5, 7, 0.1)', 'rgba(4, 5, 7, 0.35)', 'rgba(4, 5, 7, 0.62)']}
            locations={[0, 0.5, 1]}
            style={StyleSheet.absoluteFill}
          />
        </Pressable>
      </Animated.View>

      <Animated.View
        style={[styles.card, { bottom: anchorBottom + 12, right: anchorRight }, cardStyle]}
        accessibilityRole="menu"
      >
        <Frosted radius={RADIUS} palette={palette} />
        {open ? (
          <>
            <View style={styles.tiles}>
              {MORE_TILES.map((item, i) => {
                const on = item.key === activeKey;
                return (
                  <Animated.View key={item.key} entering={reduce ? undefined : riseIn(i)} style={styles.tileCell}>
                    <Tactile
                      onPress={() => choose(item.key)}
                      pressScale={0.93}
                      accessibilityRole="menuitem"
                      accessibilityState={{ selected: on }}
                      accessibilityLabel={item.label}
                      style={[styles.tile, on && styles.tileOn]}
                    >
                      <Ionicons name={item.icon} size={24} color={on ? Signal.wave : Signal.ink} />
                      <Text style={[styles.tileLabel, on && styles.labelOn]} numberOfLines={1}>{item.label}</Text>
                    </Tactile>
                  </Animated.View>
                );
              })}
            </View>

            <View style={styles.rows}>
              {MORE_ROWS.map((item, i) => {
                const on = item.key === activeKey;
                return (
                  <Animated.View key={item.key} entering={reduce ? undefined : riseIn(MORE_TILES.length + i)}>
                    {i > 0 ? <View style={styles.rule} /> : null}
                    <Pressable
                      onPress={() => choose(item.key)}
                      accessibilityRole="menuitem"
                      accessibilityState={{ selected: on }}
                      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
                    >
                      <Ionicons name={item.icon} size={22} color={on ? Signal.wave : Signal.inkSoft} />
                      <View style={styles.rowText}>
                        <Text style={[styles.rowLabel, on && styles.labelOn]}>{item.label}</Text>
                        {item.hint ? <Text style={styles.rowHint} numberOfLines={1}>{item.hint}</Text> : null}
                      </View>
                      <Ionicons name="chevron-forward" size={16} color={Signal.inkFaint} />
                    </Pressable>
                  </Animated.View>
                );
              })}
            </View>
          </>
        ) : null}
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    position: 'absolute',
    width: 292,
    borderRadius: RADIUS,
    padding: 10,
    // Grows out of the ••• button, which sits at the pill's right end.
    transformOrigin: 'bottom right',
    // A soft, far shadow sells the float on iOS; Android elevation would draw
    // a hard grey slab under translucent glass, so it relies on the dim.
    shadowColor: '#000',
    shadowOpacity: 0.45,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 18 },
  },
  tiles: { flexDirection: 'row', gap: 8 },
  tileCell: { flex: 1 },
  tile: {
    height: 78,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  tileOn: {
    backgroundColor: 'rgba(217, 230, 106, 0.14)',
    borderColor: 'rgba(217, 230, 106, 0.35)',
  },
  tileLabel: { fontSize: 12.5, fontWeight: '600', color: Signal.ink },
  rows: {
    marginTop: 8,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    minHeight: 58,
    paddingHorizontal: 14,
  },
  rowPressed: { backgroundColor: Glass.fillPressed },
  rowText: { flex: 1, minWidth: 0 },
  rule: { height: StyleSheet.hairlineWidth, marginLeft: 50, backgroundColor: Glass.hairline },
  rowLabel: { fontSize: 16, fontWeight: '600', color: Signal.ink },
  rowHint: { fontSize: 12.5, color: Signal.inkMuted, marginTop: 2 },
  labelOn: { color: Signal.wave },
});

export default MoreMenu;

// ── Hosting ───────────────────────────────────────────────────────────────
// The tab bar owns the menu's state, but the mini player pill is mounted at
// the root after the navigator, so a menu drawn inside the tab bar opened
// underneath the pill. The tab bar publishes the menu here instead, and
// MoreMenuHost draws it at the root, after the pill.
const useHostedMenu = create<{ menu: MoreMenuProps | null }>(() => ({ menu: null }));

/** Drop-in for <MoreMenu> inside a tab bar: renders nothing, publishes to the host. */
export const HostedMoreMenu: React.FC<MoreMenuProps> = ({ open, activeKey, anchorBottom, anchorRight, onSelect, onClose }) => {
  useEffect(() => {
    useHostedMenu.setState({ menu: { open, activeKey, anchorBottom, anchorRight, onSelect, onClose } });
  }, [open, activeKey, anchorBottom, anchorRight, onSelect, onClose]);
  useEffect(() => () => useHostedMenu.setState({ menu: null }), []);
  return null;
};

/** Mounted once at the root, after the mini player, so the menu opens over the pill. */
export const MoreMenuHost: React.FC = () => {
  const menu = useHostedMenu(s => s.menu);
  return menu ? <MoreMenu {...menu} /> : null;
};

type TabState = BottomTabBarProps['state'];
type TabNavigation = BottomTabBarProps['navigation'];

/** Which menu entry the current screen belongs to, or null on an everyday tab. */
export const activeMoreKey = (state: TabState): string | null => {
  const route = state.routes[state.index];
  if (!route) return null;
  if (route.name === 'Library') {
    // The Library tab itself is on the bar; its Playlists screens belong to •••.
    const nested = route.state?.routes?.[route.state.index ?? 0]?.name;
    return nested === 'Playlists' || nested === 'PlaylistDetail' ? 'Playlists' : null;
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
    if (key === 'Playlists') navigation.navigate('Library', { screen: 'Playlists' });
    else navigation.navigate(key);
  }, [navigation]);
  return { open, toggle, close, select, activeKey: activeMoreKey(state) };
};
