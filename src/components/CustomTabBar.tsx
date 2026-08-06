/**
 * LyricFlow - Custom Tab Bar (Classic Style)
 * Simple bottom bar with inline mic button.
 */

import React from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { VoiceMicButton } from './VoiceMicButton';
import { useSettingsStore } from '../store/settingsStore';

const MIC_WRAPPER_SIZE = 56;

export const CustomTabBar: React.FC<BottomTabBarProps> = ({
  state,
  descriptors,
  navigation,
}) => {
  const insets = useSafeAreaInsets();
  const micEnabled = useSettingsStore(s => s.micEnabled);
  // The classic mini player paints its artwork behind this bar; the island style
  // floats at the top and does not, so the blur is still needed there.
  const midpoint = Math.ceil(state.routes.length / 2);
  const leftRoutes = state.routes.slice(0, midpoint);
  const rightRoutes = state.routes.slice(midpoint);

  const renderTab = (route: typeof state.routes[0], index: number, offset = 0) => {
    const { options } = descriptors[route.key];
    const isFocused = state.index === index + offset;

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
      <View style={[styles.container, { height: 64 + insets.bottom, paddingBottom: insets.bottom }]}>
        {/* Translucent backdrop — list content scrolls through behind it.
            The scrim on top of the blur keeps icons legible over bright art. */}
        <BlurView
          intensity={40}
          tint="dark"
          style={StyleSheet.absoluteFill}
        />
        {/* Densest at the very bottom, near-clear at the top where it meets the
            song pill — so the bar has weight against the system nav without
            cutting a hard edge across the player above it. */}
        <LinearGradient
          colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.55)', 'rgba(0,0,0,0.97)']}
          locations={[0, 0.45, 1]}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        <View style={styles.tabBar}>
          {/* Left tabs */}
          <View style={styles.tabGroup}>
            {leftRoutes.map((r, i) => renderTab(r, i, 0))}
          </View>

          {/* Center mic button — inline, inside the bar */}
          {micEnabled && (
            <View style={styles.micSlot}>
              <VoiceMicButton variant="inline" />
            </View>
          )}

          {/* Right tabs */}
          <View style={styles.tabGroup}>
            {rightRoutes.map((r, i) => renderTab(r, i, midpoint))}
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
  },
  container: {
    width: '100%',
    height: 64,
    backgroundColor: 'transparent',
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
