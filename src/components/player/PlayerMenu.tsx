/**
 * The Now Playing ••• menu — Echo Music's PlayerMenu in LuvLyrics' frosted
 * glass: Radio · Add · Share across the top, then the song's actions as
 * rounded rows. Everything here does something real; rows that can't work
 * for this song or on this platform are left out rather than shown dead.
 */
import React from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SheetScrollView } from './PlayerSheet';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from '../../utils/haptics';
import { Song } from '../../types/song';
import { isStreamSongId } from '../../services/stream/streamSong';
import { NativeAudioPlayer } from '../../services/NativeAudioPlayer';
import { canSetRingtone } from '../../services/player/playerMenuActions';
import { usePlaybackModesStore } from '../../store/playbackModesStore';
import { useListenTogetherStore } from '../../store/listenTogetherStore';

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

export type PlayerMenuAction =
  | 'radio' | 'add' | 'share'
  | 'cast' | 'ambient' | 'lyrics' | 'shuffle' | 'download' | 'like' | 'repeat' | 'refetch'
  | 'artist' | 'ringtone' | 'together'
  | 'details' | 'equalizer' | 'advanced';

interface PlayerMenuProps {
  song: Song;
  liked: boolean;
  showLyrics: boolean;
  onAction: (action: PlayerMenuAction) => void;
}

const Top: React.FC<{ icon: IconName; label: string; onPress: () => void }> = ({ icon, label, onPress }) => (
  <Pressable onPress={onPress} style={({ pressed }) => [styles.top, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel={label}>
    <MaterialCommunityIcons name={icon} size={22} color="#fff" />
    <Text style={styles.topLabel} numberOfLines={1}>{label}</Text>
  </Pressable>
);

const Row: React.FC<{ icon: IconName; title: string; hint?: string; on?: boolean; onPress: () => void }> = ({ icon, title, hint, on, onPress }) => (
  <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel={title}>
    <MaterialCommunityIcons name={icon} size={23} color={on ? '#d9e66a' : '#fff'} />
    <View style={styles.rowText}>
      <Text style={styles.rowTitle}>{title}</Text>
      {hint ? <Text style={styles.rowHint}>{hint}</Text> : null}
    </View>
  </Pressable>
);

export const PlayerMenu: React.FC<PlayerMenuProps> = ({ song, liked, showLyrics, onAction }) => {
  const repeatOne = usePlaybackModesStore(s => s.repeatOne);
  const tempo = usePlaybackModesStore(s => s.tempo);
  const pitch = usePlaybackModesStore(s => s.pitch);
  const room = useListenTogetherStore(s => s.room);
  const role = useListenTogetherStore(s => s.role);
  const stream = isStreamSongId(song.id);
  const android = Platform.OS === 'android' && NativeAudioPlayer.isAvailable();
  const artist = song.artist && !/^unknown artist$/i.test(song.artist) ? song.artist : null;

  const act = (a: PlayerMenuAction) => () => {
    Haptics.selectionAsync().catch(() => {});
    onAction(a);
  };

  const together = room
    ? `${role === 'host' ? 'Hosting' : 'In'} room ${room.room_code} · ${room.users.length} listening`
    : 'Listen with friends in sync';
  const advanced = tempo !== 1 || pitch !== 1 ? `Tempo ${tempo}× · pitch ${pitch}×` : 'Change the song’s tempo and pitch';

  return (
    <SheetScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.topRow}>
        <Top icon="radio" label="Radio" onPress={act('radio')} />
        <Top icon="playlist-plus" label="Add" onPress={act('add')} />
        <Top icon="share-outline" label="Share" onPress={act('share')} />
      </View>

      <View style={styles.group}>
        {android ? <Row icon="cast" title="Cast to…" onPress={act('cast')} /> : null}
        <Row icon="fullscreen" title="Ambient mode" onPress={act('ambient')} />
        <Row icon="comment-quote-outline" title={showLyrics ? 'Hide lyrics' : 'Show lyrics'} onPress={act('lyrics')} />
        <Row icon="shuffle-variant" title="Shuffle" hint="Mix up what plays next" onPress={act('shuffle')} />
        {stream ? <Row icon="download-outline" title="Download" onPress={act('download')} /> : null}
        <Row icon={liked ? 'heart' : 'heart-outline'} title={liked ? 'Liked' : 'Like'} on={liked} onPress={act('like')} />
        <Row icon={repeatOne ? 'repeat-once' : 'repeat'} title={repeatOne ? 'Repeating this song' : 'Repeat'} on={repeatOne} onPress={act('repeat')} />
        <Row icon="refresh" title="Refetch" hint={stream ? 'Load the stream again' : 'Reload the audio'} onPress={act('refetch')} />
      </View>

      {artist ? (
        <View style={styles.group}>
          <Row icon="account-music-outline" title="View artist" hint={artist} onPress={act('artist')} />
        </View>
      ) : null}

      {canSetRingtone(song) ? (
        <View style={styles.group}>
          <Row icon="bell-outline" title="Set as ringtone" onPress={act('ringtone')} />
        </View>
      ) : null}

      <View style={styles.group}>
        <Row icon="account-multiple-outline" title="Listen together" hint={together} on={!!room} onPress={act('together')} />
      </View>

      <View style={styles.group}>
        <Row icon="information-outline" title="Details" hint="The song’s information" onPress={act('details')} />
        {android ? <Row icon="equalizer" title="Equalizer" hint="Adjust the sound" onPress={act('equalizer')} /> : null}
        {android ? <Row icon="tune-variant" title="Advanced" hint={advanced} onPress={act('advanced')} /> : null}
      </View>
    </SheetScrollView>
  );
};

const styles = StyleSheet.create({
  scroll: { flexGrow: 0 },
  content: { paddingBottom: 6 },
  topRow: { flexDirection: 'row', gap: 6, marginBottom: 12 },
  top: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.09)',
  },
  topLabel: { color: '#fff', fontSize: 15, fontWeight: '600' },
  group: { gap: 4, marginBottom: 12 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    minHeight: 54,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  rowText: { flex: 1 },
  rowTitle: { color: '#fff', fontSize: 16, fontWeight: '600' },
  rowHint: { color: 'rgba(255,255,255,0.6)', fontSize: 13, marginTop: 2 },
  pressed: { backgroundColor: 'rgba(255,255,255,0.14)' },
});

export default PlayerMenu;
