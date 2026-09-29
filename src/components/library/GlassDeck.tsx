/**
 * The Library's hero: your recent songs as a coverflow of glass cards.
 *
 *   - The card in the middle is the biggest and faces you; the ones either side
 *     are smaller, turned in towards it and overlapping, like a row of glass
 *     plates. Each plate carries its cover with the title and artist under it.
 *   - Drag to move along the row (it follows the finger, then settles on the
 *     nearest card with a spring). Tap the middle card to play it; tap a card
 *     beside it to bring it to the middle.
 *   - Underneath, a glass pill: shuffle everything, step back or forward
 *     along the row, and play or pause the card in the middle.
 *
 * The position is a single shared value on the UI thread, so a drag never
 * waits on React. Transforms and opacity only. The plates are tinted glass, not
 * live blurs: a row of blurs would re-render on every frame of a drag, and the
 * room behind them is already soft.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  Extrapolation,
  SharedValue,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import Artwork from '../allegra/Artwork';
import { Tactile } from '../allegra/motion';
import { Glass, Motion, Radius, Signal } from '../../constants/allegraTheme';
import * as Haptics from '../../utils/haptics';
import { flowOffset, focusFromDrag, settleFocus, tapSide } from './flowMath';
import type { Song } from '../../types/song';

const SETTLE = { stiffness: 220, damping: 26, mass: 1 } as const;
/** Cards within this distance of the centre are drawn; the rest wait out of sight. */
const REACH = 2.4;
const TILT_DEG = 26;
const PERSPECTIVE = 1300;

interface GlassDeckProps {
  songs: Song[];
  /** The middle card's width. */
  size: number;
  /** The song that is playing, if any. */
  currentId?: string | null;
  isPlaying: boolean;
  onPlay: (song: Song) => void;
  onTogglePlay: () => void;
  onShuffle: () => void;
  /** The card in the middle to start with (0 = the first). */
  initialIndex?: number;
}

const Plate: React.FC<{
  song: Song;
  index: number;
  size: number;
  height: number;
  step: number;
  position: SharedValue<number>;
  nowPlaying: boolean;
}> = React.memo(({ song, index, size, height, step, position, nowPlaying }) => {
  const style = useAnimatedStyle(() => {
    const d = index - position.value;
    const a = Math.abs(d);
    const turn = Math.max(-1, Math.min(1, d));
    return {
      zIndex: 100 - Math.round(a * 10),
      opacity: a > REACH ? 0 : interpolate(a, [0, 1, REACH], [1, 0.82, 0], Extrapolation.CLAMP),
      transform: [
        { perspective: PERSPECTIVE },
        { translateX: flowOffset(d, step) },
        // A card on the left turns its face towards the middle (its inner edge
        // recedes), and the other way round.
        { rotateY: `${-turn * TILT_DEG}deg` },
        { scale: interpolate(a, [0, 1, 2], [1, 0.8, 0.66], Extrapolation.CLAMP) },
      ] as const,
    };
  });
  const art = size - 20;
  return (
    <Animated.View style={[styles.plate, { width: size, height, borderRadius: Radius.panel + 2 }, style]} pointerEvents="none">
      <LinearGradient
        colors={['rgba(255,255,255,0.20)', 'rgba(255,255,255,0.07)', 'rgba(255,255,255,0.11)']}
        locations={[0, 0.55, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      {/* The rim, lit from above. */}
      <View style={[styles.rim, { borderRadius: Radius.panel + 2 }]} />
      <View style={styles.topLight} />
      <View style={[styles.art, { width: art, height: art }]}>
        <Artwork uri={song.coverImageUri} title={song.title} artist={song.artist} size={art} priority="high" style={StyleSheet.absoluteFill} />
        {nowPlaying ? (
          <View style={styles.playing}>
            <Ionicons name="volume-medium" size={14} color={Signal.waveInk} />
          </View>
        ) : null}
      </View>
      <View style={styles.label}>
        <Text style={styles.title} numberOfLines={1}>{song.title}</Text>
        {song.artist ? <Text style={styles.artist} numberOfLines={1}>{song.artist}</Text> : null}
      </View>
    </Animated.View>
  );
});

export const GlassDeck: React.FC<GlassDeckProps> = ({ songs, size, currentId, isPlaying, onPlay, onTogglePlay, onShuffle, initialIndex = 0 }) => {
  const n = songs.length;
  const reduce = useReducedMotion();
  const first = Math.min(Math.max(0, initialIndex), Math.max(0, n - 1));
  const position = useSharedValue(first);
  const start = useSharedValue(first);
  const [focus, setFocus] = useState(first);
  const height = Math.round(size * 1.2);
  const step = Math.round(size * 0.66);
  const stageWidth = size + step * 2;

  // A different set of songs starts from the first card.
  const signature = songs.map(s => s.id).join('|');
  const firstRun = React.useRef(true);
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    position.value = 0;
    setFocus(0);
  }, [signature, position]);

  const moveTo = useCallback((index: number) => {
    const next = Math.min(Math.max(0, index), n - 1);
    position.value = reduce ? withTiming(next, { duration: Motion.duration.fast }) : withSpring(next, SETTLE);
    setFocus(f => {
      if (f !== next) Haptics.selectionAsync().catch(() => {});
      return next;
    });
  }, [n, position, reduce]);

  const centre = songs[Math.min(focus, n - 1)];
  const playFocused = useCallback(() => {
    if (!centre) return;
    if (centre.id === currentId) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      onTogglePlay();
    } else {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      onPlay(centre);
    }
  }, [centre, currentId, onPlay, onTogglePlay]);

  const onTap = useCallback((x: number) => {
    const side = tapSide(x, stageWidth, size);
    if (side === 0) playFocused();
    else moveTo(focus + side);
  }, [stageWidth, size, playFocused, moveTo, focus]);

  const pan = Gesture.Pan()
    .enabled(n > 1)
    .activeOffsetX([-10, 10])
    .failOffsetY([-14, 14])
    .onBegin(() => {
      start.value = position.value;
    })
    .onUpdate(e => {
      position.value = focusFromDrag(start.value, e.translationX, step, n);
    })
    .onEnd(e => {
      const target = settleFocus(position.value, e.velocityX, step, n);
      position.value = withSpring(target, { ...SETTLE, velocity: -e.velocityX / step });
      runOnJS(moveTo)(target);
    });
  const tap = Gesture.Tap()
    .maxDistance(10)
    .onEnd((e, success) => {
      if (success) runOnJS(onTap)(e.x);
    });

  if (n === 0) return null;
  const playingHere = !!centre && centre.id === currentId && isPlaying;

  return (
    <View style={styles.wrap}>
      <GestureDetector gesture={Gesture.Exclusive(pan, tap)}>
        <View
          style={[styles.stage, { width: stageWidth, height: height + 12 }]}
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel={`Recent songs. ${centre?.title ?? ''}${centre?.artist ? ` by ${centre.artist}` : ''}. Swipe to browse, double tap to play`}
          accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
          onAccessibilityAction={e => moveTo(focus + (e.nativeEvent.actionName === 'increment' ? 1 : -1))}
        >
          {songs.map((song, index) => (
            <Plate
              key={song.id}
              song={song}
              index={index}
              size={size}
              height={height}
              step={step}
              position={position}
              nowPlaying={song.id === currentId}
            />
          ))}
        </View>
      </GestureDetector>

      {/* The pill: shuffle, back, play / pause, forward. */}
      <View style={styles.pill}>
        <View style={styles.pillRim} pointerEvents="none" />
        <Tactile onPress={onShuffle} hitSlop={6} pressScale={0.88} accessibilityRole="button" accessibilityLabel="Shuffle everything" style={styles.pillButton}>
          <Ionicons name="shuffle" size={20} color={Signal.inkSoft} />
        </Tactile>
        <Tactile
          onPress={() => moveTo(focus - 1)}
          disabled={focus <= 0}
          hitSlop={6}
          pressScale={0.88}
          accessibilityRole="button"
          accessibilityLabel="Previous song in the row"
          style={[styles.pillButton, focus <= 0 && styles.dim]}
        >
          <Ionicons name="play-skip-back" size={22} color={Signal.ink} />
        </Tactile>
        <Tactile
          onPress={playFocused}
          pressScale={0.9}
          accessibilityRole="button"
          accessibilityLabel={playingHere ? 'Pause' : `Play ${centre?.title ?? ''}`}
          style={styles.playButton}
        >
          <Ionicons name={playingHere ? 'pause' : 'play'} size={24} color={Signal.waveInk} style={playingHere ? undefined : styles.playNudge} />
        </Tactile>
        <Tactile
          onPress={() => moveTo(focus + 1)}
          disabled={focus >= n - 1}
          hitSlop={6}
          pressScale={0.88}
          accessibilityRole="button"
          accessibilityLabel="Next song in the row"
          style={[styles.pillButton, focus >= n - 1 && styles.dim]}
        >
          <Ionicons name="play-skip-forward" size={22} color={Signal.ink} />
        </Tactile>
        <View style={styles.pillButton} pointerEvents="none">
          <Text style={styles.count}>{focus + 1}/{n}</Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { alignItems: 'center' },
  stage: { alignItems: 'center', justifyContent: 'center' },
  plate: {
    position: 'absolute',
    overflow: 'hidden',
    backgroundColor: 'rgba(24, 29, 32, 0.5)',
    paddingTop: 10,
    alignItems: 'center',
  },
  rim: { ...StyleSheet.absoluteFillObject, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.28)' },
  topLight: { position: 'absolute', top: 0, left: 22, right: 22, height: StyleSheet.hairlineWidth * 2, backgroundColor: 'rgba(255,255,255,0.5)' },
  art: { borderRadius: Radius.well + 2, overflow: 'hidden', backgroundColor: Signal.bgSubtle },
  playing: {
    position: 'absolute',
    right: 8,
    bottom: 8,
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Signal.wave,
  },
  label: { alignSelf: 'stretch', paddingHorizontal: 14, paddingTop: 9, alignItems: 'center' },
  title: { color: Signal.ink, fontSize: 15, fontWeight: '700' },
  artist: { color: 'rgba(244,241,234,0.62)', fontSize: 12, fontWeight: '400', marginTop: 1 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 14,
    height: 62,
    minWidth: 292,
    paddingHorizontal: 10,
    borderRadius: 31,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.10)',
  },
  pillRim: { ...StyleSheet.absoluteFillObject, borderRadius: 31, borderWidth: StyleSheet.hairlineWidth, borderColor: Glass.hairlineStrong },
  pillButton: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center' },
  playButton: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: Signal.wave },
  playNudge: { marginLeft: 2 },
  dim: { opacity: 0.35 },
  count: { color: Signal.inkMuted, fontSize: 12, fontWeight: '600', fontVariant: ['tabular-nums'] },
});

export default GlassDeck;
