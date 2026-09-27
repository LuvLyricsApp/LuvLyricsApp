/**
 * Apple Music has no header bar on Now Playing — just a grabber at the top.
 * Tap it (or swipe the screen down) to go back. The player menu opens from
 * the ••• beside the title, and is anchored here.
 */
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import CustomMenu from './CustomMenu';

interface NowPlayingHeaderProps {
  animatedStyle: React.ComponentProps<typeof Animated.View>['style'];
  controlsVisible: boolean;
  onGoBack: () => void;
  menuVisible: boolean;
  onMenuClose: () => void;
  menuAnchor?: { x: number; y: number };
  menuOptions: React.ComponentProps<typeof CustomMenu>['options'];
}

const NowPlayingHeader: React.FC<NowPlayingHeaderProps> = ({
  animatedStyle, controlsVisible, onGoBack, menuVisible, onMenuClose, menuAnchor, menuOptions,
}) => {
  const insets = useSafeAreaInsets();
  return (
    <Animated.View
      style={[styles.container, { paddingTop: insets.top + 6 }, animatedStyle]}
      pointerEvents={controlsVisible ? 'box-none' : 'none'}
    >
      <Pressable onPress={onGoBack} hitSlop={{ top: 12, bottom: 12, left: 40, right: 40 }} accessibilityRole="button" accessibilityLabel="Close player">
        <View style={styles.grabber} />
      </Pressable>
      <CustomMenu visible={menuVisible} onClose={onMenuClose} anchorPosition={menuAnchor} options={menuOptions} />
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: { position: 'absolute', top: 0, left: 0, right: 0, alignItems: 'center', zIndex: 20 },
  grabber: { width: 38, height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.55)', marginVertical: 6 },
});

export default React.memo(NowPlayingHeader);
