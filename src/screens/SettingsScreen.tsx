/**
 * Settings, in Allegra's language: one scrolling page of frosted sections
 * (components/settings/SettingsKit) over the live shader, with jump chips.
 * Every control here changes something.
 */

import React from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  Pressable,
  Image,
  Modal,
  TextInput,
  Alert,
} from 'react-native';
import Slider from '@react-native-community/slider';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import type { LayoutChangeEvent } from 'react-native';
import DynamicAura from '../components/allegra/DynamicAura';
import { useArtworkPalette } from '../components/allegra/useArtworkPalette';
import * as Kit from '../components/settings/SettingsKit';
import { Action, Choice, JumpChips, Row, Section } from '../components/settings/SettingsKit';
import { Signal } from '../constants/allegraTheme';
import appConfig from '../../app.json';
import { TabScreenProps } from '../types/navigation';
import { usePlayerStore } from '../store/playerStore';
import { MiniPlayerBackground, PlayerBackground, useSettingsStore } from '../store/settingsStore';
import { CustomAlert } from '../components/CustomAlert';
import { Colors } from '../constants/colors';
import { SettingsStrings } from '../constants/uiStrings';
import { exportAllSongs, shareExportedFile, importSongsFromJson } from '../utils/exportImport';
import { clearAllData } from '../database/queries';
import { useLuvsPreferencesStore } from '../store/luvsPreferencesStore';
import { LanguagePickerModal } from '../components/LanguagePickerModal';
import { useDesktopBridgeSettingsStore } from '../store/desktopBridgeSettingsStore';
import { trustedPairingService, TrustedDesktopRecord } from '../services/TrustedPairingService';
import { useSongsStore } from '../store/songsStore';
import { usePlaylistStore } from '../store/playlistStore';
import { scanAudioFiles, convertAudioFileToSong } from '../services/mediaScanner';

// ─── Screen ──────────────────────────────────────────────────────────────────

type Props = TabScreenProps<'Settings'>;

const APP_VERSION = appConfig.expo.version;

const SettingsScreen: React.FC<Props> = () => {
  const insets = useSafeAreaInsets();
  const settings = useSettingsStore();
  const { fetchSongs, addSong, songs } = useSongsStore();
  const playerCurrentCover = usePlayerStore(state => state.currentSong?.coverImageUri);

  const [, setIsImporting] = React.useState(false);
  const [selectionModalVisible, setSelectionModalVisible] = React.useState(false);
  const [availableAudioFiles, setAvailableAudioFiles] = React.useState<any[]>([]);
  const [selectedFiles, setSelectedFiles] = React.useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = React.useState('');
  const setMiniPlayerHidden = usePlayerStore(state => state.setMiniPlayerHidden);
  useFocusEffect(React.useCallback(() => { setMiniPlayerHidden(false); }, [setMiniPlayerHidden]));
  const likedCount = usePlaylistStore(state => state.likedSongIds.size);
  const [hiddenSongsVisible, setHiddenSongsVisible] = React.useState(false);
  const [languagePickerVisible, setLanguagePickerVisible] = React.useState(false);

  // Luvs pulls its feed from whichever languages carry weight, so the row reflects
  // the live store — edits take effect on the next batch the engine requests.
  const preferredLanguages = useLuvsPreferencesStore(s => s.preferredLanguages);
  const activeLanguages = preferredLanguages.filter(l => l.weight > 0).map(l => l.language);
  const luvsLanguageSummary = activeLanguages.length === 0
    ? 'None'
    : activeLanguages.length <= 2
      ? activeLanguages.join(', ')
      : `${activeLanguages.length} selected`;
  const { hiddenSongs, fetchHiddenSongs, hideSong: unhideSong } = useSongsStore();
  const { desktopConnectEnabled, allowDesktopDownloads, setDesktopConnectEnabled, setAllowDesktopDownloads } = useDesktopBridgeSettingsStore();
  const [pairingModalVisible, setPairingModalVisible] = React.useState(false);
  const [pairingPayloadText, setPairingPayloadText] = React.useState('');
  const [pairingBusy, setPairingBusy] = React.useState(false);
  const [, setTrustedDesktops] = React.useState<TrustedDesktopRecord[]>([]);

  const [alertConfig, setAlertConfig] = React.useState<{
    visible: boolean; title: string; message: string;
    buttons: { text: string; onPress: () => void; style?: 'default' | 'cancel' | 'destructive' }[];
  }>({ visible: false, title: '', message: '', buttons: [] });

  const handleExport = React.useCallback(async () => {
    try {
      const filePath = await exportAllSongs();
      await shareExportedFile(filePath);
    } catch (e) {
      Alert.alert('Export failed', e instanceof Error ? e.message : 'Unknown error');
    }
  }, []);

  const handleImport = React.useCallback(async () => {
    try {
      setIsImporting(true);
      const imported = await importSongsFromJson();
      if (imported > 0) {
        await fetchSongs();
        Alert.alert('Import complete', `${imported} song(s) imported successfully.`);
      }
    } catch (e) {
      Alert.alert('Import failed', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setIsImporting(false);
    }
  }, [fetchSongs]);

  const handleImportLocalAudio = React.useCallback(async () => {
    try {
      const files = await scanAudioFiles();
      setAvailableAudioFiles(files);
      setSelectedFiles(new Set(files.map((f: any) => f.uri)));
      setSelectionModalVisible(true);
    } catch (e) {
      Alert.alert('Scan failed', e instanceof Error ? e.message : 'Unknown error');
    }
  }, []);

  const handleCloseSelectionModal = React.useCallback(() => {
    setSelectionModalVisible(false);
    setSelectedFiles(new Set());
    setSearchQuery('');
  }, []);

  const toggleSelectAll = React.useCallback(() => {
    if (selectedFiles.size === availableAudioFiles.length) {
      setSelectedFiles(new Set());
    } else {
      setSelectedFiles(new Set(availableAudioFiles.map((f: any) => f.uri)));
    }
  }, [selectedFiles.size, availableAudioFiles]);

  const toggleFileSelection = React.useCallback((uri: string) => {
    setSelectedFiles(prev => {
      const next = new Set(prev);
      if (next.has(uri)) next.delete(uri); else next.add(uri);
      return next;
    });
  }, []);

  const filteredAudioFiles = React.useMemo(() =>
    searchQuery.trim() === ''
      ? availableAudioFiles
      : availableAudioFiles.filter((f: any) =>
          (f.filename || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
          (f.artist || '').toLowerCase().includes(searchQuery.toLowerCase())
        ),
    [availableAudioFiles, searchQuery]
  );

  const handleImportSelected = React.useCallback(async () => {
    const filesToImport = availableAudioFiles.filter((f: any) => selectedFiles.has(f.uri));
    setSelectionModalVisible(false);
    let count = 0;
    for (const file of filesToImport) {
      try {
        const song = await convertAudioFileToSong(file);
        if (song) { await addSong(song); count++; }
      } catch {}
    }
    if (count > 0) {
      await fetchSongs();
      Alert.alert('Import complete', `${count} song(s) added to library.`);
    }
    setSelectedFiles(new Set());
  }, [availableAudioFiles, selectedFiles, addSong, fetchSongs]);

  const handlePairFromPayload = React.useCallback(async () => {
    try {
      setPairingBusy(true);
      const payload = JSON.parse(pairingPayloadText);
      await trustedPairingService.saveTrustedDesktop(payload);
      const desktops = await trustedPairingService.listTrustedDesktops();
      setTrustedDesktops(desktops);
      setPairingModalVisible(false);
      setPairingPayloadText('');
    } catch (e) {
      Alert.alert('Pairing failed', e instanceof Error ? e.message : 'Invalid payload');
    } finally {
      setPairingBusy(false);
    }
  }, [pairingPayloadText]);

  // Allegra's shell: the live shader in the playing cover's colours behind
  // frosted section panels, jump chips that stay under the status bar.
  const isFocused = useIsFocused();
  const isPlaying = usePlayerStore(state => state.isPlaying);
  const palette = useArtworkPalette(playerCurrentCover);
  const scrollRef = React.useRef<ScrollView>(null);
  const sectionY = React.useRef<Record<string, number>>({});
  const at = (key: string) => (e: LayoutChangeEvent) => { sectionY.current[key] = e.nativeEvent.layout.y; };
  const jump = (key: string) => scrollRef.current?.scrollTo({ y: Math.max(0, (sectionY.current[key] ?? 0) - 64), animated: true });

  const bgHint: Record<PlayerBackground, string> = {
    blend: 'The cover while a song plays, drifting glow when lyrics are open.',
    apple: 'The cover melting into its own blur, like Apple Music.',
    glow: 'Soft glows in the cover\u2019s colours, always.',
  };

  return (
    <View style={styles.container}>
      <DynamicAura palette={palette} playing={isPlaying} active={isFocused} dim={0.35} />
      <ScrollView
        ref={scrollRef}
        stickyHeaderIndices={[1]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: 150 + insets.bottom }}
      >
        <View style={styles.hero}>
          <Text style={styles.heroTitle} accessibilityRole="header">Settings</Text>
          <Text style={styles.heroLead}>Make it feel like yours. Everything here is saved on this phone and applies straight away.</Text>
        </View>

        <View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <JumpChips
              onJump={jump}
              items={[
                { key: 'player', label: 'Player' },
                { key: 'playback', label: 'Playback' },
                { key: 'lyrics', label: 'Lyrics' },
                { key: 'nav', label: 'Navigation' },
                { key: 'discover', label: 'Discover' },
                { key: 'library', label: 'Library & data' },
                { key: 'desktop', label: 'Desktop' },
                { key: 'about', label: 'About' },
              ]}
            />
          </ScrollView>
        </View>

        <Section icon="play-circle-outline" title="Player" lead="How Now Playing and the mini player look." onLayout={at('player')}>
          <Kit.Switch
            label="Apple Music inspired"
            hint="The cover runs full width and melts into its own blur. Off shows a floating artwork card."
            value={settings.appleMusicInspired}
            onChange={settings.setAppleMusicInspired}
          />
          {settings.appleMusicInspired ? (
            <Kit.Switch label="Hide volume slider" hint="Keep the phone's volume keys only." value={settings.hidePlayerVolume} onChange={settings.setHidePlayerVolume} />
          ) : null}
          <Choice<PlayerBackground>
            label="Player background"
            hint={bgHint[settings.playerBackground]}
            value={settings.playerBackground}
            options={[{ value: 'blend', label: 'Blend' }, { value: 'apple', label: 'Apple Music' }, { value: 'glow', label: 'Glow' }]}
            onChange={settings.setPlayerBackground}
          />
          <Choice<MiniPlayerBackground>
            label="Mini player background"
            hint={settings.miniPlayerBackground === 'glow' ? 'Two glows drifting in the cover\u2019s colours.' : 'A calm tone of the cover.'}
            value={settings.miniPlayerBackground}
            options={[{ value: 'glow', label: 'Glow' }, { value: 'tint', label: 'Cover tint' }]}
            onChange={settings.setMiniPlayerBackground}
          />
          <Kit.Switch
            label="Canvas"
            hint="Looping motion artwork on the cover when a song has one: Echo Canvas, Apple Music, then ArchiveTune."
            value={settings.canvasEnabled}
            onChange={settings.setCanvasEnabled}
          />
          {settings.canvasEnabled ? (
            <Row label="Your own tokens" hint="Optional. Apple Music already works without one. Stored on this phone only." stack>
              {([
                { label: 'Apple MusicKit token', value: settings.appleMusicToken, onChange: settings.setAppleMusicToken, placeholder: 'eyJhbGciOiJFUzI1NiIs\u2026' },
                { label: 'Tidal client token', value: settings.tidalToken, onChange: settings.setTidalToken, placeholder: 'Unlocks Tidal video covers' },
              ] as const).map(field => (
                <View key={field.label} style={styles.tokenField}>
                  <Text style={styles.tokenLabel}>{field.label}{field.value ? ' \u00b7 saved' : ''}</Text>
                  <TextInput
                    style={styles.tokenInput}
                    value={field.value}
                    onChangeText={field.onChange}
                    placeholder={field.placeholder}
                    placeholderTextColor={Signal.inkFaint}
                    autoCapitalize="none"
                    autoCorrect={false}
                    secureTextEntry
                  />
                </View>
              ))}
            </Row>
          ) : null}
        </Section>

        <Section icon="musical-notes-outline" title="Playback" lead="What happens when you press play." onLayout={at('playback')}>
          <Kit.Switch
            label="Stay on the list when a song starts"
            hint="Off opens Now Playing every time you pick a song."
            value={settings.playInMiniPlayerOnly}
            onChange={settings.setPlayInMiniPlayerOnly}
          />
          <Kit.Switch label="Keep screen on" hint="While Now Playing is open." value={settings.keepScreenOn} onChange={settings.setKeepScreenOn} />
          <Kit.Switch label="Haptics" hint="Little taps you feel on buttons and swipes." value={settings.hapticsEnabled ?? true} onChange={settings.setHapticsEnabled} />
        </Section>

        <Section icon="text-outline" title="Lyrics" lead="How lyrics look and keep time." onLayout={at('lyrics')}>
          <Choice<'small' | 'medium' | 'large'>
            label="Text size"
            value={settings.lyricsFontSize}
            options={[{ value: 'small', label: 'Small' }, { value: 'medium', label: 'Medium' }, { value: 'large', label: 'Large' }]}
            onChange={settings.setLyricsFontSize}
          />
          <Choice<'compact' | 'normal' | 'relaxed'>
            label="Line spacing"
            value={settings.lineSpacing}
            options={[{ value: 'compact', label: 'Tight' }, { value: 'normal', label: 'Normal' }, { value: 'relaxed', label: 'Airy' }]}
            onChange={settings.setLineSpacing}
          />
          <Row label={`Timing  ${settings.lyricsDelay > 0 ? '+' : ''}${settings.lyricsDelay.toFixed(1)}s`} hint="Lyrics running late? Slide right. Early? Slide left." stack>
            <Slider
              style={styles.slider}
              minimumValue={-5.0}
              maximumValue={5.0}
              step={0.1}
              value={settings.lyricsDelay}
              onSlidingComplete={settings.setLyricsDelay}
              minimumTrackTintColor={Signal.wave}
              maximumTrackTintColor="rgba(244,241,234,0.18)"
              thumbTintColor={Signal.wave}
            />
          </Row>
          <Kit.Switch
            label="Hide controls while lyrics play"
            hint="The controls fade after a few seconds without a touch."
            value={settings.autoHideControls}
            onChange={settings.setAutoHideControls}
          />
        </Section>

        <Section icon="navigate-outline" title="Navigation and voice" lead="The bar at the bottom and the mic in it." onLayout={at('nav')}>
          <Choice<'modern-pill' | 'classic'>
            label="Bottom bar"
            value={settings.navBarStyle}
            options={[{ value: 'modern-pill', label: 'Floating pill' }, { value: 'classic', label: 'Classic' }]}
            onChange={settings.setNavBarStyle}
          />
          <Kit.Switch label="Voice button" hint="Say a song and it plays." value={settings.micEnabled ?? true} onChange={settings.setMicEnabled} />
          {(settings.micEnabled ?? true) ? (
            <Choice<'hold' | 'tap'>
              label="Voice button works by"
              value={settings.voiceMode ?? 'hold'}
              options={[{ value: 'hold', label: 'Hold to talk' }, { value: 'tap', label: 'Tap to talk' }]}
              onChange={settings.setVoiceMode}
            />
          ) : null}
        </Section>

        <Section icon="compass-outline" title="Discover" lead="What Luvs and Stream bring you." onLayout={at('discover')}>
          <Action label="Song languages" hint="Luvs, mood mixes and new songs lean towards these." value={luvsLanguageSummary} onPress={() => setLanguagePickerVisible(true)} />
          <Kit.Switch label="Luvs clips start at the hook" hint="Jump straight to the best part of each song." value={settings.luvsStartAtHook} onChange={settings.setLuvsStartAtHook} />
          <Kit.Switch label="YouTube video preview" hint="Beta. Shows a song's video in the player; needs your own YouTube Data API key." value={settings.ytVideoPreview} onChange={settings.setYtVideoPreview} />
          {settings.ytVideoPreview ? (
            <Row label="YouTube API key" hint="console.cloud.google.com → enable YouTube Data API v3 → Credentials → Create API key." stack>
              <TextInput
                style={styles.tokenInput}
                value={settings.youtubeApiKey}
                onChangeText={settings.setYoutubeApiKey}
                placeholder="AIzaSy\u2026"
                placeholderTextColor={Signal.inkFaint}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </Row>
          ) : null}
        </Section>

        <Section icon="folder-open-outline" title="Library and data" lead="Your songs, backups and clean-up." onLayout={at('library')}>
          <Action label="Add songs from this phone" hint="Find music files already on your device." onPress={handleImportLocalAudio} />
          <Action label="Export library" hint="Songs, lyrics and playlists as one file." onPress={handleExport} />
          <Action label="Import a backup" onPress={handleImport} />
          <Action label="Hidden songs" value={`${hiddenSongs.length}`} onPress={() => { fetchHiddenSongs(); setHiddenSongsVisible(true); }} />
          <Action
            label="Delete all library data"
            hint="Every song and playlist on this phone. This cannot be undone."
            destructive
            onPress={() => setAlertConfig({
              visible: true,
              title: 'Delete all library data',
              message: 'This permanently deletes every song and playlist on this phone. It cannot be undone.',
              buttons: [
                { text: SettingsStrings.cancel, onPress: () => {}, style: 'cancel' },
                { text: 'Delete everything', onPress: async () => { await clearAllData(); await fetchSongs(); }, style: 'destructive' },
              ],
            })}
          />
        </Section>

        <Section icon="desktop-outline" title="Desktop Connect" lead="Send songs between this phone and your computer." onLayout={at('desktop')}>
          <Kit.Switch label="Desktop Connect" hint="Lets a paired computer see and control this phone." value={desktopConnectEnabled} onChange={setDesktopConnectEnabled} />
          <Kit.Switch label="Allow downloads from desktop" value={allowDesktopDownloads} onChange={setAllowDesktopDownloads} />
          <Action label="Pair a computer" onPress={() => setPairingModalVisible(true)} />
        </Section>

        <Section icon="information-circle-outline" title="About" lead="Version, credits and a fresh start." onLayout={at('about')}>
          <Row label="LuvLyrics" hint={`Version ${APP_VERSION}. ${songs.length} songs, ${likedCount} liked.`} />
          <Row
            label="Credits"
            hint="Music data from YouTube Music, audio from Saavn and Gaana, lyrics from LRCLIB and community providers, canvases from Echo Canvas and Apple Music. Design after Allegra."
          />
          <Kit.Switch label="Show frame rate" hint="For checking smoothness." value={settings.showPerformanceHUD} onChange={settings.setShowPerformanceHUD} />
          <Action
            label="Reset settings"
            hint="Put everything on this page back to how it started. Your songs stay."
            onPress={() => setAlertConfig({
              visible: true,
              title: 'Reset settings',
              message: 'Every setting goes back to its default. Your library is not touched.',
              buttons: [
                { text: SettingsStrings.cancel, onPress: () => {}, style: 'cancel' },
                { text: 'Reset', onPress: () => settings.resetToDefaults(), style: 'destructive' },
              ],
            })}
          />
        </Section>
      </ScrollView>

      {/* ── Alerts & Utility Modals ──────────────────────────────────────────── */}

      <LanguagePickerModal
        visible={languagePickerVisible}
        onClose={() => setLanguagePickerVisible(false)}
      />

      <CustomAlert
        visible={alertConfig.visible}
        title={alertConfig.title}
        message={alertConfig.message}
        buttons={alertConfig.buttons}
        onClose={() => setAlertConfig({ ...alertConfig, visible: false })}
      />


      <Modal visible={selectionModalVisible} transparent animationType="slide" onRequestClose={handleCloseSelectionModal}>
        <Pressable style={styles.selectionOverlay} onPress={handleCloseSelectionModal}>
          <Pressable style={styles.selectionContainer} onPress={e => e.stopPropagation()}>
            <View style={styles.selectionHeader}>
              <Text style={styles.selectionTitle}>Select Songs ({selectedFiles.size}/{availableAudioFiles.length})</Text>
              <Pressable onPress={handleCloseSelectionModal}>
                <Ionicons name="close" size={24} color={Colors.textPrimary} />
              </Pressable>
            </View>
            <View style={styles.searchBarContainer}>
              <Ionicons name="search" size={18} color={Colors.textSecondary} />
              <TextInput
                style={styles.searchBarInput} placeholder="Search songs…" placeholderTextColor={Colors.textMuted}
                value={searchQuery} onChangeText={setSearchQuery} autoCapitalize="none" autoCorrect={false}
              />
              {searchQuery.length > 0 && (
                <Pressable onPress={() => setSearchQuery('')}>
                  <Ionicons name="close-circle" size={18} color={Colors.textSecondary} />
                </Pressable>
              )}
            </View>
            <Pressable style={styles.selectAllButton} onPress={toggleSelectAll}>
              <Ionicons name={selectedFiles.size === availableAudioFiles.length ? 'checkbox' : 'square-outline'} size={24} color="#EDEDED" />
              <Text style={styles.selectAllText}>Select All</Text>
            </Pressable>
            <ScrollView style={styles.selectionList} keyboardShouldPersistTaps="handled">
              {filteredAudioFiles.length === 0 && searchQuery.trim() !== '' ? (
                <View style={styles.emptySearchContainer}>
                  <Ionicons name="search-outline" size={40} color={Colors.textMuted} />
                  <Text style={styles.emptySearchText}>No songs match "{searchQuery}"</Text>
                </View>
              ) : (
                filteredAudioFiles.map(file => (
                  <Pressable key={file.uri} style={styles.selectionItem} onPress={() => toggleFileSelection(file.uri)}>
                    <Ionicons name={selectedFiles.has(file.uri) ? 'checkbox' : 'square-outline'} size={24} color={selectedFiles.has(file.uri) ? '#EDEDED' : Colors.textSecondary} />
                    <View style={styles.selectionItemInfo}>
                      <Text style={styles.selectionItemTitle} numberOfLines={1}>{file.filename.replace(/\.[^/.]+$/, '')}</Text>
                      <Text style={styles.selectionItemArtist} numberOfLines={1}>{file.artist || file.album || 'Unknown'}</Text>
                    </View>
                  </Pressable>
                ))
              )}
            </ScrollView>
            <View style={styles.selectionActions}>
              <Pressable style={[styles.selectionButton, styles.selectionButtonCancel]} onPress={handleCloseSelectionModal}>
                <Text style={styles.selectionButtonText}>{SettingsStrings.cancel}</Text>
              </Pressable>
              <Pressable
                style={[styles.selectionButton, styles.selectionButtonImport, selectedFiles.size === 0 && styles.selectionButtonDisabled]}
                onPress={handleImportSelected} disabled={selectedFiles.size === 0}
              >
                <Text style={[styles.selectionButtonText, styles.selectionButtonTextImport]}>Import {selectedFiles.size}</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={pairingModalVisible} transparent animationType="slide" onRequestClose={() => setPairingModalVisible(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setPairingModalVisible(false)}>
          <Pressable style={styles.nameModal} onPress={e => e.stopPropagation()}>
            <Text style={styles.nameModalTitle}>{SettingsStrings.trustedPairing}</Text>
            <Text style={styles.pairingHint}>Scan the desktop QR and paste its JSON payload here.</Text>
            <TextInput
              style={styles.pairingInput} value={pairingPayloadText} onChangeText={setPairingPayloadText}
              multiline autoCapitalize="none" autoCorrect={false}
              placeholder="Paste QR payload JSON" placeholderTextColor="rgba(255,255,255,0.35)"
            />
            <View style={styles.nameModalButtons}>
              <Pressable style={styles.nameModalButton} onPress={() => setPairingModalVisible(false)}>
                <Text style={styles.nameModalButtonText}>{SettingsStrings.cancel}</Text>
              </Pressable>
              <Pressable style={[styles.nameModalButton, styles.nameModalButtonPrimary]} onPress={handlePairFromPayload} disabled={pairingBusy}>
                <Text style={[styles.nameModalButtonText, styles.nameModalButtonTextPrimary]}>{pairingBusy ? 'Pairing…' : 'Pair'}</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={hiddenSongsVisible} transparent animationType="slide" onRequestClose={() => setHiddenSongsVisible(false)}>
        <Pressable style={styles.selectionOverlay} onPress={() => setHiddenSongsVisible(false)}>
          <Pressable style={styles.selectionContainer} onPress={e => e.stopPropagation()}>
            <View style={styles.selectionHeader}>
              <Text style={styles.selectionTitle}>Hidden Songs ({hiddenSongs.length})</Text>
              <Pressable onPress={() => setHiddenSongsVisible(false)}>
                <Ionicons name="close" size={24} color={Colors.textPrimary} />
              </Pressable>
            </View>
            <ScrollView style={[styles.selectionList, { maxHeight: 500 }]} keyboardShouldPersistTaps="handled">
              {hiddenSongs.length === 0 ? (
                <View style={styles.emptySearchContainer}>
                  <Ionicons name="eye-outline" size={40} color={Colors.textMuted} />
                  <Text style={styles.emptySearchText}>No hidden songs</Text>
                </View>
              ) : (
                hiddenSongs.map(song => (
                  <View key={song.id} style={styles.selectionItem}>
                    {song.coverImageUri
                      ? <Image source={{ uri: song.coverImageUri }} style={{ width: 44, height: 44, borderRadius: 8 }} />
                      : <View style={{ width: 44, height: 44, borderRadius: 8, backgroundColor: '#2C2C2E', alignItems: 'center', justifyContent: 'center' }}>
                          <Ionicons name="disc" size={24} color="rgba(255,255,255,0.3)" />
                        </View>
                    }
                    <View style={styles.selectionItemInfo}>
                      <Text style={styles.selectionItemTitle} numberOfLines={1}>{song.title}</Text>
                      <Text style={styles.selectionItemArtist} numberOfLines={1}>{song.artist || 'Unknown Artist'}</Text>
                    </View>
                    <Pressable
                      style={{ paddingHorizontal: 16, paddingVertical: 8, borderRadius: 16, backgroundColor: 'rgba(0,122,255,0.1)' }}
                      onPress={() => unhideSong(song.id, false)}
                    >
                      <Text style={{ color: '#EDEDED', fontWeight: 'bold' }}>{SettingsStrings.unhide}</Text>
                    </Pressable>
                  </View>
                ))
              )}
            </ScrollView>
            <View style={styles.selectionActions}>
              <Pressable style={[styles.selectionButton, styles.selectionButtonCancel, { flex: 1 }]} onPress={() => setHiddenSongsVisible(false)}>
                <Text style={styles.selectionButtonText}>{SettingsStrings.close}</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

    </View>
  );
};

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  hero: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 6 },
  heroTitle: { color: Signal.ink, fontSize: 34, fontWeight: '700' },
  heroLead: { color: Signal.inkMuted, fontSize: 15, lineHeight: 21, marginTop: 6 },
  slider: { width: '100%', height: 36 },
  tokenField: { marginBottom: 12 },
  tokenLabel: { color: Signal.inkSoft, fontSize: 13, fontWeight: '600', marginBottom: 6 },
  tokenInput: {
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: 16,
    color: Signal.ink,
    fontSize: 14,
    backgroundColor: 'rgba(244,241,234,0.06)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  container: { flex: 1 },

  // Modals
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', alignItems: 'center' },
  nameModal: { backgroundColor: '#1C1C1E', borderRadius: 16, padding: 24, width: '80%', maxWidth: 320 },
  nameModalTitle: { fontSize: 18, fontWeight: '700', color: Colors.textPrimary, marginBottom: 16, textAlign: 'center' },
  nameModalButtons: { flexDirection: 'row', gap: 10 },
  nameModalButton: { flex: 1, padding: 13, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center' },
  nameModalButtonPrimary: { backgroundColor: '#2E2E2E' },
  nameModalButtonText: { fontSize: 15, fontWeight: '600', color: Colors.textPrimary },
  nameModalButtonTextPrimary: { color: '#fff' },
  pairingHint: { color: Colors.textSecondary, fontSize: 13, marginBottom: 10 },
  pairingInput: {
    minHeight: 100, maxHeight: 180, borderRadius: 10,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(255,255,255,0.04)', color: Colors.textPrimary,
    padding: 10, textAlignVertical: 'top', marginBottom: 12,
  },

  // Selection modal
  selectionOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', justifyContent: 'flex-end' },
  selectionContainer: { backgroundColor: '#1C1C1E', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '80%', paddingBottom: 40 },
  selectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 18, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.1)' },
  selectionTitle: { fontSize: 18, fontWeight: '700', color: Colors.textPrimary },
  searchBarContainer: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 16, marginTop: 12, marginBottom: 4, paddingHorizontal: 12, paddingVertical: 9, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  searchBarInput: { flex: 1, fontSize: 15, color: Colors.textPrimary },
  emptySearchContainer: { alignItems: 'center', justifyContent: 'center', paddingVertical: 40, gap: 12 },
  emptySearchText: { fontSize: 14, color: Colors.textMuted, textAlign: 'center' },
  selectAllButton: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.1)' },
  selectAllText: { fontSize: 15, fontWeight: '600', color: '#EDEDED' },
  selectionList: { maxHeight: 400 },
  selectionItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 12 },
  selectionItemInfo: { flex: 1 },
  selectionItemTitle: { fontSize: 15, fontWeight: '600', color: Colors.textPrimary },
  selectionItemArtist: { fontSize: 13, color: Colors.textSecondary, marginTop: 2 },
  selectionActions: { flexDirection: 'row', gap: 12, paddingHorizontal: 20, paddingTop: 18 },
  selectionButton: { flex: 1, padding: 14, borderRadius: 12, alignItems: 'center' },
  selectionButtonCancel: { backgroundColor: 'rgba(255,255,255,0.1)' },
  selectionButtonImport: { backgroundColor: '#2E2E2E' },
  selectionButtonDisabled: { backgroundColor: 'rgba(0,122,255,0.3)' },
  selectionButtonText: { fontSize: 15, fontWeight: '600', color: Colors.textPrimary },
  selectionButtonTextImport: { color: '#fff' },
});

export default SettingsScreen;