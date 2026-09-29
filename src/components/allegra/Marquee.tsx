/**
 * A title that fits stands still; one that doesn't glides through in a loop.
 *
 * It holds for a beat, scrolls the whole title through once at a steady pace,
 * rests a couple of seconds with the start of the title showing, and goes
 * again. The rest position is the resting frame of the loop, so the jump back
 * is invisible. Only `translateX` moves, on the UI thread, and it stops while
 * `active` is false (screen not focused). Reduce Motion gets a plain ellipsis.
 *
 * `text` restarts it, so a new song starts from the beginning.
 */
import React, { useEffect, useState } from 'react';
import { StyleProp, StyleSheet, Text, TextStyle, View, ViewStyle } from 'react-native';
import MaskedView from '@react-native-masked-view/masked-view';
import { LinearGradient } from 'expo-linear-gradient';
import { useSwapAnimations } from './motion';
import { MARQUEE_GAP, MARQUEE_REST_MS, MARQUEE_SPEED, MARQUEE_START_MS, marqueeLoop } from './marqueeMath';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

interface MarqueeProps {
  text: string;
  style?: StyleProp<TextStyle>;
  containerStyle?: StyleProp<ViewStyle>;
  /** False while the screen isn't visible: the title rests. */
  active?: boolean;
  speed?: number;
  restMs?: number;
  startMs?: number;
  gap?: number;
  /** Width of the soft fade at the right edge, in points. */
  fade?: number;
}

export const Marquee: React.FC<MarqueeProps> = ({
  text,
  style,
  containerStyle,
  active = true,
  speed = MARQUEE_SPEED,
  restMs = MARQUEE_REST_MS,
  startMs = MARQUEE_START_MS,
  gap = MARQUEE_GAP,
  fade = 18,
}) => {
  const reduce = useReducedMotion();
  const [boxW, setBoxW] = useState(0);
  const [textW, setTextW] = useState(0);
  const x = useSharedValue(0);

  const { distance, duration } = marqueeLoop(textW, boxW, gap, speed);
  const overflow = distance > 0;
  const run = overflow && active && !reduce;

  useEffect(() => {
    cancelAnimation(x);
    x.value = 0;
    if (!run) return undefined;
    x.value = withDelay(
      startMs,
      withRepeat(
        withSequence(
          withTiming(-distance, { duration, easing: Easing.linear }),
          // The copy has landed exactly where the title began; rest, then reset unseen.
          withDelay(restMs, withTiming(0, { duration: 0 })),
        ),
        -1,
      ),
    );
    return () => cancelAnimation(x);
  }, [run, distance, duration, restMs, startMs, text, x]);

  const track = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  const copyW = Math.ceil(textW) + 2;

  return (
    <View style={[styles.box, containerStyle]} onLayout={e => setBoxW(e.nativeEvent.layout.width)}>
      {/* Natural width of the title, measured off-screen. */}
      <View style={styles.probe} pointerEvents="none">
        <Text style={[style, styles.probeText]} numberOfLines={1} onLayout={e => setTextW(e.nativeEvent.layout.width)}>{text}</Text>
      </View>
      {overflow && !reduce ? (
        <MaskedView
          style={styles.fill}
          maskElement={(
            <LinearGradient
              colors={['#000', '#000', 'transparent']}
              locations={[0, Math.max(0, 1 - fade / Math.max(boxW, 1)), 1]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={StyleSheet.absoluteFill}
            />
          )}
        >
          <Animated.View style={[styles.track, track]}>
            <Text style={[style, { width: copyW }]} numberOfLines={1} ellipsizeMode="clip">{text}</Text>
            <View style={{ width: gap }} />
            <Text style={[style, { width: copyW }]} numberOfLines={1} ellipsizeMode="clip">{text}</Text>
          </Animated.View>
        </MaskedView>
      ) : (
        <Text style={style} numberOfLines={1}>{text}</Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  box: { overflow: 'hidden', alignSelf: 'stretch' },
  fill: { alignSelf: 'stretch' },
  swap: { alignSelf: 'stretch' },
  track: { flexDirection: 'row', alignItems: 'center' },
  probe: { position: 'absolute', left: 0, top: 0, width: 4000, opacity: 0 },
  probeText: { alignSelf: 'flex-start' },
});

/**
 * A line that changes with the song (title, artist): it travels with the skip
 * like SwapText, and when it is too long for its space it scrolls (Marquee).
 * Keyed by the text, so each new song starts its title from the beginning.
 */
export const SwapMarquee: React.FC<Omit<MarqueeProps, 'text'> & { children: string; direction?: number }> = ({ children, direction = 0, ...rest }) => {
  const { entering, exiting } = useSwapAnimations(direction);
  return (
    <Animated.View key={children} entering={entering} exiting={exiting} style={styles.swap}>
      <Marquee text={children} {...rest} />
    </Animated.View>
  );
};

export default React.memo(Marquee);
