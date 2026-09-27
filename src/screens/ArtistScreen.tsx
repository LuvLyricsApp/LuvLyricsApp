/**
 * An artist, the way Echo Music shows one (YouTube Music's artist page):
 *
 *   full-bleed photo (the top song's motion canvas plays over it when one
 *   exists), the name, subscriber / monthly-audience chips, About, then
 *   Follow · Radio · Shuffle, top songs, albums, singles, videos and
 *   "Fans might also like".
 *
 * The page takes the photo's colours. Songs play through the catalog
 * (browsePlay), like every YouTube Music list in the app.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useIsFocused } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BrowseStackParamList } from '../types/navigation';
import { YTMusicClient } from '../services/ytmusic/YTMusicClient';
import { ArtistPage, Shelf, YTItem } from '../services/ytmusic/browse';
import { YTSong } from '../services/ytmusic/parsers';
import { playEndpoint, playYTSongs } from '../services/stream/browsePlay';
import { BrowseShelf } from '../components/browse/BrowseShelf';
import Artwork from '../components/allegra/Artwork';
import { RiseIn } from '../components/allegra/motion';
import { useArtworkPalette } from '../components/allegra/useArtworkPalette';
import { hexToHsl, hslToHex } from '../components/allegra/palette';
import CanvasVideoLayer from '../components/CanvasVideoLayer';
import { useCanvasArtwork } from '../hooks/useCanvasArtwork';
import { useFollowedArtistsStore } from '../store/followedArtistsStore';
import { TAB_BAR_CLEARANCE } from '../navigation/tabs';
import * as Haptics from '../utils/haptics';

type Props = NativeStackScreenProps<BrowseStackParamList, 'Artist'>;

/** Echo's page tones: a very dark room of the photo's hue, and a pale chip colour. */
const tones = (hex: string) => {
  const { hue, sat } = hexToHsl(hex);
  return {
    room: hslToHex(hue, Math.min(0.28, Math.max(0.1, sat * 0.4)), 0.075),
    chip: hslToHex(hue, Math.min(0.26, Math.max(0.1, sat * 0.4)), 0.24),
    accent: hslToHex(hue, Math.min(0.6, Math.max(0.3, sat)), 0.82),
    accentInk: hslToHex(hue, 0.35, 0.18),
  };
};

const ArtistScreen: React.FC<Props> = ({ navigation, route }) => {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const focused = useIsFocused();
  const [page, setPage] = useState<ArtistPage | null>(null);
  const [failed, setFailed] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [pending, setPending] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setPage(null);
    setFailed(false);
    (async () => {
      const id = route.params.browseId ?? (route.params.name ? await YTMusicClient.findArtist(route.params.name) : null);
      const next = id ? await YTMusicClient.artist(id) : null;
      if (!alive) return;
      if (next) setPage(next);
      else setFailed(true);
    })().catch(() => alive && setFailed(true));
    return () => { alive = false; };
  }, [route.params.browseId, route.params.name]);

  const palette = useArtworkPalette(page?.thumbnail);
  const tone = useMemo(() => tones(palette.primary), [palette.primary]);

  const topShelf = page?.sections.find(s => s.items.every(i => i.kind === 'song'));
  const topSong = topShelf?.items[0]?.kind === 'song' ? topShelf.items[0].song : undefined;
  // Echo's artist header video: the top song's motion artwork, when it has one.
  const canvas = useCanvasArtwork(topSong && page ? { title: topSong.title, artist: page.name } : null);

  const followed = useFollowedArtistsStore(s => (page ? s.artists.some(a => a.browseId === page.browseId) : false));

  const play = useCallback(async (songs: YTSong[], index: number) => {
    Haptics.selectionAsync().catch(() => {});
    setPending(songs[index]?.videoId ?? null);
    await playYTSongs(songs, index);
    setPending(null);
  }, []);

  const open = useCallback((item: Exclude<YTItem, { kind: 'song' }>) => {
    if (item.kind === 'artist') navigation.push('Artist', { browseId: item.browseId });
    else navigation.push('Collection', { browseId: item.browseId, title: item.title, thumbnail: item.thumbnail });
  }, [navigation]);

  const openMore = useCallback((shelf: Shelf) => {
    if (shelf.more?.browseId.startsWith('VL') || shelf.more?.browseId.startsWith('MPRE')) {
      navigation.push('Collection', { browseId: shelf.more.browseId, title: shelf.title });
    }
  }, [navigation]);

  const heroH = Math.round(width * 1.12);

  if (!page) {
    return (
      <View style={[styles.fill, styles.center, { backgroundColor: '#0b0b0f' }]}>
        {failed ? (
          <>
            <Text style={styles.empty}>This artist could not be loaded.</Text>
            <Pressable onPress={() => navigation.goBack()} style={styles.retry}><Text style={styles.retryText}>Go back</Text></Pressable>
          </>
        ) : <ActivityIndicator color="#fff" />}
      </View>
    );
  }

  return (
    <View style={[styles.fill, { backgroundColor: tone.room }]}>
      <ScrollView contentContainerStyle={{ paddingBottom: TAB_BAR_CLEARANCE + insets.bottom + 90 }} showsVerticalScrollIndicator={false}>
        <View style={{ height: heroH }}>
          <Artwork uri={page.thumbnail} title={page.name} size={width} priority="high" style={[StyleSheet.absoluteFill, { width, height: heroH }]} />
          {focused ? <CanvasVideoLayer canvas={canvas} playing={focused} scrimStrength={0.2} /> : null}
          <LinearGradient colors={['rgba(0,0,0,0.35)', 'transparent', 'transparent', tone.room]} locations={[0, 0.2, 0.55, 1]} style={StyleSheet.absoluteFill} />
          <View style={styles.heroText}>
            <Text style={[styles.name, { color: tone.accent }]} numberOfLines={2} adjustsFontSizeToFit>{page.name}</Text>
            <View style={styles.chips}>
              {page.subscribers ? (
                <View style={[styles.chip, { backgroundColor: tone.chip }]}>
                  <Ionicons name="people-outline" size={16} color={tone.accent} />
                  <Text style={[styles.chipText, { color: tone.accent }]}>{page.subscribers} subscribers</Text>
                </View>
              ) : null}
              {page.monthlyListeners ? (
                <View style={[styles.chip, { backgroundColor: tone.accent }]}>
                  <MaterialCommunityIcons name="waveform" size={16} color={tone.accentInk} />
                  <Text style={[styles.chipText, { color: tone.accentInk }]}>{page.monthlyListeners} monthly</Text>
                </View>
              ) : null}
            </View>
          </View>
        </View>

        {page.description ? (
          <RiseIn index={0}>
            <Pressable onPress={() => setAboutOpen(o => !o)} style={styles.about} accessibilityRole="button">
              <Text style={styles.aboutTitle}>About</Text>
              <Text style={styles.aboutText} numberOfLines={aboutOpen ? undefined : 3}>{page.description}</Text>
            </Pressable>
          </RiseIn>
        ) : null}

        <RiseIn index={1}>
          <View style={styles.actions}>
            <Pressable
              style={({ pressed }) => [styles.action, { backgroundColor: followed ? tone.accent : tone.chip }, pressed && styles.pressed]}
              onPress={() => {
                Haptics.selectionAsync().catch(() => {});
                useFollowedArtistsStore.getState().toggle({ browseId: page.browseId, name: page.name, thumbnail: page.thumbnail });
              }}
              accessibilityRole="button"
            >
              <Ionicons name={followed ? 'checkmark' : 'person-add-outline'} size={19} color={followed ? tone.accentInk : '#fff'} />
              <Text style={[styles.actionText, followed && { color: tone.accentInk }]}>{followed ? 'Following' : 'Follow'}</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.action, { backgroundColor: tone.chip }, pressed && styles.pressed]}
              onPress={() => { Haptics.selectionAsync().catch(() => {}); if (page.radio) playEndpoint(page.radio); else if (topShelf) play(topShelf.items.flatMap(i => (i.kind === 'song' ? [i.song] : [])), 0); }}
              accessibilityRole="button"
            >
              <Ionicons name="radio-outline" size={19} color="#fff" />
              <Text style={styles.actionText}>Radio</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.action, { backgroundColor: tone.chip }, pressed && styles.pressed]}
              onPress={() => {
                Haptics.selectionAsync().catch(() => {});
                if (page.shuffle) playEndpoint(page.shuffle, { shuffle: true });
                else if (topShelf) playYTSongs(topShelf.items.flatMap(i => (i.kind === 'song' ? [i.song] : [])), 0, { shuffle: true });
              }}
              accessibilityRole="button"
            >
              <Ionicons name="shuffle" size={19} color="#fff" />
              <Text style={styles.actionText}>Shuffle</Text>
            </Pressable>
          </View>
        </RiseIn>

        {page.sections.map((shelf, i) => (
          <RiseIn key={`${shelf.title}-${i}`} index={i + 2}>
            <BrowseShelf
              shelf={shelf}
              rows={shelf === topShelf}
              onOpen={open}
              onPlay={play}
              pendingId={pending}
              onMore={shelf.more ? () => openMore(shelf) : undefined}
            />
          </RiseIn>
        ))}
      </ScrollView>

      <Pressable onPress={() => navigation.goBack()} style={[styles.back, { top: insets.top + 8 }]} hitSlop={10} accessibilityRole="button" accessibilityLabel="Back">
        <Ionicons name="arrow-back" size={24} color="#fff" />
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  empty: { color: 'rgba(255,255,255,0.7)', fontSize: 15 },
  retry: { marginTop: 14, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.12)' },
  retryText: { color: '#fff', fontWeight: '600' },
  heroText: { position: 'absolute', left: 20, right: 20, bottom: 12 },
  name: { fontSize: 44, fontWeight: '700' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 12 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, height: 36, borderRadius: 18 },
  chipText: { fontSize: 15, fontWeight: '600' },
  about: { paddingHorizontal: 20, marginTop: 14 },
  aboutTitle: { color: '#fff', fontSize: 17, fontWeight: '700', marginBottom: 6 },
  aboutText: { color: 'rgba(255,255,255,0.72)', fontSize: 15, lineHeight: 21 },
  actions: { flexDirection: 'row', gap: 8, paddingHorizontal: 20, marginTop: 20 },
  action: { flex: 1, height: 50, borderRadius: 25, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  actionText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  pressed: { opacity: 0.8, transform: [{ scale: 0.97 }] },
  back: { position: 'absolute', left: 14, width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.3)' },
});

export default ArtistScreen;
