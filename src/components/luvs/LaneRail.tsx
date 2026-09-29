/**
 * The lane names above the taste map, sliding with the camera: the lane
 * you're in sits centred and bright, its neighbours fade out to the sides.
 * Tap a name to go there. It follows the swipe continuously (no jump when a
 * lane is committed), transforms and opacity only.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { SharedValue, useAnimatedStyle } from 'react-native-reanimated';
import { Signal } from '../../constants/allegraTheme';

const ITEM = 150;

const RailItem: React.FC<{ title: string; index: number; cam: SharedValue<number>; onPress: () => void }> = ({ title, index, cam, onPress }) => {
  const style = useAnimatedStyle(() => {
    const d = Math.abs(index - cam.value);
    return {
      opacity: Math.max(0, 1 - d * 0.55),
      transform: [{ scale: 1 - Math.min(1, d) * 0.18 }] as const,
    };
  });
  return (
    <Animated.View style={[styles.item, style]}>
      <Pressable onPress={onPress} hitSlop={8} accessibilityRole="button" accessibilityLabel={`${title} lane`}>
        <Text style={styles.title} numberOfLines={1}>{title}</Text>
      </Pressable>
    </Animated.View>
  );
};

export const LaneRail: React.FC<{
  titles: string[];
  subtitle: string;
  cam: SharedValue<number>;
  width: number;
  onPick: (index: number) => void;
}> = ({ titles, subtitle, cam, width, onPick }) => {
  const track = useAnimatedStyle(() => ({ transform: [{ translateX: width / 2 - ITEM / 2 - cam.value * ITEM }] as const }));
  return (
    <View style={[styles.wrap, { width }]}>
      <Animated.View style={[styles.track, track]}>
        {titles.map((t, i) => <RailItem key={`${t}-${i}`} title={t} index={i} cam={cam} onPress={() => onPick(i)} />)}
      </Animated.View>
      <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { overflow: 'hidden', alignItems: 'center' },
  track: { flexDirection: 'row', alignSelf: 'flex-start' },
  item: { width: ITEM, alignItems: 'center' },
  title: { color: Signal.ink, fontSize: 18, fontWeight: '700', maxWidth: ITEM - 12 },
  subtitle: { color: Signal.inkMuted, fontSize: 13, marginTop: 2 },
});

export default LaneRail;
