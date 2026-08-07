import React from 'react';
import { View, Pressable, StyleSheet, Image, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import SynchronizedLyrics, { SynchronizedLyricsRef } from './SynchronizedLyrics';
import { RotatingVinyl } from './VinylRecord';
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
}) => {
  if (!showLyrics) {
    return (
      <View style={styles.vinylContainer}>
        <RotatingVinyl imageUri={coverImageUri} size={width * 0.75} isPlaying={storePlaying} />
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
    borderRadius: 12,
  },
  vinylContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: 200,
  },
});

export default React.memo(NowPlayingLyricsArea);
