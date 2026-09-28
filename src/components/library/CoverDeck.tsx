/**
 * The Library's hero: your recent songs as a fanned deck of sleeves.
 *
 *   - Tap the front sleeve: it plays.
 *   - Flick it either way: it flies off with your speed and tucks in at the
 *     back; the next one steps forward. It follows the finger and tilts as it
 *     goes, and a short drag springs home.
 *
 * Card order lives on the UI thread (`front`), so a flick never waits on a
 * React render and nothing flickers when the front card changes. Transforms
 * and opacity only.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
  SharedValue,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import Artwork from '../allegra/Artwork';
import { SwapText } from '../allegra/motion';
import { Motion, Signal } from '../../constants/allegraTheme';
import * as Haptics from '../../utils/haptics';
import { deckSlot } from './libraryShape';
import type { Song } from '../../types/song';

const VISIBLE = 4;
const FLING_SPRING = { stiffness: 200, damping: 26, mass: 1, overshootClamping: true } as const;
const HOME_SPRING = { stiffness: 260, damping: 20, mass: 1 } as const;

interface CoverDeckProps {
  songs: Song[];
  size: number;
  currentId?: string | null;
  onPlay: (song: Song) => void;
}

const Card: React.FC<{
  song: Song;
  index: number;
  n: number;
  size: number;
  front: SharedValue<number>;
  shift: SharedValue<number>;
  dragX: SharedValue<number>;
  playing: boolean;
}> = ({ song, index, n, size, front, shift, dragX, playing }) => {
  // The play button shows on the front sleeve only, fading as it leaves.
  const playStyle = useAnimatedStyle(() => {
    const slot = deckSlot(index, front.value, n);
    return { opacity: slot === 0 ? Math.max(0, 1 - Math.abs(dragX.value) / (size * 0.5)) * (1 - shift.value) : 0 };
  });
  const style = useAnimatedStyle(() => {
    const slot = deckSlot(index, front.value, n);
    // `shift` eases the whole deck forward one step after a flick.
    const depth = slot + shift.value;
    const isFront = slot === 0;
    const x = isFront ? dragX.value : 0;
    return {
      zIndex: n - slot,
      opacity: depth >= VISIBLE ? 0 : depth > VISIBLE - 1 ? VISIBLE - depth : 1 - depth * 0.12,
      transform: [
        // Each card behind steps right and up, smaller, leaning a little more.
        { translateX: x + depth * size * 0.13 },
        { translateY: -depth * size * 0.025 },
        { rotate: `${x / 22 + depth * 3.5}deg` },
        { scale: 1 - depth * 0.08 },
      ] as const,
    };
  });
  return (
    <Animated.View style={[styles.card, { width: size, height: size, borderRadius: size * 0.09 }, style]}>
      <Artwork uri={song.coverImageUri} title={song.title} artist={song.artist} size={size} priority="high" style={StyleSheet.absoluteFill} />
      <View style={[styles.edge, { borderRadius: size * 0.09 }]} pointerEvents="none" />
      <Animated.View style={[styles.play, playStyle]} pointerEvents="none">
        <Ionicons name={playing ? 'volume-medium' : 'play'} size={20} color={Signal.waveInk} style={playing ? undefined : styles.playNudge} />
      </Animated.View>
    </Animated.View>
  );
};

export const CoverDeck: React.FC<CoverDeckProps> = ({ songs, size, currentId, onPlay }) => {
  const n = songs.length;
  const reduce = useReducedMotion();
  const front = useSharedValue(0);
  const shift = useSharedValue(0);
  const dragX = useSharedValue(0);
  const [frontIndex, setFrontIndex] = useState(0);
  const [lastDir, setLastDir] = useState(1);

  // A different set of songs starts from the top.
  const signature = songs.map(s => s.id).join('|');
  useEffect(() => {
    front.value = 0;
    shift.value = 0;
    dragX.value = 0;
    setFrontIndex(0);
  }, [signature, front, shift, dragX]);

  const settled = useCallback((index: number, dir: number) => {
    setFrontIndex(index);
    setLastDir(dir);
    Haptics.selectionAsync().catch(() => {});
  }, []);

  const pan = Gesture.Pan()
    .enabled(n > 1)
    .activeOffsetX([-12, 12])
    .failOffsetY([-14, 14])
    .onUpdate(e => {
      dragX.value = e.translationX;
    })
    .onEnd(e => {
      // Decide on where the flick is heading, not where the finger let go.
      const landing = e.translationX + e.velocityX * 0.12;
      if (Math.abs(landing) < size * 0.42) {
        dragX.value = withSpring(0, { ...HOME_SPRING, velocity: e.velocityX });
        return;
      }
      const dir = landing > 0 ? 1 : -1;
      const out = dir * size * 1.6;
      const done = (finished?: boolean) => {
        'worklet';
        if (!finished) return;
        // Same frame: the flung card is now the back card, drag resets, and
        // the deck eases forward one step.
        const next = (front.value + 1) % n;
        front.value = next;
        dragX.value = 0;
        shift.value = 1;
        shift.value = withSpring(0, HOME_SPRING);
        runOnJS(settled)(next, dir);
      };
      dragX.value = reduce
        ? withTiming(out, { duration: Motion.duration.fast }, done)
        : withSpring(out, { ...FLING_SPRING, velocity: e.velocityX }, done);
    });

  const tap = Gesture.Tap()
    .maxDistance(10)
    .onEnd((_e, success) => {
      if (success) runOnJS(playFront)(front.value);
    });

  function playFront(index: number) {
    const song = songs[index];
    if (!song) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onPlay(song);
  }

  if (n === 0) return null;
  const current = songs[frontIndex] ?? songs[0];

  return (
    <View style={styles.wrap}>
      <GestureDetector gesture={Gesture.Exclusive(pan, tap)}>
        <View
          style={[styles.stage, { width: size + size * 0.13 * (VISIBLE - 1), height: size + 16 }]}
          accessible
          accessibilityRole="button"
          accessibilityLabel={`Play ${current.title}${current.artist ? ` by ${current.artist}` : ''}. Swipe for the next song`}
        >
          {songs.map((song, index) => (
            <Card
              key={song.id}
              song={song}
              index={index}
              n={n}
              size={size}
              front={front}
              shift={shift}
              dragX={dragX}
              playing={song.id === currentId}
            />
          ))}
        </View>
      </GestureDetector>
      <View style={styles.caption}>
        <SwapText style={styles.title} numberOfLines={1} direction={-lastDir}>{current.title}</SwapText>
        {current.artist ? <SwapText style={styles.artist} numberOfLines={1} direction={-lastDir}>{current.artist}</SwapText> : null}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { alignItems: 'center' },
  stage: { alignItems: 'flex-start', justifyContent: 'flex-end' },
  card: {
    position: 'absolute',
    left: 0,
    bottom: 0,
    overflow: 'hidden',
    backgroundColor: Signal.bgSubtle,
    transformOrigin: 'center',
  },
  edge: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.18)',
  },
  play: {
    position: 'absolute',
    right: 12,
    bottom: 12,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Signal.wave,
  },
  playNudge: { marginLeft: 3 },
  caption: { alignSelf: 'stretch', alignItems: 'center', marginTop: 18, minHeight: 48, paddingHorizontal: 24 },
  title: { color: Signal.ink, fontSize: 20, fontWeight: '700' },
  artist: { color: Signal.inkMuted, fontSize: 14, marginTop: 2 },
});

export default CoverDeck;
