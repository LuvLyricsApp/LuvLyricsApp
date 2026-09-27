/**
 * The Apple Music artwork stage.
 *
 *   open        — the cover rises into place (spring, from 0.9 scale / +24px)
 *   song change — the old cover slides away and the new one slides in from the
 *                 direction of travel: next comes from the right, previous from
 *                 the left. Springs, so rapid skipping retargets smoothly
 *                 instead of queueing animations.
 *   pause       — the cover settles to 82% and springs back on play.
 *
 * Transform and opacity only. Reduce Motion collapses every move to a fade.
 */
import React, { useEffect, useRef } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import Animated, {
  EntryAnimationsValues,
  ExitAnimationsValues,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Glass, Motion, Radius, Signal } from '../constants/allegraTheme';
import { usePlayerStore } from '../store/playerStore';
import Artwork from './allegra/Artwork';

interface AppleArtworkStageProps {
  uri?: string;
  title: string;
  artist?: string;
  /** Changes on every track change — drives the slide transition. */
  songKey: string;
  size: number;
  playing: boolean;
  onLongPress?: () => void;
}

const PAUSED_SCALE = 0.82;

const slideIn = (dir: number, distance: number) => (_v: EntryAnimationsValues) => {
  'worklet';
  return {
    initialValues: { opacity: 0, transform: [{ translateX: dir * distance }, { scale: 0.92 }] },
    animations: {
      opacity: withTiming(1, { duration: Motion.duration.base, easing: Motion.ease.decelerate }),
      transform: [{ translateX: withSpring(0, Motion.spring.hero) }, { scale: withSpring(1, Motion.spring.hero) }],
    },
  };
};

const slideOut = (dir: number, distance: number) => (_v: ExitAnimationsValues) => {
  'worklet';
  const t = { duration: Motion.duration.base, easing: Motion.ease.accelerate };
  return {
    initialValues: { opacity: 1, transform: [{ translateX: 0 }, { scale: 1 }] },
    animations: {
      opacity: withTiming(0, t),
      transform: [{ translateX: withTiming(-dir * distance, t) }, { scale: withTiming(0.92, t) }],
    },
  };
};

const riseIn = (_v: EntryAnimationsValues) => {
  'worklet';
  return {
    initialValues: { opacity: 0, transform: [{ translateY: 24 }, { scale: 0.9 }] },
    animations: {
      opacity: withTiming(1, { duration: Motion.duration.slow, easing: Motion.ease.decelerate }),
      transform: [{ translateY: withSpring(0, Motion.spring.hero) }, { scale: withSpring(1, Motion.spring.hero) }],
    },
  };
};

const fade = (to: number) => (_v: EntryAnimationsValues | ExitAnimationsValues) => {
  'worklet';
  return {
    initialValues: { opacity: 1 - to },
    animations: { opacity: withTiming(to, { duration: Motion.duration.fast }) },
  };
};

export const AppleArtworkStage: React.FC<AppleArtworkStageProps> = ({ uri, title, artist, songKey, size, playing, onLongPress }) => {
  const reduceMotion = useReducedMotion();
  const scale = useSharedValue(playing ? 1 : PAUSED_SCALE);

  // Direction of travel from the queue position: +1 next, -1 previous.
  const queueIndex = usePlayerStore(s => s.currentQueueIndex);
  const lastIndex = useRef(queueIndex);
  const direction = useRef(1);
  const firstRender = useRef(true);
  if (queueIndex !== lastIndex.current) {
    direction.current = queueIndex < lastIndex.current && lastIndex.current - queueIndex === 1 ? -1 : 1;
    lastIndex.current = queueIndex;
  }

  useEffect(() => {
    const target = playing ? 1 : PAUSED_SCALE;
    scale.value = reduceMotion
      ? withTiming(target, { duration: Motion.duration.instant })
      : withSpring(target, Motion.spring.hero);
  }, [playing, reduceMotion, scale]);

  useEffect(() => {
    firstRender.current = false;
  }, []);

  const scaleStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const distance = size * 0.45;
  const dir = direction.current;
  const entering = reduceMotion ? fade(1) : firstRender.current ? riseIn : slideIn(dir, distance);
  const exiting = reduceMotion ? fade(0) : slideOut(dir, distance);

  return (
    <Pressable onLongPress={onLongPress} accessibilityRole="image" accessibilityLabel={`Artwork for ${title}`}>
      <Animated.View style={[{ width: size, height: size }, scaleStyle]}>
        <Animated.View key={songKey} entering={entering} exiting={exiting} style={[styles.frame, StyleSheet.absoluteFill]}>
          <Artwork uri={uri} title={title} artist={artist} size={size} priority="high" transition={Motion.duration.slow} style={StyleSheet.absoluteFill} />
        </Animated.View>
      </Animated.View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  frame: {
    borderRadius: Radius.art,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Glass.hairline,
    backgroundColor: Signal.bgSubtle,
  },
});

export default React.memo(AppleArtworkStage);
