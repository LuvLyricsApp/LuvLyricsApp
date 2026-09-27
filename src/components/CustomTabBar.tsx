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
import { VISIBLE_TABS } from '../navigation/tabs';
import { HostedMoreMenu, useMoreMenu } from './MoreMenu';
import { MorphIcon } from './allegra/motion';

const MIC_WRAPPER_SIZE = 56;

export const CustomTabBar: React.FC<BottomTabBarProps> = ({
  state,
  descriptors,
  navigation,
}) => {
  const insets = useSafeAreaInsets();
  const micEnabled = useSettingsStore(s => s.micEnabled);
  const routes = state.routes.filter(r => VISIBLE_TABS.has(r.name));
  const activeKey = state.routes[state.index]?.key;
  const midpoint = Math.ceil(routes.length / 2);
  const leftRoutes = routes.slice(0, midpoint);
  const rightRoutes = routes.slice(midpoint);
  const more = useMoreMenu(state, navigation);
  const moreActive = more.open || more.activeKey !== null;

  const renderTab = (route: typeof state.routes[0]) => {
    const { options } = descriptors[route.key];
    const isFocused = route.key === activeKey && !more.open;

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
    <View style={[styles.outerContainer, more.open && styles.outerOpen]} pointerEvents="box-none">
      <HostedMoreMenu
        open={more.open}
        activeKey={more.activeKey}
        anchorBottom={TAB_BAR_HEIGHT + insets.bottom}
        anchorRight={12}
        onSelect={more.select}
        onClose={more.close}
      />
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
            <Pressable
              onPress={more.toggle}
              style={styles.tab}
              accessibilityRole="button"
              accessibilityLabel="More"
              accessibilityState={{ expanded: more.open, selected: moreActive }}
            >
              <MorphIcon on={more.open} onIcon="close" offIcon="ellipsis-horizontal" size={24} color={moreActive ? '#fff' : 'rgba(255,255,255,0.5)'} />
            </Pressable>
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
  // While the menu is open the bar's layer covers the screen, so the dim
  // backdrop above it can receive touches (Android clips hit-testing to bounds).
  outerOpen: { top: 0, justifyContent: 'flex-end' },
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
