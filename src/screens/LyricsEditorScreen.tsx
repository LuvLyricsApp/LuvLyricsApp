/**
 * Edit lyrics — for a song saved on the phone, opened from the player's
 * Details sheet. (Adding lyrics without a song was removed: lyrics always
 * belong to a track.)
 *
 * The dark room with the song's own shader behind frosted panels:
 *   Song      title, artist and album
 *   Lyrics    find them (the provider cascade), choose a source, paste,
 *             switch to the transliteration, and the text itself
 *   Timing    nudge every timestamp; for unsynced lyrics, the song length
 *   Display   alignment
 * Every control does something; Save writes to the library and updates the
 * player if this song is playing.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useIsFocused } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import DynamicAura from '../components/allegra/DynamicAura';
import Artwork from '../components/allegra/Artwork';
import { Tactile } from '../components/allegra/motion';
import { useArtworkPalette } from '../components/allegra/useArtworkPalette';
import { Choice, Row, Section } from '../components/settings/SettingsKit';
import { LrcSearchModal } from '../components/LrcSearchModal';
import { Toast } from '../components/Toast';
import { Glass, Radius, Signal } from '../constants/allegraTheme';
import { useSongsStore } from '../store/songsStore';
import { usePlayerStore } from '../store/playerStore';
import { lyricaService } from '../services/LyricaService';
import { GeniusService } from '../services/GeniusService';
import { TransliterationService } from '../services/TransliterationService';
import { SearchResult } from '../services/LyricsRepository';
import { calculateDuration, lyricsToRawText, parseTimestampedLyrics } from '../utils/timestampParser';
import { formatTime } from '../utils/formatters';
import { formatOffset, hasTimestamps, parseDurationInput, shiftTimestamps } from '../utils/lyricsEditing';
import { safeGoBack } from '../utils/navigationService';
import * as Haptics from '../utils/haptics';
import { RootStackScreenProps } from '../types/navigation';
import { Song } from '../types/song';

type Props = RootStackScreenProps<'EditLyrics'>;
type Align = 'left' | 'center' | 'right';

const OFFSETS = [-1, -0.5, -0.1, 0.1, 0.5, 1] as const;

const Field: React.FC<{
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'numbers-and-punctuation';
}> = ({ label, value, onChangeText, placeholder, keyboardType = 'default' }) => (
  <View style={styles.field}>
    <Text style={styles.fieldLabel}>{label}</Text>
    <TextInput
      style={styles.fieldInput}
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={Signal.inkFaint}
      keyboardType={keyboardType}
      selectionColor={Signal.wave}
      accessibilityLabel={label}
    />
  </View>
);

const Chip: React.FC<{
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  onPress: () => void;
  busy?: boolean;
  on?: boolean;
}> = ({ icon, label, onPress, busy = false, on = false }) => (
  <Tactile
    onPress={onPress}
    pressScale={0.94}
    disabled={busy}
    accessibilityRole="button"
    accessibilityLabel={label}
    style={[styles.chip, on && styles.chipOn]}
  >
    {busy ? <ActivityIndicator size="small" color={Signal.ink} /> : <Ionicons name={icon} size={16} color={on ? Signal.waveInk : Signal.ink} />}
    <Text style={[styles.chipText, on && styles.chipTextOn]} numberOfLines={1}>{label}</Text>
  </Tactile>
);

const LyricsEditorScreen: React.FC<Props> = ({ navigation, route }) => {
  const { songId } = route.params;
  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();
  const getSong = useSongsStore(s => s.getSong);
  const updateSong = useSongsStore(s => s.updateSong);
  const setMiniPlayerHiddenSource = usePlayerStore(s => s.setMiniPlayerHiddenSource);

  const [original, setOriginal] = useState<Song | null>(null);
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [album, setAlbum] = useState('');
  const [lyricsText, setLyricsText] = useState('');
  const [transliterated, setTransliterated] = useState('');
  const [showTransliteration, setShowTransliteration] = useState(false);
  const [durationText, setDurationText] = useState('');
  const [align, setAlign] = useState<Align>('left');
  const [shifted, setShifted] = useState(0);
  const [finding, setFinding] = useState(false);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);

  const palette = useArtworkPalette(original?.coverImageUri);
  const synced = useMemo(() => hasTimestamps(lyricsText), [lyricsText]);
  const say = (text: string, type: 'success' | 'error' | 'info' = 'info') => setNotice({ text, type });

  // The editor is full screen; the pill would sit on the keyboard.
  useEffect(() => {
    setMiniPlayerHiddenSource('Editor', true);
    return () => setMiniPlayerHiddenSource('Editor', false);
  }, [setMiniPlayerHiddenSource]);

  useEffect(() => {
    let live = true;
    getSong(songId).then(song => {
      if (!live || !song) return;
      setOriginal(song);
      setTitle(song.title);
      setArtist(song.artist ?? '');
      setAlbum(song.album ?? '');
      setLyricsText(lyricsToRawText(song.lyrics));
      setTransliterated(song.transliteratedLyrics ? lyricsToRawText(song.transliteratedLyrics) : '');
      setDurationText(song.duration > 0 ? formatTime(song.duration) : '');
      setAlign(song.lyricsAlign ?? 'left');
    }).catch(() => {});
    return () => { live = false; };
  }, [songId, getSong]);

  const applyLyrics = useCallback((raw: string, duration?: number) => {
    setLyricsText(raw);
    setShowTransliteration(false);
    setTransliterated('');
    setShifted(0);
    if (duration && duration > 0) setDurationText(formatTime(duration));
  }, []);

  const findLyrics = async () => {
    if (finding) return;
    if (!title.trim()) { say('Add the song title first — lyrics are matched by it', 'error'); return; }
    Haptics.selectionAsync().catch(() => {});
    setFinding(true);
    try {
      const result = await lyricaService.fetchLyrics(title.trim(), artist.trim(), synced, parseDurationInput(durationText));
      if (result?.lyrics) {
        const withStamps = lyricaService.hasTimestamps(result.lyrics);
        applyLyrics(lyricsToRawText(lyricaService.parseLrc(result.lyrics, result.metadata?.duration || 0)), result.metadata?.duration);
        say(withStamps ? `Synced lyrics from ${result.source}` : `Lyrics from ${result.source}, not synced yet`, 'success');
      } else {
        say(synced ? 'No better synced version found' : 'No lyrics found — try choosing a source', 'info');
      }
    } catch {
      say('Couldn’t reach the lyrics sources', 'error');
    } finally {
      setFinding(false);
    }
  };

  const onSourcePicked = async (result: SearchResult) => {
    setSourcesOpen(false);
    let text = result.syncedLyrics || result.plainLyrics;
    if (result.source === 'Genius' && !text && result.url) text = (await GeniusService.scrapeGeniusLyrics(result.url)) ?? '';
    if (!text) { say('That source had no lyrics text', 'error'); return; }
    const lines = result.syncedLyrics && result.syncedLyrics.includes('[')
      ? lyricaService.parseLrc(text, result.duration)
      : text.includes('[') ? lyricaService.parseLrc(text, result.duration) : GeniusService.convertToLyricLines(text);
    applyLyrics(lyricsToRawText(lines), result.duration);
    say(`Lyrics from ${result.source}`, 'success');
  };

  const paste = async () => {
    const text = await Clipboard.getStringAsync().catch(() => '');
    if (!text) { say('Nothing to paste', 'info'); return; }
    Haptics.selectionAsync().catch(() => {});
    if (showTransliteration) setTransliterated(prev => (prev ? `${prev}\n${text}` : text));
    else setLyricsText(prev => (prev ? `${prev}\n${text}` : text));
  };

  const toggleTransliteration = () => {
    Haptics.selectionAsync().catch(() => {});
    const next = !showTransliteration;
    setShowTransliteration(next);
    if (next && !transliterated && lyricsText.trim()) {
      setTransliterated(lyricsToRawText(TransliterationService.transliterate(parseTimestampedLyrics(lyricsText))));
      say('Transliteration made from the lyrics — edit it freely', 'success');
    }
  };

  const nudge = (seconds: number) => {
    if (!synced) return;
    Haptics.selectionAsync().catch(() => {});
    setLyricsText(prev => shiftTimestamps(prev, seconds));
    if (transliterated) setTransliterated(prev => shiftTimestamps(prev, seconds));
    setShifted(prev => prev + seconds);
  };

  const save = async () => {
    if (!original || saving) return;
    if (!title.trim()) { say('The song needs a title', 'error'); return; }
    setSaving(true);
    try {
      const lyrics = lyricsText.trim() ? parseTimestampedLyrics(lyricsText) : [];
      const typed = parseDurationInput(durationText);
      const song: Song = {
        ...original,
        title: title.trim(),
        artist: artist.trim() || undefined,
        album: album.trim() || undefined,
        lyrics,
        transliteratedLyrics: transliterated.trim() ? parseTimestampedLyrics(transliterated) : undefined,
        duration: typed > 0 ? typed : Math.max(original.duration, calculateDuration(lyrics)),
        dateModified: new Date().toISOString(),
        lyricsAlign: align,
      };
      await updateSong(song);
      const player = usePlayerStore.getState();
      if (player.currentSong?.id === song.id) {
        player.updateCurrentSong({
          title: song.title,
          artist: song.artist,
          album: song.album,
          lyrics: song.lyrics,
          transliteratedLyrics: song.transliteratedLyrics,
          duration: song.duration,
          lyricsAlign: song.lyricsAlign,
        });
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      safeGoBack(navigation);
    } catch {
      say('Couldn’t save — try again in a moment', 'error');
      setSaving(false);
    }
  };

  const close = () => {
    Haptics.selectionAsync().catch(() => {});
    safeGoBack(navigation);
  };

  return (
    <View style={styles.root}>
      <DynamicAura palette={palette} active={isFocused} dim={0.3} />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
          <Tactile onPress={close} pressScale={0.9} hitSlop={8} accessibilityRole="button" accessibilityLabel="Close without saving" style={styles.round}>
            <Ionicons name="chevron-down" size={22} color={Signal.ink} />
          </Tactile>
          <Text style={styles.headerTitle} accessibilityRole="header">Edit lyrics</Text>
          <Tactile
            onPress={save}
            pressScale={0.94}
            disabled={!original || saving}
            accessibilityRole="button"
            accessibilityLabel="Save"
            style={[styles.save, (!original || saving) && styles.saveOff]}
          >
            {saving ? <ActivityIndicator size="small" color={Signal.waveInk} /> : <Text style={styles.saveText}>Save</Text>}
          </Tactile>
        </View>

        <ScrollView
          style={styles.flex}
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 48 }]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          <View style={styles.songCard}>
            <Artwork uri={original?.coverImageUri} title={title || original?.title || ''} artist={artist} size={64} style={styles.songArt} />
            <View style={styles.flex}>
              <Text style={styles.songTitle} numberOfLines={1}>{title || original?.title || 'Loading…'}</Text>
              <Text style={styles.songMeta} numberOfLines={1}>
                {synced ? 'Synced lyrics' : lyricsText.trim() ? 'Lyrics, not synced' : 'No lyrics yet'}
              </Text>
            </View>
          </View>

          <Section icon="musical-note" title="Song" lead="How it shows in your library and the player.">
            <Field label="Title" value={title} onChangeText={setTitle} />
            <Field label="Artist" value={artist} onChangeText={setArtist} placeholder="Unknown artist" />
            <Field label="Album" value={album} onChangeText={setAlbum} placeholder="Optional" />
          </Section>

          <Section icon="text" title="Lyrics" lead="Find them, pick a source, or type and paste.">
            <View style={styles.chips}>
              <Chip icon="search" label={finding ? 'Searching' : synced ? 'Find better lyrics' : 'Find lyrics'} onPress={findLyrics} busy={finding} />
              <Chip icon="list" label="Choose a source" onPress={() => { Haptics.selectionAsync().catch(() => {}); setSourcesOpen(true); }} />
              <Chip icon="clipboard-outline" label="Paste" onPress={paste} />
              <Chip icon="language-outline" label="Transliteration" onPress={toggleTransliteration} on={showTransliteration} />
            </View>
            <View style={styles.well}>
              <TextInput
                style={[styles.lyrics, { textAlign: align }]}
                multiline
                value={showTransliteration ? transliterated : lyricsText}
                onChangeText={showTransliteration ? setTransliterated : setLyricsText}
                placeholder={showTransliteration ? 'The lyrics in Latin letters' : 'Type or paste the lyrics. Lines like [0:12.40] are synced.'}
                placeholderTextColor={Signal.inkFaint}
                selectionColor={Signal.wave}
                textAlignVertical="top"
                scrollEnabled={false}
                accessibilityLabel={showTransliteration ? 'Transliteration' : 'Lyrics'}
              />
            </View>
          </Section>

          <Section icon="time-outline" title="Timing" lead={synced ? 'Early or late? Move every line at once.' : 'Lyrics without timestamps show in full; add [0:12.40] stamps to sync them.'}>
            {synced ? (
              <Row label="Shift all lines" hint={shifted === 0 ? 'Earlier on the left, later on the right' : `Shifted ${formatOffset(shifted)}`} stack>
                <View style={styles.offsets}>
                  {OFFSETS.map(s => (
                    <Tactile
                      key={s}
                      onPress={() => nudge(s)}
                      pressScale={0.92}
                      accessibilityRole="button"
                      accessibilityLabel={`Shift ${s < 0 ? 'earlier' : 'later'} by ${Math.abs(s)} seconds`}
                      style={styles.offset}
                    >
                      <Text style={styles.offsetText}>{formatOffset(s)}</Text>
                    </Tactile>
                  ))}
                </View>
                {shifted !== 0 ? (
                  <Pressable onPress={() => nudge(-shifted)} accessibilityRole="button" style={styles.undo}>
                    <Text style={styles.undoText}>Undo shift</Text>
                  </Pressable>
                ) : null}
              </Row>
            ) : (
              <Field label="Song length" value={durationText} onChangeText={setDurationText} placeholder="3:25" keyboardType="numbers-and-punctuation" />
            )}
          </Section>

          <Section icon="options-outline" title="Display" lead="How the lyrics sit on the player.">
            <Choice<Align>
              label="Alignment"
              value={align}
              options={[{ value: 'left', label: 'Left' }, { value: 'center', label: 'Centre' }, { value: 'right', label: 'Right' }]}
              onChange={setAlign}
            />
          </Section>
        </ScrollView>
      </KeyboardAvoidingView>

      <LrcSearchModal
        visible={sourcesOpen}
        onClose={() => setSourcesOpen(false)}
        onSelect={onSourcePicked}
        initialQuery={{ title, artist, duration: parseDurationInput(durationText) }}
      />
      <Toast visible={notice !== null} message={notice?.text ?? ''} type={notice?.type ?? 'info'} onDismiss={() => setNotice(null)} />
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Signal.bg },
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 10 },
  round: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Glass.fillLight,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Glass.hairline,
  },
  headerTitle: { color: Signal.ink, fontSize: 17, fontWeight: '600' },
  save: { minWidth: 76, height: 40, paddingHorizontal: 18, borderRadius: Radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: Signal.wave },
  saveOff: { opacity: 0.5 },
  saveText: { color: Signal.waveInk, fontSize: 15, fontWeight: '700' },
  content: { paddingHorizontal: 16 },
  songCard: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 6 },
  songArt: { width: 64, height: 64, borderRadius: 12 },
  songTitle: { color: Signal.ink, fontSize: 22, fontWeight: '700' },
  songMeta: { color: Signal.inkMuted, fontSize: 13, marginTop: 3 },
  field: { paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Glass.hairline },
  fieldLabel: { color: Signal.inkMuted, fontSize: 13 },
  fieldInput: { color: Signal.ink, fontSize: 16, paddingVertical: 6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingBottom: 12 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 38,
    paddingHorizontal: 14,
    borderRadius: Radius.pill,
    backgroundColor: Glass.fillLight,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Glass.hairlineStrong,
  },
  chipOn: { backgroundColor: Signal.wave, borderColor: Signal.wave },
  chipText: { color: Signal.ink, fontSize: 14, fontWeight: '600' },
  chipTextOn: { color: Signal.waveInk },
  well: {
    borderRadius: Radius.well,
    backgroundColor: 'rgba(0, 0, 0, 0.22)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Glass.hairline,
    marginBottom: 16,
  },
  lyrics: { minHeight: 280, color: Signal.ink, fontSize: 15, lineHeight: 24, padding: 14 },
  offsets: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  offset: {
    flexBasis: '30%',
    flexGrow: 1,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Glass.fillLight,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Glass.hairlineStrong,
  },
  offsetText: { color: Signal.ink, fontSize: 15, fontWeight: '600', fontVariant: ['tabular-nums'] },
  undo: { alignSelf: 'flex-start', paddingVertical: 4 },
  undoText: { color: Signal.wave, fontSize: 14, fontWeight: '600' },
});

export default LyricsEditorScreen;
