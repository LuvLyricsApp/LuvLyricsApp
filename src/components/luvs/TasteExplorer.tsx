/**
 * Luvs' taste map: lanes of taste side by side (swipe across), each a stack
 * that goes deeper (swipe up). The camera — which lane, how deep — lives on
 * the UI thread (camX, camZ); every card works out its own place from it, so
 * a swipe never waits on React and nothing flickers when the song changes.
 *
 *   across  the lanes turn like a carousel: the neighbours peek at the edges,
 *           a little smaller and turned away
 *   deeper  the next songs wait stacked behind the card; swipe up and the card
 *           lifts away while the one behind grows into place. Swipe down to
 *           bring the last one back.
 *
 * A drag locks to the axis it starts on. Release decides by where the flick is
 * heading (momentum projection) and springs there with the finger's speed;
 * past the ends it rubber-bands. The song is committed on release, so audio
 * switches under the animation. Transforms and opacity only.
 */
import React, { useEffect, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  SharedValue,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import type { UnifiedSong } from '../../types/song';

export interface ExplorerLane {
  id: string;
  songs: UnifiedSong[];
}

interface TasteExplorerProps {
  lanes: ExplorerLane[];
  laneIndex: number;
  depths: number[];
  width: number;
  height: number;
  /** A card's content; `active` is the one playing. */
  renderCard: (song: UnifiedSong, active: boolean) => React.ReactNode;
  /** The listener landed somewhere new (called on release, before the spring settles). */
  onCommit: (laneIndex: number, depth: number) => void;
  onTap: () => void;
  /** Fired once, when the first drag gets going (to retire a hint). */
  onFirstMove?: () => void;
  /** The camera's lane position, shared with the lane rail so it slides along. */
  camX?: SharedValue<number>;
}

const GAP = 14;
const LIFT = 1.08;
const SPRING = { stiffness: 230, damping: 25, mass: 1 } as const;

const rubber = (over: number, dimension: number): number => {
  'worklet';
  const a = Math.abs(over);
  return Math.sign(over) * ((a * dimension * 0.55) / (dimension + 0.55 * a)) / dimension;
};

interface Placed {
  key: string;
  song: UnifiedSong;
  lane: number;
  depth: number;
}

const Card: React.FC<{
  placed: Placed;
  width: number;
  height: number;
  camX: SharedValue<number>;
  camZ: SharedValue<number>;
  curLane: SharedValue<number>;
  laneDepths: SharedValue<number[]>;
  children: React.ReactNode;
}> = ({ placed, width, height, camX, camZ, curLane, laneDepths, children }) => {
  const { lane, depth } = placed;
  const style = useAnimatedStyle(() => {
    const rx = lane - camX.value;
    const z = lane === curLane.value ? depth - camZ.value : depth - (laneDepths.value[lane] ?? 0);
    const side = Math.min(1, Math.abs(rx));
    let ty: number;
    let scale: number;
    let opacity: number;
    if (z < 0) {
      // Lifting away (or the previous one, parked above).
      // Gone by the time it's parked, so it never shows over the header.
      ty = z * height * LIFT;
      scale = 1 + z * 0.04;
      opacity = Math.max(0, 1 + z * 1.15);
    } else {
      // Waiting behind: peeking over the top edge, smaller and dimmer.
      ty = -z * 26;
      scale = 1 - z * 0.07;
      opacity = z <= 1 ? 1 - z * 0.3 : Math.max(0, 0.7 - (z - 1) * 0.7);
    }
    scale *= 1 - 0.1 * side;
    opacity *= 1 - 0.4 * side;
    const far = Math.abs(rx) > 1.6 || z > 2.2 || z <= -0.9;
    return {
      opacity: far ? 0 : opacity,
      zIndex: z < 0 ? 300 : Math.round(200 - side * 50 - z * 20),
      transform: [
        { perspective: 1100 },
        { translateX: rx * (width + GAP) },
        { translateY: ty },
        { rotateY: `${-rx * 16}deg` },
        { scale },
      ] as const,
    };
  });
  return (
    <Animated.View style={[styles.card, { width, height }, style]} pointerEvents="none">
      {children}
    </Animated.View>
  );
};

export const TasteExplorer: React.FC<TasteExplorerProps> = ({
  lanes, laneIndex, depths, width, height, renderCard, onCommit, onTap, onFirstMove, camX: sharedCamX,
}) => {
  const reduce = useReducedMotion();
  const ownCamX = useSharedValue(laneIndex);
  const camX = sharedCamX ?? ownCamX;
  const camZ = useSharedValue(depths[laneIndex] ?? 0);
  const curLane = useSharedValue(laneIndex);
  const laneDepths = useSharedValue<number[]>(depths);
  const laneLens = useSharedValue<number[]>(lanes.map(l => l.songs.length));
  const axis = useSharedValue(0);
  const startX = useSharedValue(0);
  const startZ = useSharedValue(0);
  const moved = useSharedValue(false);
  // Where the last release landed (the camera may still be springing there).
  const committedLane = useSharedValue(laneIndex);
  const committedDepth = useSharedValue(depths[laneIndex] ?? 0);

  // Lanes grow while you browse; the camera needs their lengths for its bounds.
  useEffect(() => {
    laneLens.value = lanes.map(l => l.songs.length);
  }, [lanes, laneLens]);

  // The screen can place the camera too (restoring a position, a reload).
  // Our own commits echo back as props and match; anything else moves the camera.
  useEffect(() => {
    const depth = depths[laneIndex] ?? 0;
    if (committedLane.value !== laneIndex || committedDepth.value !== depth) {
      committedLane.value = laneIndex;
      committedDepth.value = depth;
      curLane.value = laneIndex;
      // A lane picked on the rail glides over rather than cutting.
      camX.value = reduce ? laneIndex : withSpring(laneIndex, SPRING);
      camZ.value = depth;
    }
    laneDepths.value = depths;
  }, [laneIndex, depths, camX, camZ, curLane, laneDepths, committedLane, committedDepth, reduce]);

  const placed = useMemo(() => {
    const out: Placed[] = [];
    const add = (lane: number, depth: number) => {
      const song = lanes[lane]?.songs[depth];
      if (song) out.push({ key: `${lanes[lane].id}:${depth}:${song.id}`, song, lane, depth });
    };
    const d = depths[laneIndex] ?? 0;
    for (let z = d - 1; z <= d + 2; z++) add(laneIndex, z);
    for (const side of [laneIndex - 1, laneIndex + 1]) {
      const sd = depths[side] ?? 0;
      add(side, sd);
      add(side, sd + 1);
    }
    return out;
  }, [lanes, laneIndex, depths]);

  const spring = (target: number, velocity: number) => {
    'worklet';
    return reduce ? withTiming(target, { duration: 220 }) : withSpring(target, { ...SPRING, velocity });
  };

  const pan = Gesture.Pan()
    .minDistance(8)
    .onStart(() => {
      axis.value = 0;
      startX.value = camX.value;
      startZ.value = camZ.value;
    })
    .onUpdate(e => {
      if (axis.value === 0) {
        if (Math.abs(e.translationX) > 10 && Math.abs(e.translationX) > Math.abs(e.translationY)) axis.value = 1;
        else if (Math.abs(e.translationY) > 10) axis.value = 2;
        else return;
        if (!moved.value && onFirstMove) {
          moved.value = true;
          runOnJS(onFirstMove)();
        }
      }
      if (axis.value === 1) {
        const n = laneLens.value.length;
        const raw = startX.value - e.translationX / (width + GAP);
        camX.value = raw < 0 ? rubber(raw, 1) : raw > n - 1 ? n - 1 + rubber(raw - (n - 1), 1) : raw;
      } else {
        const len = laneLens.value[curLane.value] ?? 0;
        const raw = startZ.value - e.translationY / (height * LIFT);
        camZ.value = raw < 0 ? rubber(raw, 1) : raw > len - 1 ? Math.max(0, len - 1) + rubber(raw - Math.max(0, len - 1), 1) : raw;
      }
    })
    .onEnd(e => {
      if (axis.value === 1) {
        const n = laneLens.value.length;
        const v = -e.velocityX / (width + GAP);
        const from = Math.round(startX.value);
        const heading = camX.value + v * 0.22;
        const target = Math.max(0, Math.min(n - 1, Math.max(from - 1, Math.min(from + 1, Math.round(heading)))));
        if (target !== curLane.value) {
          const next = [...laneDepths.value];
          next[curLane.value] = Math.round(camZ.value);
          laneDepths.value = next;
          curLane.value = target;
          camZ.value = next[target] ?? 0;
          committedLane.value = target;
          committedDepth.value = next[target] ?? 0;
          runOnJS(onCommit)(target, next[target] ?? 0);
        }
        camX.value = spring(target, v);
      } else if (axis.value === 2) {
        const len = laneLens.value[curLane.value] ?? 0;
        const v = -e.velocityY / (height * LIFT);
        const from = Math.round(startZ.value);
        const heading = camZ.value + v * 0.25;
        const target = Math.max(0, Math.min(Math.max(0, len - 1), Math.max(from - 1, Math.min(from + 1, Math.round(heading)))));
        if (target !== from) {
          committedLane.value = curLane.value;
          committedDepth.value = target;
          runOnJS(onCommit)(curLane.value, target);
        }
        camZ.value = spring(target, v);
      }
      axis.value = 0;
    });

  const tap = Gesture.Tap().maxDistance(10).onEnd((_e, ok) => { if (ok) runOnJS(onTap)(); });

  const active = lanes[laneIndex]?.songs[depths[laneIndex] ?? 0]?.id;
  return (
    <GestureDetector gesture={Gesture.Exclusive(pan, tap)}>
      <View style={[styles.stage, { width, height }]} collapsable={false}>
        {placed.map(p => (
          <Card
            key={p.key}
            placed={p}
            width={width}
            height={height}
            camX={camX}
            camZ={camZ}
            curLane={curLane}
            laneDepths={laneDepths}
          >
            {renderCard(p.song, p.lane === laneIndex && p.song.id === active)}
          </Card>
        ))}
      </View>
    </GestureDetector>
  );
};

const styles = StyleSheet.create({
  stage: { alignSelf: 'center', overflow: 'visible' },
  card: { position: 'absolute', left: 0, top: 0, borderRadius: 30, overflow: 'hidden', backfaceVisibility: 'hidden' },
});

export default TasteExplorer;
