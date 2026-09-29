/**
 * Settings → Listen together: Echo Music's ListenTogetherSettings, in the
 * Settings kit. Every row changes how rooms behave (services/listenTogether):
 *
 *   Your name            what others see; locked while you're in a room (Echo)
 *   Let people in        auto-approve join requests (host only, as in Echo)
 *   Match host volume    guests take the host's volume (Echo: on)
 *   Resync on reconnect  a guest asks for fresh state after reconnecting (Echo: on)
 *   Blocked people       their requests are turned away; unblock here
 *   Server               Echo's published server, or your own ws:// address
 *   Open a room          the room sheet in the player
 */
import React, { useEffect, useState } from 'react';
import { LayoutChangeEvent, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Glass, Radius, Signal } from '../../constants/allegraTheme';
import { isServerUrl, useListenTogetherStore } from '../../store/listenTogetherStore';
import { usePlayerStore } from '../../store/playerStore';
import { KNOWN_SERVERS } from '../../services/listenTogether/client';
import { navigationRef } from '../../utils/navigationService';
import * as Haptics from '../../utils/haptics';
import { Action, Choice, Row, Section, Switch } from './SettingsKit';

type ServerMode = 'echo' | 'custom';

export const ListenTogetherSettings: React.FC<{ onLayout?: (e: LayoutChangeEvent) => void; onNotice: (text: string) => void }> = ({ onLayout, onNotice }) => {
  const s = useListenTogetherStore();
  const inRoom = s.room !== null;
  const songId = usePlayerStore(p => p.currentSongId);

  const [name, setName] = useState(s.username);
  useEffect(() => { setName(s.username); }, [s.username]);
  const saveName = () => {
    if (name.trim() !== s.username) s.setUsername(name);
  };

  const [serverMode, setServerMode] = useState<ServerMode>(s.serverUrl ? 'custom' : 'echo');
  const [server, setServer] = useState(s.serverUrl);
  const [showBlocked, setShowBlocked] = useState(false);

  const pickServerMode = (mode: ServerMode) => {
    setServerMode(mode);
    if (mode === 'echo') {
      s.setServerUrl('');
      setServer('');
    }
  };
  const saveServer = () => {
    if (!server.trim()) return;
    if (!isServerUrl(server)) { onNotice('A room server address starts with ws:// or wss://'); return; }
    s.setServerUrl(server);
    onNotice(inRoom ? 'The new server is used from your next room' : 'Rooms will use this server');
  };

  const openRoom = () => {
    if (!songId || !navigationRef.isReady()) return;
    Haptics.selectionAsync().catch(() => {});
    navigationRef.navigate('NowPlaying', { songId, sheet: 'together' });
  };

  return (
    <Section icon="people-outline" title="Listen together" lead="Rooms where friends hear the same song, in time." onLayout={onLayout}>
      <Row label="Your name" hint={inRoom ? 'You can change it after you leave the room' : 'What others in a room see'} stack>
        <TextInput
          value={name}
          onChangeText={setName}
          onBlur={saveName}
          onSubmitEditing={saveName}
          editable={!inRoom}
          placeholder="Your name"
          placeholderTextColor={Signal.inkFaint}
          selectionColor={Signal.wave}
          maxLength={32}
          returnKeyType="done"
          style={[styles.input, inRoom && styles.inputLocked]}
          accessibilityLabel="Your name in Listen together"
        />
      </Row>

      <Switch
        label="Let people in automatically"
        hint={s.role === 'guest' ? 'Only the host lets people in' : 'Join requests are accepted without asking you'}
        value={s.autoApprove}
        onChange={on => { if (s.role !== 'guest') s.setAutoApprove(on); }}
      />
      <Switch
        label="Match the host’s volume"
        hint="As a guest your volume follows the host’s; as host, yours is shared"
        value={s.syncHostVolume}
        onChange={s.setSyncHostVolume}
      />
      <Switch
        label="Resync after reconnecting"
        hint="Catch up with the room right after your connection comes back"
        value={s.smartResync}
        onChange={s.setSmartResync}
      />

      <Action
        label="Blocked people"
        hint={s.blocked.length > 0 ? 'Their join requests are turned away' : 'Block someone from a join request in a room'}
        value={s.blocked.length > 0 ? String(s.blocked.length) : 'None'}
        onPress={() => { if (s.blocked.length > 0) { Haptics.selectionAsync().catch(() => {}); setShowBlocked(v => !v); } }}
      />
      {showBlocked && s.blocked.length > 0 ? (
        <View style={styles.blocked}>
          {s.blocked.map(person => (
            <View key={person} style={styles.person}>
              <Text style={styles.personName} numberOfLines={1}>{person}</Text>
              <Pressable
                onPress={() => { Haptics.selectionAsync().catch(() => {}); s.unblock(person); onNotice(`${person} can ask to join again`); }}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={`Unblock ${person}`}
                style={({ pressed }) => [styles.unblock, pressed && styles.pressed]}
              >
                <Text style={styles.unblockText}>Unblock</Text>
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}

      <Choice<ServerMode>
        label="Server"
        hint={serverMode === 'echo' ? `${KNOWN_SERVERS[0].name}, shared with Echo Music listeners` : 'Rooms only reach people on the same server'}
        value={serverMode}
        options={[{ value: 'echo', label: 'Echo’s server' }, { value: 'custom', label: 'My own' }]}
        onChange={pickServerMode}
      />
      {serverMode === 'custom' ? (
        <View style={styles.serverRow}>
          <TextInput
            value={server}
            onChangeText={setServer}
            onSubmitEditing={saveServer}
            onBlur={saveServer}
            placeholder="wss://your.server/ws"
            placeholderTextColor={Signal.inkFaint}
            selectionColor={Signal.wave}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            returnKeyType="done"
            style={[styles.input, styles.flex]}
            accessibilityLabel="Room server address"
          />
        </View>
      ) : null}

      <Action
        label={inRoom ? `Room ${s.room?.room_code ?? ''}` : 'Start or join a room'}
        hint={songId ? 'Opens the room in the player' : 'Play a song first — a room shares what’s playing'}
        onPress={openRoom}
      />
    </Section>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1 },
  input: {
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: Radius.well,
    color: Signal.ink,
    fontSize: 15,
    backgroundColor: Glass.fillLight,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Glass.hairline,
  },
  inputLocked: { opacity: 0.55 },
  blocked: { paddingBottom: 8, gap: 6 },
  person: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 46,
    paddingLeft: 14,
    paddingRight: 8,
    borderRadius: Radius.well,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
  },
  personName: { flex: 1, color: Signal.ink, fontSize: 15 },
  unblock: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: Radius.pill, backgroundColor: Glass.fillLight },
  unblockText: { color: Signal.wave, fontSize: 13, fontWeight: '600' },
  pressed: { opacity: 0.7 },
  serverRow: { flexDirection: 'row', paddingBottom: 14 },
});

export default ListenTogetherSettings;
