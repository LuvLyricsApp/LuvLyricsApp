import React from 'react';
import { View, Pressable, StyleSheet, Image, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import SynchronizedLyrics, { SynchronizedLyricsRef } from './SynchronizedLyrics';
import AppleArtworkStage from './AppleArtworkStage';
// Theme context used via props
type ProcessedLyric = { timestamp: number; text: string };

const { width } = Dimensions.get('window');

interface NowPlayingLyricsAreaProps {
  showLyrics: boolean;
  processedLyrics: ProcessedLyric[];
  currentTime: any;
  onLyricPress: (timestamp: number) => void;
  songTitle?: string;
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
  isUserScrollingRef,
  scrollTimeoutRef,
  flatListRef,
  coverImageUri,
  storePlaying,
  isDark,
  colors,
  onCoverLongPress,
  canvasVisible = false,
}) => {
  if (!showLyrics) {
    return (
      <View style={styles.artworkContainer}>
        {canvasVisible ? null : (
          <AppleArtworkStage
            uri={coverImageUri}
            size={width - 64}
            playing={storePlaying}
            onLongPress={onCoverLongPress}
          />
        )}
      </View>
    );
  }

  return (
    <SynchronizedLyrics
      ref={flatListRef}
      lyrics={processedLyrics || []}
      currentTime={currentTime}
      onLyricPress={onLyricPress}
      songTitle={songTitle}
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
      headerContent={
        canvasVisible ? <View style={styles.topSpacer} /> : (
        <View style={styles.topSpacer}>
          <Pressable
            onLongPress={onCoverLongPress}
            style={({ pressed }) => [
              styles.mainCoverContainer,
              pressed && { opacity: 0.8 },
            ]}
          >
            {coverImageUri ? (
              <Image source={{ uri: coverImageUri }} style={styles.mainCover} />
            ) : (
              <View style={[styles.mainCover, { backgroundColor: isDark ? '#333' : colors.cardHover, justifyContent: 'center', alignItems: 'center' }]}>
                <Ionicons name="musical-note" size={60} color={isDark ? '#666' : colors.textMuted} />
              </View>
            )}
          </Pressable>
        </View>
        )
      }
    />
  );
};

const styles = StyleSheet.create({
  topSpacer: {
    height: 300,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  mainCoverContainer: {},
  mainCover: {
    width: 250,
    height: 250,
    borderRadius: 16,
  },
  artworkContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: 260,
  },
});

export default React.memo(NowPlayingLyricsArea);
