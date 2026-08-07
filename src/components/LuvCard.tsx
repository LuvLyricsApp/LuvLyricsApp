import React, { useState, useEffect, useCallback, useRef } from 'react';
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

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const ART_SIZE = SCREEN_WIDTH * 0.72;
const PROGRESS_W = SCREEN_WIDTH - 40;

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
      <Ionicons name="heart" size={13} color="#FF2D55" />
    </Animated.View>
  );
};

const HeartBurst = ({ trigger }: { trigger: number }) => (
  <View style={styles.burstAnchor} pointerEvents="none">
    {BURST_ANGLES.map((a) => <HeartParticle key={a} angle={a} trigger={trigger} />)}
  </View>
);

// ─── Animated action button ───────────────────────────────────────────────────
interface ActionBtnProps {
  icon: string;
  label: string;
  iconColor?: string;
  labelColor?: string;
  iconSize?: number;
  iconStyle?: StyleProp<ViewStyle>;
  onPress: () => void;
  disabled?: boolean;
}

const ActionBtn = ({
  icon, label, iconColor = '#fff', labelColor, iconSize = 30,
  iconStyle, onPress, disabled = false,
}: ActionBtnProps) => {
  const sc = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: sc.value }] }));

  const handlePress = useCallback(() => {
    sc.value = withSequence(
      withSpring(0.72, { damping: 12, stiffness: 600 }),
      withSpring(1.16, { damping: 5, stiffness: 260 }),
      withSpring(1, { damping: 8, stiffness: 300 })
    );
    onPress();
  }, [onPress, sc]);

  return (
    <Pressable onPress={disabled ? undefined : handlePress} disabled={disabled}>
      <Animated.View style={[styles.actionBtn, animStyle]}>
        <Animated.View style={iconStyle as ViewStyle}>
          <Ionicons name={icon as any} size={iconSize} color={iconColor} />
        </Animated.View>
        <Text style={[styles.actionLabel, labelColor ? { color: labelColor } : undefined]}>
          {label}
        </Text>
      </Animated.View>
    </Pressable>
  );
};

// ─── Progress controller ──────────────────────────────────────────────────────
const LuvsProgressController = ({
  isActive, insetTop, insetBottom, onScrubStateChange,
}: {
  isActive: boolean;
  insetTop: number;
  insetBottom: number;
  onScrubStateChange?: (scrubbing: boolean) => void;
}) => {
  const position = useSharedValue(0);
  const duration = useSharedValue(0);
  const progress = useSharedValue(0);

  useEffect(() => {
    if (!isActive) return;
    luvsBufferManager.setStatusUpdateCallback((status) => {
      if (status.isLoaded) {
        position.value = status.positionMillis;
        duration.value = status.durationMillis || 0;
        progress.value = status.durationMillis > 0
          ? status.positionMillis / status.durationMillis : 0;
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive]);

  const fillStyle = useAnimatedStyle(() => ({
    width: Math.min(progress.value, 1) * PROGRESS_W,
  }));

  if (!isActive) return null;

  return (
    <>
      <View style={[styles.topBar, { top: insetTop + 10 }]}>
        <Animated.View style={[styles.topBarFill, fillStyle]} />
      </View>
      <View style={[styles.scrubberWrap, { bottom: insetBottom + 78 }]}>
        <TimelineScrubber
          currentTime={position}
          duration={duration}
          onSeek={(t) => luvsBufferManager.seekTo(t)}
          onScrubStart={() => { onScrubStateChange?.(true); luvsBufferManager.pause(); }}
          onScrubEnd={() => { onScrubStateChange?.(false); luvsBufferManager.resume(); }}
          variant="island"
        />
      </View>
    </>
  );
};

// ─── LuvCard ──────────────────────────────────────────────────────────────────
interface LuvCardProps {
  song: UnifiedSong;
  isActive: boolean;
  isLiked: boolean;
  isPlaying: boolean;
  onLike: () => void;
  onShare: () => void;
  onDownload: () => void;
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
     onPlayPause, onScrubStateChange, luvHeight, index, currentIndex, isNearActive,
     isMounted = true, nativeDepth = false }) => {
    const insets = useSafeAreaInsets();
    const [burstTrigger, setBurstTrigger] = useState(0);
    const [isMagicActive, setIsMagicActive] = useState(false);
    const [gradientOpacity, setGradientOpacity] = useState(0.9);
    const magicRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const glowSc = useSharedValue(1);
    const glowOp = useSharedValue(0.15);
    const heartSc = useSharedValue(1);
    const ppOp = useSharedValue(0);
    const ppSc = useSharedValue(0.4);

    useEffect(() => {
      if (isPlaying && isActive) {
        glowSc.value = withRepeat(
          withSequence(
            withTiming(1.22, { duration: 1500, easing: Easing.inOut(Easing.sin) }),
            withTiming(1.0, { duration: 1500, easing: Easing.inOut(Easing.sin) })
          ), -1, false
        );
        glowOp.value = withRepeat(
          withSequence(
            withTiming(0.5, { duration: 1500 }),
            withTiming(0.12, { duration: 1500 })
          ), -1, false
        );
      } else {
        cancelAnimation(glowSc); cancelAnimation(glowOp);
        glowSc.value = withTiming(1, { duration: 500 });
        glowOp.value = withTiming(0.12, { duration: 500 });
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, isActive]);

    useEffect(() => {
      if (isLiked) {
        heartSc.value = withSequence(
          withSpring(1.75, { damping: 4, stiffness: 450 }),
          withSpring(1, { damping: 8, stiffness: 300 })
        );
      }
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
      onLike();
      if (!isLiked) setBurstTrigger((n) => n + 1);
    }, [onLike, isLiked]);

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

    const glowStyle = useAnimatedStyle(() => ({
      transform: [{ scale: glowSc.value }],
      opacity: glowOp.value,
    }));
    const heartStyle = useAnimatedStyle(() => ({
      transform: [{ scale: heartSc.value }],
    }));
    const ppStyle = useAnimatedStyle(() => ({
      opacity: ppOp.value,
      transform: [{ scale: ppSc.value }],
    }));

    // Placed after every hook so the hook order never changes as cards scroll in
    // and out of range.
    if (!isMounted) {
      return <View style={[styles.card, { height: luvHeight }]} />;
    }

    return (
      <Animated.View
        style={[styles.card, { height: luvHeight }, cardAnimStyle]}
        renderToHardwareTextureAndroid
      >
        <Pressable style={[StyleSheet.absoluteFill, styles.pressable]} onPress={handleTap}>
          {/* Full-screen blurred bg */}
          {song.highResArt && (
            <Image
              source={{ uri: song.highResArt }}
              style={[StyleSheet.absoluteFillObject, { width: SCREEN_WIDTH, height: luvHeight }]}
              blurRadius={isActive ? 45 : 0}
              resizeMode="cover"
            />
          )}

          {/* Cinematic vignette */}
          <LinearGradient
            colors={['rgba(0,0,0,0.18)', 'rgba(0,0,0,0.04)', 'rgba(0,0,0,0.45)', 'rgba(0,0,0,0.1)']}
            locations={[0, 0.28, 0.72, 1]}
            style={StyleSheet.absoluteFillObject}
          />

          {/* Glow halo behind art */}
          <Animated.View style={[styles.artGlow, glowStyle]} />

          {/* Album art */}
          {song.highResArt ? (
            <Image source={{ uri: song.highResArt }} style={styles.coverArt} resizeMode="cover" />
          ) : (
            <View style={styles.coverArtFallback}>
              <Ionicons name="musical-note" size={64} color="rgba(255,255,255,0.3)" />
            </View>
          )}

          {/* Play/pause flash */}
          <Animated.View style={[styles.ppOverlay, ppStyle]} pointerEvents="none">
            <View style={styles.ppCircle}>
              <Ionicons name={isPlaying ? 'pause' : 'play'} size={46} color="#fff" />
            </View>
          </Animated.View>

          {/* UI layer */}
          <View
            style={[StyleSheet.absoluteFill, isNearActive ? styles.uiOn : styles.uiOff]}
            pointerEvents={isNearActive ? 'box-none' : 'none'}
          >
            <LuvsProgressController
              isActive={isActive}
              insetTop={insets.top}
              insetBottom={insets.bottom}
              onScrubStateChange={onScrubStateChange}
            />

            {/* Right buttons */}
            <View style={[styles.actionsCol, { bottom: insets.bottom + 130 }]}>
              <View style={styles.actionWithBurst}>
                <HeartBurst trigger={burstTrigger} />
                <ActionBtn
                  icon={isLiked ? 'heart' : 'heart-outline'}
                  label={isLiked ? "Luv'd" : 'Luv'}
                  iconColor={isLiked ? '#FF2D55' : '#fff'}
                  labelColor={isLiked ? '#FF2D55' : undefined}
                  iconSize={33}
                  iconStyle={heartStyle}
                  onPress={handleLike}
                />
              </View>

              <ActionBtn
                icon="sparkles"
                label={isMagicActive ? 'Learning…' : 'Magic'}
                iconColor={isMagicActive ? '#4CD964' : '#fff'}
                labelColor={isMagicActive ? '#4CD964' : undefined}
                iconSize={28}
                onPress={handleMagic}
                disabled={isMagicActive}
              />

              <ActionBtn icon="share-outline" label="Share" onPress={onShare} />
              <ActionBtn icon="bookmark-outline" label="Save" onPress={onDownload} />
            </View>

            {/* Bottom song info */}
            <LinearGradient
              colors={['rgba(0,0,0,0)', `rgba(0,0,0,${gradientOpacity})`]}
              locations={[0, 0.6]}
              style={[styles.bottomGrad, { paddingBottom: insets.bottom + 20 }]}
            >
              <View style={styles.songCard}>
                {song.highResArt ? (
                  <Image source={{ uri: song.highResArt }} style={styles.miniArt} />
                ) : (
                  <View style={styles.miniArtFallback}>
                    <Ionicons name="musical-note" size={18} color="#fff" />
                  </View>
                )}
                <View style={styles.songTexts}>
                  <Text style={styles.songTitle} numberOfLines={1}>{song.title}</Text>
                  <View style={styles.artistRow}>
                    <EqBars active={isActive && isPlaying} />
                    <Text style={styles.songArtist} numberOfLines={1}>
                      {song.artist || 'Unknown Artist'}
                    </Text>
                  </View>
                </View>
              </View>
            </LinearGradient>
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
    prev.song.id === next.song.id
);

const styles = StyleSheet.create({
  card: {
    width: SCREEN_WIDTH,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
  },
  pressable: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  uiOn: { opacity: 1 },
  uiOff: { opacity: 0 },
  particle: { position: 'absolute' },

  artGlow: {
    position: 'absolute',
    width: ART_SIZE + 70,
    height: ART_SIZE + 70,
    borderRadius: (ART_SIZE + 70) / 2,
    backgroundColor: 'rgba(255,255,255,0.11)',
  },
  coverArt: {
    width: ART_SIZE,
    height: ART_SIZE,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    marginTop: -70,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.75,
    shadowRadius: 28,
    elevation: 18,
  },
  coverArtFallback: {
    width: ART_SIZE,
    height: ART_SIZE,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.07)',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: -70,
  },

  ppOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 5,
  },
  ppCircle: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: 'rgba(0,0,0,0.52)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.28)',
    justifyContent: 'center',
    alignItems: 'center',
  },

  topBar: {
    position: 'absolute',
    left: 20,
    width: PROGRESS_W,
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  topBarFill: {
    height: 3,
    backgroundColor: '#fff',
    borderRadius: 2,
  },

  scrubberWrap: {
    position: 'absolute',
    left: 20,
    right: 20,
  },

  actionsCol: {
    position: 'absolute',
    right: 14,
    gap: 22,
    alignItems: 'center',
  },
  actionWithBurst: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  burstAnchor: {
    position: 'absolute',
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 20,
  },
  actionBtn: {
    alignItems: 'center',
    gap: 5,
  },
  actionLabel: {
    color: 'rgba(255,255,255,0.92)',
    fontSize: 11,
    fontWeight: '600',
    textShadowColor: 'rgba(0,0,0,0.85)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },

  bottomGrad: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingTop: 90,
  },
  songCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 18,
    padding: 12,
    borderWidth: 0.5,
    borderColor: 'rgba(255,255,255,0.13)',
  },
  miniArt: {
    width: 50,
    height: 50,
    borderRadius: 11,
    marginRight: 12,
  },
  miniArtFallback: {
    width: 50,
    height: 50,
    borderRadius: 11,
    marginRight: 12,
    backgroundColor: 'rgba(255,255,255,0.14)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  songTexts: { flex: 1 },
  songTitle: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 5,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  artistRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  songArtist: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 13,
    fontWeight: '500',
    flex: 1,
  },

  eqWrap: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 2,
    height: 16,
  },
  eqBar: {
    width: 3,
    backgroundColor: '#FF2D55',
    borderRadius: 2,
  },
});
