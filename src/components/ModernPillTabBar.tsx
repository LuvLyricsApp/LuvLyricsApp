/**
 * LyricFlow - Premium pill-shaped navigation bar
 * Matches Dynamic Island aesthetic with live song color theming
 */

import React from 'react';
import { View, StyleSheet, Pressable, Platform, ImageBackground } from 'react-native';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { usePlayerStore } from '../store/playerStore';
import { useSettingsStore } from '../store/settingsStore';

export const ModernPillTabBar: React.FC<BottomTabBarProps> = ({
  state,
  descriptors,
  navigation,
}) => {
  const coverImageUri = usePlayerStore(s => s.currentSong?.coverImageUri);
  const isDynamicIsland = useSettingsStore(s => s.miniPlayerStyle === 'island');
  
  // Completely hide tab bar on Luvs
  const currentRoute = state.routes[state.index];
  if (currentRoute.name === 'Luvs') {
    return null;
  }

  return (
    <View style={styles.container}>
      <View style={styles.pillContainer}>
        {/* Dynamic Background */}
        <View style={StyleSheet.absoluteFill}>
            {isDynamicIsland && coverImageUri ? (
              <ImageBackground
                source={{ uri: coverImageUri }}
                style={StyleSheet.absoluteFill}
                blurRadius={40}
              >
                {/* Dark overlay for blurred image */}
                <View style={[StyleSheet.absoluteFill, { backgroundColor: '#1E1E1E' }]} />
              </ImageBackground>
            ) : (
              // Fallback dark background
              <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.6)' }]} />
            )}
            
            {/* Vignette Overlay for readability (always present) */}
            <LinearGradient
                colors={['rgba(0,0,0,0.4)', 'rgba(0,0,0,0.9)']}
                style={StyleSheet.absoluteFill}
            />
        </View>

        <BlurView intensity={20} tint="dark" style={styles.blur}>
            <View style={styles.tabsRow}>
              {state.routes.map((route, index) => {
                const { options } = descriptors[route.key];
                const isFocused = state.index === index;

                // label removed as unused

                const onPress = async () => {
                  const event = navigation.emit({
                    type: 'tabPress',
                    target: route.key,
                    canPreventDefault: true,
                  });

                  if (!isFocused && !event.defaultPrevented) {
                    navigation.navigate(route.name, route.params);
                    
                    // Trigger refresh if navigating to Luvs AND feed is empty
                    if (route.name === 'Luvs') {
                        const { feedSongs } = (await import('../store/luvsFeedStore')).useLuvsFeedStore.getState();
                        if (feedSongs.length === 0) {
                            import('../services/LuvsRecommendationEngine')
                                .then(m => m.luvsRecommendationEngine.refreshRecommendation())
                                .catch(error => { if (__DEV__) console.error(error); });
                        }
                    }
                  } else if (isFocused && route.name === 'Luvs') {
                    // Refresh even if already focused (user tapping the button again)
                    import('../services/LuvsRecommendationEngine')
                      .then(m => m.luvsRecommendationEngine.refreshRecommendation())
                      .catch(error => { if (__DEV__) console.error(error); });
                  }
                };

                return (
                  <Pressable
                    key={route.key}
                    onPress={onPress}
                    style={[
                      styles.tabItem,
                      // Removed background color style for active state
                      // isFocused && styles.tabItemActive, 
                    ]}
                  >
                    {options.tabBarIcon?.({
                      focused: isFocused,
                      color: isFocused ? '#FFFFFF' : 'rgba(255,255,255,0.5)',
                      size: 24,
                    })}
                  </Pressable>
                );
              })}
            </View>
        </BlurView>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: Platform.OS === 'ios' ? 12 : 8,
    pointerEvents: 'box-none',
  },
  pillContainer: {
    width: '85%',
    maxWidth: 400,
    borderRadius: 32,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 24,
    // Ensure background doesn't bleed
    backgroundColor: '#000', 
  },
  blur: {
    overflow: 'hidden',
  },
  tabsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingVertical: 12,
    paddingHorizontal: 8,
  },
  tabItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    minWidth: 56,
  },
});

export default ModernPillTabBar;
