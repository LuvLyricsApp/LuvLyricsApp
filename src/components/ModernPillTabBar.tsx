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

  const pillBg = isDark ? '#0A0A0C' : '#FFFFFF';
  const overlayColor = isDark ? '#0A0A0C' : '#FFFFFF';
  const overlayOpacity = isDark ? 0.90 : 0.82;
  const fallbackBg = isDark ? 'rgba(10,10,12,0.98)' : 'rgba(255,255,255,0.98)';
  const gradientColors: [string, string] = isDark
    ? ['rgba(0,0,0,0.3)', 'rgba(0,0,0,0.85)']
    : ['rgba(255,255,255,0.1)', 'rgba(248,248,252,0.5)'];
  const borderColor = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';

  // Split routes: left half and right half (mic occupies center slot)
  const midpoint = Math.ceil(state.routes.length / 2);
  const leftRoutes = state.routes.slice(0, midpoint);
  const rightRoutes = state.routes.slice(midpoint);

  const renderTab = (route: typeof state.routes[0], index: number, offset = 0) => {
    const { options } = descriptors[route.key];
    const isFocused = state.index === index + offset;

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
            import('../services/LuvsRecommendationEngine')
              .then(m => m.luvsRecommendationEngine.refreshRecommendation())
              .catch(console.error);
          }
        }
      } else if (isFocused && route.name === 'Luvs') {
        import('../services/LuvsRecommendationEngine')
          .then(m => m.luvsRecommendationEngine.refreshRecommendation())
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
        {/* Dynamic Background */}
        <View style={StyleSheet.absoluteFill}>
          {isDynamicIsland && coverImageUri ? (
            <ImageBackground
              source={{ uri: coverImageUri }}
              style={StyleSheet.absoluteFill}
              blurRadius={40}
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
              {leftRoutes.map((route, i) => renderTab(route, i, 0))}
            </View>

            {/* Center mic button — inline inside the pill */}
            {micEnabled && (
              <View style={styles.centerSlot}>
                <VoiceMicButton variant="inline" />
              </View>
            )}

            {/* Right tabs */}
            <View style={styles.tabGroup}>
              {rightRoutes.map((route, i) => renderTab(route, i, midpoint))}
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
