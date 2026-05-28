/**
 * LyricFlow - Settings Screen
 * User preferences with iOS-style toggles
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
} from 'react-native';
import Slider from '@react-native-community/slider';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { TabScreenProps } from '../types/navigation';
import { usePlayerStore } from '../store/playerStore';
import { useSettingsStore } from '../store/settingsStore';
import { useArtHistoryStore } from '../store/artHistoryStore';
import { CustomAlert } from '../components/CustomAlert';
import { Colors } from '../constants/colors';
import { exportAllSongs, shareExportedFile, importSongsFromJson } from '../utils/exportImport';
import { clearAllData } from '../database/queries';
import { useLuvsPreferencesStore } from '../store/luvsPreferencesStore';
import { useDesktopBridgeSettingsStore } from '../store/desktopBridgeSettingsStore';

const LuvsLanguagesModal = ({ visible, onClose }: { visible: boolean; onClose: () => void }) => {
    const { preferredLanguages, updateLanguageWeight } = useLuvsPreferencesStore();
    
    // Sort so active ones are on top or just alphabetical? Let's do alphabetical or fixed order
    // Fixed order from store is fine.
    
    return (
        <Modal
            animationType="slide"
            transparent={true}
            visible={visible}
            onRequestClose={onClose}
        >
            <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', alignItems: 'center' }}>
                <View style={{ 
                    width: '90%', 
                    maxHeight: '80%', 
                    backgroundColor: Colors.card, 
                    borderRadius: 20, 
                    padding: 20,
                    borderWidth: 1,
                    borderColor: 'rgba(255,255,255,0.1)'
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
                                    <Text style={{ fontSize: 16, color: Colors.textPrimary, fontWeight: '600', fontFamily: 'Inter-SemiBold' }}>{item.language}</Text>
                                    <Text style={{ fontSize: 14, color: Colors.primary, fontWeight: '700' }}>{item.weight === 0 ? 'DISABLED' : `${item.weight}%`}</Text>
                                </View>
                                <Slider
                                    style={{ width: '100%', height: 40 }}
                                    minimumValue={0}
                                    maximumValue={100}
                                    step={10}
                                    value={item.weight}
                                    onSlidingComplete={(value) => updateLanguageWeight(item.language, value)}
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
import { useSongsStore } from '../store/songsStore';
import { scanAudioFiles, convertAudioFileToSong } from '../services/mediaScanner';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';



type Props = TabScreenProps<'Settings'>;

const SettingsScreen: React.FC<Props> = () => {
  const settings = useSettingsStore();
  const { fetchSongs, addSong, songs, deleteSong, updateSong } = useSongsStore();
  const { addRecentArt } = useArtHistoryStore();
  const [isImporting, setIsImporting] = React.useState(false);
  const [profileName, setProfileName] = React.useState('LyricFlow User');
  const [profileImage, setProfileImage] = React.useState<string | null>(null);
  const [editNameVisible, setEditNameVisible] = React.useState(false);
  const [tempName, setTempName] = React.useState('');
  const [selectionModalVisible, setSelectionModalVisible] = React.useState(false);
  const [availableAudioFiles, setAvailableAudioFiles] = React.useState<any[]>([]);
  const [selectedFiles, setSelectedFiles] = React.useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = React.useState('');
  const setMiniPlayerHidden = usePlayerStore(state => state.setMiniPlayerHidden);
  const [hiddenSongsVisible, setHiddenSongsVisible] = React.useState(false);
  const { hiddenSongs, fetchHiddenSongs, hideSong: unhideSong } = useSongsStore();
  const [luvsLangModalVisible, setLuvsLangModalVisible] = React.useState(false);
  const { luvsLanguages } = useLuvsPreferencesStore();
  const {
    desktopConnectEnabled,
    allowDesktopDownloads,
    setDesktopConnectEnabled,
    setAllowDesktopDownloads,
  } = useDesktopBridgeSettingsStore();

  // Visibility Management: Hide MiniPlayer when Settings is focus
  useFocusEffect(
    React.useCallback(() => {
      setMiniPlayerHidden(true);
    }, [setMiniPlayerHidden])
  );

  // Filter audio files based on search query
  const filteredAudioFiles = React.useMemo(() => {
    if (!searchQuery.trim()) return availableAudioFiles;
    const q = searchQuery.toLowerCase().trim();
    return availableAudioFiles.filter(f => {
      const filename = (f.filename || '').toLowerCase();
      const artist = (f.artist || '').toLowerCase();
      const album = (f.album || '').toLowerCase();
      return filename.includes(q) || artist.includes(q) || album.includes(q);
    });
  }, [availableAudioFiles, searchQuery]);
  const [alertConfig, setAlertConfig] = React.useState<{
    visible: boolean;
    title: string;
    message: string;
    buttons: Array<{ text: string; onPress: () => void; style?: 'default' | 'cancel' | 'destructive' }>;
  }>({ visible: false, title: '', message: '', buttons: [] });

  const handleEditName = () => {
    setTempName(profileName);
    setEditNameVisible(true);
  };

  const handleSaveName = () => {
    if (tempName.trim()) {
      setProfileName(tempName.trim());
    }
    setEditNameVisible(false);
  };

  const handleEditAvatar = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0].uri) {
        setProfileImage(result.assets[0].uri);
      }
    } catch (error) {
      if (__DEV__) console.error('Avatar selection failed:', error);
    }
  };

  const handleExport = async () => {
    try {
      const fileUri = await exportAllSongs();
      await shareExportedFile(fileUri);
    } catch (error) {
      if (__DEV__) console.error('Export failed:', error);
      Alert.alert('Export Failed', 'Could not export songs.');
    }
  };

  const handleImport = async () => {
    try {
      const count = await importSongsFromJson();
      if (count > 0) {
        Alert.alert('Import Successful', `Imported ${count} songs.`);
        await fetchSongs();
      }
    } catch (error) {
       if (__DEV__) console.error('Import failed:', error);
       Alert.alert('Import Failed', 'Could not import songs. Check file format.');
    }
  };

  const handleClearData = () => {
    setAlertConfig({
      visible: true,
      title: '⚠️ Clear All Data',
      message: 'This will permanently delete all songs and lyrics. This action cannot be undone.',
      buttons: [
        { text: 'Cancel', style: 'cancel', onPress: () => {} },
        {
          text: 'Delete All',
          style: 'destructive',
          onPress: async () => {
            try {
              await clearAllData();
              await fetchSongs();
              setAlertConfig({
                visible: true,
                title: '✅ Success',
                message: 'All data has been cleared.',
                buttons: [{ text: 'Done', onPress: () => {} }],
              });
            } catch (error) {
              setAlertConfig({
                visible: true,
                title: '❌ Error',
                message: 'Failed to clear data.',
                buttons: [{ text: 'OK', onPress: () => {} }],
              });
            }
          },
        },
      ],
    });
  };

  const handleClearImported = async () => {
    const importedSongs = songs.filter(s => s.audioUri);
    
    if (importedSongs.length === 0) {
      setAlertConfig({
        visible: true,
        title: 'ℹ️ No Imported Songs',
        message: 'There are no imported audio files to remove.',
        buttons: [{ text: 'OK', onPress: () => {} }],
      });
      return;
    }

    setAlertConfig({
      visible: true,
      title: '🗑️ Clear Imported Audio',
      message: `Remove ${importedSongs.length} imported audio files? Your manually created songs will be kept.`,
      buttons: [
        { text: 'Cancel', style: 'cancel', onPress: () => {} },
        {
          text: `Remove ${importedSongs.length} Songs`,
          style: 'destructive',
          onPress: async () => {
            try {
              for (const song of importedSongs) {
                await deleteSong(song.id);
              }
              setAlertConfig({
                visible: true,
                title: '✅ Removed',
                message: `Removed ${importedSongs.length} imported songs.`,
                buttons: [{ text: 'Done', onPress: () => {} }],
              });
            } catch (error) {
              setAlertConfig({
                visible: true,
                title: '❌ Error',
                message: 'Failed to remove imported songs.',
                buttons: [{ text: 'OK', onPress: () => {} }],
              });
            }
          },
        },
      ],
    });
  };

  const handleBatchCoverArt = async () => {
    const importedSongs = songs.filter(s => s.audioUri);
    
    if (importedSongs.length === 0) {
      setAlertConfig({
        visible: true,
        title: 'ℹ️ No Imported Songs',
        message: 'There are no imported audio files.',
        buttons: [{ text: 'OK', onPress: () => {} }],
      });
      return;
    }

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0].uri) {
        const uri = result.assets[0].uri;
        
        setAlertConfig({
          visible: true,
          title: '🖼️ Apply Cover Art',
          message: `Set this image as cover for all ${importedSongs.length} imported songs?`,
          buttons: [
            { text: 'Cancel', style: 'cancel', onPress: () => {} },
            {
              text: `Update ${importedSongs.length} Songs`,
              onPress: async () => {
                let updated = 0;
                for (const song of importedSongs) {
                  try {
                    await updateSong({
                      ...song,
                      coverImageUri: uri,
                      dateModified: new Date().toISOString(),
                    });
                    updated++;
                  } catch (error) {
                    if (__DEV__) console.error('Failed to update:', song.title);
                  }
                }
                addRecentArt(uri);
                setAlertConfig({
                  visible: true,
                  title: '✅ Updated',
                  message: `Updated cover art for ${updated} songs.`,
                  buttons: [{ text: 'Done', onPress: () => {} }],
                });
              },
            },
          ],
        });
      }
    } catch (error) {
      if (__DEV__) console.error('Cover art selection failed:', error);
    }
  };

  const handleImportLocalAudio = async () => {
    try {
      setIsImporting(true);
      const audioFiles = await scanAudioFiles();
      
      if (audioFiles.length === 0) {
        Alert.alert('No Audio Files', 'No audio files found on your device.');
        setIsImporting(false);
        return;
      }

      const existingUris = new Set(songs.filter(s => s.audioUri).map(s => s.audioUri));
      const newAudioFiles = audioFiles.filter(f => !existingUris.has(f.uri));

      if (newAudioFiles.length === 0) {
        setAlertConfig({
          visible: true,
          title: 'ℹ️ Already Imported',
          message: 'All audio files have already been imported.',
          buttons: [{ text: 'OK', onPress: () => setIsImporting(false) }],
        });
        return;
      }

      setIsImporting(false);
      setAvailableAudioFiles(newAudioFiles);
      setSelectedFiles(new Set());
      setSearchQuery('');
      setSelectionModalVisible(true);
    } catch (error) {
      setIsImporting(false);
      if (__DEV__) console.error('Import failed:', error);
      Alert.alert('Import Failed', 'Could not access media library. Check permissions.');
    }
  };

  const handleImportSelected = async () => {
    setSelectionModalVisible(false);
    setIsImporting(true);
    
    let imported = 0;
    for (const audioFile of availableAudioFiles) {
      if (selectedFiles.has(audioFile.uri)) {
        try {
          const song = convertAudioFileToSong(audioFile);
          await addSong(song);
          imported++;
        } catch (error) {
          if (__DEV__) console.error('Failed to import:', audioFile.filename, error);
        }
      }
    }
    
    setIsImporting(false);
    setAlertConfig({
      visible: true,
      title: '✅ Import Complete',
      message: `Successfully imported ${imported} of ${selectedFiles.size} selected songs.`,
      buttons: [{ text: 'Done', onPress: () => {} }],
    });
  };

  const toggleSelectAll = () => {
    if (selectedFiles.size === availableAudioFiles.length) {
      setSelectedFiles(new Set());
    } else {
      setSelectedFiles(new Set(availableAudioFiles.map(f => f.uri)));
    }
  };

  const handleCloseSelectionModal = () => {
    setSelectionModalVisible(false);
    setSearchQuery('');
  };

  const toggleFileSelection = (uri: string) => {
    const newSelected = new Set(selectedFiles);
    if (newSelected.has(uri)) {
      newSelected.delete(uri);
    } else {
      newSelected.add(uri);
    }
    setSelectedFiles(newSelected);
  };

  const handleSetDownloadLocation = async () => {
    if (Platform.OS !== 'android') {
      Alert.alert('Not Available', 'Custom download folders are only supported on Android. On iOS, downloads are saved to the app documents.');
      return;
    }

    try {
      const permissions = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
      if (permissions.granted) {
        const uri = permissions.directoryUri;
        settings.setDownloadDirectory(uri);
        Alert.alert('Success', 'Download location updated! Future downloads will be saved here.');
      }
    } catch (e) {
      if (__DEV__) console.error(e);
      Alert.alert('Error', 'Failed to set download location.');
    }
  };

  return (
    <View style={styles.container}>
      {/* AuroraHeader removed */}
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScrollView contentContainerStyle={styles.content}>
          {/* Profile Section */}
          <View style={styles.profileSection}>
            <Pressable style={styles.avatar} onPress={handleEditAvatar}>
              {profileImage ? (
                <Image source={{ uri: profileImage }} style={styles.avatarImage} />
              ) : (
                <Ionicons name="person" size={40} color={Colors.textSecondary} />
              )}
              <View style={styles.editBadge}>
                <Ionicons name="camera" size={14} color="#000" />
              </View>
            </Pressable>
            <Pressable onPress={handleEditName}>
              <View style={styles.nameContainer}>
                <Text style={styles.profileName}>{profileName}</Text>
                <Ionicons name="create-outline" size={16} color={Colors.textSecondary} style={{ marginLeft: 6 }} />
              </View>
            </Pressable>
            <Text style={styles.profileEmail}>Offline Mode • Privacy First</Text>
          </View>

          {/* Quick Actions */}
          <View style={styles.quickActions}>
            <Pressable style={styles.quickAction} onPress={handleExport}>
              <Ionicons name="download-outline" size={28} color="#A78BFA" />
              <Text style={styles.quickActionText}>Export</Text>
            </Pressable>
            <Pressable style={styles.quickAction} onPress={handleImport}>
              <Ionicons name="cloud-upload-outline" size={28} color="#F472B6" />
              <Text style={styles.quickActionText}>Import</Text>
            </Pressable>
            <Pressable style={styles.quickAction}>
              <Ionicons name="time-outline" size={28} color="#60A5FA" />
              <Text style={styles.quickActionText}>History</Text>
            </Pressable>
          </View>

          {/* Settings Sections */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>APPEARANCE</Text>
            <SettingsRow
              icon="moon-outline"
              label="App Theme"
              value="Dark"
              onPress={() => {}}
            />
            <SettingsRow
              icon="text-outline"
              label="Lyrics Size"
              value={settings.lyricsFontSize.charAt(0).toUpperCase() + settings.lyricsFontSize.slice(1)}
              onPress={() => {}}
            />
            <SettingsRowSwitch
              icon="speedometer-outline"
              label="Show FPS Counter"
              value={settings.showPerformanceHUD}
              onToggle={settings.setShowPerformanceHUD}
            />
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>PLAYBACK</Text>
            <SettingsRowSwitch
              icon="play-outline"
              label="Auto-Scroll Lyrics"
              value={true}
              onToggle={() => {}}
            />
            <SettingsRowSwitch
              icon="musical-note-outline"
              label="Play in Mini Player Only"
              value={settings.playInMiniPlayerOnly}
              onToggle={settings.setPlayInMiniPlayerOnly}
            />
            {/* Mini Player Style - Only show choice if Classic Navbar is selected */}
            {settings.navBarStyle === 'classic' && (
                <SettingsRow
                icon="layers-outline"
                label="Mini Player Style"
                value={settings.miniPlayerStyle === 'island' ? 'Dynamic Island' : 'Classic Bar'}
                onPress={() => {
                    const newStyle = settings.miniPlayerStyle === 'island' ? 'bar' : 'island';
                    settings.setMiniPlayerStyle(newStyle);
                }}
                />
            )}

            <SettingsRow
              icon="navigate-outline"
              label="Navigation Bar Style"
              value={settings.navBarStyle === 'modern-pill' ? 'Modern Pill' : 'Classic'}
              onPress={() => {
                const newStyle = settings.navBarStyle === 'modern-pill' ? 'classic' : 'modern-pill';
                settings.setNavBarStyle(newStyle);
                
                // If switching TO Modern Pill, FORCE Dynamic Island
                if (newStyle === 'modern-pill') {
                  settings.setMiniPlayerStyle('island');
                } 
                // If switching TO Classic, defaulted to Island (user can change it)
                // No need to force 'bar' anymore, let user choose.
              }}
            />
            <SettingsRowSwitch
              icon="sunny-outline"
              label="Keep Screen On"
              value={settings.keepScreenOn}
              onToggle={settings.setKeepScreenOn}
            />
             <View style={{ marginBottom: 20 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <Ionicons name="timer-outline" size={22} color={Colors.textSecondary} style={{ marginRight: 12 }} />
                        <Text style={{ fontSize: 16, color: Colors.textPrimary, fontWeight: '500' }}>Lyrics Delay</Text>
                    </View>
                    <Text style={{ fontSize: 14, color: Colors.primary, fontWeight: '700' }}>{settings.lyricsDelay.toFixed(1)}s</Text>
                </View>
                <Slider
                    style={{ width: '100%', height: 40 }}
                    minimumValue={-5.0}
                    maximumValue={5.0}
                    step={0.1}
                    value={settings.lyricsDelay}
                    onSlidingComplete={settings.setLyricsDelay}
                    minimumTrackTintColor={Colors.primary}
                    maximumTrackTintColor={Colors.cardHover}
                    thumbTintColor={Colors.primary}
                />
                 <Text style={{ fontSize: 12, color: Colors.textSecondary, marginLeft: 34 }}>
                    Negative values delay lyrics (late). Positive values speed them up (early).
                </Text>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>LIBRARY</Text>
            <SettingsRow
              icon="folder-outline"
              label={isImporting ? 'Importing...' : 'Import Local Audio'}
              value={isImporting ? '' : 'Tap to scan'}
              onPress={handleImportLocalAudio}
            />
            <SettingsRow
              icon="image-outline"
              label="Set Cover for All Imported"
              value="Batch update"
              onPress={handleBatchCoverArt}
            />
            <SettingsRowSwitch
              icon="download-outline"
              label="Show Thumbnails"
              value={settings.showThumbnails}
              onToggle={settings.setShowThumbnails}
            />
            {/* Library Background Mode Selector */}
             <SettingsRow
              icon="color-palette-outline"
              label="Background Theme"
              value={
                  settings.libraryBackgroundMode === 'daily' ? 'Most Played Yesterday' :
                  settings.libraryBackgroundMode === 'current' ? 'Current Song' :
                  settings.libraryBackgroundMode === 'black' ? 'Pure Black' :
                  settings.libraryBackgroundMode === 'grey' ? 'Spotify Grey' :
                  'Standard (Aurora)'
              }
              onPress={() => {
                  // Cycle through modes: daily -> current -> aurora -> black -> grey -> daily
                  const modes: ('daily' | 'current' | 'aurora' | 'black' | 'grey')[] = ['daily', 'current', 'aurora', 'black', 'grey'];
                  const currentIndex = modes.indexOf(settings.libraryBackgroundMode);
                  const nextMode = modes[(currentIndex + 1) % modes.length];
                  settings.setLibraryBackgroundMode(nextMode);
              }}
            />
            <SettingsRow
              icon="eye-off-outline"
              label="Hidden Songs"
              value={hiddenSongs.length > 0 ? `${hiddenSongs.length} songs` : 'None'}
              onPress={() => {
                  fetchHiddenSongs();
                  setHiddenSongsVisible(true);
              }}
            />
            <SettingsRow
              icon="save-outline"
              label="Download Location"
              value={settings.downloadDirectoryUri ? 'Custom Folder' : 'Default (App Storage)'}
              onPress={handleSetDownloadLocation}
            />
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>DATA</Text>
            <SettingsRow
              icon="close-circle-outline"
              label="Clear Imported Audio"
              onPress={handleClearImported}
            />
            <SettingsRow
              icon="trash-outline"
              label="Clear All Data"
              onPress={handleClearData}
            />
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>LUVS & DISCOVERY</Text>
            <SettingsRow
              icon="language-outline"
              label="Music Languages"
              value="Configure Weights"
              onPress={() => setLuvsLangModalVisible(true)}
            />
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>DESKTOP CONNECT</Text>
            <SettingsRowSwitch
              icon="desktop-outline"
              label="Desktop Connect"
              value={desktopConnectEnabled}
              onToggle={setDesktopConnectEnabled}
            />
            <SettingsRowSwitch
              icon="cloud-download-outline"
              label="Allow Desktop Downloads"
              value={allowDesktopDownloads}
              onToggle={setAllowDesktopDownloads}
            />
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>ABOUT</Text>
            <SettingsRow
              icon="information-circle-outline"
              label="Version"
              value="1.0.0"
              showChevron={false}
            />
            <SettingsRow
              icon="shield-outline"
              label="Privacy Policy"
              onPress={() => {}}
            />
          </View>
        </ScrollView>
      </SafeAreaView>
      
      <CustomAlert
        visible={alertConfig.visible}
        title={alertConfig.title}
        message={alertConfig.message}
        buttons={alertConfig.buttons}
        onClose={() => setAlertConfig({ ...alertConfig, visible: false })}
      />
      
      <Modal
        visible={editNameVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setEditNameVisible(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setEditNameVisible(false)}>
          <View style={styles.nameModal}>
            <Text style={styles.nameModalTitle}>Edit Name</Text>
            <TextInput
              style={styles.nameInput}
              value={tempName}
              onChangeText={setTempName}
              placeholder="Enter your name"
              placeholderTextColor="rgba(255,255,255,0.3)"
              autoFocus
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

      <Modal
        visible={selectionModalVisible}
        transparent
        animationType="slide"
        onRequestClose={handleCloseSelectionModal}
      >
        <Pressable 
          style={styles.selectionOverlay}
          onPress={handleCloseSelectionModal}
        >
          <Pressable 
            style={styles.selectionContainer}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.selectionHeader}>
              <Text style={styles.selectionTitle}>Select Songs ({selectedFiles.size}/{availableAudioFiles.length})</Text>
              <Pressable onPress={handleCloseSelectionModal}>
                <Ionicons name="close" size={24} color={Colors.textPrimary} />
              </Pressable>
            </View>
            {/* Search Bar */}
            <View style={styles.searchBarContainer}>
              <Ionicons name="search" size={18} color={Colors.textSecondary} />
              <TextInput
                style={styles.searchBarInput}
                placeholder="Search songs..."
                placeholderTextColor={Colors.textMuted}
                value={searchQuery}
                onChangeText={setSearchQuery}
                autoCapitalize="none"
                autoCorrect={false}
                clearButtonMode="while-editing"
              />
              {searchQuery.length > 0 && (
                <Pressable onPress={() => setSearchQuery('')}>
                  <Ionicons name="close-circle" size={18} color={Colors.textSecondary} />
                </Pressable>
              )}
            </View>
            <Pressable style={styles.selectAllButton} onPress={toggleSelectAll}>
              <Ionicons 
                name={selectedFiles.size === availableAudioFiles.length ? "checkbox" : "square-outline"} 
                size={24} 
                color="#007AFF" 
              />
              <Text style={styles.selectAllText}>Select All</Text>
            </Pressable>
            <ScrollView style={styles.selectionList} keyboardShouldPersistTaps="handled">
              {filteredAudioFiles.length === 0 && searchQuery.trim() !== '' ? (
                <View style={styles.emptySearchContainer}>
                  <Ionicons name="search-outline" size={40} color={Colors.textMuted} />
                  <Text style={styles.emptySearchText}>No songs match "{searchQuery}"</Text>
                </View>
              ) : (
                filteredAudioFiles.map((file) => (
                  <Pressable
                    key={file.uri}
                    style={styles.selectionItem}
                    onPress={() => toggleFileSelection(file.uri)}
                  >
                    <Ionicons 
                      name={selectedFiles.has(file.uri) ? "checkbox" : "square-outline"} 
                      size={24} 
                      color={selectedFiles.has(file.uri) ? "#007AFF" : Colors.textSecondary} 
                    />
                    <View style={styles.selectionItemInfo}>
                      <Text style={styles.selectionItemTitle} numberOfLines={1}>{file.filename.replace(/\.[^/.]+$/, '')}</Text>
                      <Text style={styles.selectionItemArtist} numberOfLines={1}>{file.artist || file.album || 'Unknown'}</Text>
                    </View>
                  </Pressable>
                ))
              )}
            </ScrollView>
            <View style={styles.selectionActions}>
              <Pressable 
                style={[styles.selectionButton, styles.selectionButtonCancel]} 
                onPress={handleCloseSelectionModal}
              >
                <Text style={styles.selectionButtonText}>Cancel</Text>
              </Pressable>
              <Pressable 
                style={[styles.selectionButton, styles.selectionButtonImport, selectedFiles.size === 0 && styles.selectionButtonDisabled]} 
                onPress={handleImportSelected}
                disabled={selectedFiles.size === 0}
              >
                <Text style={[styles.selectionButtonText, styles.selectionButtonTextImport]}>Import {selectedFiles.size}</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
      <Modal
        visible={hiddenSongsVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setHiddenSongsVisible(false)}
      >
        <Pressable 
          style={styles.selectionOverlay}
          onPress={() => setHiddenSongsVisible(false)}
        >
          <Pressable 
            style={styles.selectionContainer}
            onPress={(e) => e.stopPropagation()}
          >
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
                hiddenSongs.map((song) => (
                  <View
                    key={song.id}
                    style={styles.selectionItem}
                  >
                    {song.coverImageUri ? (
                        <Image source={{ uri: song.coverImageUri }} style={{ width: 44, height: 44, borderRadius: 8 }} />
                    ) : (
                        <View style={{ width: 44, height: 44, borderRadius: 8, backgroundColor: '#2C2C2E', alignItems: 'center', justifyContent: 'center' }}>
                            <Ionicons name="disc" size={24} color="rgba(255,255,255,0.3)" />
                        </View>
                    )}
                    <View style={styles.selectionItemInfo}>
                      <Text style={styles.selectionItemTitle} numberOfLines={1}>{song.title}</Text>
                      <Text style={styles.selectionItemArtist} numberOfLines={1}>{song.artist || 'Unknown Artist'}</Text>
                    </View>
                    <Pressable
                        style={{ 
                            paddingHorizontal: 16, 
                            paddingVertical: 8, 
                            borderRadius: 16, 
                            backgroundColor: 'rgba(0,122,255,0.1)' 
                        }}
                        onPress={() => unhideSong(song.id, false)}
                    >
                        <Text style={{ color: '#007AFF', fontWeight: 'bold' }}>Unhide</Text>
                    </Pressable>
                  </View>
                ))
              )}
            </ScrollView>
            
            <View style={styles.selectionActions}>
              <Pressable 
                style={[styles.selectionButton, styles.selectionButtonCancel, { flex: 1 }]} 
                onPress={() => setHiddenSongsVisible(false)}
              >
                <Text style={styles.selectionButtonText}>Close</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <LuvsLanguagesModal 
        visible={luvsLangModalVisible} 
        onClose={() => setLuvsLangModalVisible(false)} 
      />
    </View>
  );
};

// Settings Row Component
interface SettingsRowProps {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value?: string;
  onPress?: () => void;
  showChevron?: boolean;
}

const SettingsRow: React.FC<SettingsRowProps> = ({
  icon,
  label,
  value,
  onPress,
  showChevron = true,
}) => (
  <Pressable style={styles.settingsRow} onPress={onPress}>
    <Ionicons name={icon} size={24} color={Colors.textSecondary} />
    <Text style={styles.settingsLabel}>{label}</Text>
    <View style={styles.settingsValue}>
      {value && <Text style={styles.settingsValueText}>{value}</Text>}
      {showChevron && (
        <Ionicons name="chevron-forward" size={20} color={Colors.textMuted} />
      )}
    </View>
  </Pressable>
);

// Settings Row with Switch
interface SettingsRowSwitchProps {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: boolean;
  onToggle: (value: boolean) => void;
}

const SettingsRowSwitch: React.FC<SettingsRowSwitchProps> = ({
  icon,
  label,
  value,
  onToggle,
}) => (
  <View style={styles.settingsRow}>
    <Ionicons name={icon} size={24} color={Colors.textSecondary} />
    <Text style={styles.settingsLabel}>{label}</Text>
    <Switch
      value={value}
      onValueChange={onToggle}
      trackColor={{ false: '#39393D', true: '#34C759' }}
      thumbColor="#fff"
    />
  </View>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  safeArea: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 16,
    paddingBottom: 100,
  },
  profileSection: {
    alignItems: 'center',
    marginTop: 24,
    marginBottom: 32,
  },
  avatar: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: Colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    position: 'relative',
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: 45,
  },
  editBadge: {
    position: 'absolute',
    bottom: -4,
    right: -4,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: Colors.background,
  },
  nameContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  profileName: {
    fontSize: 24,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  profileEmail: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 4,
  },
  quickActions: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 32,
    paddingHorizontal: 4,
  },
  quickAction: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 20,
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
    height: 110,
    gap: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  quickActionText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  section: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textSecondary,
    letterSpacing: 1,
    marginBottom: 8,
    paddingLeft: 4,
  },
  settingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(44,44,46,0.3)',
    gap: 16,
  },
  settingsLabel: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
    color: Colors.textPrimary,
  },
  settingsValue: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  settingsValueText: {
    fontSize: 16,
    color: Colors.textSecondary,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  nameModal: {
    backgroundColor: '#1C1C1E',
    borderRadius: 16,
    padding: 24,
    width: '80%',
    maxWidth: 320,
  },
  nameModalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 16,
    textAlign: 'center',
  },
  nameInput: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: Colors.textPrimary,
    marginBottom: 20,
  },
  nameModalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  nameModalButton: {
    flex: 1,
    padding: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
  },
  nameModalButtonPrimary: {
    backgroundColor: '#007AFF',
  },
  nameModalButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  nameModalButtonTextPrimary: {
    color: '#fff',
  },
  selectionOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.9)',
    justifyContent: 'flex-end',
  },
  selectionContainer: {
    backgroundColor: '#1C1C1E',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
    paddingBottom: 40,
  },
  selectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 20,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  selectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  searchBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 4,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  searchBarInput: {
    flex: 1,
    fontSize: 16,
    color: Colors.textPrimary,
    paddingVertical: 2,
  },
  emptySearchContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    gap: 12,
  },
  emptySearchText: {
    fontSize: 15,
    color: Colors.textMuted,
    textAlign: 'center',
  },
  selectAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  selectAllText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#007AFF',
  },
  selectionList: {
    maxHeight: 400,
  },
  selectionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  selectionItemInfo: {
    flex: 1,
  },
  selectionItemTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  selectionItemArtist: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  selectionActions: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  selectionButton: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  selectionButtonCancel: {
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  selectionButtonImport: {
    backgroundColor: '#007AFF',
  },
  selectionButtonDisabled: {
    backgroundColor: 'rgba(0,122,255,0.3)',
  },
  selectionButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  selectionButtonTextImport: {
    color: '#fff',
  },
});

export default SettingsScreen;
