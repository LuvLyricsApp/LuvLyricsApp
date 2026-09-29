/**
 * A search result on Get songs: the cover, its title and artist, and a preview
 * button. Tap to download (or to tick it while selecting); long-press starts
 * selecting; the artist opens their songs. Glass in Allegra's language, with the
 * wave colour for a ticked card.
 */
import React, { memo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { UnifiedSong } from '../types/song';
import { Ionicons } from '@expo/vector-icons';
import Artwork from './allegra/Artwork';
import { Tactile } from './allegra/motion';
import { Glass, Radius, Signal } from '../constants/allegraTheme';
import { formatTime } from '../utils/formatters';

const CARD_MARGIN = 6;

interface DownloadGridCardProps {
  song: UnifiedSong;
  isSelected: boolean;
  isPlayingPreview: boolean;
  onPress: () => void;
  onLongPress: () => void;
  onPlayPress: () => void;
  onArtistPress: () => void;
  selectionMode?: boolean;
}

export const DownloadGridCard = memo(({
  song, isSelected, isPlayingPreview,
  onPress, onLongPress, onPlayPress, onArtistPress, selectionMode
}: DownloadGridCardProps) => (
  <Tactile
    wrapperStyle={styles.wrap}
    style={[styles.container, isSelected && styles.selected]}
    pressScale={0.97}
    onPress={onPress}
    onLongPress={onLongPress}
    accessibilityRole="button"
    accessibilityLabel={`${song.title} by ${song.artist}${isSelected ? ', selected' : ''}. ${selectionMode ? 'Tap to select' : 'Tap to download'}`}
  >
    <View style={styles.coverContainer}>
      <Artwork uri={song.highResArt} title={song.title} artist={song.artist} size={160} style={StyleSheet.absoluteFill} />
      <Tactile
        onPress={onPlayPress}
        hitSlop={6}
        pressScale={0.9}
        accessibilityRole="button"
        accessibilityLabel={isPlayingPreview ? 'Stop preview' : 'Preview'}
        wrapperStyle={styles.previewWrap}
        style={styles.preview}
      >
        <Ionicons name={isPlayingPreview ? 'pause' : 'play'} size={18} color={Signal.ink} style={isPlayingPreview ? undefined : styles.playNudge} />
      </Tactile>
      {(isSelected || selectionMode) && (
        <View style={[styles.tick, isSelected && styles.tickOn]}>
          {isSelected ? <Ionicons name="checkmark" size={15} color={Signal.waveInk} /> : null}
        </View>
      )}
    </View>

    <View style={styles.infoContainer}>
      <Text style={styles.title} numberOfLines={1}>{song.title}</Text>
      <Tactile onPress={onArtistPress} hitSlop={6} pressScale={0.97} accessibilityRole="button" accessibilityLabel={`Songs by ${song.artist}`}>
        <Text style={styles.artist} numberOfLines={1}>{song.artist}</Text>
      </Tactile>
      <View style={styles.metaRow}>
        {!!song.duration && <Text style={styles.metaText}>{formatTime(song.duration)}</Text>}
        <View style={styles.source}>
          <Text style={styles.sourceText}>{song.source}</Text>
        </View>
      </View>
    </View>
  </Tactile>
));

const styles = StyleSheet.create({
  wrap: { flex: 1, margin: CARD_MARGIN },
  container: {
    flex: 1,
    backgroundColor: Glass.fill,
    borderRadius: Radius.panel - 4,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: Glass.hairline,
  },
  selected: { borderColor: Signal.wave },
  coverContainer: { aspectRatio: 1, width: '100%', position: 'relative', backgroundColor: Signal.bgSubtle },
  previewWrap: { position: 'absolute', right: 8, bottom: 8 },
  preview: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(8,9,12,0.55)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Glass.hairlineStrong,
  },
  playNudge: { marginLeft: 2 },
  tick: {
    position: 'absolute',
    top: 8,
    left: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(244,241,234,0.6)',
    backgroundColor: 'rgba(8,9,12,0.35)',
  },
  tickOn: { borderColor: Signal.wave, backgroundColor: Signal.wave },
  infoContainer: { paddingHorizontal: 10, paddingVertical: 9, gap: 2 },
  title: { color: Signal.ink, fontSize: 14, fontWeight: '700' },
  artist: { color: Signal.inkSoft, fontSize: 12, fontWeight: '400' },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 3, minHeight: 20 },
  metaText: { color: Signal.inkMuted, fontSize: 11, fontVariant: ['tabular-nums'] },
  source: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: Radius.pill,
    backgroundColor: Glass.fillLight,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Glass.hairline,
  },
  sourceText: { color: Signal.inkSoft, fontSize: 10, fontWeight: '600' },
});
