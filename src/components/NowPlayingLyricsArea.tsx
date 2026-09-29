import React from 'react';
import { Dimensions, View, StyleSheet, useWindowDimensions } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import Artwork from './allegra/Artwork';
import { isCardPlayerBackground, lyricsTextStyle, useSettingsStore } from '../store/settingsStore';
import { washAt, youtubeWash } from './allegra/palette';
import { isCoverFull } from './player/coverStage';
import { usePlayerStore } from '../store/playerStore';
import Animated, { EntryAnimationsValues, ExitAnimationsValues, SharedValue, useAnimatedStyle, useReducedMotion, withTiming } from 'react-native-reanimated';
import { Motion } from '../constants/allegraTheme';
import VinylDisc from './player/VinylDisc';
import { useArtworkPalette } from './allegra/useArtworkPalette';
import SynchronizedLyrics, { SynchronizedLyricsRef } from './SynchronizedLyrics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type ProcessedLyric = { timestamp: number; text: string };

export const HEADER_CLEARANCE = 28;
/** The compact controls (no volume row) stacked at the bottom. */
export const CONTROLS_CLEARANCE = 372;

/** Height the controls take from the title down (full layout, with volume), plus a clear gap above the title. */
const CONTROLS_ROOM = 360;

/** The record's diameter on a screen this wide: leaves room on the right for the tonearm. */
export const vinylSize = (screenWidth: number): number => Math.round(Math.min(screenWidth * 0.7, 320));

// The cover and the record swap places: the new one turns in from a little
// smaller while the old one turns away.
const stageIn = (_v: EntryAnimationsValues) => {
  'worklet';
  const t = { duration: 340, easing: Motion.ease.decelerate };
  return {
    initialValues: { opacity: 0, transform: [{ scale: 0.88 }, { rotate: '-10deg' }] as const },
    animations: { opacity: withTiming(1, t), transform: [{ scale: withTiming(1, t) }, { rotate: withTiming('0deg', t) }] as const },
  };
};
const stageOut = (_v: ExitAnimationsValues) => {
  'worklet';
  const t = { duration: 220, easing: Motion.ease.accelerate };
  return {
    initialValues: { opacity: 1, transform: [{ scale: 1 }, { rotate: '0deg' }] as const },
    animations: { opacity: withTiming(0, t), transform: [{ scale: withTiming(0.92, t) }, { rotate: withTiming('10deg', t) }] as const },
  };
};
// Tap the cover: the card grows into the full-bleed cover, or the full cover
// draws back into a card. No turn — that belongs to the record.
const growIn = (_v: EntryAnimationsValues) => {
  'worklet';
  const t = { duration: 340, easing: Motion.ease.decelerate };
  return {
    initialValues: { opacity: 0, transform: [{ scale: 0.9 }] as const },
    animations: { opacity: withTiming(1, t), transform: [{ scale: withTiming(1, t) }] as const },
  };
};
const shrinkIn = (_v: EntryAnimationsValues) => {
  'worklet';
  const t = { duration: 340, easing: Motion.ease.decelerate };
  return {
    initialValues: { opacity: 0, transform: [{ scale: 1.12 }] as const },
    animations: { opacity: withTiming(1, t), transform: [{ scale: withTiming(1, t) }] as const },
  };
};
const fadeAway = (_v: ExitAnimationsValues) => {
  'worklet';
  const t = { duration: 220, easing: Motion.ease.accelerate };
  return { initialValues: { opacity: 1 }, animations: { opacity: withTiming(0, t) } };
};

/** The full-bleed cover's height: YouTube Music's, a little taller than wide, never past 62% of the screen. */
export const fullCoverHeight = (width: number, height: number): number => Math.round(Math.min(width * 1.15, height * 0.62));

/**
 * YouTube Music's full cover for the card styles: edge to edge from the top of
 * the screen, melting at the bottom into the wash behind it.
 */
const FullCover: React.FC<{
  width: number;
  screenH: number;
  uri?: string;
  title: string;
  artist?: string;
  primary: string;
  stageX?: SharedValue<number>;
}> = ({ width, screenH, uri, title, artist, primary, stageX }) => {
  const reduce = useReducedMotion();
  const h = fullCoverHeight(width, screenH);
  // The wash's own colour where the cover ends, so there is no seam.
  const meet = washAt(youtubeWash(primary), h / Math.max(1, screenH));
  const follow = useAnimatedStyle(() => {
    const x = stageX ? stageX.value : 0;
    return { opacity: 1 - 0.55 * Math.min(1, Math.abs(x) / Math.max(1, width)), transform: [{ translateX: x }] as const };
  });
  return (
    <Animated.View style={[styles.fullCover, { height: h }, follow]} entering={reduce ? undefined : growIn} exiting={reduce ? undefined : fadeAway} pointerEvents="none">
      <Artwork uri={uri} title={title} artist={artist} size={Math.max(width, h)} priority="high" continuous style={{ width, height: h }} />
      <LinearGradient colors={['rgba(0,0,0,0.32)', 'rgba(0,0,0,0)']} style={[styles.fullShade, { height: Math.round(h * 0.22) }]} />
      <LinearGradient colors={[`${meet}00`, `${meet}cc`, meet]} locations={[0, 0.6, 1]} style={[styles.fullMelt, { height: Math.round(h * 0.42) }]} />
    </Animated.View>
  );
};

interface NowPlayingLyricsAreaProps {
  showLyrics: boolean;
  processedLyrics: ProcessedLyric[];
  currentTime: SharedValue<number>;
  onLyricPress: (timestamp: number) => void;
  songTitle?: string;
  isUserScrollingRef: React.MutableRefObject<boolean>;
  scrollTimeoutRef: React.MutableRefObject<NodeJS.Timeout | null>;
  flatListRef: React.RefObject<SynchronizedLyricsRef>;
  coverImageUri?: string;
  songArtist?: string;
  scrollOffset?: SharedValue<number>;
  /** Show the artwork as a spinning record instead of a cover. */
  vinyl?: boolean;
  playing?: boolean;
  /** The cover follows a sideways swipe by this much. */
  stageX?: SharedValue<number>;
}

/**
 * What the cover stage shows: the backdrop's own full-bleed hero (Apple
 * styles, nothing drawn here), a full cover of our own (card styles), a
 * floating card, or the record.
 */
type StageMode = 'hero' | 'full' | 'card' | 'vinyl';

/** The cover (or the record it turns into), following a sideways swipe. */
const Stage: React.FC<{
  mode: StageMode;
  width: number;
  screenH: number;
  paddingTop: number;
  uri?: string;
  title: string;
  artist?: string;
  playing: boolean;
  stageX?: SharedValue<number>;
}> = ({ mode, width, screenH, paddingTop, uri, title, artist, playing, stageX }) => {
  const reduce = useReducedMotion();
  const focused = useIsFocused();
  const palette = useArtworkPalette(uri);
  // Short screens: the card and the record also fit the height above the
  // title, which used to run over the card's bottom edge.
  const room = Math.max(160, screenH - paddingTop - CONTROLS_ROOM);
  const card = Math.min(width - 64, 380, room);
  const disc = Math.min(vinylSize(width), room);
  const follow = useAnimatedStyle(() => {
    const x = stageX ? stageX.value : 0;
    const away = Math.min(1, Math.abs(x) / Math.max(1, width));
    return { opacity: 1 - 0.55 * away, transform: [{ translateX: x }, { scale: 1 - 0.05 * away }] as const };
  });
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {mode === 'full' ? (
        <FullCover key="full" width={width} screenH={screenH} uri={uri} title={title} artist={artist} primary={palette.primary} stageX={stageX} />
      ) : null}
      <View style={[styles.cardArea, { paddingTop }]}>
        <Animated.View style={[{ width: card, height: card, alignItems: 'center', justifyContent: 'center' }, follow]}>
          {mode === 'vinyl' ? (
            <Animated.View key="vinyl" entering={reduce ? undefined : stageIn} exiting={reduce ? undefined : stageOut} style={styles.stageLayer}>
              <VinylDisc size={disc} uri={uri} title={title} artist={artist} palette={palette} playing={playing} active={focused} />
            </Animated.View>
          ) : mode === 'card' ? (
            <Animated.View key="card" entering={reduce ? undefined : shrinkIn} exiting={reduce ? undefined : fadeAway} style={styles.stageLayer}>
              <Artwork uri={uri} title={title} artist={artist} size={card} priority="high" continuous style={[styles.card, { width: card, height: card }]} />
            </Animated.View>
          ) : null}
        </Animated.View>
      </View>
    </View>
  );
};

const NowPlayingLyricsArea: React.FC<NowPlayingLyricsAreaProps> = ({
  showLyrics,
  processedLyrics,
  currentTime,
  onLyricPress,
  songTitle,
  isUserScrollingRef,
  scrollTimeoutRef,
  flatListRef,
  coverImageUri,
  songArtist,
  scrollOffset,
  vinyl = false,
  playing = false,
  stageX,
}) => {
  // Settings → Lyrics (text size, line spacing) and the song's own alignment (lyrics editor).
  const fontSize = useSettingsStore(st => st.lyricsSize);
  const lineSpacing = useSettingsStore(st => st.lineSpacing);
  // Settings → Lyrics → Alignment, unless the song was set to centre or right
  // in the lyrics editor (songs are stored as 'left' by default).
  const globalAlign = useSettingsStore(st => st.lyricsAlign);
  const songAlign = usePlayerStore(st => st.currentSong?.lyricsAlign);
  const align = songAlign && songAlign !== 'left' ? songAlign : globalAlign;
  const textStyle = React.useMemo(() => lyricsTextStyle(fontSize, lineSpacing, align), [fontSize, lineSpacing, align]);
  const insets = useSafeAreaInsets();
  const { width, height: windowH } = useWindowDimensions();
  const screenH = Math.max(windowH, Dimensions.get('screen').height);
  // Tapping the cover flips it between full-bleed and a card (coverStage.isCoverFull).
  const full = useSettingsStore(s => isCoverFull(s.playerBackground, s.appleMusicInspired, s.playerCoverFull));
  const cardStyle = useSettingsStore(s => isCardPlayerBackground(s.playerBackground));
  if (!showLyrics) {
    // Apple styles, full: the backdrop draws the cover full-bleed, so there is
    // nothing to draw here unless it has become a record. The card styles
    // draw their own full cover over the wash. Otherwise a floating card.
    const mode: StageMode = vinyl ? 'vinyl' : !full ? 'card' : cardStyle ? 'full' : 'hero';
    // 'hero' still renders the (empty) stage, so a card or record leaving
    // plays its exit instead of vanishing with its parent.
    return (
      <Stage
        mode={mode}
        width={width}
        screenH={screenH}
        paddingTop={insets.top + HEADER_CLEARANCE + 24}
        uri={coverImageUri}
        title={songTitle ?? ''}
        artist={songArtist}
        playing={playing}
        stageX={stageX}
      />
    );
  }

  // Apple Music's lyrics view: the lines own the space between the header and
  // the controls, and the sung line's centre rides at 35% of that space — not
  // in the middle of a list whose lower half sits under the controls.
  return (
    <View style={[styles.lyricsFrame, { paddingTop: insets.top + HEADER_CLEARANCE }]}>
      <SynchronizedLyrics
        ref={flatListRef}
        textStyle={textStyle}
        lyrics={processedLyrics || []}
        currentTime={currentTime}
        onLyricPress={onLyricPress}
        songTitle={songTitle}
        activeLinePosition={0.35}
        topSpacerHeight={24}
        edgeFade={56}
        scrollOffset={scrollOffset}
        isUserScrolling={isUserScrollingRef.current}
        onScrollStateChange={(isScrolling) => {
          isUserScrollingRef.current = isScrolling;
          if (!isScrolling) {
            if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
            scrollTimeoutRef.current = setTimeout(() => {
              isUserScrollingRef.current = false;
            }, 4000);
          } else {
            if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
          }
        }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  cardArea: { alignItems: 'center' },
  stageLayer: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  card: { borderRadius: 14, overflow: 'hidden' },
  fullCover: { position: 'absolute', top: 0, left: 0, right: 0, overflow: 'hidden' },
  fullShade: { position: 'absolute', top: 0, left: 0, right: 0 },
  fullMelt: { position: 'absolute', bottom: 0, left: 0, right: 0 },
  lyricsFrame: {
    flex: 1,
    // The controls (meta, scrubber, transport) float over the bottom.
    marginBottom: CONTROLS_CLEARANCE,
  },
});

export default React.memo(NowPlayingLyricsArea);
