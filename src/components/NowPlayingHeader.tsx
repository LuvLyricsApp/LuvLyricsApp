import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import CustomMenu from './CustomMenu';

interface NowPlayingHeaderProps {
  animatedStyle: any;
  controlsVisible: boolean;
  onGoBack: () => void;
  onMenuPress: (event: any) => void;
  menuVisible: boolean;
  onMenuClose: () => void;
  menuAnchor?: { x: number; y: number };
  menuOptions: any[];
  currentSongTitle?: string;
  colors: {
    textPrimary: string;
    textSecondary: string;
  };
  isDark: boolean;
}

const NowPlayingHeader: React.FC<NowPlayingHeaderProps> = ({
  animatedStyle,
  controlsVisible,
  onGoBack,
  onMenuPress,
  menuVisible,
  onMenuClose,
  menuAnchor,
  menuOptions,
  currentSongTitle,
  colors,
  isDark,
}) => {
  const insets = useSafeAreaInsets();

  return (
    <Animated.View style={[styles.headerContainer, animatedStyle]} pointerEvents={controlsVisible ? 'auto' : 'none'}>
      <BlurView intensity={80} tint={isDark ? 'dark' : 'light'} style={styles.blurContainer}>
        <View style={[styles.headerContent, { paddingTop: insets.top + 10 }]}>
          <Pressable onPress={onGoBack} style={[styles.headerButton, { backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)' }]}>
            <Ionicons name="chevron-down" size={28} color={colors.textPrimary} />
          </Pressable>

          <View style={{ alignItems: 'center', flex: 1 }}>
            <Text style={[styles.headerTitle, { color: colors.textPrimary }]} numberOfLines={1}>NOW PLAYING</Text>
            <Text style={[styles.headerSubtitle, { color: colors.textSecondary }]} numberOfLines={1}>{currentSongTitle}</Text>
          </View>

          <View style={styles.headerRight}>
            <CustomMenu
              visible={menuVisible}
              onClose={onMenuClose}
              anchorPosition={menuAnchor}
              options={menuOptions}
            />
            <Pressable onPress={onMenuPress} style={[styles.headerButton, { backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)' }]}>
              <Ionicons name="ellipsis-horizontal" size={24} color={colors.textPrimary} />
            </Pressable>
          </View>
        </View>
      </BlurView>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  headerContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 20,
    overflow: 'hidden',
  },
  blurContainer: {
    flex: 1,
    backgroundColor: 'rgba(10,10,10,0.3)',
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '600',
    maxWidth: '60%',
    textAlign: 'center',
  },
  headerSubtitle: {
    fontSize: 12,
    fontWeight: '500',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerButton: {
    padding: 8,
    borderRadius: 20,
  },
});

export default React.memo(NowPlayingHeader);
