/**
 * Apple Music has no header bar on Now Playing — just a grabber at the top.
 * Tap it (or swipe the screen down) to go back. While a Listen together room
 * is open, a small chip beside it shows how many are listening.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface NowPlayingHeaderProps {
  animatedStyle: React.ComponentProps<typeof Animated.View>['style'];
  controlsVisible: boolean;
  onGoBack: () => void;
  /** Listeners in the Listen together room, or null when not in one. */
  together?: number | null;
  onTogetherPress?: () => void;
}

const NowPlayingHeader: React.FC<NowPlayingHeaderProps> = ({
  animatedStyle, controlsVisible, onGoBack, together = null, onTogetherPress,
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
      {together !== null ? (
        <Pressable onPress={onTogetherPress} style={styles.chip} accessibilityRole="button" accessibilityLabel={`Listening together, ${together} in the room`}>
          <MaterialCommunityIcons name="account-multiple" size={15} color="#fff" />
          <Text style={styles.chipText}>{`Listening together · ${together}`}</Text>
        </Pressable>
      ) : null}
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: { position: 'absolute', top: 0, left: 0, right: 0, alignItems: 'center', zIndex: 20 },
  grabber: { width: 38, height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.55)', marginVertical: 6 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6, height: 30, paddingHorizontal: 12, borderRadius: 15, backgroundColor: 'rgba(0,0,0,0.35)' },
  chipText: { color: '#fff', fontSize: 13, fontWeight: '600' },
});

export default React.memo(NowPlayingHeader);
