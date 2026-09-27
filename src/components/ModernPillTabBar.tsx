/**
 * LyricFlow - Premium pill-shaped navigation bar
 * Matches Dynamic Island aesthetic with live song color theming
 * Center mic button bulges above the pill.
 */

import React, { useEffect, useRef, useState } from 'react';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { View, Text, StyleSheet, Pressable, Platform, ImageBackground, ViewStyle } from 'react-native';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePlayerStore } from '../store/playerStore';
import { useSettingsStore } from '../store/settingsStore';
import { useThemeColors, useIsDark } from '../contexts/ThemeContext';
import { VoiceMicButton } from './VoiceMicButton';
import { Glass, Motion, Radius } from '../constants/allegraTheme';
import { VISIBLE_TABS } from '../navigation/tabs';

const MIC_WRAPPER_SIZE = 56;
const INDICATOR_W = 62;

/** The selected icon gives a small lift — acknowledges the tap, then settles. */
const TabIcon: React.FC<{ focused: boolean; children: React.ReactNode }> = ({ focused, children }) => {
  const reduce = useReducedMotion();
  const lift = useSharedValue(0);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    if (!focused || reduce) return;
    lift.value = withSequence(
      withTiming(1, { duration: Motion.duration.fast, easing: Motion.ease.decelerate }),
      withSpring(0, Motion.spring.tactile),
    );
  }, [focused, reduce, lift]);
  const style = useAnimatedStyle((): ViewStyle => ({
    transform: [{ translateY: -3 * lift.value }, { scale: 1 + 0.12 * lift.value }],
  }));
  return <Animated.View style={style}>{children}</Animated.View>;
};

export const ModernPillTabBar: React.FC<BottomTabBarProps> = ({
  state,
  descriptors,
  navigation,
}) => {
  const coverImageUri = usePlayerStore(s => s.currentSong?.coverImageUri);
  const isDynamicIsland = useSettingsStore(s => s.miniPlayerStyle === 'island');
  const micEnabled = useSettingsStore(s => s.micEnabled);
  const isDark = useIsDark();
  const colors = useThemeColors();
  // iOS floats the bar into the home-indicator zone, as Apple Music does; on
  // Android it has to clear the gesture / 3-button bar, which edge-to-edge draws under.
  const insets = useSafeAreaInsets();
  const bottomOffset = Platform.OS === 'ios' ? 12 : insets.bottom + 8;

  // Glass highlight that springs between tabs. Positions are measured, and it
  // moves by translateX only (never width) — Allegra's transform-only rule.
  const reduceMotion = useReducedMotion();
  const [groupX, setGroupX] = useState({ left: 0, right: 0 });
  const [tabCenters, setTabCenters] = useState<Record<string, number>>({});
  const indicatorX = useSharedValue(0);
  const indicatorOpacity = useSharedValue(0);
  // Settings and the downloader are tab routes without an icon: the bar stays,
  // nothing is highlighted.
  const routes = state.routes.filter(r => VISIBLE_TABS.has(r.name));
  const splitAt = Math.ceil(routes.length / 2);
  const leftRoutes = routes.slice(0, splitAt);
  const rightRoutes = routes.slice(splitAt);
  const activeKey = state.routes[state.index]?.key;
  const activeOnLeft = leftRoutes.some(r => r.key === activeKey);
  const activeCenter = activeKey !== undefined && tabCenters[activeKey] !== undefined
    ? (activeOnLeft ? groupX.left : groupX.right) + tabCenters[activeKey]
    : null;

  useEffect(() => {
    if (activeCenter === null) {
      indicatorOpacity.value = withTiming(0, { duration: Motion.duration.fast });
      return;
    }
    const target = activeCenter - INDICATOR_W / 2;
    if (indicatorOpacity.value === 0 || reduceMotion) {
      indicatorX.value = target;
      indicatorOpacity.value = withTiming(1, { duration: Motion.duration.base });
    } else {
      indicatorX.value = withSpring(target, Motion.spring.sheet);
    }
  }, [activeCenter, reduceMotion, indicatorX, indicatorOpacity]);

  const indicatorStyle = useAnimatedStyle(() => ({
    opacity: indicatorOpacity.value,
    transform: [{ translateX: indicatorX.value }],
  }));

  const activeIconColor = isDark ? '#FFFFFF' : colors.textPrimary;
  const inactiveIconColor = isDark ? 'rgba(255,255,255,0.45)' : colors.textMuted;

  // Kept translucent so list content stays visible through the pill's BlurView.
  const pillBg = 'transparent';
  const overlayColor = isDark ? '#0A0A0C' : '#FFFFFF';
  const overlayOpacity = isDark ? 0.90 : 0.82;
  const fallbackBg = isDark ? 'rgba(10,10,12,0.35)' : 'rgba(255,255,255,0.35)';
  const gradientColors: [string, string] = isDark
    ? ['rgba(0,0,0,0.3)', 'rgba(0,0,0,0.85)']
    : ['rgba(255,255,255,0.1)', 'rgba(248,248,252,0.5)'];
  const borderColor = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';

  const renderTab = (route: typeof state.routes[0]) => {
    const { options } = descriptors[route.key];
    const isFocused = route.key === activeKey;
    const label = typeof options.tabBarLabel === 'string' ? options.tabBarLabel : route.name;

    const onPress = async () => {
      const event = navigation.emit({
        type: 'tabPress',
        target: route.key,
        canPreventDefault: true,
      });

      if (!isFocused && !event.defaultPrevented) {
        navigation.navigate(route.name, route.params);

        if (route.name === 'Luvs') {
          const { feedSongs } = (await import('../store/luvsFeedStore')).useLuvsFeedStore.getState();
          if (feedSongs.length === 0) {
            import('../services/luvsEngine')
              .then(m => m.luvsEngine.refresh())
              .catch(console.error);
          }
        }
      } else if (isFocused && route.name === 'Luvs') {
        import('../services/luvsEngine')
          .then(m => m.luvsEngine.refresh())
          .catch(console.error);
      }
    };

    return (
      <Pressable
        key={route.key}
        onPress={onPress}
        accessibilityRole="tab"
        accessibilityState={{ selected: isFocused }}
        accessibilityLabel={label}
        onLayout={e => {
          const { x, width } = e.nativeEvent.layout;
          const center = x + width / 2;
          setTabCenters(prev => (prev[route.key] === center ? prev : { ...prev, [route.key]: center }));
        }}
        style={({ pressed }) => [styles.tabItem, pressed && styles.tabPressed]}
      >
        <TabIcon focused={isFocused}>
          {options.tabBarIcon?.({
            focused: isFocused,
            color: isFocused ? activeIconColor : inactiveIconColor,
            size: 22,
          })}
        </TabIcon>
        <Text style={[styles.label, { color: isFocused ? activeIconColor : inactiveIconColor }]} numberOfLines={1}>
          {label}
        </Text>
      </Pressable>
    );
  };

  return (
    <View style={[styles.container, { bottom: bottomOffset }]} pointerEvents="box-none">
      {/* Pill */}
      <View style={[styles.pillContainer, { backgroundColor: pillBg, borderColor }]}>
        {/* Dynamic Background — oversized + heavier blur so album-art edges
            don't read as a sharp rectangle inside the pill rim. */}
        <View style={[StyleSheet.absoluteFill, { overflow: 'hidden' }]}>
          {isDynamicIsland && coverImageUri ? (
            <ImageBackground
              source={{ uri: coverImageUri }}
              style={{
                position: 'absolute',
                top: -24,
                left: -24,
                right: -24,
                bottom: -24,
                transform: [{ scale: 1.25 }],
              }}
              blurRadius={Platform.OS === 'android' ? 50 : 60}
              resizeMode="cover"
            >
              <View style={[StyleSheet.absoluteFill, { backgroundColor: overlayColor, opacity: overlayOpacity }]} />
            </ImageBackground>
          ) : (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: fallbackBg }]} />
          )}
          <LinearGradient colors={gradientColors} style={StyleSheet.absoluteFill} />
        </View>

        {/* Inset top highlight — the frosted-glass edge from the Allegra material recipe. */}
        {isDark && <View pointerEvents="none" style={styles.glassHighlight} />}

        <BlurView intensity={60} tint={isDark ? 'dark' : 'light'} style={styles.blur}>
          <View style={styles.tabsRow}>
            <Animated.View pointerEvents="none" style={[styles.indicator, indicatorStyle]} />
            {/* Left tabs */}
            {/* Each side is weighted by its tab count so an odd number of tabs
                still spaces every icon evenly around the centre mic. */}
            <View
              style={[styles.tabGroup, { flex: leftRoutes.length }]}
              onLayout={e => { const x = e.nativeEvent.layout.x; setGroupX(g => (g.left === x ? g : { ...g, left: x })); }}
            >
              {leftRoutes.map(renderTab)}
            </View>

            {/* Center mic button — inline inside the pill */}
            {micEnabled && (
              <View style={styles.centerSlot}>
                <VoiceMicButton variant="inline" />
              </View>
            )}

            {/* Right tabs */}
            <View
              style={[styles.tabGroup, { flex: rightRoutes.length }]}
              onLayout={e => { const x = e.nativeEvent.layout.x; setGroupX(g => (g.right === x ? g : { ...g, right: x })); }}
            >
              {rightRoutes.map(renderTab)}
            </View>
          </View>
        </BlurView>
      </View>

    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    // Above classic mini player (root sibling) — keep elevation high on Android.
    zIndex: 1000,
    elevation: 100,
  },
  pillContainer: {
    width: '92%',
    maxWidth: 440,
    borderRadius: Radius.pill,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    // Shadow size only — z-order above the mini player comes from the parent
    // container's elevation. Cranking this just dumps a huge dark blob under
    // the pill on Android.
    elevation: 24,
  },
  blur: {
    overflow: 'hidden',
  },
  tabsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
    paddingHorizontal: 6,
  },
  tabGroup: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-evenly',
  },
  // Center slot for inline mic button
  centerSlot: {
    width: MIC_WRAPPER_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabItem: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingHorizontal: 4,
    paddingVertical: 6,
    borderRadius: Radius.pill,
    minWidth: 56,
    minHeight: 50,
  },
  label: {
    fontSize: 10.5,
    fontWeight: '600',
  },
  tabPressed: {
    transform: [{ scale: 0.92 }],
  },
  indicator: {
    position: 'absolute',
    left: 0,
    top: 6,
    bottom: 6,
    width: INDICATOR_W,
    borderRadius: Radius.pill,
    backgroundColor: 'rgba(255, 255, 255, 0.09)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Glass.hairline,
  },
  glassHighlight: {
    position: 'absolute',
    top: 0,
    left: 24,
    right: 24,
    height: StyleSheet.hairlineWidth,
    backgroundColor: Glass.highlight,
    zIndex: 2,
  },
});

export default ModernPillTabBar;
