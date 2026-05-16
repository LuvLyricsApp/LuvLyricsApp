import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, View, ViewStyle } from 'react-native';
import Animated, { LinearTransition } from 'react-native-reanimated';
import { useSongsStore } from '../store/songsStore';
import { SongCard } from './SongCard';
import { Song } from '../types/song';

const RECENT_SONGS_MAX = 16;
const ARTIST_SONGS_MAX = 20;

export type RecentlyPlayedMode = 'recent' | 'artist';

interface RecentlyPlayedGridProps {
  onSongPress: (song: Song) => void;
  onSongLongPress: (song: Song) => void;
  onLikePress: (id: string) => void;
  onMagicPress: (song: Song) => void;
  mode?: RecentlyPlayedMode;
  currentSong?: Song | null;
  style?: ViewStyle;
}

function normalizeArtist(value?: string): string {
  const raw = value?.trim().toLowerCase() ?? '';
  return raw.split(',')[0]?.trim() ?? '';
}

function getSongDateValue(song: Song): number {
  const candidates = [song.dateCreated, song.dateModified, song.lastPlayed];

  for (const value of candidates) {
    if (!value) continue;
    const time = new Date(value).getTime();
    if (!Number.isNaN(time)) {
      return time;
    }
  }

  return 0;
}

export const RecentlyPlayedGrid: React.FC<RecentlyPlayedGridProps> = React.memo(({
  onSongPress,
  onSongLongPress,
  onLikePress,
  onMagicPress,
  mode = 'recent',
  currentSong,
  style
}) => {
  const songs = useSongsStore(state => state.songs);

  const visibleSongs = useMemo(() => {
    if (mode === 'artist' && currentSong) {
      const currentArtist = normalizeArtist(currentSong.artist);

      if (currentArtist) {
        const artistSongs = songs
          .filter(song => normalizeArtist(song.artist) === currentArtist && !!song.audioUri)
          .sort((a, b) => getSongDateValue(b) - getSongDateValue(a));

        const dedupedArtistSongs = artistSongs.filter(song => song.id !== currentSong.id);

        return [currentSong, ...dedupedArtistSongs].slice(0, ARTIST_SONGS_MAX);
      }
    }

    return songs
      .filter(song => song.lastPlayed)
      .sort((a, b) => (new Date(b.lastPlayed || 0).getTime() - new Date(a.lastPlayed || 0).getTime()))
      .slice(0, RECENT_SONGS_MAX);
  }, [currentSong, mode, songs]);

  if (visibleSongs.length === 0) return null;

  return (
    <View style={style}>

      <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={false} 
        contentContainerStyle={styles.horizontalScroll} 
        decelerationRate="fast" 
        snapToInterval={172}
      >
      {visibleSongs.map((song) => (
        <Animated.View 
          key={song.id} 
          style={styles.horizontalCard}
          layout={LinearTransition.duration(160)}
        >
          <SongCard
            id={song.id} 
            title={song.title} 
            artist={song.artist} 
            album={song.album} 
            gradientId={song.gradientId}
            coverImageUri={song.coverImageUri} 
            duration={song.duration} 
            isLiked={song.isLiked}
            onPress={() => onSongPress(song)} 
            onLongPress={() => onSongLongPress(song)}
            onLikePress={() => onLikePress(song.id)} 
            onMagicPress={() => onMagicPress(song)}
          />
        </Animated.View>
      ))}
      </ScrollView>
    </View>

  );
});

const styles = StyleSheet.create({
  horizontalScroll: {
    paddingLeft: 26,
    paddingRight: 16,
    gap: 12,
    marginBottom: 20
  },
  horizontalCard: {
    width: 160,
  },

});
