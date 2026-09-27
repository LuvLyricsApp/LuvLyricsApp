import React from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import SynchronizedLyrics, { SynchronizedLyricsRef } from './SynchronizedLyrics';
import AppleArtworkStage from './AppleArtworkStage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
// Theme context used via props
type ProcessedLyric = { timestamp: number; text: string };

const { width } = Dimensions.get('window');
const HEADER_CLEARANCE = 56;
const CONTROLS_CLEARANCE = 250;

interface NowPlayingLyricsAreaProps {
  showLyrics: boolean;
  processedLyrics: ProcessedLyric[];
  currentTime: any;
  onLyricPress: (timestamp: number) => void;
  songTitle?: string;
  songArtist?: string;
  /** Changes on every track change; drives the artwork transition. */
  songId?: string;
  isUserScrollingRef: React.MutableRefObject<boolean>;
  scrollTimeoutRef: React.MutableRefObject<NodeJS.Timeout | null>;
  flatListRef: React.RefObject<SynchronizedLyricsRef>;
  coverImageUri?: string;
  storePlaying: boolean;
  isDark: boolean;
  colors: {
    cardHover: string;
    textMuted: string;
  };
  onCoverLongPress: () => void;
  /** A motion canvas fills the screen: step the artwork aside so it shows. */
  canvasVisible?: boolean;
}

const NowPlayingLyricsArea: React.FC<NowPlayingLyricsAreaProps> = ({
  showLyrics,
  processedLyrics,
  currentTime,
  onLyricPress,
  songTitle,
  songArtist,
  songId,
  isUserScrollingRef,
  scrollTimeoutRef,
  flatListRef,
  coverImageUri,
  storePlaying,
  onCoverLongPress,
  canvasVisible = false,
}) => {
  const insets = useSafeAreaInsets();
  if (!showLyrics) {
    return (
      <View style={styles.artworkContainer}>
        {canvasVisible ? null : (
          <AppleArtworkStage
            uri={coverImageUri}
            title={songTitle ?? 'Untitled'}
            artist={songArtist}
            songKey={songId ?? songTitle ?? 'song'}
            size={width - 64}
            playing={storePlaying}
            onLongPress={onCoverLongPress}
          />
        )}
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
  artworkContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: 260,
  },
});

export default React.memo(NowPlayingLyricsArea);
