/**
 * About (Stream → the button at the top right): who made LuvLyrics and how
 * to reach them, a coffee, a place to report bugs (straight into Convex,
 * services/feedback), a check for a newer build (services/appUpdate) and
 * what the app does with your data. Dark glass panels, like Settings.
 */
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Clipboard from 'expo-clipboard';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Tactile } from '../allegra/motion';
import { Radius, Signal } from '../../constants/allegraTheme';
import * as Haptics from '../../utils/haptics';
import appConfig from '../../../app.json';
import { FEEDBACK_MAX, feedbackProblem, sendFeedback } from '../../services/feedback';
import { fetchLatestBuild, LatestBuild, LATEST_APK_URL, releasedAgo } from '../../services/appUpdate';

const WEBSITE = 'https://prathick.vercel.app';
const INSTAGRAM = 'yourboy_prats';
/** Your UPI id (name@bank). The coffee row stays hidden until it is set. */
const UPI_ID = '';
const ALLEGRA = 'allegravibe.vercel.app';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

const Panel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <View style={styles.panel}>
    <LinearGradient
      colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.16)', 'rgba(255,255,255,0)']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 0 }}
      style={styles.panelEdge}
      pointerEvents="none"
    />
    {children}
  </View>
);

const LinkRow: React.FC<{ icon: IconName; label: string; value: string; onPress: () => void; last?: boolean }> = ({ icon, label, value, onPress, last }) => (
  <Pressable onPress={onPress} style={({ pressed }) => [styles.row, !last && styles.rowDivider, pressed && styles.pressed]} accessibilityRole="link" accessibilityLabel={`${label}: ${value}`}>
    <View style={styles.rowIcon}><Ionicons name={icon} size={18} color={Signal.wave} /></View>
    <View style={styles.flex}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue} numberOfLines={1}>{value}</Text>
    </View>
    <Ionicons name="arrow-forward" size={16} color={Signal.inkMuted} />
  </Pressable>
);

type SendState = { kind: 'idle' } | { kind: 'sending' } | { kind: 'sent' } | { kind: 'error'; message: string };
type UpdateState = { kind: 'idle' } | { kind: 'checking' } | { kind: 'found'; build: LatestBuild } | { kind: 'error' };

const AboutSheet: React.FC<{ visible: boolean; onClose: () => void }> = ({ visible, onClose }) => {
  const insets = useSafeAreaInsets();
  const [message, setMessage] = useState('');
  const [contact, setContact] = useState('');
  const [send, setSend] = useState<SendState>({ kind: 'idle' });
  const [update, setUpdate] = useState<UpdateState>({ kind: 'idle' });
  const [copied, setCopied] = useState(false);

  const open = useCallback((url: string) => {
    Haptics.selectionAsync().catch(() => {});
    Linking.openURL(url).catch(() => {});
  }, []);

  const openInstagram = useCallback(() => {
    Haptics.selectionAsync().catch(() => {});
    // The app when it is installed, the website otherwise.
    Linking.openURL(`instagram://user?username=${INSTAGRAM}`).catch(() => Linking.openURL(`https://instagram.com/${INSTAGRAM}`).catch(() => {}));
  }, []);

  const coffee = useCallback(() => {
    Haptics.selectionAsync().catch(() => {});
    Clipboard.setStringAsync(UPI_ID).catch(() => {});
    setCopied(true);
    // Opens a UPI app with the id filled in; the id is on the clipboard either way.
    Linking.openURL(`upi://pay?pa=${encodeURIComponent(UPI_ID)}&pn=${encodeURIComponent('LuvLyrics')}&tn=${encodeURIComponent('A coffee for LuvLyrics')}`).catch(() => {});
  }, []);

  const submit = useCallback(async () => {
    const problem = feedbackProblem({ message, contact });
    if (problem) {
      setSend({ kind: 'error', message: problem });
      return;
    }
    setSend({ kind: 'sending' });
    try {
      await sendFeedback({ message, contact });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setSend({ kind: 'sent' });
      setMessage('');
      setContact('');
    } catch (e) {
      setSend({ kind: 'error', message: e instanceof Error ? e.message : 'Could not send it. Try again in a bit.' });
    }
  }, [message, contact]);

  const checkUpdate = useCallback(async () => {
    Haptics.selectionAsync().catch(() => {});
    setUpdate({ kind: 'checking' });
    try {
      const build = await fetchLatestBuild();
      setUpdate(build ? { kind: 'found', build } : { kind: 'error' });
    } catch {
      setUpdate({ kind: 'error' });
    }
  }, []);

  return (
    <Modal visible={visible} animationType="slide" transparent statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[styles.sheet, { paddingTop: insets.top + 12 }]}>
          <View style={styles.head}>
            <Text style={styles.title} accessibilityRole="header">About</Text>
            <Tactile onPress={onClose} hitSlop={10} pressScale={0.9} accessibilityRole="button" accessibilityLabel="Close" style={styles.close}>
              <Ionicons name="close" size={20} color={Signal.ink} />
            </Tactile>
          </View>

          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}>
            <Panel>
              <Text style={styles.kicker}>LuvLyrics {appConfig.expo.version}</Text>
              <Text style={styles.story}>I made this entire thing.</Text>
              <Text style={styles.body}>
                Every screen, every animation and every little detail — through many iterations and even more ideas, until it landed here.
                It is free, and it always will be. Hope it feels like yours.
              </Text>
              <Text style={styles.signature}>— Prathick</Text>
            </Panel>

            <Panel>
              <LinkRow icon="globe-outline" label="Website" value="prathick.vercel.app" onPress={() => open(WEBSITE)} />
              <LinkRow icon="logo-instagram" label="Instagram" value={`@${INSTAGRAM}`} onPress={openInstagram} last={!UPI_ID} />
              {UPI_ID ? (
                <LinkRow icon="cafe-outline" label="Feel free to buy me a coffee 😉" value={copied ? `${UPI_ID} · copied` : `UPI · ${UPI_ID}`} onPress={coffee} last />
              ) : null}
            </Panel>

            <Panel>
              <Text style={styles.panelTitle}>Found a bug?</Text>
              <Text style={styles.body}>Tell me what happened and what you were doing. I read every one.</Text>
              <TextInput
                value={message}
                onChangeText={t => { setMessage(t); if (send.kind !== 'sending') setSend({ kind: 'idle' }); }}
                placeholder="What went wrong?"
                placeholderTextColor={Signal.inkFaint}
                multiline
                maxLength={FEEDBACK_MAX}
                style={[styles.input, styles.inputTall]}
                selectionColor={Signal.wave}
                accessibilityLabel="What went wrong"
              />
              <TextInput
                value={contact}
                onChangeText={setContact}
                placeholder="Email or Instagram, if you want a reply (optional)"
                placeholderTextColor={Signal.inkFaint}
                autoCapitalize="none"
                autoCorrect={false}
                style={styles.input}
                selectionColor={Signal.wave}
                accessibilityLabel="How to reach you, optional"
              />
              <View style={styles.sendRow}>
                <Text style={[styles.status, send.kind === 'error' && styles.statusError]} numberOfLines={2}>
                  {send.kind === 'sent' ? 'Sent. Thank you!' : send.kind === 'error' ? send.message : ''}
                </Text>
                <Tactile
                  onPress={submit}
                  disabled={send.kind === 'sending'}
                  pressScale={0.95}
                  accessibilityRole="button"
                  accessibilityLabel="Send the report"
                  style={[styles.primary, send.kind === 'sending' && styles.dim]}
                >
                  {send.kind === 'sending' ? <ActivityIndicator size="small" color={Signal.waveInk} /> : <Ionicons name="paper-plane" size={16} color={Signal.waveInk} />}
                  <Text style={styles.primaryText}>{send.kind === 'sending' ? 'Sending' : 'Send'}</Text>
                </Tactile>
              </View>
            </Panel>

            <Panel>
              <Text style={styles.panelTitle}>Updates</Text>
              <Text style={styles.body}>
                {update.kind === 'found'
                  ? `The newest build came out ${releasedAgo(update.build.publishedAt)}. Download it and open the file to update — your library stays.`
                  : update.kind === 'error'
                    ? 'Could not check right now. You can still download the newest build.'
                    : `You are on ${appConfig.expo.version}. New features land as new builds.`}
              </Text>
              <View style={styles.buttons}>
                {update.kind === 'found' || update.kind === 'error' ? (
                  <Tactile
                    onPress={() => open(update.kind === 'found' ? update.build.downloadUrl : LATEST_APK_URL)}
                    pressScale={0.95}
                    accessibilityRole="button"
                    accessibilityLabel="Download the newest build"
                    style={styles.primary}
                  >
                    <Ionicons name="arrow-down" size={16} color={Signal.waveInk} />
                    <Text style={styles.primaryText}>Download update</Text>
                  </Tactile>
                ) : (
                  <Tactile onPress={checkUpdate} disabled={update.kind === 'checking'} pressScale={0.95} accessibilityRole="button" accessibilityLabel="Check for updates" style={styles.glass}>
                    {update.kind === 'checking' ? <ActivityIndicator size="small" color={Signal.ink} /> : <Ionicons name="refresh" size={16} color={Signal.ink} />}
                    <Text style={styles.glassText}>{update.kind === 'checking' ? 'Checking' : 'Check for updates'}</Text>
                  </Tactile>
                )}
              </View>
            </Panel>

            <Panel>
              <Text style={styles.panelTitle}>Privacy</Text>
              <Text style={styles.body}>
                LuvLyrics is free to use. No ads, no tracking, nothing sold. Your library, likes and lyrics live on this phone;
                streaming goes straight to where the music is. A bug report you send is kept only until it has been read and fixed, then deleted.
              </Text>
              <Text style={[styles.body, styles.gap]}>
                Coming soon: sign in with Google to sync this app with {ALLEGRA} — one account, the same library and the same recommendations on both.
              </Text>
            </Panel>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet: { flex: 1, backgroundColor: Signal.bgDeep, paddingHorizontal: 16 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4, paddingBottom: 6 },
  title: { color: Signal.ink, fontSize: 34, fontWeight: '800', letterSpacing: -0.6 },
  close: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  panel: {
    marginTop: 14,
    paddingHorizontal: 18,
    paddingVertical: 16,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.09)',
    overflow: 'hidden',
  },
  panelEdge: { position: 'absolute', top: 0, left: 0, right: 0, height: 1 },
  kicker: { color: Signal.wave, fontSize: 12, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase' },
  story: { color: Signal.ink, fontSize: 24, fontWeight: '800', letterSpacing: -0.4, marginTop: 8 },
  body: { color: Signal.inkSoft, fontSize: 14, lineHeight: 21, marginTop: 6 },
  gap: { marginTop: 10 },
  signature: { color: Signal.inkMuted, fontSize: 14, fontWeight: '600', marginTop: 10 },
  panelTitle: { color: Signal.ink, fontSize: 17, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 12 },
  rowDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.07)' },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(217, 230, 106, 0.1)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(217, 230, 106, 0.28)',
  },
  rowLabel: { color: Signal.ink, fontSize: 15, fontWeight: '600' },
  rowValue: { color: Signal.inkMuted, fontSize: 13, marginTop: 2 },
  pressed: { opacity: 0.7 },
  input: {
    marginTop: 12,
    minHeight: 46,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 16,
    color: Signal.ink,
    fontSize: 15,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  inputTall: { minHeight: 110, textAlignVertical: 'top' },
  sendRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 14 },
  status: { flex: 1, color: Signal.wave, fontSize: 13, fontWeight: '600' },
  statusError: { color: Signal.accentBright },
  buttons: { flexDirection: 'row', marginTop: 14 },
  primary: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 44, paddingHorizontal: 18, borderRadius: Radius.pill, backgroundColor: Signal.wave },
  primaryText: { color: Signal.waveInk, fontSize: 15, fontWeight: '700' },
  dim: { opacity: 0.7 },
  glass: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 44,
    paddingHorizontal: 18,
    borderRadius: Radius.pill,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  glassText: { color: Signal.ink, fontSize: 15, fontWeight: '700' },
});

export default AboutSheet;
