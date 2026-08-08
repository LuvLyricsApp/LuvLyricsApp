/**
 * LyricFlow - Custom Tab Bar (Classic Style)
 * Simple bottom bar with inline mic button.
 */

import React from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { VoiceMicButton } from './VoiceMicButton';
import { useSettingsStore } from '../store/settingsStore';
import { TAB_BAR_HEIGHT } from '../constants/layout';

const MIC_WRAPPER_SIZE = 56;

export const CustomTabBar: React.FC<BottomTabBarProps> = ({
  state,
  descriptors,
  navigation,
}) => {
  const insets = useSafeAreaInsets();
  const micEnabled = useSettingsStore(s => s.micEnabled);
  // Settings is a hidden tab route so its screen can retain this navigator. It
  // must not reserve an empty icon slot in the visible four-tab layout.
  const visibleRoutes = state.routes.filter(route => route.name !== 'Settings');
  const midpoint = Math.ceil(visibleRoutes.length / 2);
  const leftRoutes = visibleRoutes.slice(0, midpoint);
  const rightRoutes = visibleRoutes.slice(midpoint);

  const renderTab = (route: typeof state.routes[0]) => {
    const { options } = descriptors[route.key];
    const isFocused = state.routes[state.index]?.key === route.key;

    const onPress = () => {
      const event = navigation.emit({
        type: 'tabPress',
        target: route.key,
        canPreventDefault: true,
      });
      if (!isFocused && !event.defaultPrevented) {
        navigation.navigate(route.name, route.params);
      }
    };

    return (
      <Pressable key={route.key} onPress={onPress} style={styles.tab}>
        {options.tabBarIcon?.({
          focused: isFocused,
          color: isFocused ? '#fff' : 'rgba(255,255,255,0.5)',
          size: 24,
        })}
      </Pressable>
    );
  };

  return (
    <View style={styles.outerContainer} pointerEvents="box-none">
      {/* edgeToEdgeEnabled draws under the system bars, so the inset has to be
          reserved as padding too — growing the height alone just re-centres the
          icons into the gesture pill / 3-button strip. */}
      <View style={[styles.container, { height: TAB_BAR_HEIGHT + insets.bottom, paddingBottom: insets.bottom }]}>
        <View style={styles.tabBar}>
          {/* Left tabs */}
          <View style={styles.tabGroup}>
            {leftRoutes.map(renderTab)}
          </View>

          {/* Center mic button — inline, inside the bar */}
          {micEnabled && (
            <View style={styles.micSlot}>
              <VoiceMicButton variant="inline" />
            </View>
          )}

          {/* Right tabs */}
          <View style={styles.tabGroup}>
            {rightRoutes.map(renderTab)}
          </View>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  outerContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    pointerEvents: 'box-none',
    // Above classic mini player (root sibling) — keep elevation high on Android.
    zIndex: 1000,
    elevation: 100,
  },
  container: {
    width: '100%',
    height: TAB_BAR_HEIGHT,
    // Solid black, not a blur — list content used to read straight through the
    // bar and collide with the icons, and an opaque bar meets the near-black
    // bottom of the song pill without a visible seam.
    backgroundColor: '#000000',
    borderTopWidth: 0,
    overflow: 'hidden',
  },
  tabBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
  },
  tabGroup: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
  },
  micSlot: {
    width: MIC_WRAPPER_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default CustomTabBar;
