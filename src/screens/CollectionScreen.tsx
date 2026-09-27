/**
 * A YouTube Music album or playlist: cover, title, artists, Play / Shuffle,
 * then the tracks. Taps play through the catalog (browsePlay).
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BrowseStackParamList } from '../types/navigation';
import { YTMusicClient } from '../services/ytmusic/YTMusicClient';
import { CollectionPage } from '../services/ytmusic/browse';
import { YTSong } from '../services/ytmusic/parsers';
import { playYTSongs } from '../services/stream/browsePlay';
import { SongRow } from '../components/browse/BrowseShelf';
import Artwork from '../components/allegra/Artwork';
import { useArtworkPalette } from '../components/allegra/useArtworkPalette';
import { hexToHsl, hslToHex } from '../components/allegra/palette';
import { TAB_BAR_CLEARANCE } from '../navigation/tabs';
import * as Haptics from '../utils/haptics';

type Props = NativeStackScreenProps<BrowseStackParamList, 'Collection'>;

const COVER = 230;

const CollectionScreen: React.FC<Props> = ({ navigation, route }) => {
  const insets = useSafeAreaInsets();
  const { browseId, title: hintTitle, thumbnail: hintThumb } = route.params;
  const [page, setPage] = useState<CollectionPage | null>(null);
  const [failed, setFailed] = useState(false);
  const [pending, setPending] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setPage(null);
    setFailed(false);
    YTMusicClient.collection(browseId)
      .then(p => { if (alive) { if (p) setPage(p); else setFailed(true); } })
      .catch(() => alive && setFailed(true));
    return () => { alive = false; };
  }, [browseId]);

  const cover = page?.thumbnail ?? hintThumb;
  const palette = useArtworkPalette(cover);
  const room = useMemo(() => {
    const { hue, sat } = hexToHsl(palette.primary);
    return { top: hslToHex(hue, Math.min(0.35, Math.max(0.12, sat * 0.5)), 0.26), bottom: hslToHex(hue, 0.2, 0.06) };
  }, [palette.primary]);

  const play = useCallback(async (songs: YTSong[], index: number, shuffle = false) => {
    Haptics.selectionAsync().catch(() => {});
    setPending(shuffle ? null : songs[index]?.videoId ?? null);
    await playYTSongs(songs, index, { shuffle });
    setPending(null);
  }, []);

  const songs = page?.songs ?? [];
  const header = (
    <View style={[styles.header, { paddingTop: insets.top + 56 }]}>
      <Artwork uri={cover} title={page?.title ?? hintTitle ?? ''} size={COVER} priority="high" style={styles.cover} />
      <Text style={styles.title} numberOfLines={2}>{page?.title ?? hintTitle}</Text>
      {page?.artists.length ? <Text style={styles.artists} numberOfLines={1}>{page.artists.join(', ')}</Text> : null}
      {page?.subtitle ? <Text style={styles.subtitle} numberOfLines={1}>{page.subtitle}</Text> : null}
      <View style={styles.buttons}>
        <Pressable style={({ pressed }) => [styles.button, styles.buttonPrimary, pressed && styles.pressed]} onPress={() => songs.length && play(songs, 0)} accessibilityRole="button">
          <Ionicons name="play" size={18} color="#111" />
          <Text style={[styles.buttonText, styles.buttonTextDark]}>Play</Text>
        </Pressable>
        <Pressable style={({ pressed }) => [styles.button, pressed && styles.pressed]} onPress={() => songs.length && play(songs, 0, true)} accessibilityRole="button">
          <Ionicons name="shuffle" size={18} color="#fff" />
          <Text style={styles.buttonText}>Shuffle</Text>
        </Pressable>
      </View>
      {!page ? (failed ? <Text style={styles.empty}>This could not be loaded.</Text> : <ActivityIndicator color="#fff" style={styles.loading} />) : null}
    </View>
  );

  return (
    <View style={styles.fill}>
      <LinearGradient colors={[room.top, room.bottom]} locations={[0, 0.6]} style={StyleSheet.absoluteFill} />
      <FlatList
        data={songs}
        keyExtractor={(s, i) => `${s.videoId}-${i}`}
        ListHeaderComponent={header}
        renderItem={({ item, index }) => (
          <SongRow song={item} pending={pending === item.videoId} onPress={() => play(songs, index)} />
        )}
        contentContainerStyle={{ paddingBottom: TAB_BAR_CLEARANCE + insets.bottom + 90 }}
        initialNumToRender={12}
      />
      <Pressable onPress={() => navigation.goBack()} style={[styles.back, { top: insets.top + 8 }]} hitSlop={10} accessibilityRole="button" accessibilityLabel="Back">
        <Ionicons name="arrow-back" size={24} color="#fff" />
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: '#0b0b0f' },
  header: { alignItems: 'center', paddingHorizontal: 24, paddingBottom: 16 },
  cover: { width: COVER, height: COVER, borderRadius: 12, overflow: 'hidden' },
  title: { color: '#fff', fontSize: 24, fontWeight: '700', marginTop: 18, textAlign: 'center' },
  artists: { color: 'rgba(255,255,255,0.8)', fontSize: 16, marginTop: 4 },
  subtitle: { color: 'rgba(255,255,255,0.55)', fontSize: 13, marginTop: 4 },
  buttons: { flexDirection: 'row', gap: 12, marginTop: 18 },
  button: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 46, paddingHorizontal: 26, borderRadius: 23, backgroundColor: 'rgba(255,255,255,0.14)' },
  buttonPrimary: { backgroundColor: '#fff' },
  buttonText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  buttonTextDark: { color: '#111' },
  pressed: { opacity: 0.8, transform: [{ scale: 0.97 }] },
  empty: { color: 'rgba(255,255,255,0.7)', marginTop: 20 },
  loading: { marginTop: 24 },
  back: { position: 'absolute', left: 14, width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.3)' },
});

export default CollectionScreen;
