import React from 'react';
import { View, StyleSheet, useWindowDimensions } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import Artwork from './allegra/Artwork';
import { isCardPlayerBackground, lyricsTextStyle, useSettingsStore } from '../store/settingsStore';
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

/** The cover (or the record it turns into), following a sideways swipe. */
const Stage: React.FC<{
  vinyl: boolean;
  appleInspired: boolean;
  width: number;
  paddingTop: number;
  uri?: string;
  title: string;
  artist?: string;
  playing: boolean;
  stageX?: SharedValue<number>;
}> = ({ vinyl, appleInspired, width, paddingTop, uri, title, artist, playing, stageX }) => {
  const reduce = useReducedMotion();
  const focused = useIsFocused();
  const palette = useArtworkPalette(uri);
  const card = Math.min(width - 64, 380);
  const disc = vinylSize(width);
  const follow = useAnimatedStyle(() => {
    const x = stageX ? stageX.value : 0;
    const away = Math.min(1, Math.abs(x) / Math.max(1, width));
    return { opacity: 1 - 0.55 * away, transform: [{ translateX: x }, { scale: 1 - 0.05 * away }] as const };
  });
  const enter = reduce ? undefined : stageIn;
  const exit = reduce ? undefined : stageOut;
  return (
    <View style={[styles.cardArea, { paddingTop }]} pointerEvents="none">
      <Animated.View style={[{ width: card, height: card, alignItems: 'center', justifyContent: 'center' }, follow]}>
        {vinyl ? (
          <Animated.View key="vinyl" entering={enter} exiting={exit} style={styles.stageLayer}>
            <VinylDisc size={disc} uri={uri} title={title} artist={artist} palette={palette} playing={playing} active={focused} />
          </Animated.View>
        ) : appleInspired ? null : (
          <Animated.View key="card" entering={enter} exiting={exit} style={styles.stageLayer}>
            <Artwork uri={uri} title={title} artist={artist} size={card} priority="high" continuous style={[styles.card, { width: card, height: card }]} />
          </Animated.View>
        )}
      </Animated.View>
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
  const { width } = useWindowDimensions();
  // YouTube Music's player (and our shader wash) always show the artwork as a card.
  const appleInspired = useSettingsStore(s => s.appleMusicInspired && !isCardPlayerBackground(s.playerBackground));
  if (!showLyrics) {
    // Apple Music inspired: the cover is drawn full-bleed by the backdrop, so
    // there is nothing to draw here unless it has become a record.
    // Off: a floating artwork card, as in Echo's other player design.
    if (appleInspired && !vinyl) return null;
    return (
      <Stage
        vinyl={vinyl}
        appleInspired={appleInspired}
        width={width}
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
  lyricsFrame: {
    flex: 1,
    // The controls (meta, scrubber, transport) float over the bottom.
    marginBottom: CONTROLS_CLEARANCE,
  },
});

export default React.memo(NowPlayingLyricsArea);
