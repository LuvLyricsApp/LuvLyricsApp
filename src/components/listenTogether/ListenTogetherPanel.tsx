/**
 * The Listen Together room, as a sheet over Now Playing — Echo Music's
 * dialog: start a room or join one by code; inside, the code to share, who's
 * listening, join requests, suggestions and the host's controls.
 */
import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from '../../utils/haptics';
import { Signal } from '../../constants/allegraTheme';
import { useListenTogetherStore } from '../../store/listenTogetherStore';
import { StreamService } from '../../services/stream/StreamService';
import { resolveToCatalog } from '../../services/ytmusic/resolver';
import { searchMusic } from '../../services/MultiSourceSearchService';
import { TrackInfo } from '../../services/listenTogether/protocol';
import {
  approveJoin,
  approveSuggestion,
  connect,
  createRoom,
  joinRoom,
  kickUser,
  leaveRoom,
  rejectJoin,
  blockUser,
  rejectSuggestion,
  requestSync,
  transferHost,
} from '../../services/listenTogether/client';

const tap = () => Haptics.selectionAsync().catch(() => {});

const Button: React.FC<{ label: string; onPress: () => void; primary?: boolean; danger?: boolean; disabled?: boolean; icon?: React.ComponentProps<typeof MaterialCommunityIcons>['name'] }> = ({ label, onPress, primary, danger, disabled, icon }) => (
  <Pressable
    onPress={() => { tap(); onPress(); }}
    disabled={disabled}
    style={({ pressed }) => [styles.button, primary && styles.primary, danger && styles.danger, pressed && styles.pressed, disabled && styles.disabled]}
    accessibilityRole="button"
    accessibilityLabel={label}
  >
    {icon ? <MaterialCommunityIcons name={icon} size={18} color={primary ? Signal.waveInk : '#fff'} /> : null}
    <Text style={[styles.buttonText, primary && styles.primaryText, danger && styles.dangerText]}>{label}</Text>
  </Pressable>
);

const Toggle: React.FC<{ label: string; hint?: string; value: boolean; onChange: (v: boolean) => void }> = ({ label, hint, value, onChange }) => (
  <Pressable onPress={() => { tap(); onChange(!value); }} style={styles.toggleRow} accessibilityRole="switch" accessibilityState={{ checked: value }}>
    <View style={styles.flex}>
      <Text style={styles.toggleLabel}>{label}</Text>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
    <View style={[styles.track, value && styles.trackOn]}>
      <View style={[styles.thumb, value && styles.thumbOn]} />
    </View>
  </Pressable>
);

/** Approving a guest's suggestion: find it in the catalog and play it next. */
const queueSuggestion = async (track: TrackInfo) => {
  const match = await resolveToCatalog(
    { videoId: track.id, title: track.title, artists: track.artist.split(/\s*(?:,|&)\s*/).filter(Boolean), duration: track.duration / 1000 },
    q => searchMusic(q),
  ).catch(() => null);
  if (match) StreamService.playNext(match);
  else useListenTogetherStore.getState().announce(`Couldn’t find “${track.title}”`);
};

const Lobby: React.FC = () => {
  const saved = useListenTogetherStore(s => s.username);
  const autoApprove = useListenTogetherStore(s => s.autoApprove);
  const connection = useListenTogetherStore(s => s.connection);
  const pendingJoinCode = useListenTogetherStore(s => s.pendingJoinCode);
  const invite = useListenTogetherStore(s => s.inviteCode);
  const [name, setName] = useState(saved);
  const [code, setCode] = useState(invite ?? '');
  const ready = name.trim().length > 0;

  if (pendingJoinCode) {
    return (
      <View>
        <Text style={styles.lead}>{`Asked to join ${pendingJoinCode}. Waiting for the host to let you in…`}</Text>
        <Button label="Cancel" onPress={leaveRoom} />
      </View>
    );
  }

  return (
    <View>
      <Text style={styles.lead}>Play the same song at the same moment with friends — on LuvLyrics or Echo Music.</Text>
      <TextInput
        value={name}
        onChangeText={setName}
        placeholder="Your name"
        placeholderTextColor="rgba(255,255,255,0.4)"
        style={styles.input}
        maxLength={32}
        autoCapitalize="words"
        returnKeyType="done"
      />
      <Button label="Start a room" icon="broadcast" primary disabled={!ready} onPress={() => createRoom(name)} />
      <Text style={styles.or}>or join one</Text>
      <View style={styles.joinRow}>
        <TextInput
          value={code}
          onChangeText={t => setCode(t.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
          placeholder="Room code"
          placeholderTextColor="rgba(255,255,255,0.4)"
          style={[styles.input, styles.flex, styles.codeInput]}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={12}
          returnKeyType="go"
          onSubmitEditing={() => { if (ready && code) joinRoom(code, name); }}
        />
        <Button label="Join" disabled={!ready || code.length < 4} onPress={() => joinRoom(code, name)} />
      </View>
      <Toggle label="Let people in without asking" hint="When you host, join requests are approved at once" value={autoApprove} onChange={v => useListenTogetherStore.getState().setAutoApprove(v)} />
      {connection === 'connecting' ? <Text style={styles.status}>Connecting…</Text> : null}
      {connection === 'error' ? <Text style={styles.status}>Couldn’t reach the room server.</Text> : null}
    </View>
  );
};

const Room: React.FC = () => {
  const room = useListenTogetherStore(s => s.room)!;
  const role = useListenTogetherStore(s => s.role);
  const me = useListenTogetherStore(s => s.userId);
  const connection = useListenTogetherStore(s => s.connection);
  const requests = useListenTogetherStore(s => s.joinRequests);
  const suggestions = useListenTogetherStore(s => s.suggestions);
  const buffering = useListenTogetherStore(s => s.bufferingUsers);
  const [managing, setManaging] = useState<string | null>(null);
  const isHost = role === 'host';
  const host = room.users.find(u => u.user_id === room.host_id);

  const shareCode = () => {
    Share.share({
      message: `Listen with me on LuvLyrics or Echo Music — room code ${room.room_code}\nlyricflow://together?code=${room.room_code}`,
    }).catch(() => {});
  };
  const copyCode = () => {
    Clipboard.setStringAsync(room.room_code).catch(() => {});
    useListenTogetherStore.getState().announce('Room code copied');
  };
  const status =
    connection === 'connected' ? (isHost ? 'You’re hosting' : `Following ${host?.username ?? 'the host'}`)
    : connection === 'reconnecting' ? 'Reconnecting…'
    : connection === 'connecting' ? 'Connecting…'
    : 'Offline — tap Resync to try again';

  return (
    <ScrollView style={styles.roomScroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      <View style={styles.codeCard}>
        <View style={styles.flex}>
          <Text style={styles.codeLabel}>Room code</Text>
          <Text style={styles.code} selectable>{room.room_code}</Text>
          <Text style={styles.hint}>{status}</Text>
        </View>
        <Pressable onPress={copyCode} hitSlop={8} style={styles.round} accessibilityLabel="Copy room code">
          <MaterialCommunityIcons name="content-copy" size={18} color="#fff" />
        </Pressable>
        <Pressable onPress={shareCode} hitSlop={8} style={styles.round} accessibilityLabel="Share room code">
          <MaterialCommunityIcons name="share-outline" size={20} color="#fff" />
        </Pressable>
      </View>

      {isHost && requests.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Wants to join</Text>
          {requests.map(r => (
            <View key={r.user_id} style={styles.personRow}>
              <Text style={[styles.person, styles.flex]} numberOfLines={1}>{r.username}</Text>
              <Pressable
                onPress={() => { tap(); blockUser(r.username); }}
                hitSlop={8}
                style={styles.round}
                accessibilityRole="button"
                accessibilityLabel={`Block ${r.username}`}
              >
                <MaterialCommunityIcons name="account-cancel-outline" size={18} color="#fff" />
              </Pressable>
              <Button label="Decline" onPress={() => rejectJoin(r.user_id)} />
              <Button label="Let in" primary onPress={() => approveJoin(r.user_id)} />
            </View>
          ))}
        </View>
      ) : null}

      {isHost && suggestions.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Suggestions</Text>
          {suggestions.map(sg => (
            <View key={sg.suggestion_id} style={styles.personRow}>
              <View style={styles.flex}>
                <Text style={styles.person} numberOfLines={1}>{sg.track_info.title}</Text>
                <Text style={styles.hint} numberOfLines={1}>{`${sg.track_info.artist} · from ${sg.from_username}`}</Text>
              </View>
              <Button label="Skip" onPress={() => rejectSuggestion(sg.suggestion_id)} />
              <Button label="Play next" primary onPress={() => { const s = approveSuggestion(sg.suggestion_id); if (s) queueSuggestion(s.track_info); }} />
            </View>
          ))}
        </View>
      ) : null}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{`Listening · ${room.users.length}`}</Text>
        {room.users.map(u => {
          const waiting = buffering.includes(u.user_id);
          const canManage = isHost && u.user_id !== me;
          return (
            <View key={u.user_id}>
              <Pressable onPress={() => canManage && setManaging(managing === u.user_id ? null : u.user_id)} style={styles.personRow} disabled={!canManage}>
                <View style={[styles.dot, u.is_connected === false && styles.dotOff]} />
                <Text style={[styles.person, styles.flex, u.is_connected === false && styles.offline]} numberOfLines={1}>
                  {u.user_id === me ? `${u.username} (you)` : u.username}
                </Text>
                {waiting ? <Text style={styles.hint}>loading…</Text> : null}
                {u.user_id === room.host_id ? <Text style={styles.badge}>Host</Text> : null}
                {canManage ? <MaterialCommunityIcons name={managing === u.user_id ? 'chevron-up' : 'chevron-down'} size={20} color="rgba(255,255,255,0.6)" /> : null}
              </Pressable>
              {managing === u.user_id ? (
                <View style={styles.manageRow}>
                  <Button label="Make host" onPress={() => { transferHost(u.user_id); setManaging(null); }} />
                  <Button label="Remove" danger onPress={() => { kickUser(u.user_id); setManaging(null); }} />
                </View>
              ) : null}
            </View>
          );
        })}
      </View>

      <View style={styles.footer}>
        {!isHost ? <Button label="Resync" icon="sync" onPress={() => { if (connection !== 'connected') connect(); else requestSync(); }} /> : null}
        <Button label={isHost ? 'End room' : 'Leave room'} danger onPress={leaveRoom} />
      </View>
    </ScrollView>
  );
};

export const ListenTogetherPanel: React.FC = () => {
  const inRoom = useListenTogetherStore(s => s.room !== null);
  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {inRoom ? <Room /> : <Lobby />}
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1 },
  lead: { color: 'rgba(255,255,255,0.75)', fontSize: 15, lineHeight: 21, marginBottom: 14, marginHorizontal: 4 },
  input: {
    height: 50,
    borderRadius: 25,
    paddingHorizontal: 18,
    color: '#fff',
    fontSize: 16,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginBottom: 10,
  },
  codeInput: { fontWeight: '700', marginBottom: 0 },
  joinRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  or: { color: 'rgba(255,255,255,0.5)', fontSize: 13, textAlign: 'center', marginVertical: 12 },
  button: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 44, paddingHorizontal: 18, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.1)' },
  primary: { backgroundColor: Signal.wave },
  danger: { backgroundColor: 'rgba(255,110,100,0.16)' },
  buttonText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  primaryText: { color: Signal.waveInk },
  dangerText: { color: '#ff8a80' },
  pressed: { opacity: 0.8 },
  disabled: { opacity: 0.4 },
  status: { color: 'rgba(255,255,255,0.6)', fontSize: 13, marginTop: 12, textAlign: 'center' },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 4, marginTop: 6 },
  toggleLabel: { color: '#fff', fontSize: 15, fontWeight: '600' },
  hint: { color: 'rgba(255,255,255,0.55)', fontSize: 13, marginTop: 2 },
  track: { width: 46, height: 28, borderRadius: 14, padding: 3, backgroundColor: 'rgba(255,255,255,0.18)' },
  trackOn: { backgroundColor: Signal.wave },
  thumb: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#fff' },
  thumbOn: { transform: [{ translateX: 18 }], backgroundColor: Signal.waveInk },
  roomScroll: { flexGrow: 0 },
  codeCard: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 16, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.07)', marginBottom: 12 },
  codeLabel: { color: 'rgba(255,255,255,0.55)', fontSize: 12, fontWeight: '600' },
  code: { color: '#fff', fontSize: 30, fontWeight: '700', fontVariant: ['tabular-nums'] },
  round: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.12)' },
  section: { marginBottom: 12 },
  sectionTitle: { color: 'rgba(255,255,255,0.6)', fontSize: 13, fontWeight: '600', marginBottom: 6, marginHorizontal: 4 },
  personRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48, paddingHorizontal: 12, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.05)', marginBottom: 4 },
  manageRow: { flexDirection: 'row', gap: 8, justifyContent: 'flex-end', marginBottom: 6 },
  person: { color: '#fff', fontSize: 15, fontWeight: '600' },
  offline: { color: 'rgba(255,255,255,0.4)' },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Signal.wave },
  dotOff: { backgroundColor: 'rgba(255,255,255,0.3)' },
  badge: { color: Signal.waveInk, backgroundColor: Signal.wave, fontSize: 12, fontWeight: '700', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, overflow: 'hidden' },
  footer: { flexDirection: 'row', gap: 8, justifyContent: 'flex-end', marginTop: 4, marginBottom: 4 },
});

export default ListenTogetherPanel;
