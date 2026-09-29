/**
 * YouTube Music's player background: the cover's colour at the top washing
 * down into near-black. A new song's wash fades in over the last one, so the
 * room changes colour without a cut.
 */
import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeIn } from 'react-native-reanimated';
import { AuraPalette, WASH_STOPS, youtubeWash } from '../allegra/palette';

const FADE_MS = 700;

interface Layer {
  key: string;
  colors: [string, string, string];
}

const YouTubeBackdrop: React.FC<{ palette: AuraPalette }> = ({ palette }) => {
  const colors = youtubeWash(palette.primary);
  const key = colors.join();
  // The last wash stays underneath while the new one fades in on top.
  const [layers, setLayers] = useState<Layer[]>([{ key, colors }]);
  useEffect(() => {
    setLayers(prev => (prev[prev.length - 1]?.key === key ? prev : [...prev.slice(-1), { key, colors }]));
    // colors is derived from key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return (
    <View style={[StyleSheet.absoluteFill, styles.base]} pointerEvents="none">
      {layers.map((layer, i) => (
        <Animated.View key={layer.key} style={StyleSheet.absoluteFill} entering={i > 0 ? FadeIn.duration(FADE_MS) : undefined}>
          <LinearGradient colors={layer.colors} locations={[...WASH_STOPS]} style={StyleSheet.absoluteFill} />
        </Animated.View>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  base: { backgroundColor: '#0a0a0b' },
});

export default React.memo(YouTubeBackdrop);
