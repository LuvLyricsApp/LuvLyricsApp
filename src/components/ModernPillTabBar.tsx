/**
 * LyricFlow - Premium pill-shaped navigation bar
 * Matches Dynamic Island aesthetic with live song color theming
 * Center mic button bulges above the pill.
 */

import React from 'react';
import { View, StyleSheet, Pressable, Platform, ImageBackground } from 'react-native';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { usePlayerStore } from '../store/playerStore';
import { useSettingsStore } from '../store/settingsStore';
import { useThemeColors, useIsDark } from '../contexts/ThemeContext';
import { VoiceMicButton } from './VoiceMicButton';

const MIC_WRAPPER_SIZE = 56;

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

  // Completely hide tab bar on Luvs
  const currentRoute = state.routes[state.index];
  if (currentRoute.name === 'Luvs') {
    return null;
  }

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

  // Settings stays inside the tab navigator to keep this bar visible, but it
  // remains a header-only destination rather than a fifth tab icon.
  const visibleRoutes = state.routes.filter(
    route => route.name !== 'Settings' && route.name !== 'AudioDownloader',
  );
  const midpoint = Math.ceil(visibleRoutes.length / 2);
  const leftRoutes = visibleRoutes.slice(0, midpoint);
  const rightRoutes = visibleRoutes.slice(midpoint);

  const renderTab = (route: typeof state.routes[0]) => {
    const { options } = descriptors[route.key];
    const isFocused = state.routes[state.index]?.key === route.key;

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
        style={styles.tabItem}
      >
        {options.tabBarIcon?.({
          focused: isFocused,
          color: isFocused ? activeIconColor : inactiveIconColor,
          size: 24,
        })}
      </Pressable>
    );
  };

  return (
    <View style={styles.container} pointerEvents="box-none">
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

        <BlurView intensity={60} tint={isDark ? 'dark' : 'light'} style={styles.blur}>
          <View style={styles.tabsRow}>
            {/* Left tabs */}
            <View style={styles.tabGroup}>
              {leftRoutes.map(renderTab)}
            </View>

            {/* Center mic button — inline inside the pill */}
            {micEnabled && (
              <View style={styles.centerSlot}>
                <VoiceMicButton variant="inline" />
              </View>
            )}

            {/* Right tabs */}
            <View style={styles.tabGroup}>
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
    bottom: Platform.OS === 'ios' ? 12 : 8,
    left: 0,
    right: 0,
    alignItems: 'center',
    // Above classic mini player (root sibling) — keep elevation high on Android.
    zIndex: 1000,
    elevation: 100,
  },
  pillContainer: {
    width: '85%',
    maxWidth: 400,
    borderRadius: 32,
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
    paddingVertical: 12,
    paddingHorizontal: 8,
  },
  tabGroup: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
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
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    minWidth: 48,
  },
});

export default ModernPillTabBar;
