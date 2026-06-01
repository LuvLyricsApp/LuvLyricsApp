/**
 * LyricFlow - Settings Screen
 */

import React from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  Pressable,
  Switch,
  Image,
  Modal,
  TextInput,
  Alert,
  Animated,
  PanResponder,
} from 'react-native';
import Slider from '@react-native-community/slider';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { TabScreenProps } from '../types/navigation';
import { usePlayerStore } from '../store/playerStore';
import { useSettingsStore } from '../store/settingsStore';
import { CustomAlert } from '../components/CustomAlert';
import { useThemeColors, useIsDark } from '../contexts/ThemeContext';
import { getGradientColors } from '../constants/gradients';
import { useDailyStatsStore } from '../store/dailyStatsStore';
import { AuroraHeader } from '../components/AuroraHeader';
import { Colors } from '../constants/colors';
import { exportAllSongs, shareExportedFile, importSongsFromJson } from '../utils/exportImport';
import { clearAllData } from '../database/queries';
import { useLuvsPreferencesStore } from '../store/luvsPreferencesStore';
import { useDesktopBridgeSettingsStore } from '../store/desktopBridgeSettingsStore';
import { trustedPairingService, TrustedDesktopRecord } from '../services/TrustedPairingService';
import { useSongsStore } from '../store/songsStore';
import { usePlaylistStore } from '../store/playlistStore';
import { scanAudioFiles, convertAudioFileToSong } from '../services/mediaScanner';
import * as ImagePicker from 'expo-image-picker';

// ─── Mini player background options ──────────────────────────────────────────

type MiniBgMode = 'album-art' | 'song-gradient' | 'aurora' | 'purest-black' | 'grey' | 'theme-subtle' | 'theme-blue';

const MINI_BG_MODES: MiniBgMode[] = ['album-art', 'song-gradient', 'aurora', 'purest-black', 'grey', 'theme-subtle', 'theme-blue'];

const MINI_BG_LABELS: Record<MiniBgMode, string> = {
  'album-art':     'Album Art',
  'song-gradient': 'Song Gradient',
  'aurora':        'Aurora',
  'purest-black':  'Pure Black',
  'grey':          'Spotify Grey',
  'theme-subtle':  'Subtle Dark',
  'theme-blue':    'LuvLyrics Blue',
};

// ─── Bottom Sheet ────────────────────────────────────────────────────────────

interface BottomSheetProps {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}

const BottomSheet: React.FC<BottomSheetProps> = ({ visible, title, onClose, children }) => {
  const overlayOpacity = React.useRef(new Animated.Value(0)).current;
  const sheetTranslateY = React.useRef(new Animated.Value(800)).current;
  const panY = React.useRef(new Animated.Value(0)).current;
  const [modalVisible, setModalVisible] = React.useState(false);
  const isClosing = React.useRef(false);
  const isDark = useIsDark();
  const colors = useThemeColors();
  const dividerColor = useSettingsDividerColor();

  const closeOnce = React.useCallback(() => {
    if (isClosing.current) return;
    isClosing.current = true;
    onClose();
  }, [onClose]);

  const panResponder = React.useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, g) => g.dy > 8,
      onPanResponderMove: (_, g) => {
        if (g.dy > 0) panY.setValue(g.dy);
      },
      onPanResponderRelease: (_, g) => {
        if (g.dy > 80 || g.vy > 0.8) {
          panY.setValue(0);
          closeOnce();
        } else {
          Animated.spring(panY, { toValue: 0, useNativeDriver: true, damping: 20, stiffness: 300 }).start();
        }
      },
    }),
  ).current;

  React.useEffect(() => {
    if (visible) {
      isClosing.current = false;
      panY.setValue(0);
      setModalVisible(true);
      Animated.parallel([
        Animated.timing(overlayOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.spring(sheetTranslateY, { toValue: 0, useNativeDriver: true, damping: 32, stiffness: 220, mass: 1.1 }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(overlayOpacity, { toValue: 0, duration: 180, useNativeDriver: true }),
        Animated.timing(sheetTranslateY, { toValue: 800, duration: 220, useNativeDriver: true }),
      ]).start(() => { setModalVisible(false); panY.setValue(0); });
    }
  }, [visible, overlayOpacity, panY, sheetTranslateY]);

  return (
    <Modal visible={modalVisible} transparent animationType="none" onRequestClose={closeOnce} statusBarTranslucent>
      <Animated.View style={[StyleSheet.absoluteFill, bs.backdrop, { opacity: overlayOpacity }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={closeOnce} />
      </Animated.View>
      <Animated.View style={[bs.sheet, { backgroundColor: isDark ? '#1C1C1E' : colors.card, transform: [{ translateY: Animated.add(sheetTranslateY, panY) }] }]} {...panResponder.panHandlers}>
        <View style={bs.handle} />
        <View style={[bs.header, { borderBottomColor: dividerColor }]}>
          <Text style={[bs.title, { color: colors.textPrimary }]}>{title}</Text>
          <Pressable onPress={onClose} hitSlop={12}>
            <Ionicons name="close" size={22} color={colors.textSecondary} />
          </Pressable>
        </View>
        <ScrollView bounces={false} keyboardShouldPersistTaps="handled" contentContainerStyle={bs.content}>
          {children}
        </ScrollView>
        <View style={[bs.sheetFloor, { backgroundColor: isDark ? '#1C1C1E' : colors.card }]} />
      </Animated.View>
    </Modal>
  );
};

const bs = StyleSheet.create({
  backdrop: {
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#1C1C1E',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '65%',
    paddingBottom: 36,
  },
  sheetFloor: {
    position: 'absolute',
    bottom: -100,
    left: 0,
    right: 0,
    height: 100,
    backgroundColor: '#1C1C1E',
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 4,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.07)',
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
  },
});

// ─── Luv Languages Modal ──────────────────────────────────────────────────────

const LuvsLanguagesModal = ({ visible, onClose }: { visible: boolean; onClose: () => void }) => {
  const { preferredLanguages, updateLanguageWeight } = useLuvsPreferencesStore();
  return (
    <Modal animationType="slide" transparent visible={visible} onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', alignItems: 'center' }}>
        <View style={{
          width: '90%', maxHeight: '80%', backgroundColor: Colors.card,
          borderRadius: 20, padding: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
        }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <Text style={{ fontSize: 20, fontWeight: 'bold', color: Colors.textPrimary }}>Music Languages</Text>
            <Pressable onPress={onClose}>
              <Ionicons name="close-circle" size={28} color={Colors.textSecondary} />
            </Pressable>
          </View>
          <ScrollView style={{ width: '100%' }}>
            <Text style={{ color: Colors.textSecondary, marginBottom: 16, fontSize: 13 }}>
              Adjust preferences to curate your Luvs feed. Set weight to 0% to disable a language.
            </Text>
            {preferredLanguages.map((item) => (
              <View key={item.language} style={{ marginBottom: 20 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                  <Text style={{ fontSize: 16, color: Colors.textPrimary, fontWeight: '600' }}>{item.language}</Text>
                  <Text style={{ fontSize: 14, color: Colors.primary, fontWeight: '700' }}>
                    {item.weight === 0 ? 'DISABLED' : `${item.weight}%`}
                  </Text>
                </View>
                <Slider
                  style={{ width: '100%', height: 40 }}
                  minimumValue={0} maximumValue={100} step={10}
                  value={item.weight}
                  onSlidingComplete={(v) => updateLanguageWeight(item.language, v)}
                  minimumTrackTintColor={Colors.primary}
                  maximumTrackTintColor={Colors.cardHover}
                  thumbTintColor={Colors.primary}
                />
              </View>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

// ─── Reusable rows ───────────────────────────────────────────────────────────

const useSettingsDividerColor = () => {
  const colors = useThemeColors();
  const isDark = useIsDark();
  const libraryBackgroundMode = useSettingsStore(state => state.libraryBackgroundMode);

  if (!isDark) return colors.divider;
  switch (libraryBackgroundMode) {
    case 'purest-black':
    case 'black':
      return 'rgba(255,255,255,0.08)';
    case 'grey':
      return '#282828';
    case 'theme-subtle':
      return '#1E2A3A';
    case 'theme-blue':
      return '#1C3E6B';
    default:
      return colors.divider;
  }
};


interface SettingsRowSwitchProps {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: boolean;
  onToggle: (v: boolean) => void;
}

const SettingsRowSwitch: React.FC<SettingsRowSwitchProps> = ({ icon, label, value, onToggle }) => {
  const dividerColor = useSettingsDividerColor();
  const colors = useThemeColors();
  return (
    <View style={[styles.settingsRow, { borderBottomColor: dividerColor }]}>
      <Ionicons name={icon} size={22} color={colors.textSecondary} />
      <Text style={[styles.settingsLabel, { color: colors.textPrimary }]}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onToggle}
        trackColor={{ false: '#39393D', true: '#34C759' }}
        thumbColor="#fff"
        accessibilityLabel={label}
        accessibilityRole="switch"
        accessibilityState={{ checked: value }}
      />
    </View>
  );
};

interface SettingsRowProps {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value?: string;
  onPress: () => void;
}

const SettingsRow: React.FC<SettingsRowProps> = ({ icon, label, value, onPress }) => {
  const dividerColor = useSettingsDividerColor();
  const colors = useThemeColors();
  return (
    <Pressable
      style={[styles.settingsRow, { borderBottomColor: dividerColor }]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Ionicons name={icon} size={22} color={colors.textSecondary} />
      <Text style={[styles.settingsLabel, { color: colors.textPrimary }]}>{label}</Text>
      {value ? (
        <View style={styles.settingsValue}>
          <Text style={[styles.settingsValueText, { color: colors.textSecondary }]}>{value}</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
        </View>
      ) : null}
    </Pressable>
  );
};

interface MenuRowProps {
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  label: string;
  badge?: string;
  onPress: () => void;
  isLast?: boolean;
}

const MenuRow: React.FC<MenuRowProps> = ({ icon, iconColor, label, badge, onPress, isLast }) => {
  const dividerColor = useSettingsDividerColor();
  const colors = useThemeColors();
  return (
    <Pressable
      style={[styles.menuRow, { borderBottomColor: dividerColor }, isLast && styles.menuRowLast]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <View style={[styles.menuIcon, { backgroundColor: iconColor + '22' }]}>
        <Ionicons name={icon} size={20} color={iconColor} />
      </View>
      <Text style={[styles.menuLabel, { color: colors.textPrimary }]}>{label}</Text>
      <View style={styles.menuRight}>
        {badge ? <Text style={[styles.menuBadge, { color: colors.textSecondary }]}>{badge}</Text> : null}
        <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
      </View>
    </Pressable>
  );
};

// ─── Pinnable items definition ───────────────────────────────────────────────

type PinId = 'appearance' | 'playback' | 'library' | 'discovery' | 'miniplayer' | 'desktop' | 'data' | 'about' | 'export' | 'import' | 'scan';

const PINNABLE_ITEMS: Record<PinId, {
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  label: string;
  section: 'personalization' | 'system' | 'tools';
}> = {
  appearance:  { icon: 'moon-outline',              iconColor: '#A78BFA', label: 'Appearance',   section: 'personalization' },
  playback:    { icon: 'play-circle-outline',        iconColor: '#34C759', label: 'Playback',     section: 'personalization' },
  library:     { icon: 'folder-open-outline',        iconColor: '#FF9F0A', label: 'Library',      section: 'personalization' },
  discovery:   { icon: 'globe-outline',              iconColor: '#30D158', label: 'Discovery',    section: 'personalization' },
  miniplayer:  { icon: 'radio-outline',              iconColor: '#FF6B6B', label: 'Mini Player',  section: 'personalization' },
  desktop:     { icon: 'desktop-outline',            iconColor: '#0A84FF', label: 'Desktop',      section: 'system' },
  data:        { icon: 'trash-outline',              iconColor: '#FF453A', label: 'Data',         section: 'system' },
  about:       { icon: 'information-circle-outline', iconColor: '#8E8E93', label: 'About',        section: 'system' },
  export:      { icon: 'download-outline',           iconColor: '#A78BFA', label: 'Export',       section: 'tools' },
  import:      { icon: 'cloud-upload-outline',       iconColor: '#F472B6', label: 'Import',       section: 'tools' },
  scan:        { icon: 'musical-notes-outline',      iconColor: '#60A5FA', label: 'Scan Audio',   section: 'tools' },
};

// ─── Screen ──────────────────────────────────────────────────────────────────

type Props = TabScreenProps<'Settings'>;

const SettingsScreen: React.FC<Props> = () => {
  const insets = useSafeAreaInsets();
  const settings = useSettingsStore();
  const { fetchSongs, addSong, songs, getSong } = useSongsStore();
  const applyThemeToOtherPages = useSettingsStore(state => state.applyThemeToOtherPages);
  const libraryBackgroundMode = useSettingsStore(state => state.libraryBackgroundMode);
  const isDark = useIsDark();
  const colors = useThemeColors();
  const isSolidBg = libraryBackgroundMode === 'purest-black'
    || libraryBackgroundMode === 'grey'
    || libraryBackgroundMode === 'theme-subtle'
    || libraryBackgroundMode === 'black'
    || libraryBackgroundMode === 'theme-blue';
  const currentSongId = usePlayerStore(state => state.currentSongId);
  const playerCurrentCover = usePlayerStore(state => state.currentSong?.coverImageUri);
  const playerCurrentGradient = usePlayerStore(state => state.currentSong?.gradientId);

  const [activeThemeColors, setActiveThemeColors] = React.useState<string[] | undefined>(undefined);
  const [activeImageUri, setActiveImageUri] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!applyThemeToOtherPages) {
      setActiveThemeColors(undefined);
      setActiveImageUri(null);
      return;
    }
    const updateTheme = async () => {
      let themeColors: string[] | undefined;
      let image: string | null = null;
      if (libraryBackgroundMode === 'current') {
        if (currentSongId) {
          image = playerCurrentCover || null;
          if (!image && playerCurrentGradient) {
            themeColors = playerCurrentGradient === 'dynamic' ? ['#f7971e', '#ffd200', '#ff6b35'] : getGradientColors(playerCurrentGradient);
          }
        }
      } else if (libraryBackgroundMode === 'daily') {
        const topId = useDailyStatsStore.getState().getTopSongOfYesterday() || useDailyStatsStore.getState().getTopSongOfToday();
        if (topId) {
          const song = songs.find(s => s.id === topId) || await getSong(topId);
          if (song) {
            image = song.coverImageUri || null;
            if (!image && song.gradientId) {
              themeColors = song.gradientId === 'dynamic' ? ['#f7971e', '#ffd200', '#ff6b35'] : getGradientColors(song.gradientId);
            }
          }
        }
      } else if (libraryBackgroundMode === 'black') {
        themeColors = ['#050505', '#050505', '#050505'];
        image = null;
      } else if (libraryBackgroundMode === 'purest-black') {
        themeColors = ['#000000', '#000000', '#000000'];
        image = null;
      } else if (libraryBackgroundMode === 'grey') {
        themeColors = ['#121212', '#212121', '#121212'];
        image = null;
      } else if (libraryBackgroundMode === 'theme-subtle') {
        themeColors = ['#0E1722', '#1E2A3A', '#0E1722'];
        image = null;
      } else if (libraryBackgroundMode === 'theme-blue') {
        themeColors = ['#0A1628', '#1A3A6B', '#2F8CFF'];
        image = null;
      }
      setActiveThemeColors(themeColors); setActiveImageUri(image);
    };
    updateTheme();
  }, [applyThemeToOtherPages, libraryBackgroundMode, currentSongId, playerCurrentCover, playerCurrentGradient, songs, songs.length, getSong]);

  const [, setIsImporting] = React.useState(false);
  const [profileName, setProfileName] = React.useState('LyricFlow User');
  const [profileImage, setProfileImage] = React.useState<string | null>(null);
  const [editNameVisible, setEditNameVisible] = React.useState(false);
  const [tempName, setTempName] = React.useState('');
  const [selectionModalVisible, setSelectionModalVisible] = React.useState(false);
  const [availableAudioFiles, setAvailableAudioFiles] = React.useState<any[]>([]);
  const [selectedFiles, setSelectedFiles] = React.useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = React.useState('');
  const setMiniPlayerHidden = usePlayerStore(state => state.setMiniPlayerHidden);
  useFocusEffect(React.useCallback(() => { setMiniPlayerHidden(false); }, [setMiniPlayerHidden]));
  const likedCount = usePlaylistStore(state => state.likedSongIds.size);
  const [hiddenSongsVisible, setHiddenSongsVisible] = React.useState(false);
  const { hiddenSongs, fetchHiddenSongs, hideSong: unhideSong } = useSongsStore();
  const [luvsLangModalVisible, setLuvsLangModalVisible] = React.useState(false);
  const { desktopConnectEnabled, allowDesktopDownloads, setDesktopConnectEnabled, setAllowDesktopDownloads } = useDesktopBridgeSettingsStore();
  const [pairingModalVisible, setPairingModalVisible] = React.useState(false);
  const [pairingPayloadText, setPairingPayloadText] = React.useState('');
  const [pairingBusy, setPairingBusy] = React.useState(false);
  const [, setTrustedDesktops] = React.useState<TrustedDesktopRecord[]>([]);
  const [activeSheet, setActiveSheet] = React.useState<string | null>(null);
  const closeSheet = React.useCallback(() => setActiveSheet(null), []);
  const quickPins = useSettingsStore(state => state.quickPins);
  const [, setPinPickerSlot] = React.useState<number | null>(null);

  const [alertConfig, setAlertConfig] = React.useState<{
    visible: boolean; title: string; message: string;
    buttons: { text: string; onPress: () => void; style?: 'default' | 'cancel' | 'destructive' }[];
  }>({ visible: false, title: '', message: '', buttons: [] });

  const handleEditAvatar = React.useCallback(async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Allow photo library access to change your profile picture.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1] as [number, number],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      setProfileImage(result.assets[0].uri);
    }
  }, []);

  const handleEditName = React.useCallback(() => {
    setTempName(profileName);
    setEditNameVisible(true);
  }, [profileName]);

  const handleSaveName = React.useCallback(() => {
    if (tempName.trim()) setProfileName(tempName.trim());
    setEditNameVisible(false);
  }, [tempName]);

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

  const cardBg = isDark ? 'rgba(255,255,255,0.06)' : colors.card;
  const cardBorder = isDark ? 'rgba(255,255,255,0.08)' : colors.border;

  return (
    <View style={[styles.container, { backgroundColor: isDark ? '#000' : colors.background }]}>
      {isDark && applyThemeToOtherPages && (
        <View style={StyleSheet.absoluteFill}>
          <AuroraHeader palette="settings" colors={activeThemeColors} imageUri={activeImageUri} isSolid={isSolidBg} />
        </View>
      )}
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: 150 + insets.bottom }]} showsVerticalScrollIndicator={false}>

          {/* ── Screen title ── */}
          <Text style={[styles.screenTitle, { color: colors.textPrimary }]}>Settings</Text>

          {/* ── Profile card ── */}
          <View style={[styles.profileCard, { backgroundColor: cardBg, borderColor: cardBorder }]}>
            {/* Avatar */}
            <Pressable
              style={[styles.avatar, {
                backgroundColor: isDark ? 'rgba(6,21,43,1)' : colors.cardHover,
                borderColor: cardBorder,
              }]}
              onPress={handleEditAvatar}
            >
              {profileImage
                ? <Image source={{ uri: profileImage }} style={styles.avatarImage} />
                : <Ionicons name="person" size={34} color={isDark ? 'rgba(255,255,255,0.4)' : colors.textMuted} />}
              <View style={[styles.editBadge, { borderColor: isDark ? '#000' : colors.background }]}>
                <Ionicons name="camera" size={12} color="#000" />
              </View>
            </Pressable>

            {/* Name + stats */}
            <View style={styles.profileRight}>
              <Pressable onPress={handleEditName} style={styles.nameRow}>
                <Text style={[styles.profileName, { color: colors.textPrimary }]} numberOfLines={1}>{profileName}</Text>
                <Ionicons name="pencil-outline" size={14} color={colors.textMuted} style={{ marginLeft: 6 }} />
              </Pressable>
              <Text style={[styles.profileSub, { color: colors.textMuted }]}>Offline · Privacy First</Text>

              {/* Stats strip */}
              <View style={styles.statsRow}>
                <View style={styles.statItem}>
                  <Text style={[styles.statNumber, { color: colors.textPrimary }]}>{songs.length}</Text>
                  <Text style={[styles.statLabel, { color: colors.textMuted }]}>Songs</Text>
                </View>
                <View style={[styles.statDivider, { backgroundColor: cardBorder }]} />
                <View style={styles.statItem}>
                  <Text style={[styles.statNumber, { color: colors.textPrimary }]}>{likedCount}</Text>
                  <Text style={[styles.statLabel, { color: colors.textMuted }]}>Liked</Text>
                </View>
                <View style={[styles.statDivider, { backgroundColor: cardBorder }]} />
                <View style={styles.statItem}>
                  <Text style={[styles.statNumber, { color: colors.textPrimary }]}>{hiddenSongs.length}</Text>
                  <Text style={[styles.statLabel, { color: colors.textMuted }]}>Hidden</Text>
                </View>
              </View>
            </View>
          </View>

          {/* ── Quick pins ── */}
          <View style={styles.quickActions}>
            {(quickPins as string[]).map((pinId, slotIndex) => {
              const item = PINNABLE_ITEMS[pinId as PinId];
              if (!item) return null;
              return (
                <Pressable
                  key={slotIndex}
                  style={[styles.quickAction, { backgroundColor: cardBg, borderColor: cardBorder }]}
                  onPress={() => {
                    if (pinId === 'export') handleExport();
                    else if (pinId === 'import') handleImport();
                    else if (pinId === 'scan') handleImportLocalAudio();
                    else setActiveSheet(pinId);
                  }}
                  onLongPress={() => setPinPickerSlot(slotIndex)}
                  delayLongPress={400}
                >
                  <View style={[styles.quickIcon, { backgroundColor: item.iconColor + '22' }]}>
                    <Ionicons name={item.icon} size={20} color={item.iconColor} />
                  </View>
                  <Text style={[styles.quickActionText, { color: colors.textPrimary }]}>{item.label}</Text>
                  <View style={styles.quickEditHint}>
                    <Ionicons name="ellipsis-horizontal" size={12} color={colors.textMuted} />
                  </View>
                </Pressable>
              );
            })}
          </View>
          <Text style={[styles.quickHint, { color: colors.textMuted }]}>Hold any shortcut to customise</Text>

          {/* ── Section: Personalization ── */}
          <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>PERSONALIZATION</Text>
          <View style={[styles.menuGroup, { backgroundColor: cardBg, borderColor: cardBorder }]}>
            <MenuRow icon="moon-outline" iconColor="#A78BFA" label="Appearance" onPress={() => setActiveSheet('appearance')} />
            <MenuRow icon="play-circle-outline" iconColor="#34C759" label="Playback" onPress={() => setActiveSheet('playback')} />
            <MenuRow icon="radio-outline" iconColor="#FF6B6B" label="Mini Player" onPress={() => setActiveSheet('miniplayer')} />
            <MenuRow icon="folder-open-outline" iconColor="#FF9F0A" label="Library" onPress={() => setActiveSheet('library')} />
            <MenuRow icon="globe-outline" iconColor="#30D158" label="Discovery" onPress={() => setActiveSheet('discovery')} isLast />
          </View>

          {/* ── Section: System ── */}
          <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>SYSTEM</Text>
          <View style={[styles.menuGroup, { backgroundColor: cardBg, borderColor: cardBorder }]}>
            <MenuRow
              icon="desktop-outline" iconColor="#0A84FF" label="Desktop Connect"
              badge={desktopConnectEnabled ? 'On' : 'Off'}
              onPress={() => setActiveSheet('desktop')}
            />
            <MenuRow icon="trash-outline" iconColor="#FF453A" label="Data" onPress={() => setActiveSheet('data')} />
            <MenuRow icon="information-circle-outline" iconColor="#8E8E93" label="About" onPress={() => setActiveSheet('about')} isLast />
          </View>

          {/* ── Section: Tools ── */}
          <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>TOOLS</Text>
          <View style={[styles.menuGroup, { backgroundColor: cardBg, borderColor: cardBorder }]}>
            <MenuRow icon="download-outline" iconColor="#A78BFA" label="Export Library" onPress={handleExport} />
            <MenuRow icon="cloud-upload-outline" iconColor="#F472B6" label="Import Backup" onPress={handleImport} />
            <MenuRow icon="musical-notes-outline" iconColor="#60A5FA" label="Scan Local Audio" onPress={handleImportLocalAudio} isLast />
          </View>

        </ScrollView>
      </SafeAreaView>

      {/* ── Bottom Sheets ───────────────────────────────────────────────────── */}

      <BottomSheet visible={activeSheet === 'appearance'} title="Appearance" onClose={closeSheet}>
        <SettingsRow icon="moon-outline" label="App Theme" value="Dark" onPress={() => {}} />
        <SettingsRow
          icon="text-outline" label="Lyrics Size"
          value={settings.lyricsFontSize.charAt(0).toUpperCase() + settings.lyricsFontSize.slice(1)}
          onPress={() => {}}
        />
        <SettingsRowSwitch icon="speedometer-outline" label="Show FPS Counter" value={settings.showPerformanceHUD} onToggle={settings.setShowPerformanceHUD} />
      </BottomSheet>

      <BottomSheet visible={activeSheet === 'playback'} title="Playback" onClose={closeSheet}>
        <SettingsRowSwitch icon="play-outline" label="Auto-Scroll Lyrics" value={true} onToggle={() => {}} />
        <SettingsRowSwitch icon="musical-note-outline" label="Play in Mini Player Only" value={settings.playInMiniPlayerOnly} onToggle={settings.setPlayInMiniPlayerOnly} />
        {settings.navBarStyle === 'classic' && (
          <SettingsRow
            icon="layers-outline" label="Mini Player Style"
            value={settings.miniPlayerStyle === 'island' ? 'Dynamic Island' : 'Classic Bar'}
            onPress={() => settings.setMiniPlayerStyle(settings.miniPlayerStyle === 'island' ? 'bar' : 'island')}
          />
        )}
        <SettingsRow
          icon="navigate-outline" label="Navigation Bar Style"
          value={settings.navBarStyle === 'modern-pill' ? 'Modern Pill' : 'Classic'}
          onPress={() => {
            const next = settings.navBarStyle === 'modern-pill' ? 'classic' : 'modern-pill';
            settings.setNavBarStyle(next);
            if (next === 'modern-pill') settings.setMiniPlayerStyle('island');
          }}
        />
        <SettingsRowSwitch
          icon="mic-outline" label="Voice Button"
          value={settings.micEnabled ?? true}
          onToggle={settings.setMicEnabled}
        />
        {(settings.micEnabled ?? true) && (
          <SettingsRow
            icon="mic-outline" label="Voice Button Mode"
            value={(settings.voiceMode ?? 'hold') === 'hold' ? 'Hold to Talk' : 'Tap to Talk'}
            onPress={() => settings.setVoiceMode((settings.voiceMode ?? 'hold') === 'hold' ? 'tap' : 'hold')}
          />
        )}
        <SettingsRowSwitch icon="sunny-outline" label="Keep Screen On" value={settings.keepScreenOn} onToggle={settings.setKeepScreenOn} />
        <View style={styles.sliderRow}>
          <View style={styles.sliderHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Ionicons name="timer-outline" size={20} color={Colors.textSecondary} style={{ marginRight: 10 }} />
              <Text style={styles.sliderLabel}>Lyrics Delay</Text>
            </View>
            <Text style={styles.sliderValue}>{settings.lyricsDelay.toFixed(1)}s</Text>
          </View>
          <Slider
            style={{ width: '100%', height: 36 }}
            minimumValue={-5.0} maximumValue={5.0} step={0.1}
            value={settings.lyricsDelay}
            onSlidingComplete={settings.setLyricsDelay}
            minimumTrackTintColor={Colors.primary}
            maximumTrackTintColor={Colors.cardHover}
            thumbTintColor={Colors.primary}
          />
          <Text style={styles.sliderHint}>Negative = lyrics arrive late · Positive = early</Text>
        </View>
      </BottomSheet>

      <BottomSheet visible={activeSheet === 'miniplayer'} title="Mini Player" onClose={closeSheet}>
        <SettingsRow
          icon="image-outline"
          label="Dynamic Island Background"
          value={MINI_BG_LABELS[settings.islandBgMode as MiniBgMode] ?? 'Album Art'}
          onPress={() => {
            const next = MINI_BG_MODES[(MINI_BG_MODES.indexOf(settings.islandBgMode as MiniBgMode) + 1) % MINI_BG_MODES.length];
            settings.setIslandBgMode(next);
          }}
        />
        <SettingsRow
          icon="albums-outline"
          label="Classic Bar Background"
          value={MINI_BG_LABELS[settings.classicBarBgMode as MiniBgMode] ?? 'Album Art'}
          onPress={() => {
            const next = MINI_BG_MODES[(MINI_BG_MODES.indexOf(settings.classicBarBgMode as MiniBgMode) + 1) % MINI_BG_MODES.length];
            settings.setClassicBarBgMode(next);
          }}
        />
        {settings.navBarStyle === 'classic' && (
          <SettingsRow
            icon="layers-outline" label="Mini Player Style"
            value={settings.miniPlayerStyle === 'island' ? 'Dynamic Island' : 'Classic Bar'}
            onPress={() => settings.setMiniPlayerStyle(settings.miniPlayerStyle === 'island' ? 'bar' : 'island')}
          />
        )}
        <SettingsRowSwitch icon="musical-note-outline" label="Play in Mini Player Only" value={settings.playInMiniPlayerOnly} onToggle={settings.setPlayInMiniPlayerOnly} />
      </BottomSheet>

      <BottomSheet visible={activeSheet === 'library'} title="Library" onClose={closeSheet}>
        <SettingsRow
          icon="color-palette-outline" label="Background Theme"
          value={
            settings.libraryBackgroundMode === 'daily' ? 'Most Played Yesterday' :
            settings.libraryBackgroundMode === 'current' ? 'Current Song' :
            settings.libraryBackgroundMode === 'black' ? 'Pure Black' :
            settings.libraryBackgroundMode === 'grey' ? 'Spotify Grey' :
            settings.libraryBackgroundMode === 'theme-blue' ? 'LuvLyrics Blue' :
            settings.libraryBackgroundMode === 'purest-black' ? 'Purest Black' :
            settings.libraryBackgroundMode === 'theme-subtle' ? 'Subtle Dark' : 'Aurora'
          }
          onPress={() => {
            const modes: ('daily' | 'current' | 'aurora' | 'black' | 'grey' | 'theme-blue' | 'purest-black' | 'theme-subtle')[] = [
              'daily', 'current', 'aurora', 'black', 'grey', 'theme-blue', 'purest-black', 'theme-subtle'
            ];
            const next = modes[(modes.indexOf(settings.libraryBackgroundMode) + 1) % modes.length];
            settings.setLibraryBackgroundMode(next);
          }}
        />
        <SettingsRowSwitch
          icon="color-filter-outline"
          label="Apply Theme to Other Pages"
          value={settings.applyThemeToOtherPages}
          onToggle={settings.setApplyThemeToOtherPages}
        />
      </BottomSheet>

      <BottomSheet visible={activeSheet === 'desktop'} title="Desktop Connect" onClose={closeSheet}>
        <SettingsRowSwitch
          icon="desktop-outline"
          label="Enable Desktop Connect"
          value={desktopConnectEnabled}
          onToggle={setDesktopConnectEnabled}
        />
        <SettingsRowSwitch
          icon="cloud-download-outline"
          label="Allow Desktop Downloads"
          value={allowDesktopDownloads}
          onToggle={setAllowDesktopDownloads}
        />
        <SettingsRow
          icon="qr-code-outline"
          label="Pair New Desktop"
          onPress={() => { closeSheet(); setPairingModalVisible(true); }}
        />
      </BottomSheet>

      <BottomSheet visible={activeSheet === 'discovery'} title="Discovery" onClose={closeSheet}>
        <SettingsRowSwitch
          icon="musical-notes-outline"
          label="Show Thumbnails"
          value={settings.showThumbnails}
          onToggle={settings.setShowThumbnails}
        />
        <SettingsRow
          icon="scan-outline"
          label="Scan Local Audio"
          onPress={() => { closeSheet(); handleImportLocalAudio(); }}
        />
      </BottomSheet>

      <BottomSheet visible={activeSheet === 'data'} title="Data" onClose={closeSheet}>
        <SettingsRow
          icon="eye-off-outline"
          label="Hidden Songs"
          value={`${hiddenSongs.length}`}
          onPress={() => { closeSheet(); fetchHiddenSongs(); setHiddenSongsVisible(true); }}
        />
        <SettingsRow
          icon="refresh-outline"
          label="Reset Settings to Defaults"
          onPress={() => {
            setAlertConfig({
              visible: true,
              title: 'Reset Settings',
              message: 'All settings will be restored to their defaults. Your library will not be affected.',
              buttons: [
                { text: 'Cancel', onPress: () => {}, style: 'cancel' },
                { text: 'Reset', onPress: () => { settings.resetToDefaults(); closeSheet(); }, style: 'destructive' },
              ],
            });
          }}
        />
        <SettingsRow
          icon="trash-outline"
          label="Clear All Library Data"
          onPress={() => {
            setAlertConfig({
              visible: true,
              title: 'Clear All Data',
              message: 'This will permanently delete your entire song library and playlists. This cannot be undone.',
              buttons: [
                { text: 'Cancel', onPress: () => {}, style: 'cancel' },
                { text: 'Delete Everything', onPress: async () => { await clearAllData(); closeSheet(); }, style: 'destructive' },
              ],
            });
          }}
        />
      </BottomSheet>

      <BottomSheet visible={activeSheet === 'about'} title="About" onClose={closeSheet}>
        <SettingsRow icon="musical-note-outline" label="App" value="LuvLyrics" onPress={() => {}} />
        <SettingsRow icon="code-slash-outline" label="Version" value="1.0.0" onPress={() => {}} />
      </BottomSheet>

      {/* ── Alerts & Utility Modals ──────────────────────────────────────────── */}

      <CustomAlert
        visible={alertConfig.visible}
        title={alertConfig.title}
        message={alertConfig.message}
        buttons={alertConfig.buttons}
        onClose={() => setAlertConfig({ ...alertConfig, visible: false })}
      />

      <Modal visible={editNameVisible} transparent animationType="fade" onRequestClose={() => setEditNameVisible(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setEditNameVisible(false)}>
          <View style={styles.nameModal}>
            <Text style={styles.nameModalTitle}>Edit Name</Text>
            <TextInput
              style={styles.nameInput} value={tempName} onChangeText={setTempName}
              placeholder="Enter your name" placeholderTextColor="rgba(255,255,255,0.3)" autoFocus
            />
            <View style={styles.nameModalButtons}>
              <Pressable style={styles.nameModalButton} onPress={() => setEditNameVisible(false)}>
                <Text style={styles.nameModalButtonText}>Cancel</Text>
              </Pressable>
              <Pressable style={[styles.nameModalButton, styles.nameModalButtonPrimary]} onPress={handleSaveName}>
                <Text style={[styles.nameModalButtonText, styles.nameModalButtonTextPrimary]}>Save</Text>
              </Pressable>
            </View>
          </View>
        </Pressable>
      </Modal>

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
              <Ionicons name={selectedFiles.size === availableAudioFiles.length ? 'checkbox' : 'square-outline'} size={24} color="#007AFF" />
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
                    <Ionicons name={selectedFiles.has(file.uri) ? 'checkbox' : 'square-outline'} size={24} color={selectedFiles.has(file.uri) ? '#007AFF' : Colors.textSecondary} />
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
                <Text style={styles.selectionButtonText}>Cancel</Text>
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
            <Text style={styles.nameModalTitle}>Trusted Pairing</Text>
            <Text style={styles.pairingHint}>Scan the desktop QR and paste its JSON payload here.</Text>
            <TextInput
              style={styles.pairingInput} value={pairingPayloadText} onChangeText={setPairingPayloadText}
              multiline autoCapitalize="none" autoCorrect={false}
              placeholder="Paste QR payload JSON" placeholderTextColor="rgba(255,255,255,0.35)"
            />
            <View style={styles.nameModalButtons}>
              <Pressable style={styles.nameModalButton} onPress={() => setPairingModalVisible(false)}>
                <Text style={styles.nameModalButtonText}>Cancel</Text>
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
                      <Text style={{ color: '#007AFF', fontWeight: 'bold' }}>Unhide</Text>
                    </Pressable>
                  </View>
                ))
              )}
            </ScrollView>
            <View style={styles.selectionActions}>
              <Pressable style={[styles.selectionButton, styles.selectionButtonCancel, { flex: 1 }]} onPress={() => setHiddenSongsVisible(false)}>
                <Text style={styles.selectionButtonText}>Close</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <LuvsLanguagesModal visible={luvsLangModalVisible} onClose={() => setLuvsLangModalVisible(false)} />
    </View>
  );
};

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  content: { paddingHorizontal: 16 },

  // Screen title
  screenTitle: { fontSize: 34, fontWeight: '700', letterSpacing: -0.5, marginTop: 12, marginBottom: 20 },

  // Profile card
  profileCard: {
    flexDirection: 'row', alignItems: 'center', gap: 16,
    borderRadius: 20, padding: 16, marginBottom: 14,
    borderWidth: 1,
  },
  avatar: {
    width: 72, height: 72, borderRadius: 36,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, flexShrink: 0,
  },
  avatarImage: { width: '100%', height: '100%', borderRadius: 36 },
  editBadge: {
    position: 'absolute', bottom: -2, right: -2, width: 24, height: 24,
    borderRadius: 12, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center',
    borderWidth: 2,
  },
  profileRight: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 2 },
  profileName: { fontSize: 18, fontWeight: '700', letterSpacing: -0.3 },
  profileSub: { fontSize: 12, marginBottom: 12 },
  statsRow: { flexDirection: 'row', alignItems: 'center', gap: 0 },
  statItem: { flex: 1, alignItems: 'center' },
  statNumber: { fontSize: 17, fontWeight: '700', letterSpacing: -0.4 },
  statLabel: { fontSize: 11, marginTop: 1 },
  statDivider: { width: 1, height: 28, opacity: 0.5 },

  // Quick Actions
  quickActions: { flexDirection: 'row', gap: 10, marginBottom: 6 },
  quickAction: {
    flex: 1, borderRadius: 16,
    paddingVertical: 14, paddingHorizontal: 12,
    alignItems: 'center', gap: 8,
    borderWidth: 1,
  },
  quickIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  quickActionText: { fontSize: 13, fontWeight: '600' },
  quickActionSub: { fontSize: 11 },
  quickEditHint: { position: 'absolute', top: 8, right: 10 },
  quickHint: { fontSize: 11, textAlign: 'center', marginBottom: 24, opacity: 0.7 },

  // Pin picker
  pinSectionLabel: { fontSize: 11, fontWeight: '600', letterSpacing: 0.5, marginTop: 12, marginBottom: 4, marginLeft: 2 },
  pinPickerRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 13, borderBottomWidth: StyleSheet.hairlineWidth },
  pinPickerLabel: { flex: 1, fontSize: 15, fontWeight: '500' },
  pinPickerUsed: { fontSize: 12, marginRight: 4 },

  // Section label
  sectionLabel: {
    fontSize: 12, fontWeight: '600', letterSpacing: 0.6,
    marginBottom: 8, marginLeft: 4,
  },

  // Menu groups
  menuGroup: {
    borderRadius: 16, overflow: 'hidden', borderWidth: 1, marginBottom: 20,
  },
  menuRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 13, paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth, gap: 14,
  },
  menuRowLast: { borderBottomWidth: 0 },
  menuIcon: { width: 34, height: 34, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  menuLabel: { flex: 1, fontSize: 15, fontWeight: '500', color: Colors.textPrimary },
  menuRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  menuBadge: { fontSize: 13, color: Colors.textSecondary, fontWeight: '500' },

  // Settings rows (inside sheets)
  settingsRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 14, borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)', gap: 14,
  },
  settingsLabel: { flex: 1, fontSize: 15, fontWeight: '500', color: Colors.textPrimary },
  settingsValue: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  settingsValueText: { fontSize: 14, color: Colors.textSecondary },

  // Slider row
  sliderRow: { paddingTop: 14, paddingBottom: 4 },
  sliderHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  sliderLabel: { fontSize: 15, fontWeight: '500', color: Colors.textPrimary },
  sliderValue: { fontSize: 14, color: Colors.primary, fontWeight: '700' },
  sliderHint: { fontSize: 11, color: Colors.textSecondary, marginTop: 2 },

  // Modals
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', alignItems: 'center' },
  nameModal: { backgroundColor: '#1C1C1E', borderRadius: 16, padding: 24, width: '80%', maxWidth: 320 },
  nameModalTitle: { fontSize: 18, fontWeight: '700', color: Colors.textPrimary, marginBottom: 16, textAlign: 'center' },
  nameInput: { backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 12, padding: 14, fontSize: 15, color: Colors.textPrimary, marginBottom: 18 },
  nameModalButtons: { flexDirection: 'row', gap: 10 },
  nameModalButton: { flex: 1, padding: 13, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center' },
  nameModalButtonPrimary: { backgroundColor: '#007AFF' },
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
  selectAllText: { fontSize: 15, fontWeight: '600', color: '#007AFF' },
  selectionList: { maxHeight: 400 },
  selectionItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 12 },
  selectionItemInfo: { flex: 1 },
  selectionItemTitle: { fontSize: 15, fontWeight: '600', color: Colors.textPrimary },
  selectionItemArtist: { fontSize: 13, color: Colors.textSecondary, marginTop: 2 },
  selectionActions: { flexDirection: 'row', gap: 12, paddingHorizontal: 20, paddingTop: 18 },
  selectionButton: { flex: 1, padding: 14, borderRadius: 12, alignItems: 'center' },
  selectionButtonCancel: { backgroundColor: 'rgba(255,255,255,0.1)' },
  selectionButtonImport: { backgroundColor: '#007AFF' },
  selectionButtonDisabled: { backgroundColor: 'rgba(0,122,255,0.3)' },
  selectionButtonText: { fontSize: 15, fontWeight: '600', color: Colors.textPrimary },
  selectionButtonTextImport: { color: '#fff' },
});

export default SettingsScreen;