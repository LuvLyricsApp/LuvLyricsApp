/**
 * The card that answers the mic. Mounted once in RootNavigator, above the tabs.
 *
 *   listening  live level bars + the words as they're heard. Touches pass
 *              through, so the finger holding the mic keeps holding it.
 *   searching  the query, while the catalog answers.
 *   results    the best match large, with Play; other matches below — tap one
 *              to make it the pick.
 *   empty      nothing found, with the query shown so a mishearing is obvious.
 *   notice     a one-line confirmation for commands ("Next song").
 *
 * Springs in from 0.92 scale; content swaps cross-fade. Reduce Motion fades.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { BackHandler, Pressable, StyleSheet, Text, useWindowDimensions, View, ViewStyle } from 'react-native';
import Animated, {
  FadeIn,
  FadeOut,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TAB_BAR_CLEARANCE } from '../navigation/tabs';
import { Glass, Motion, Radius, Signal } from '../constants/allegraTheme';
import { useVoiceSearchStore, VoicePick } from '../store/voiceSearchStore';
import { usePlayerStore } from '../store/playerStore';
import { useDownloadQueueStore } from '../store/downloadQueueStore';
import { StreamService } from '../services/stream/StreamService';
import { Tactile } from './allegra/motion';
import Artwork from './allegra/Artwork';
import Frosted from './allegra/Frosted';
import { useArtworkPalette } from './allegra/useArtworkPalette';

const pickArt = (p: VoicePick) => (p.kind === 'local' ? p.song.coverImageUri : p.song.highResArt);
const pickArtist = (p: VoicePick) => p.song.artist ?? '';

// ─── Level bars ────────────────────────────────────────────────────────────

const BAR_SHAPE = [0.55, 0.85, 1, 0.8, 0.5];

const LevelBar: React.FC<{ weight: number }> = ({ weight }) => {
  const level = useVoiceSearchStore(s => s.level);
  const h = useSharedValue(0.25);
  useEffect(() => {
    h.value = withSpring(0.25 + Math.min(1, level) * 0.75 * weight, Motion.spring.tactile);
  }, [level, weight, h]);
  const style = useAnimatedStyle(() => ({ transform: [{ scaleY: h.value }] }));
  return <Animated.View style={[styles.bar, style]} />;
};

// ─── Card ──────────────────────────────────────────────────────────────────

export const VoiceSearchCard: React.FC = () => {
  const phase = useVoiceSearchStore(s => s.phase);
  const transcript = useVoiceSearchStore(s => s.transcript);
  const query = useVoiceSearchStore(s => s.query);
  const picks = useVoiceSearchStore(s => s.picks);
  const selected = useVoiceSearchStore(s => s.selected);
  const notice = useVoiceSearchStore(s => s.notice);
  const wantsDownload = useVoiceSearchStore(s => s.wantsDownload);
  const { select, dismiss } = useVoiceSearchStore.getState();
  const reduce = useReducedMotion();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  // The glass takes the colours of the song on the card (or the one playing).
  const shownArt = picks[selected] ? pickArt(picks[selected]) : undefined;
  const playingArt = usePlayerStore(s => s.currentSong?.coverImageUri);
  const palette = useArtworkPalette(shownArt ?? playingArt);

  const visible = phase !== 'idle';
  const interactive = visible && phase !== 'listening';
  const show = useSharedValue(0);
  // Stays mounted through the close animation — but a close that finishes
  // after the card was reopened must not unmount it.
  const [mounted, setMounted] = useState(visible);
  const visibleRef = useRef(visible);
  visibleRef.current = visible;
  const unmountIfHidden = useCallback(() => { if (!visibleRef.current) setMounted(false); }, []);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      show.value = reduce ? withTiming(1, { duration: Motion.duration.fast }) : withSpring(1, Motion.spring.sheet);
    } else {
      show.value = withTiming(0, { duration: Motion.duration.fast, easing: Motion.ease.accelerate }, done => {
        if (done) runOnJS(unmountIfHidden)();
      });
    }
  }, [visible, reduce, show, unmountIfHidden]);

  useEffect(() => {
    if (!interactive) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { dismiss(); return true; });
    return () => sub.remove();
  }, [interactive, dismiss]);

  useEffect(() => {
    if (phase === 'results') Haptics.selectionAsync().catch(() => {});
  }, [phase]);

  const backdropStyle = useAnimatedStyle(() => ({ opacity: show.value }));
  const cardStyle = useAnimatedStyle((): ViewStyle => (reduce
    ? { opacity: show.value }
    : { opacity: Math.min(1, show.value * 1.3), transform: [{ scale: 0.92 + 0.08 * show.value }] }));

  if (!mounted) return null;

  const pick = picks[selected];
  const cardWidth = Math.min(width - 40, 360);
  const cover = Math.min(cardWidth - 48, 220);

  const play = () => {
    if (!pick) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    if (pick.kind === 'local') {
      const store = usePlayerStore.getState();
      store.loadSong(pick.song.id);
      store.requestPlayback(true);
    } else {
      // The other streamable matches follow it, then radio takes over.
      const rest = picks
        .filter((p, i): p is Extract<VoicePick, { kind: 'stream' }> => p.kind === 'stream' && i !== selected)
        .map(p => p.song);
      StreamService.play([pick.song, ...rest], 0);
    }
    dismiss();
  };
  const playNext = () => {
    if (pick?.kind !== 'stream') return;
    StreamService.playNext(pick.song);
    useVoiceSearchStore.getState().notify('Playing next');
  };
  const download = () => {
    if (pick?.kind !== 'stream') return;
    useDownloadQueueStore.getState().addToQueue([pick.song]);
    useVoiceSearchStore.getState().notify('Saving to Downloads');
  };

  let content: React.ReactNode;
  if (phase === 'listening') {
    content = (
      <Animated.View key="listening" entering={FadeIn.duration(Motion.duration.fast)} exiting={FadeOut.duration(Motion.duration.instant)} style={styles.center}>
        <View style={styles.bars}>
          {BAR_SHAPE.map((w, i) => <LevelBar key={i} weight={w} />)}
        </View>
        <Text style={[styles.heard, !transcript && styles.hint]} numberOfLines={3}>
          {transcript || 'Say a song or an artist'}
        </Text>
        <Text style={styles.caption}>Let go when you're done</Text>
      </Animated.View>
    );
  } else if (phase === 'notice') {
    content = (
      <Animated.View key="notice" entering={FadeIn.duration(Motion.duration.fast)} style={styles.center}>
        <Text style={styles.notice}>{notice}</Text>
      </Animated.View>
    );
  } else if (phase === 'searching' || (phase === 'results' && !pick)) {
    content = (
      <Animated.View key="searching" entering={FadeIn.duration(Motion.duration.fast)} style={styles.center}>
        <View style={[styles.coverSkeleton, { width: cover, height: cover }]} />
        <Text style={styles.heard} numberOfLines={2}>“{query}”</Text>
        <Text style={styles.caption}>Finding it…</Text>
      </Animated.View>
    );
  } else if (phase === 'empty') {
    content = (
      <Animated.View key="empty" entering={FadeIn.duration(Motion.duration.fast)} style={styles.center}>
        <Ionicons name="musical-notes-outline" size={32} color={Signal.inkMuted} />
        <Text style={styles.heard} numberOfLines={2}>No match for “{query}”</Text>
        <Text style={styles.caption}>Hold the mic and try the artist name too</Text>
      </Animated.View>
    );
  } else if (pick) {
    const others = picks.map((p, i) => ({ p, i })).filter(({ i }) => i !== selected).slice(0, 3);
    content = (
      <Animated.View key="results" entering={FadeIn.duration(Motion.duration.base)}>
        <Animated.View key={`${pick.kind}-${pick.song.id}`} entering={reduce ? undefined : FadeIn.duration(Motion.duration.base)} style={styles.center}>
          <View style={[styles.cover, { width: cover, height: cover }]}>
            <Artwork uri={pickArt(pick)} title={pick.song.title} artist={pickArtist(pick)} size={cover} priority="high" style={StyleSheet.absoluteFill} />
          </View>
          <Text style={styles.title} numberOfLines={2}>{pick.song.title}</Text>
          <Text style={styles.artist} numberOfLines={1}>{pickArtist(pick)}</Text>
          <Text style={styles.source}>{pick.kind === 'local' ? 'In your library' : 'Streaming'}</Text>
        </Animated.View>

        <Tactile onPress={play} accessibilityRole="button" accessibilityLabel={`Play ${pick.song.title}`} style={styles.playBtn}>
          <Ionicons name="play" size={20} color={Signal.waveInk} />
          <Text style={styles.playText}>Play</Text>
        </Tactile>

        {pick.kind === 'stream' ? (
          <View style={styles.secondary}>
            <Pressable onPress={playNext} style={styles.secondaryBtn} accessibilityRole="button">
              <Ionicons name="return-down-forward" size={17} color={Signal.inkSoft} />
              <Text style={styles.secondaryText}>Play next</Text>
            </Pressable>
            <Pressable onPress={download} style={styles.secondaryBtn} accessibilityRole="button">
              <Ionicons name="arrow-down-circle-outline" size={17} color={wantsDownload ? Signal.wave : Signal.inkSoft} />
              <Text style={[styles.secondaryText, wantsDownload && styles.secondaryOn]}>Download</Text>
            </Pressable>
          </View>
        ) : null}

        {others.length > 0 ? (
          <View style={styles.others}>
            {others.map(({ p, i }) => (
              <Pressable
                key={`${p.kind}-${p.song.id}`}
                onPress={() => { Haptics.selectionAsync().catch(() => {}); select(i); }}
                style={({ pressed }) => [styles.other, pressed && styles.otherPressed]}
                accessibilityRole="button"
                accessibilityLabel={`${p.song.title}, ${pickArtist(p)}`}
              >
                <View style={styles.otherArt}>
                  <Artwork uri={pickArt(p)} title={p.song.title} artist={pickArtist(p)} size={40} style={StyleSheet.absoluteFill} />
                </View>
                <View style={styles.flex}>
                  <Text style={styles.otherTitle} numberOfLines={1}>{p.song.title}</Text>
                  <Text style={styles.otherArtist} numberOfLines={1}>
                    {pickArtist(p)}{p.kind === 'local' ? ' · Library' : ''}
                  </Text>
                </View>
              </Pressable>
            ))}
          </View>
        ) : null}
      </Animated.View>
    );
  }

  return (
    <View style={styles.layer} pointerEvents={interactive ? 'auto' : 'none'}>
      <Animated.View style={[StyleSheet.absoluteFill, backdropStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={dismiss} accessibilityRole="button" accessibilityLabel="Close">
          {phase === 'listening' ? (
            // The finger is still on the mic: dim the page but leave the tab
            // bar clear, so the mic's bloom and level bars stay visible.
            <LinearGradient
              colors={['rgba(4, 5, 7, 0.72)', 'rgba(4, 5, 7, 0.55)', 'rgba(4, 5, 7, 0)']}
              locations={[0, 0.72, 1]}
              style={[StyleSheet.absoluteFill, { bottom: TAB_BAR_CLEARANCE + insets.bottom }]}
            />
          ) : (
            <Frosted radius={0} intensity={28} tint={0.3} edge={false} />
          )}
        </Pressable>
      </Animated.View>

      <Animated.View style={[styles.card, { width: cardWidth }, cardStyle]} accessibilityViewIsModal={interactive}>
        <Frosted radius={Radius.sheet} intensity={70} palette={palette} />
        {interactive && phase !== 'notice' ? (
          <Pressable onPress={dismiss} hitSlop={10} style={styles.close} accessibilityRole="button" accessibilityLabel="Close">
            <Ionicons name="close" size={20} color={Signal.inkMuted} />
          </Pressable>
        ) : null}
        {content}
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  layer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    // Above the tab bar (elevation 100) and the mini player.
    zIndex: 3000,
    elevation: 300,
  },
  card: {
    borderRadius: Radius.sheet,
    overflow: 'hidden',
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 20,
  },
  close: { position: 'absolute', top: 14, right: 14, zIndex: 2, width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  center: { alignItems: 'center' },

  bars: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 56, marginBottom: 18 },
  bar: { width: 8, height: 56, borderRadius: 4, backgroundColor: Signal.wave },
  heard: { fontSize: 22, fontWeight: '700', color: Signal.ink, textAlign: 'center', marginTop: 14 },
  hint: { color: Signal.inkMuted, fontWeight: '600' },
  caption: { fontSize: 13, color: Signal.inkMuted, marginTop: 8, textAlign: 'center' },
  notice: { fontSize: 18, fontWeight: '600', color: Signal.ink, textAlign: 'center', paddingVertical: 6 },

  coverSkeleton: { borderRadius: Radius.well, backgroundColor: 'rgba(255, 255, 255, 0.07)' },
  cover: { borderRadius: Radius.well, overflow: 'hidden', backgroundColor: 'rgba(255, 255, 255, 0.07)' },
  title: { fontSize: 22, fontWeight: '700', color: Signal.ink, textAlign: 'center', marginTop: 18 },
  artist: { fontSize: 16, color: Signal.inkSoft, textAlign: 'center', marginTop: 4 },
  source: { fontSize: 12, fontWeight: '600', color: Signal.inkMuted, marginTop: 6 },

  playBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 52,
    borderRadius: Radius.pill,
    backgroundColor: Signal.wave,
    marginTop: 20,
  },
  playText: { fontSize: 17, fontWeight: '700', color: Signal.waveInk },
  secondary: { flexDirection: 'row', justifyContent: 'center', gap: 28, marginTop: 14 },
  secondaryBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6 },
  secondaryText: { fontSize: 14, fontWeight: '600', color: Signal.inkSoft },
  secondaryOn: { color: Signal.wave },

  others: { marginTop: 14, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Glass.hairline, paddingTop: 8 },
  other: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 7, borderRadius: 10 },
  otherPressed: { backgroundColor: Glass.fillPressed },
  otherArt: { width: 40, height: 40, borderRadius: 6, overflow: 'hidden' },
  otherTitle: { fontSize: 15, fontWeight: '600', color: Signal.ink },
  otherArtist: { fontSize: 13, color: Signal.inkMuted, marginTop: 1 },
});

export default VoiceSearchCard;
