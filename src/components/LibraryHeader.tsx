import React from 'react';
import { StyleSheet } from 'react-native';
import { RecentlyPlayedGrid, RecentlyPlayedMode } from './RecentlyPlayedGrid';
import { Song } from '../types/song';

interface LibraryHeaderProps {
  hasSongs: boolean;
  /** Second arg is the tapped row's own list, which becomes the play queue. */
  onSongPress: (song: Song, queue: Song[]) => void;
  onSongLongPress: (song: Song) => void;
  onLikePress: (id: string) => void;
  onMagicPress: (song: Song) => void;
  currentSong: Song | null;
  recentlyPlayedMode: RecentlyPlayedMode;
}

const LibraryHeader: React.FC<LibraryHeaderProps> = ({
  hasSongs,
  onSongPress,
  onSongLongPress,
  onLikePress,
  onMagicPress,
  currentSong,
  recentlyPlayedMode,
}) => {
  if (!hasSongs) return null;

  return (
    <RecentlyPlayedGrid
      onSongPress={onSongPress}
      onSongLongPress={onSongLongPress}
      onLikePress={onLikePress}
      onMagicPress={onMagicPress}
      mode={recentlyPlayedMode}
      currentSong={currentSong}
      style={styles.recentlyPlayedGrid}
    />
  );
};

const styles = StyleSheet.create({
  // Extra top gap so the art squares sit clear of the brand row, not tucked
  // right under it.
  recentlyPlayedGrid: { marginTop: 6, marginBottom: 4 },
});

export default React.memo(LibraryHeader);
