/**
 * Sheets opened from the player menu: Details (with the lyrics and cover
 * editors that used to live in the menu) and Advanced (Echo's tempo & pitch).
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from '../../utils/haptics';
import { Song } from '../../types/song';
import { isStreamSongId, parseStreamId } from '../../services/stream/streamSong';
import { formatTimeSV, durationSV } from '../../playback/positionBus';
import { PITCH_STEPS, TEMPO_STEPS, usePlaybackModesStore } from '../../store/playbackModesStore';

const Field: React.FC<{ label: string; value?: string | null }> = ({ label, value }) =>
  value ? (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={styles.fieldValue} selectable>{value}</Text>
    </View>
  ) : null;

const Action: React.FC<{ icon: React.ComponentProps<typeof MaterialCommunityIcons>['name']; label: string; onPress: () => void }> = ({ icon, label, onPress }) => (
  <Pressable onPress={onPress} style={({ pressed }) => [styles.action, pressed && styles.pressed]} accessibilityRole="button">
    <MaterialCommunityIcons name={icon} size={20} color="#fff" />
    <Text style={styles.actionText}>{label}</Text>
  </Pressable>
);

export const SongDetails: React.FC<{
  song: Song;
  onEditLyrics?: () => void;
  onChangeCover?: () => void;
}> = ({ song, onEditLyrics, onChangeCover }) => {
  const stream = parseStreamId(song.id);
  const seconds = durationSV.value > 0 ? durationSV.value : song.duration;
  return (
    <View>
      <Field label="Title" value={song.title} />
      <Field label="Artist" value={song.artist} />
      <Field label="Album" value={song.album} />
      <Field label="Length" value={seconds > 0 ? formatTimeSV(seconds) : null} />
      <Field label="Plays from" value={stream ? `Streaming · ${stream.source}` : 'This phone'} />
      <Field label="Lyrics" value={song.lyrics.length > 0 ? `${song.lyricSource ?? 'Synced'} · ${song.lyrics.length} lines` : 'None yet'} />
      {!isStreamSongId(song.id) && (onEditLyrics || onChangeCover) ? (
        <View style={styles.actions}>
          {onEditLyrics ? <Action icon="text-box-edit-outline" label="Edit lyrics" onPress={onEditLyrics} /> : null}
          {onChangeCover ? <Action icon="image-outline" label="Change cover" onPress={onChangeCover} /> : null}
        </View>
      ) : null}
    </View>
  );
};

const Stepper: React.FC<{ label: string; value: number; steps: readonly number[]; onChange: (v: number) => void }> = ({ label, value, steps, onChange }) => {
  const i = steps.indexOf(value as never);
  const at = i >= 0 ? i : steps.indexOf(1 as never);
  const move = (d: number) => {
    const next = steps[Math.max(0, Math.min(steps.length - 1, at + d))];
    if (next === value) return;
    Haptics.selectionAsync().catch(() => {});
    onChange(next);
  };
  return (
    <View style={styles.stepper}>
      <Text style={styles.stepLabel}>{label}</Text>
      <Pressable onPress={() => move(-1)} disabled={at <= 0} hitSlop={8} style={[styles.stepBtn, at <= 0 && styles.disabled]} accessibilityLabel={`Lower ${label.toLowerCase()}`}>
        <MaterialCommunityIcons name="minus" size={20} color="#fff" />
      </Pressable>
      <Text style={styles.stepValue}>{`${value}×`}</Text>
      <Pressable onPress={() => move(1)} disabled={at >= steps.length - 1} hitSlop={8} style={[styles.stepBtn, at >= steps.length - 1 && styles.disabled]} accessibilityLabel={`Raise ${label.toLowerCase()}`}>
        <MaterialCommunityIcons name="plus" size={20} color="#fff" />
      </Pressable>
    </View>
  );
};

export const TempoPitch: React.FC = () => {
  const tempo = usePlaybackModesStore(s => s.tempo);
  const pitch = usePlaybackModesStore(s => s.pitch);
  const set = usePlaybackModesStore(s => s.setTempoPitch);
  return (
    <View>
      <Stepper label="Tempo" value={tempo} steps={TEMPO_STEPS} onChange={t => set(t, pitch)} />
      <Stepper label="Pitch" value={pitch} steps={PITCH_STEPS} onChange={p => set(tempo, p)} />
      <Pressable
        onPress={() => set(1, 1)}
        disabled={tempo === 1 && pitch === 1}
        style={({ pressed }) => [styles.reset, pressed && styles.pressed, tempo === 1 && pitch === 1 && styles.disabled]}
        accessibilityRole="button"
      >
        <Text style={styles.resetText}>Reset</Text>
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  field: { paddingVertical: 9, paddingHorizontal: 6 },
  fieldLabel: { color: 'rgba(255,255,255,0.55)', fontSize: 12, fontWeight: '600' },
  fieldValue: { color: '#fff', fontSize: 16, marginTop: 2 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 12, marginBottom: 4 },
  action: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 48, borderRadius: 24, backgroundColor: 'rgba(255,255,255,0.1)' },
  actionText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  pressed: { backgroundColor: 'rgba(255,255,255,0.16)' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 6 },
  stepLabel: { flex: 1, color: '#fff', fontSize: 16, fontWeight: '600' },
  stepBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.1)' },
  stepValue: { color: '#fff', fontSize: 16, fontWeight: '600', minWidth: 52, textAlign: 'center', fontVariant: ['tabular-nums'] },
  disabled: { opacity: 0.35 },
  reset: { marginTop: 10, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.1)' },
  resetText: { color: '#fff', fontSize: 15, fontWeight: '600' },
});
