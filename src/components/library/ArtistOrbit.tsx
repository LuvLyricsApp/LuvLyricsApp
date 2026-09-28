/**
 * Your artists as a row of round covers, each sized by how many of their
 * songs you have. Tap one to see only their songs (tap again to go back);
 * the chosen one wears the chartreuse ring.
 */
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Artwork from '../allegra/Artwork';
import { Tactile } from '../allegra/motion';
import { Signal } from '../../constants/allegraTheme';
import * as Haptics from '../../utils/haptics';
import type { ArtistGroup } from './libraryShape';

const MIN = 58;
const MAX = 84;

export const ArtistOrbit: React.FC<{
  artists: ArtistGroup[];
  selected: string | null;
  onSelect: (name: string | null) => void;
}> = ({ artists, selected, onSelect }) => {
  if (artists.length < 2) return null;
  const most = artists[0]?.count ?? 1;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {artists.map(artist => {
        const on = selected === artist.name;
        // Bigger for the artists you keep most of; never a pill of text.
        const size = Math.round(MIN + (MAX - MIN) * Math.sqrt(artist.count / most));
        return (
          <Tactile
            key={artist.name}
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              onSelect(on ? null : artist.name);
            }}
            pressScale={0.92}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            accessibilityLabel={`${artist.name}, ${artist.count} ${artist.count === 1 ? 'song' : 'songs'}${on ? '. Showing only their songs' : ''}`}
            style={styles.item}
          >
            <View style={[styles.ring, { width: size + 8, height: size + 8, borderRadius: (size + 8) / 2 }, on && styles.ringOn]}>
              <Artwork uri={artist.cover} title={artist.name} size={size} style={{ width: size, height: size, borderRadius: size / 2 }} />
            </View>
            <Text style={[styles.name, on && styles.nameOn]} numberOfLines={1}>{artist.name}</Text>
            <Text style={styles.count}>{artist.count}</Text>
          </Tactile>
        );
      })}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  row: { paddingHorizontal: 20, gap: 14, alignItems: 'flex-end', paddingBottom: 4 },
  item: { alignItems: 'center', width: MAX + 8 },
  ring: { alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'transparent' },
  ringOn: { borderColor: Signal.wave },
  name: { color: Signal.inkSoft, fontSize: 13, fontWeight: '600', marginTop: 6, maxWidth: MAX + 8, textAlign: 'center' },
  nameOn: { color: Signal.wave },
  count: { color: Signal.inkFaint, fontSize: 12, marginTop: 1, fontVariant: ['tabular-nums'] },
});

export default ArtistOrbit;
