/**
 * Echo's Ambient mode: the player steps away and the song's art — or its
 * motion canvas — fills the screen, with the title quietly underneath. The
 * screen stays awake. Tap anywhere (or back) to return.
 */
import React, { useEffect } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, { FadeIn, FadeOut, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Artwork from '../allegra/Artwork';
import CanvasVideoLayer from '../CanvasVideoLayer';
import { CanvasArtwork } from '../../services/canvas/types';
import { Song } from '../../types/song';

interface AmbientModeProps {
  song: Song;
  canvas: CanvasArtwork | null;
  playing: boolean;
  onExit: () => void;
}

const AmbientMode: React.FC<AmbientModeProps> = ({ song, canvas, playing, onExit }) => {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const size = Math.min(width - 56, height * 0.5, 460);

  useEffect(() => {
    activateKeepAwakeAsync('ambient').catch(() => {});
    return () => { deactivateKeepAwake('ambient').catch(() => {}); };
  }, []);

  // "Tap to go back" shows for a moment, then leaves the art alone.
  const hint = useSharedValue(1);
  useEffect(() => {
    hint.value = withDelay(2200, withTiming(0, { duration: 600 }));
  }, [hint]);
  const hintStyle = useAnimatedStyle(() => ({ opacity: hint.value }));

  return (
    <Animated.View entering={FadeIn.duration(360)} exiting={FadeOut.duration(260)} style={[StyleSheet.absoluteFill, styles.room]}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onExit} accessibilityRole="button" accessibilityLabel="Leave ambient mode">
        {canvas ? (
          <CanvasVideoLayer canvas={canvas} playing={playing} scrimStrength={0.45} />
        ) : (
          <View style={styles.center}>
            <Artwork uri={song.coverImageUri} title={song.title} artist={song.artist} size={size} priority="high" style={[styles.art, { width: size, height: size }]} />
          </View>
        )}
        <View style={[styles.meta, { paddingBottom: insets.bottom + 36 }]} pointerEvents="none">
          <Text style={styles.title} numberOfLines={1}>{song.title}</Text>
          {song.artist ? <Text style={styles.artist} numberOfLines={1}>{song.artist}</Text> : null}
          <Animated.Text style={[styles.hint, hintStyle]}>Tap to go back</Animated.Text>
        </View>
      </Pressable>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  room: { backgroundColor: 'rgba(5,5,7,0.72)', zIndex: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  art: { borderRadius: 18, overflow: 'hidden' },
  meta: { position: 'absolute', left: 32, right: 32, bottom: 0, alignItems: 'center' },
  title: { color: '#fff', fontSize: 22, fontWeight: '700' },
  artist: { color: 'rgba(255,255,255,0.75)', fontSize: 16, marginTop: 4 },
  hint: { color: 'rgba(255,255,255,0.55)', fontSize: 13, marginTop: 14 },
});

export default React.memo(AmbientMode);
