/**
 * Playlist cover: the first song's art, or a 2×2 mosaic of the first four.
 * Every cell goes through Artwork, so a song without a cover still gets its
 * designed artwork — and an empty playlist gets one generated from its name.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Song } from '../types/song';
import Artwork, { GeneratedArtwork } from './allegra/Artwork';
import { Radius } from '../constants/allegraTheme';

interface MosaicCoverProps {
  songs: Song[]; // Up to 4 songs (should be latest 4)
  size: number; // Total width/height of the mosaic
  /** Playlist name — gives an empty playlist its own cover. */
  name?: string;
  /** Print the name on an empty playlist's cover — only where no title sits beside it. */
  label?: boolean;
}

export const MosaicCover: React.FC<MosaicCoverProps> = ({ songs, size, name, label = false }) => {
  const frame = [styles.frame, { width: size, height: size }];

  if (songs.length === 0) {
    return (
      <View style={frame}>
        <GeneratedArtwork title={name || 'New playlist'} size={size} label={label} />
      </View>
    );
  }

  if (songs.length < 4) {
    const song = songs[0];
    return <Artwork uri={song.coverImageUri} title={song.title} artist={song.artist} size={size} style={frame} />;
  }

  const cell = size / 2;
  return (
    <View style={[frame, styles.grid]}>
      {songs.slice(0, 4).map(song => (
        <Artwork key={song.id} uri={song.coverImageUri} title={song.title} artist={song.artist} size={cell} style={{ width: cell, height: cell }} />
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  frame: {
    borderRadius: Radius.well,
    overflow: 'hidden',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
});

export default MosaicCover;
