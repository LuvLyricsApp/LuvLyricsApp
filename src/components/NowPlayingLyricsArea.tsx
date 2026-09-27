import React from 'react';
import { View, StyleSheet } from 'react-native';
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
}) => {
  const insets = useSafeAreaInsets();
  // The cover itself is drawn full-bleed by the backdrop (AppleBackdrop).
  if (!showLyrics) return null;

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
  lyricsFrame: {
    flex: 1,
    // The controls (meta, scrubber, transport) float over the bottom.
    marginBottom: CONTROLS_CLEARANCE,
  },
});

export default React.memo(NowPlayingLyricsArea);
