import React from 'react';
import { View, StyleSheet, useWindowDimensions } from 'react-native';
import Artwork from './allegra/Artwork';
import { useSettingsStore } from '../store/settingsStore';
import { SharedValue } from 'react-native-reanimated';
import SynchronizedLyrics, { SynchronizedLyricsRef } from './SynchronizedLyrics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type ProcessedLyric = { timestamp: number; text: string };

const HEADER_CLEARANCE = 28;
/** The compact controls (no volume row) stacked at the bottom. */
const CONTROLS_CLEARANCE = 330;

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
}

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
}) => {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const appleInspired = useSettingsStore(s => s.appleMusicInspired);
  if (!showLyrics) {
    // Apple Music inspired: the cover is drawn full-bleed by the backdrop.
    // Off: a floating artwork card, as in Echo's other player design.
    if (appleInspired) return null;
    const size = Math.min(width - 64, 380);
    return (
      <View style={[styles.cardArea, { paddingTop: insets.top + HEADER_CLEARANCE + 24 }]}>
        <Artwork uri={coverImageUri} title={songTitle ?? ''} artist={songArtist} size={size} priority="high" style={[styles.card, { width: size, height: size }]} />
      </View>
    );
  }

  // Apple Music's lyrics view: the lines own the space between the header and
  // the controls, and the sung line rides a third of the way down — not in
  // the middle of a list whose lower half sits under the controls.
  return (
    <View style={[styles.lyricsFrame, { paddingTop: insets.top + HEADER_CLEARANCE }]}>
      <SynchronizedLyrics
        ref={flatListRef}
        lyrics={processedLyrics || []}
        currentTime={currentTime}
        onLyricPress={onLyricPress}
        songTitle={songTitle}
        activeLinePosition={0.3}
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
  card: { borderRadius: 14, overflow: 'hidden' },
  lyricsFrame: {
    flex: 1,
    // The controls (meta, scrubber, transport) float over the bottom.
    marginBottom: CONTROLS_CLEARANCE,
  },
});

export default React.memo(NowPlayingLyricsArea);
