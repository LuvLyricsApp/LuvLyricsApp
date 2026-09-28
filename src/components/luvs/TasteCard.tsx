/**
 * One sleeve on the Luvs taste map: the cover full-bleed, its motion canvas
 * while it plays, and the equaliser in the corner. Title and actions live
 * under the map, so the card is pure picture.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Artwork from '../allegra/Artwork';
import CanvasVideoLayer from '../CanvasVideoLayer';
import { useCanvasArtwork } from '../../hooks/useCanvasArtwork';
import { EqBars } from './LuvControls';
import type { UnifiedSong } from '../../types/song';

export const TasteCard: React.FC<{ song: UnifiedSong; size: number; active: boolean; playing: boolean }> = React.memo(({ song, size, active, playing }) => {
  const canvas = useCanvasArtwork(active ? { title: song.title, artist: song.artist, duration: song.duration } : null);
  return (
    <View style={StyleSheet.absoluteFill}>
      <Artwork uri={song.highResArt || song.thumbnail} title={song.title} artist={song.artist} size={size} priority={active ? 'high' : 'normal'} style={StyleSheet.absoluteFill} />
      {active ? <CanvasVideoLayer canvas={canvas} playing={playing} scrimStrength={0.25} /> : null}
      <LinearGradient
        colors={['rgba(0,0,0,0.28)', 'rgba(0,0,0,0)', 'rgba(0,0,0,0)', 'rgba(0,0,0,0.35)']}
        locations={[0, 0.22, 0.7, 1]}
        style={StyleSheet.absoluteFill}
      />
      {active ? <View style={styles.eq}><EqBars active={playing} /></View> : null}
      <View style={styles.edge} />
    </View>
  );
});

const styles = StyleSheet.create({
  eq: { position: 'absolute', left: 16, top: 16 },
  edge: { ...StyleSheet.absoluteFillObject, borderRadius: 30, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.18)' },
});

export default TasteCard;
