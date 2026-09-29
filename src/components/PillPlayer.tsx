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
import { Dimensions, Pressable, StyleSheet, View } from 'react-native';
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
import { MorphIcon, NudgeIcon, Tactile } from './allegra/motion';
import { SwapMarquee } from './allegra/Marquee';
import { useArtworkPalette } from './allegra/useArtworkPalette';
import { pillTint } from './allegra/palette';
import { Motion } from '../constants/allegraTheme';
import { positionSV, durationSV } from '../playback/positionBus';
import { isLowEndDevice } from '../utils/performanceTier';
import GlowBackground from './player/GlowBackground';
import LiquidGlass, { GlassShadow } from './allegra/LiquidGlass';
import { useGlowColors } from './player/useGlowColors';
import { useSettingsStore } from '../store/settingsStore';
import { PILL_PLAYER_HEIGHT, pillPlayerInset } from '../navigation/tabs';
import { playerSheetProgress } from '../navigation/sheetProgress';
import { lastSongDirection } from '../store/playerStore';

export { PILL_PLAYER_HEIGHT };

const DISC = 40;
const RING = DISC + 8;
const RING_STROKE = 2.5;
const RING_R = (RING - RING_STROKE) / 2;
const RING_C = 2 * Math.PI * RING_R;
const COOKIE = 40;
/** The artwork on the liquid-glass pill: a small rounded square, as in Apple Music. */
const GLASS_ART = 40;
const SPIN_MS = 14000;
const SPIN = !isLowEndDevice();

/** How far the pill can be pulled, in points, however far the finger goes. */
const PILL_GIVE_UP = 14;
const PILL_GIVE_DOWN = 8;
const PILL_GIVE_SIDE = 18;
/** Underdamped on purpose: the pill overshoots its rest once and settles. */
const PILL_BOUNCE = { stiffness: 520, damping: 16, mass: 0.7 } as const;
/** Rubber band that approaches `limit` asymptotically. */
const pillGive = (drag: number, limit: number): number => {
  'worklet';
  const a = Math.abs(drag);
  return Math.sign(drag) * ((a * limit) / (limit + a));
};

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
  /** The player sheet is up (or on its way): the pill hands over to it and takes no touches. */
  sheetUp?: boolean;
  /** `velocity`: upward swipe speed in px/s, carried into the player sheet. */
  onOpen: (velocity?: number) => void;
  onTogglePlay: () => void;
  onNext: () => void;
  onPrevious: () => void;
}

const tick = () => { Haptics.selectionAsync().catch(() => {}); };

const PillPlayer: React.FC<PillPlayerProps> = ({
  title, artist, coverImageUri, playing, bottom, sheetUp = false, onOpen, onTogglePlay, onNext, onPrevious,
}) => {
  const side = pillPlayerInset(Dimensions.get('window').width);
  // Read at render: when the title changes this is the way the skip went.
  const songDirection = lastSongDirection();

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
  // Settings → Appearance → Mini player background: Echo's "Glow animated"
  // (two drifting glows of the cover's palette), the calm cover tint, Apple-style
  // liquid glass, or plain black.
  const background = useSettingsStore(s => s.miniPlayerBackground);
  const glow = background === 'glow';
  const glass = background === 'glass';
  const glowColors = useGlowColors(glow ? coverImageUri : null);
  const shellColor = useAnimatedStyle(() => ({
    backgroundColor: background === 'glass'
      ? 'rgba(0,0,0,0)'
      : background === 'black'
        ? '#000000'
        : interpolateColor(mix.value, [0, 1], [fromColor.value, toColor.value]),
  }), [background]);

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
  // Where the pill shows under the finger (already rubber-banded).
  const dragX = useSharedValue(0);
  const dragY = useSharedValue(0);
  // Hand-over with the player sheet (Echo Music's): the pill rides the sheet's
  // top edge and fades over the first quarter of the travel, before the player
  // itself fades in; closing brings it back the same way, landing where it rests.
  const restTop = Math.max(Dimensions.get('window').height, Dimensions.get('screen').height) - bottom - PILL_PLAYER_HEIGHT;
  const shellMotion = useAnimatedStyle(() => {
    const p = playerSheetProgress.value;
    const handOver = Math.max(0, 1 - p * 4);
    // The pill gives a few points under the finger, never more: the further
    // the pull, the harder it resists (a swipe up opens the player instead).
    const y = (1 - enter.value) * 24 + dragY.value - restTop * p;
    const x = dragX.value;
    return { opacity: enter.value * handOver, transform: [{ translateY: y }, { translateX: x }] as const };
  });

  const [backNudge, setBackNudge] = useState(0);
  const [nextNudge, setNextNudge] = useState(0);
  const next = useCallback(() => { tick(); setNextNudge(n => n + 1); onNext(); }, [onNext]);
  const previous = useCallback(() => { tick(); setBackNudge(n => n + 1); onPrevious(); }, [onPrevious]);

  // A swipe up opens the player as soon as it is clearly upward, not when the
  // finger lifts: the sheet is already growing out of the pill while the finger
  // is still moving, which is what makes it feel immediate.
  const opened = useSharedValue(false);
  const pan = Gesture.Pan()
    .activeOffsetX([-14, 14])
    .activeOffsetY([-14, 14])
    .onStart(() => {
      opened.value = false;
    })
    .onUpdate(e => {
      dragX.value = pillGive(e.translationX, PILL_GIVE_SIDE);
      dragY.value = pillGive(e.translationY, e.translationY < 0 ? PILL_GIVE_UP : PILL_GIVE_DOWN);
      if (!opened.value && e.translationY < -28 && Math.abs(e.translationY) > Math.abs(e.translationX) * 1.2) {
        opened.value = true;
        runOnJS(onOpen)(Math.max(0, -e.velocityY));
      }
    })
    .onEnd(e => {
      const horizontal = Math.abs(e.translationX) > Math.abs(e.translationY);
      if (horizontal && (e.translationX < -60 || e.velocityX < -600)) runOnJS(next)();
      else if (horizontal && (e.translationX > 60 || e.velocityX > 600)) runOnJS(previous)();
      else if (!opened.value && !horizontal && (e.translationY < -36 || e.velocityY < -500)) runOnJS(onOpen)(Math.max(0, -e.velocityY));
      // Let go: it springs home from where it shows and settles with a small bounce.
      dragX.value = withSpring(0, PILL_BOUNCE);
      dragY.value = withSpring(0, PILL_BOUNCE);
    })
    // Opening the player mid-swipe can cancel this gesture before onEnd runs
    // (the player route mounts over the pill), so it always goes home here too.
    .onFinalize(() => {
      dragX.value = withSpring(0, PILL_BOUNCE);
      dragY.value = withSpring(0, PILL_BOUNCE);
    });

  return (
    <GestureDetector gesture={pan}>
      <Animated.View
        pointerEvents={sheetUp ? 'none' : 'auto'}
        style={[styles.shell, glass && styles.shellGlass, { left: side, right: side, bottom }, shellColor, shellMotion]}
      >
        {glow ? (
          <View style={[StyleSheet.absoluteFill, styles.glowClip]} pointerEvents="none">
            <GlowBackground colors={glowColors} variant="mini" />
          </View>
        ) : null}
        {glass ? <GlassShadow radius={PILL_PLAYER_HEIGHT / 2} /> : null}
        {glass ? <LiquidGlass radius={PILL_PLAYER_HEIGHT / 2} palette={palette} /> : null}
        {glass ? (
          // Apple Music's mini player on its glass: the artwork, the song, play and next.
          <Pressable
            onPress={() => onOpen()}
            style={[styles.row, styles.rowGlass]}
            accessibilityRole="button"
            accessibilityLabel={`Now playing: ${title}. Open player`}
          >
            <Artwork uri={coverImageUri} title={title} artist={artist} size={GLASS_ART} priority="high" continuous style={styles.glassArt} />
            <View style={styles.meta}>
              <SwapMarquee style={styles.title} direction={songDirection} active={!sheetUp}>{title}</SwapMarquee>
              {artist ? <SwapMarquee style={styles.artist} direction={songDirection} active={!sheetUp}>{artist}</SwapMarquee> : null}
            </View>
            <Tactile
              onPress={() => { tick(); onTogglePlay(); }}
              hitSlop={6}
              pressScale={0.86}
              accessibilityRole="button"
              accessibilityLabel={playing ? 'Pause' : 'Play'}
              style={styles.glassBtn}
            >
              <MorphIcon on={playing} onIcon="pause" offIcon="play" size={24} color="#fff" offStyle={styles.playNudge} />
            </Tactile>
            <Tactile onPress={next} hitSlop={6} pressScale={0.86} accessibilityRole="button" accessibilityLabel="Next" style={styles.glassBtn}>
              <NudgeIcon name="play-forward" size={24} color="#fff" direction={1} trigger={nextNudge} />
            </Tactile>
          </Pressable>
        ) : (
        <Pressable
          onPress={() => onOpen()}
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
              <Artwork uri={coverImageUri} title={title} artist={artist} size={DISC} priority="high" continuous style={styles.discArt} />
              <View style={styles.spindle} />
            </Animated.View>
          </View>

          <View style={styles.meta}>
            <SwapMarquee style={styles.title} direction={songDirection} active={!sheetUp}>{title}</SwapMarquee>
            {artist ? <SwapMarquee style={styles.artist} direction={songDirection} active={!sheetUp}>{artist}</SwapMarquee> : null}
          </View>

          <Tactile onPress={previous} hitSlop={8} pressScale={0.85} accessibilityRole="button" accessibilityLabel="Previous" style={styles.skip}>
            <NudgeIcon name="play-skip-back" size={18} color="#fff" direction={-1} trigger={backNudge} />
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
            <MorphIcon on={playing} onIcon="pause" offIcon="play" size={20} color="#15151a" offStyle={styles.playNudge} />
          </Tactile>

          <Tactile onPress={next} hitSlop={8} pressScale={0.85} accessibilityRole="button" accessibilityLabel="Next" style={styles.skip}>
            <NudgeIcon name="play-skip-forward" size={18} color="#fff" direction={1} trigger={nextNudge} />
          </Tactile>
        </Pressable>
        )}
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
  // The glass draws its own edge.
  shellGlass: { borderWidth: 0 },
  glowClip: { borderRadius: PILL_PLAYER_HEIGHT / 2, overflow: 'hidden' },
  rowGlass: { paddingLeft: (PILL_PLAYER_HEIGHT - GLASS_ART) / 2, paddingRight: 6 },
  glassArt: { width: GLASS_ART, height: GLASS_ART, borderRadius: 8, overflow: 'hidden' },
  glassBtn: { width: 42, height: 44, alignItems: 'center', justifyContent: 'center' },
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
  spindle: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(0,0,0,0.55)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)' },
  meta: { flex: 1, marginLeft: 10, marginRight: 4, justifyContent: 'center' },
  title: { color: '#fff', fontSize: 14, fontWeight: '600' },
  artist: { color: 'rgba(255,255,255,0.68)', fontSize: 12, marginTop: 1 },
  skip: { width: 32, height: 36, alignItems: 'center', justifyContent: 'center' },
  cookie: { width: COOKIE, height: COOKIE, alignItems: 'center', justifyContent: 'center', marginHorizontal: 2 },
  playNudge: { marginLeft: 2 },
});

export default React.memo(PillPlayer);
