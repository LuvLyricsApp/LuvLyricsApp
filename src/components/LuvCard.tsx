import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  Pressable,
  Dimensions,
  ViewStyle,
  StyleProp,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  interpolate,
  Extrapolation,
  SharedValue,
  withSpring,
  withTiming,
  withRepeat,
  withSequence,
  cancelAnimation,
  Easing,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { UnifiedSong } from '../types/song';
import { analyzeImageBrightness } from '../utils/imageAnalyzer';
import { luvsBufferManager } from '../services/LuvsBufferManager';
import TimelineScrubber from './TimelineScrubber';
import { luvsEngine } from '../services/luvsEngine';
import CanvasVideoLayer from './CanvasVideoLayer';
import { useCanvasArtwork } from '../hooks/useCanvasArtwork';
import { Glass, Motion, Radius, Signal } from '../constants/allegraTheme';
import Artwork from './allegra/Artwork';
import { duotoneFor } from './allegra/artworkSeed';
import { TAB_BAR_CLEARANCE } from '../navigation/tabs';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
/** Shared with the Luvs header so its buttons sit on the same edge as the cover. */
export const LUVS_GUTTER = 24;
const GUTTER = LUVS_GUTTER;
/** Space reserved for the Luvs header (back / reload / vault) above the stage. */
const HEADER_CLEARANCE = 72;
/** Title row + scrubber + action row + the gaps between them. */
const BOTTOM_BLOCK = 58 + 14 + 46 + 18 + 72;

// ─── Equalizer bars ──────────────────────────────────────────────────────────
const EqBars = ({ active }: { active: boolean }) => {
  const h1 = useSharedValue(3);
  const h2 = useSharedValue(3);
  const h3 = useSharedValue(3);

  useEffect(() => {
    if (active) {
      h1.value = withRepeat(
        withSequence(
          withTiming(13, { duration: 280, easing: Easing.inOut(Easing.ease) }),
          withTiming(3, { duration: 280, easing: Easing.inOut(Easing.ease) })
        ), -1, false
      );
      h2.value = withRepeat(
        withSequence(
          withTiming(7, { duration: 200 }),
          withTiming(15, { duration: 320 }),
          withTiming(3, { duration: 240 })
        ), -1, false
      );
      h3.value = withRepeat(
        withSequence(
          withTiming(15, { duration: 380, easing: Easing.inOut(Easing.ease) }),
          withTiming(3, { duration: 320, easing: Easing.inOut(Easing.ease) })
        ), -1, false
      );
    } else {
      cancelAnimation(h1); cancelAnimation(h2); cancelAnimation(h3);
      h1.value = withTiming(3, { duration: 250 });
      h2.value = withTiming(3, { duration: 250 });
      h3.value = withTiming(3, { duration: 250 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const s1 = useAnimatedStyle(() => ({ height: h1.value }));
  const s2 = useAnimatedStyle(() => ({ height: h2.value }));
  const s3 = useAnimatedStyle(() => ({ height: h3.value }));

  return (
    <View style={styles.eqWrap}>
      <Animated.View style={[styles.eqBar, s1]} />
      <Animated.View style={[styles.eqBar, s2]} />
      <Animated.View style={[styles.eqBar, s3]} />
    </View>
  );
};

// ─── Heart burst ─────────────────────────────────────────────────────────────
const BURST_ANGLES = [270, 315, 0, 45, 90, 135, 180, 225];

const HeartParticle = ({ angle, trigger }: { angle: number; trigger: number }) => {
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const op = useSharedValue(0);
  const sc = useSharedValue(0);

  useEffect(() => {
    if (trigger === 0) return;
    const rad = (angle * Math.PI) / 180;
    tx.value = 0; ty.value = 0; op.value = 0; sc.value = 0;
    tx.value = withTiming(Math.cos(rad) * 62, { duration: 520, easing: Easing.out(Easing.cubic) });
    ty.value = withTiming(Math.sin(rad) * 62, { duration: 520, easing: Easing.out(Easing.cubic) });
    op.value = withSequence(
      withTiming(1, { duration: 80 }),
      withTiming(0, { duration: 400, easing: Easing.out(Easing.quad) })
    );
    sc.value = withSequence(
      withSpring(1.6, { damping: 8, stiffness: 280 }),
      withTiming(0.3, { duration: 300 })
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trigger]);

  const style = useAnimatedStyle(() => ({
    opacity: op.value,
    transform: [{ translateX: tx.value }, { translateY: ty.value }, { scale: sc.value }] as any,
  }));

  return (
    <Animated.View style={[{ position: 'absolute', width: 20, height: 20, justifyContent: 'center', alignItems: 'center' }, style]} pointerEvents="none">
      <Ionicons name="heart" size={13} color={Signal.accent} />
    </Animated.View>
  );
};

const HeartBurst = ({ trigger }: { trigger: number }) => (
  <View style={styles.burstAnchor} pointerEvents="none">
    {BURST_ANGLES.map((a) => <HeartParticle key={a} angle={a} trigger={trigger} />)}
  </View>
);

// ─── Action button ───────────────────────────────────────────────────────────
// A frosted circle with its label underneath. All four sit in one row with equal
// columns, so they align to the same grid as the title and scrubber above them.
interface ActionBtnProps {
  icon: string;
  label: string;
  iconColor?: string;
  labelColor?: string;
  iconSize?: number;
  iconStyle?: StyleProp<ViewStyle>;
  onPress: () => void;
  disabled?: boolean;
  /** Fill for the circle when this action is "on" (liked, saved). */
  activeTint?: string;
  children?: React.ReactNode;
}

const ActionBtn = ({
  icon, label, iconColor = Signal.ink, labelColor, iconSize = 24,
  iconStyle, onPress, disabled = false, activeTint, children,
}: ActionBtnProps) => {
  const sc = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: sc.value }] }));
  const handlePress = useCallback(() => {
    sc.value = withSequence(
      withSpring(0.82, { damping: 14, stiffness: 600 }),
      withSpring(1.08, { damping: 8, stiffness: 320 }),
      withSpring(1, Motion.spring.tactile)
    );
    onPress();
  }, [onPress, sc]);

  return (
    <Pressable
      onPress={disabled ? undefined : handlePress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={styles.actionCell}
      hitSlop={6}
    >
      <Animated.View style={[styles.actionCircle, activeTint ? { backgroundColor: activeTint, borderColor: activeTint } : null, animStyle]}>
        {children}
        <Animated.View style={iconStyle as ViewStyle}>
          <Ionicons name={icon as React.ComponentProps<typeof Ionicons>['name']} size={iconSize} color={iconColor} />
        </Animated.View>
      </Animated.View>
      <Text style={[styles.actionLabel, labelColor ? { color: labelColor } : undefined]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
};

// ─── Scrubber ────────────────────────────────────────────────────────────────
// Inline, in the layout column (not pinned to a screen edge). Reads the Luvs
// audio pool; values are seconds so the time labels read correctly.
const LuvsScrubber = ({
  isActive, onScrubStateChange,
}: {
  isActive: boolean;
  onScrubStateChange?: (scrubbing: boolean) => void;
}) => {
  const position = useSharedValue(0);
  const duration = useSharedValue(0);

  useEffect(() => {
    if (!isActive) return;
    luvsBufferManager.setStatusUpdateCallback((status) => {
      if (status.isLoaded) {
        position.value = (status.positionMillis || 0) / 1000;
        duration.value = (status.durationMillis || 0) / 1000;
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive]);

  return (
    <View style={styles.scrubber}>
      {isActive ? (
        <TimelineScrubber
          currentTime={position}
          duration={duration}
          onSeek={(t) => luvsBufferManager.seekTo(t * 1000)}
          onScrubStart={() => { onScrubStateChange?.(true); luvsBufferManager.pause(); }}
          onScrubEnd={() => { onScrubStateChange?.(false); luvsBufferManager.resume(); }}
          variant="classic"
        />
      ) : null}
    </View>
  );
};

// ─── LuvCard ──────────────────────────────────────────────────────────────────
interface LuvCardProps {
  song: UnifiedSong;
  isActive: boolean;
  isLiked: boolean;
  isPlaying: boolean;
  // Take the song so LuvsScreen can pass stable handlers — inline arrows here
  // defeated React.memo and re-rendered every mounted card on every swipe.
  onLike: (song: UnifiedSong) => void;
  onShare: (song: UnifiedSong) => void;
  onDownload: (song: UnifiedSong) => void;
  /** Hands the clip to the main player as a full song (Spotify's "play full song"). */
  onPlayFull?: (song: UnifiedSong) => void;
  /** Already queued for download this session. */
  isSaved?: boolean;
  onPlayPause: () => void;
  /** Lets the feed suspend ViewPager2 paging while the timeline is being dragged. */
  onScrubStateChange?: (scrubbing: boolean) => void;
  luvHeight: number;
  index: number;
  currentIndex: SharedValue<number>;
  isNearActive: boolean;
  /**
   * False for cards far from the viewport. The native pager keeps every card in the
   * feed mounted as a page, so distant ones collapse to a bare black view rather
   * than holding a full-screen bitmap each. Defaults to true for the iOS FlatList,
   * which already virtualises.
   */
  isMounted?: boolean;
  /**
   * True when LuvsPagerView's PageTransformer is doing the scale/fade. The JS
   * interpolation is skipped so the two don't compound into a double transform.
   */
  nativeDepth?: boolean;
}

export const LuvCard = React.memo<LuvCardProps>(
  ({ song, isActive, isLiked, isPlaying, onLike, onShare, onDownload,
     onPlayFull, isSaved = false, onPlayPause, onScrubStateChange, luvHeight, index, currentIndex, isNearActive,
     isMounted = true, nativeDepth = false }) => {
    const insets = useSafeAreaInsets();
    // Only the card on screen looks up and decodes a canvas.
    const duotone = useMemo(() => duotoneFor(`${song.title}|${song.artist ?? ''}`), [song.title, song.artist]);
    const canvas = useCanvasArtwork(isActive ? { title: song.title, artist: song.artist, duration: song.duration } : null);
    const [canvasVisible, setCanvasVisible] = useState(false);
    const [burstTrigger, setBurstTrigger] = useState(0);
    const [isMagicActive, setIsMagicActive] = useState(false);
    const [gradientOpacity, setGradientOpacity] = useState(0.9);
    const magicRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // The cover breathes with playback, as on Now Playing: full size while
    // playing, settling smaller on pause.
    const artScale = useSharedValue(isPlaying ? 1 : 0.92);
    const heartSc = useSharedValue(1);
    const ppOp = useSharedValue(0);
    const ppSc = useSharedValue(0.4);

    useEffect(() => {
      artScale.value = withSpring(isPlaying || !isActive ? 1 : 0.92, Motion.spring.hero);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isPlaying, isActive]);

    // Pop only when the listener likes it — not when a liked card mounts.
    const likedOnMount = useRef(isLiked);
    useEffect(() => {
      if (isLiked && !likedOnMount.current) {
        heartSc.value = withSequence(
          withSpring(1.35, { damping: 9, stiffness: 520 }),
          withSpring(1, Motion.spring.tactile)
        );
      }
      likedOnMount.current = false;
      // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLiked]);

    useEffect(() => {
      if (isActive && song.highResArt) {
        analyzeImageBrightness(song.highResArt).then((r) => {
          setGradientOpacity(r.brightness > 160 ? 0.95 : 0.88);
        });
      }
    }, [song.highResArt, isActive]);

    useEffect(() => () => { if (magicRef.current) clearTimeout(magicRef.current); }, []);

    const handleTap = useCallback(() => {
      onPlayPause();
      ppSc.value = 0.4;
      ppOp.value = 0;
      ppSc.value = withSpring(1, { damping: 10, stiffness: 280 });
      ppOp.value = withSequence(
        withTiming(1, { duration: 60 }),
        withTiming(0, { duration: 580, easing: Easing.out(Easing.quad) })
      );
      // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onPlayPause]);

    const handleLike = useCallback(() => {
      onLike(song);
      if (!isLiked) setBurstTrigger((n) => n + 1);
    }, [onLike, isLiked, song]);

    const handleShare = useCallback(() => onShare(song), [onShare, song]);
    const handleDownload = useCallback(() => onDownload(song), [onDownload, song]);
    const handlePlayFull = useCallback(() => onPlayFull?.(song), [onPlayFull, song]);

    const handleMagic = useCallback(() => {
      setIsMagicActive(true);
      luvsEngine.discoverSimilar(song.id);
      magicRef.current = setTimeout(() => setIsMagicActive(false), 3000);
    }, [song.id]);

    const cardAnimStyle = useAnimatedStyle(() => {
      'worklet';
      // LuvsPagerView already applies scale/alpha/translate per page.
      if (nativeDepth) return {} as ViewStyle;
      const dist = Math.abs(currentIndex.value - index);
      if (dist > 1.1) {
        return { opacity: 0, transform: [{ scale: 0.93 }, { translateY: 0 }] } as ViewStyle;
      }
      const scale = interpolate(dist, [0, 1], [1, 0.93], Extrapolation.CLAMP);
      const translateY = interpolate(
        currentIndex.value - index, [-1, 0, 1], [32, 0, -32], Extrapolation.CLAMP
      );
      const opacity = interpolate(dist, [0, 0.35, 1], [1, 0.97, 0], Extrapolation.CLAMP);
      return { opacity, transform: [{ scale }, { translateY }] } as ViewStyle;
    });

    const artStyle = useAnimatedStyle(() => ({ transform: [{ scale: artScale.value }] }));
    const heartStyle = useAnimatedStyle(() => ({
      transform: [{ scale: heartSc.value }],
    }));
    const ppStyle = useAnimatedStyle(() => ({
      opacity: ppOp.value,
      transform: [{ scale: ppSc.value }],
    }));

    // Placed after every hook so the hook order never changes as cards scroll in
    // and out of range.
    // ── Layout grid ────────────────────────────────────────────────────────
    // One column, one gutter. Everything below the header is sized from the
    // real screen and safe areas, so nothing overlaps on small or tall phones.
    const contentTop = insets.top + HEADER_CLEARANCE;
    // The pill bar floats over the feed; keep the actions clear of it.
    const contentBottom = insets.bottom + TAB_BAR_CLEARANCE;
    const artSize = Math.round(Math.max(
      160,
      Math.min(SCREEN_WIDTH - GUTTER * 2, 420, luvHeight - contentTop - contentBottom - BOTTOM_BLOCK - 28),
    ));

    if (!isMounted) {
      return <View style={[styles.card, { height: luvHeight }]} />;
    }

    return (
      <Animated.View
        style={[styles.card, { height: luvHeight }, cardAnimStyle]}
        renderToHardwareTextureAndroid
      >
        <Pressable style={[StyleSheet.absoluteFill, styles.pressable]} onPress={handleTap}>
          {/* Full-screen blurred bg — or, with no cover, the song's own duotone
              (the same one its generated artwork uses) so the card is never black. */}
          {song.highResArt ? (
            <Image
              source={{ uri: song.highResArt }}
              style={[StyleSheet.absoluteFillObject, { width: SCREEN_WIDTH, height: luvHeight }]}
              blurRadius={isActive ? 45 : 0}
              resizeMode="cover"
            />
          ) : (
            <LinearGradient
              colors={[duotone[0], duotone[1], duotone[0]]}
              locations={[0, 0.55, 1]}
              start={{ x: 0.1, y: 0 }}
              end={{ x: 0.9, y: 1 }}
              style={StyleSheet.absoluteFillObject}
            />
          )}

          {/* Motion canvas: full-bleed like Spotify's feed; artwork steps aside once it lands */}
          {isActive ? (
            <CanvasVideoLayer canvas={canvas} playing={isPlaying} scrimStrength={0.55} onVisibleChange={setCanvasVisible} />
          ) : null}

          {/* Legibility: light at the top, deep at the bottom where the text sits. */}
          <LinearGradient
            colors={['rgba(0,0,0,0.35)', 'rgba(0,0,0,0)', 'rgba(0,0,0,0.25)', `rgba(0,0,0,${gradientOpacity})`]}
            locations={[0, 0.2, 0.55, 1]}
            style={StyleSheet.absoluteFillObject}
            pointerEvents="none"
          />

          <View
            style={[
              styles.column,
              { paddingTop: contentTop, paddingBottom: contentBottom },
              isNearActive ? styles.uiOn : styles.uiOff,
            ]}
            pointerEvents={isNearActive ? 'box-none' : 'none'}
          >
            {/* Stage — the cover, centred in whatever height is left. */}
            <View style={styles.stage} pointerEvents="none">
              {!(isActive && canvasVisible) ? (
                <Animated.View style={[styles.coverArt, { width: artSize, height: artSize }, artStyle]}>
                  <Artwork uri={song.highResArt} title={song.title} artist={song.artist} size={artSize} priority={isActive ? 'high' : 'normal'} style={styles.coverArtInner} />
                </Animated.View>
              ) : null}
              {/* Play/pause flash, centred on the cover */}
              <Animated.View style={[styles.ppOverlay, ppStyle]}>
                <View style={styles.ppCircle}>
                  <Ionicons name={isPlaying ? 'pause' : 'play'} size={40} color="#fff" style={isPlaying ? undefined : styles.ppNudge} />
                </View>
              </Animated.View>
            </View>

            {/* Title block — left-aligned to the gutter, Full song on the same line */}
            <View style={styles.metaRow}>
              <View style={styles.songTexts}>
                <Text style={styles.songTitle} numberOfLines={1}>{song.title}</Text>
                <View style={styles.artistRow}>
                  <EqBars active={isActive && isPlaying} />
                  <Text style={styles.songArtist} numberOfLines={1}>
                    {song.artist || 'Unknown Artist'}
                  </Text>
                </View>
              </View>
              {onPlayFull ? (
                <Pressable
                  onPress={handlePlayFull}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={`Play full song ${song.title}`}
                  style={({ pressed }) => [styles.playFull, pressed && styles.playFullPressed]}
                >
                  <Ionicons name="play" size={14} color={Signal.waveInk} style={styles.playFullGlyph} />
                  <Text style={styles.playFullText}>Full song</Text>
                </Pressable>
              ) : null}
            </View>

            <LuvsScrubber isActive={isActive} onScrubStateChange={onScrubStateChange} />

            {/* Actions — four equal columns on the same gutter */}
            <View style={styles.actionsRow}>
              <ActionBtn
                icon={isLiked ? 'heart' : 'heart-outline'}
                label={isLiked ? "Luv'd" : 'Luv'}
                iconColor={isLiked ? Signal.accent : Signal.ink}
                labelColor={isLiked ? Signal.accent : undefined}
                iconStyle={heartStyle}
                activeTint={isLiked ? 'rgba(238, 107, 95, 0.22)' : undefined}
                onPress={handleLike}
              >
                <HeartBurst trigger={burstTrigger} />
              </ActionBtn>
              <ActionBtn
                icon={isSaved ? 'checkmark' : 'arrow-down'}
                label={isSaved ? 'Saved' : 'Save'}
                iconColor={isSaved ? Signal.waveInk : Signal.ink}
                labelColor={isSaved ? Signal.wave : undefined}
                activeTint={isSaved ? Signal.wave : undefined}
                onPress={handleDownload}
                disabled={isSaved}
              />
              <ActionBtn icon="share-outline" label="Share" onPress={handleShare} />
              <ActionBtn
                icon="radio-outline"
                label={isMagicActive ? 'Finding…' : 'Similar'}
                iconColor={isMagicActive ? Signal.wave : Signal.ink}
                labelColor={isMagicActive ? Signal.wave : undefined}
                onPress={handleMagic}
                disabled={isMagicActive}
              />
            </View>
          </View>
        </Pressable>
      </Animated.View>
    );
  },
  (prev, next) =>
    prev.isActive === next.isActive &&
    prev.isNearActive === next.isNearActive &&
    // Without this the card would stay a black placeholder after scrolling back
    // into range — the other flags can all be unchanged across that transition.
    prev.isMounted === next.isMounted &&
    prev.isLiked === next.isLiked &&
    prev.isPlaying === next.isPlaying &&
    prev.isSaved === next.isSaved &&
    prev.song.id === next.song.id
);

const styles = StyleSheet.create({
  card: {
    width: SCREEN_WIDTH,
    backgroundColor: '#000',
    overflow: 'hidden',
  },
  pressable: {},
  uiOn: { opacity: 1 },
  uiOff: { opacity: 0 },

  // ── Column ──
  column: {
    ...StyleSheet.absoluteFillObject,
    paddingHorizontal: GUTTER,
  },
  stage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  coverArt: {
    borderRadius: Radius.panel,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.55,
    shadowRadius: 30,
    elevation: 18,
  },
  coverArtInner: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: Radius.panel,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Glass.hairlineStrong,
  },
  ppOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ppCircle: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: 'rgba(7, 8, 11, 0.5)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Glass.hairlineStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ppNudge: { marginLeft: 4 },

  // ── Title row ──
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    minHeight: 58,
    marginTop: 28,
  },
  songTexts: { flex: 1, minWidth: 0 },
  songTitle: {
    fontWeight: '700',
    fontSize: 24,
    lineHeight: 29,
    color: Signal.ink,
  },
  artistRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  songArtist: {
    flex: 1,
    fontWeight: '500',
    fontSize: 15,
    color: 'rgba(244, 241, 234, 0.72)',
  },
  playFull: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 40,
    paddingHorizontal: 16,
    borderRadius: Radius.pill,
    backgroundColor: Signal.wave,
  },
  playFullPressed: { transform: [{ scale: 0.95 }] },
  playFullGlyph: { marginLeft: 1 },
  playFullText: {
    fontWeight: '600',
    fontSize: 14,
    color: Signal.waveInk,
  },

  // ── Scrubber ──
  scrubber: {
    height: 46,
    marginTop: 14,
    justifyContent: 'center',
  },

  // ── Actions ──
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 18,
  },
  actionCell: {
    flex: 1,
    alignItems: 'center',
  },
  actionCircle: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Glass.hairlineStrong,
  },
  actionLabel: {
    marginTop: 7,
    fontWeight: '600',
    fontSize: 11.5,
    color: 'rgba(244, 241, 234, 0.82)',
  },
  burstAnchor: {
    position: 'absolute',
    width: 50,
    height: 50,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 20,
  },

  // ── Equaliser ──
  eqWrap: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 2,
    height: 14,
  },
  eqBar: {
    width: 3,
    backgroundColor: Signal.wave,
    borderRadius: 2,
  },
});
