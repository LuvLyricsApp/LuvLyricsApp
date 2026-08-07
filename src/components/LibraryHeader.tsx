import React from 'react';
import { StyleSheet } from 'react-native';
import { RecentlyPlayedGrid, RecentlyPlayedMode } from './RecentlyPlayedGrid';
import { Song } from '../types/song';

interface LibraryHeaderProps {
  hasSongs: boolean;
  onSongPress: (song: Song) => void;
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
  recentlyPlayedGrid: { marginBottom: 4 },
});

export default React.memo(LibraryHeader);
