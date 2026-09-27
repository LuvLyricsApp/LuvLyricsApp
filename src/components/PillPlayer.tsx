/**
 * The mini player as a small floating pill (Echo Music's look).
 *
 *   ( ◉ disc )  Title            ⏮  ✿  ⏭
 *               Artist
 *
 * - The cover sits in a round disc that turns slowly while music plays, with
 *   the song's progress drawn as a ring around it.
 * - The pill wears a calm tone of the cover and cross-fades to the next
 *   song's tone (colour only — nothing else moves).
 * - Play/pause sits on a white scalloped "cookie" shape.
 * - Tap or swipe up opens Now Playing; swipe sideways to skip.
 *
 * Everything that moves is transform / opacity / colour, so it stays smooth
 * on old phones. The disc does not spin there (performanceTier).
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Dimensions, Pressable, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  cancelAnimation,
  Easing,
  interpolateColor,
  runOnJS,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Path } from 'react-native-svg';
import * as Haptics from '../utils/haptics';
import Artwork from './allegra/Artwork';
import { MorphIcon, NudgeIcon, SwapText, Tactile } from './allegra/motion';
import { useArtworkPalette } from './allegra/useArtworkPalette';
import { pillTint } from './allegra/palette';
import { Motion } from '../constants/allegraTheme';
import { positionSV, durationSV } from '../playback/positionBus';
import { pillBarInset } from '../navigation/tabs';
import { isLowEndDevice } from '../utils/performanceTier';
import GlowBackground from './player/GlowBackground';
import { useGlowColors } from './player/useGlowColors';
import { useSettingsStore } from '../store/settingsStore';

export const PILL_PLAYER_HEIGHT = 60;
const DISC = 46;
const RING = DISC + 8;
const RING_STROKE = 2.5;
const RING_R = (RING - RING_STROKE) / 2;
const RING_C = 2 * Math.PI * RING_R;
const COOKIE = 44;
const SPIN_MS = 14000;
const SPIN = !isLowEndDevice();

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/** A soft nine-lobed scallop (Material's "cookie"), as an SVG path. */
const cookiePath = (size: number, lobes = 9, depth = 0.055): string => {
  const c = size / 2;
  const r = c * (1 - depth);
  const steps = 144;
  let d = '';
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    const rr = r * (1 + depth * Math.cos(lobes * a));
    d += `${i === 0 ? 'M' : 'L'}${(c + rr * Math.cos(a)).toFixed(2)} ${(c + rr * Math.sin(a)).toFixed(2)} `;
  }
  return `${d}Z`;
};
const COOKIE_PATH = cookiePath(COOKIE);

interface PillPlayerProps {
  title: string;
  artist?: string;
  coverImageUri?: string;
  playing: boolean;
  /** Distance from the screen bottom (clears the tab bar). */
  bottom: number;
  onOpen: () => void;
  onTogglePlay: () => void;
  onNext: () => void;
  onPrevious: () => void;
}

const tick = () => { Haptics.selectionAsync().catch(() => {}); };

const PillPlayer: React.FC<PillPlayerProps> = ({
  title, artist, coverImageUri, playing, bottom, onOpen, onTogglePlay, onNext, onPrevious,
}) => {
  const side = pillBarInset(Dimensions.get('window').width) + 14;

  // ── Colour: cross-fade from the last song's tone to this one's ────────────
  const palette = useArtworkPalette(coverImageUri);
  const tint = useMemo(() => pillTint(palette.primary), [palette.primary]);
  const fromColor = useSharedValue(tint);
  const toColor = useSharedValue(tint);
  const mix = useSharedValue(1);
  useEffect(() => {
    if (toColor.value === tint) return;
    fromColor.value = toColor.value;
    toColor.value = tint;
    mix.value = 0;
    mix.value = withTiming(1, { duration: Motion.duration.cinematic, easing: Motion.ease.standard });
  }, [tint, fromColor, toColor, mix]);
  const shellColor = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(mix.value, [0, 1], [fromColor.value, toColor.value]),
  }));

  // Settings → Appearance → Mini player background: Echo's "Glow animated"
  // (two drifting glows of the cover's palette) or the calm cover tint.
  const glow = useSettingsStore(s => s.miniPlayerBackground) !== 'tint';
  const glowColors = useGlowColors(glow ? coverImageUri : null);

  // ── Disc: turns slowly while playing, holds its angle when paused ─────────
  const spin = useSharedValue(0);
  useEffect(() => {
    if (!SPIN) return;
    if (playing) {
      const from = spin.value % 360;
      spin.value = from;
      spin.value = withRepeat(withTiming(from + 360, { duration: SPIN_MS, easing: Easing.linear }), -1, false);
    } else {
      cancelAnimation(spin);
    }
  }, [playing, spin]);
  const discStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.value}deg` }] }));

  // ── Progress ring ─────────────────────────────────────────────────────────
  const ringProps = useAnimatedProps(() => {
    const d = durationSV.value;
    const p = d > 0 ? Math.max(0, Math.min(1, positionSV.value / d)) : 0;
    return { strokeDashoffset: RING_C * (1 - p) };
  });

  // ── Arrival + drag ────────────────────────────────────────────────────────
  const enter = useSharedValue(0);
  useEffect(() => {
    enter.value = withSpring(1, Motion.spring.sheet);
  }, [enter]);
  const dragX = useSharedValue(0);
  const dragY = useSharedValue(0);
  const shellMotion = useAnimatedStyle(() => {
    const y = (1 - enter.value) * 24 + Math.min(0, dragY.value) * 0.35;
    const x = dragX.value * 0.3;
    return { opacity: enter.value, transform: [{ translateY: y }, { translateX: x }] as const };
  });

  const [backNudge, setBackNudge] = useState(0);
  const [nextNudge, setNextNudge] = useState(0);
  const next = useCallback(() => { tick(); setNextNudge(n => n + 1); onNext(); }, [onNext]);
  const previous = useCallback(() => { tick(); setBackNudge(n => n + 1); onPrevious(); }, [onPrevious]);

  const pan = Gesture.Pan()
    .activeOffsetX([-14, 14])
    .activeOffsetY([-14, 14])
    .onUpdate(e => {
      dragX.value = e.translationX;
      dragY.value = e.translationY;
    })
    .onEnd(e => {
      const horizontal = Math.abs(e.translationX) > Math.abs(e.translationY);
      if (horizontal && (e.translationX < -60 || e.velocityX < -600)) runOnJS(next)();
      else if (horizontal && (e.translationX > 60 || e.velocityX > 600)) runOnJS(previous)();
      else if (!horizontal && (e.translationY < -36 || e.velocityY < -500)) runOnJS(onOpen)();
      dragX.value = withSpring(0, Motion.spring.tactile);
      dragY.value = withSpring(0, Motion.spring.tactile);
    });

  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={[styles.shell, { left: side, right: side, bottom }, shellColor, shellMotion]}>
        {glow ? (
          <View style={[StyleSheet.absoluteFill, styles.glowClip]} pointerEvents="none">
            <GlowBackground colors={glowColors} variant="mini" />
          </View>
        ) : null}
        <Pressable
          onPress={onOpen}
          style={styles.row}
          accessibilityRole="button"
          accessibilityLabel={`Now playing: ${title}. Open player`}
        >
          <View style={styles.discWrap}>
            <Svg width={RING} height={RING} style={StyleSheet.absoluteFill}>
              <Circle cx={RING / 2} cy={RING / 2} r={RING_R} stroke="rgba(0,0,0,0.35)" strokeWidth={RING_STROKE} fill="none" />
              <AnimatedCircle
                cx={RING / 2}
                cy={RING / 2}
                r={RING_R}
                stroke="rgba(255,255,255,0.92)"
                strokeWidth={RING_STROKE}
                strokeLinecap="round"
                fill="none"
                strokeDasharray={`${RING_C} ${RING_C}`}
                animatedProps={ringProps}
                transform={`rotate(-90 ${RING / 2} ${RING / 2})`}
              />
            </Svg>
            <Animated.View style={[styles.disc, discStyle]}>
              <Artwork uri={coverImageUri} title={title} artist={artist} size={DISC} priority="high" style={styles.discArt} />
              <View style={styles.spindle} />
            </Animated.View>
          </View>

          <View style={styles.meta}>
            <SwapText style={styles.title} numberOfLines={1}>{title}</SwapText>
            {artist ? <Text style={styles.artist} numberOfLines={1}>{artist}</Text> : null}
          </View>

          <Tactile onPress={previous} hitSlop={8} pressScale={0.85} accessibilityRole="button" accessibilityLabel="Previous" style={styles.skip}>
            <NudgeIcon name="play-skip-back" size={20} color="#fff" direction={-1} trigger={backNudge} />
          </Tactile>

          <Tactile
            onPress={() => { tick(); onTogglePlay(); }}
            pressScale={0.88}
            accessibilityRole="button"
            accessibilityLabel={playing ? 'Pause' : 'Play'}
            style={styles.cookie}
          >
            <Svg width={COOKIE} height={COOKIE} style={StyleSheet.absoluteFill}>
              <Path d={COOKIE_PATH} fill="#ffffff" />
            </Svg>
            <MorphIcon on={playing} onIcon="pause" offIcon="play" size={22} color="#15151a" offStyle={styles.playNudge} />
          </Tactile>

          <Tactile onPress={next} hitSlop={8} pressScale={0.85} accessibilityRole="button" accessibilityLabel="Next" style={styles.skip}>
            <NudgeIcon name="play-skip-forward" size={20} color="#fff" direction={1} trigger={nextNudge} />
          </Tactile>
        </Pressable>
      </Animated.View>
    </GestureDetector>
  );
};

const styles = StyleSheet.create({
  shell: {
    position: 'absolute',
    height: PILL_PLAYER_HEIGHT,
    borderRadius: PILL_PLAYER_HEIGHT / 2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.14)',
    zIndex: 10,
  },
  glowClip: { borderRadius: PILL_PLAYER_HEIGHT / 2, overflow: 'hidden' },
  row: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: (PILL_PLAYER_HEIGHT - RING) / 2,
    paddingRight: 8,
  },
  discWrap: { width: RING, height: RING, alignItems: 'center', justifyContent: 'center' },
  disc: { width: DISC, height: DISC, borderRadius: DISC / 2, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  discArt: { position: 'absolute', width: DISC, height: DISC },
  // The record's centre hole.
  spindle: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: 'rgba(0,0,0,0.55)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)' },
  meta: { flex: 1, marginLeft: 10, marginRight: 4, justifyContent: 'center' },
  title: { color: '#fff', fontSize: 15, fontWeight: '600' },
  artist: { color: 'rgba(255,255,255,0.68)', fontSize: 13, marginTop: 1 },
  skip: { width: 34, height: 40, alignItems: 'center', justifyContent: 'center' },
  cookie: { width: COOKIE, height: COOKIE, alignItems: 'center', justifyContent: 'center', marginHorizontal: 2 },
  playNudge: { marginLeft: 2 },
});

export default React.memo(PillPlayer);
