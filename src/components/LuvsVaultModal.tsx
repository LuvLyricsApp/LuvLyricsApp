/**
 * Luvs Vault Modal
 * Shows liked luvs in a 3-column grid with batch download functionality
 */

import React from 'react';
import {
  View,
  Text,
  Modal,
  StyleSheet,
  Pressable,
  FlatList,
  Image,
  Dimensions,
} from 'react-native';
const { width: SCREEN_WIDTH } = Dimensions.get('window');
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useLuvsFeedStore } from '../store/luvsFeedStore';
import { useDownloadQueueStore } from '../store/downloadQueueStore';
import { UnifiedSong } from '../types/song';
import { CustomAlert } from './CustomAlert';

interface LuvsVaultModalProps {
  visible: boolean;
  onClose: () => void;
}

export const LuvsVaultModal: React.FC<LuvsVaultModalProps> = ({
  visible,
  onClose,
}) => {
  const vault = useLuvsFeedStore(s => s.vault);
  const removeFromVault = useLuvsFeedStore(s => s.removeFromVault);
  const clearVault = useLuvsFeedStore(s => s.clearVault);
  const addToQueue = useDownloadQueueStore((state) => state.addToQueue);
  
  const [downloadAlertVisible, setDownloadAlertVisible] = React.useState(false);
  const [startedAlertVisible, setStartedAlertVisible] = React.useState(false);
  const [emptyAlertVisible, setEmptyAlertVisible] = React.useState(false);

  const handleDownloadAll = () => {
    if (vault.length === 0) {
      setEmptyAlertVisible(true);
      return;
    }
    setDownloadAlertVisible(true);
  };

  const confirmDownload = () => {
    setDownloadAlertVisible(false);
    addToQueue(vault);
    setStartedAlertVisible(true);
  };

  const handleRemoveSong = (songId: string) => {
    removeFromVault(songId);
  };

  const renderSong = ({ item }: { item: UnifiedSong }) => (
    <View style={styles.songCard}>
      <Image
        source={{ uri: item.highResArt }}
        style={styles.coverArt}
        resizeMode="cover"
      />
      <Pressable
        style={styles.removeButton}
        onPress={() => handleRemoveSong(item.id)}
      >
        <Ionicons name="close-circle" size={24} color="#FF0048" />
      </Pressable>
      <View style={styles.songInfo}>
        <Text style={styles.songTitle} numberOfLines={1}>
          {item.title}
        </Text>
        <Text style={styles.songArtist} numberOfLines={1}>
          {item.artist}
        </Text>
      </View>
    </View>
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFill} />
        <View style={styles.modalContainer}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Luvs Vault ({vault.length})</Text>
            <Pressable onPress={onClose} hitSlop={10} style={styles.closeButton}>
              <Ionicons name="close" size={24} color="#fff" />
            </Pressable>
          </View>

          {/* Song Grid */}
          {vault.length > 0 ? (
            <FlatList
              data={vault}
              renderItem={renderSong}
              keyExtractor={(item) => item.id}
              numColumns={3}
              contentContainerStyle={styles.gridContainer}
              showsVerticalScrollIndicator={false}
              columnWrapperStyle={styles.columnWrapper}
            />
          ) : (
            <View style={styles.emptyState}>
              <MaterialCommunityIcons name="heart-multiple-outline" size={64} color="rgba(255,255,255,0.3)" />
              <Text style={styles.emptyText}>No liked luvs yet</Text>
              <Text style={styles.emptySubtext}>
                Tap the heart on any luv to save it here
              </Text>
            </View>
          )}

          {/* Download All Button */}
          {vault.length > 0 && (
            <View style={styles.footer}>
              <Pressable
                style={styles.downloadButton}
                onPress={handleDownloadAll}
              >
                <Ionicons name="download" size={22} color="#fff" />
                <Text style={styles.downloadButtonText}>
                  Download All ({vault.length})
                </Text>
              </Pressable>
            </View>
          )}
        </View>

        {/* Custom Alerts */}
        <CustomAlert
          visible={emptyAlertVisible}
          title="Empty Vault"
          message="No songs to download. Go explore some luvs!"
          onClose={() => setEmptyAlertVisible(false)}
          buttons={[{ text: 'OK', onPress: () => {} }]}
        />

        <CustomAlert
          visible={downloadAlertVisible}
          title="Download All"
          message={`Are you sure you want to download all ${vault.length} songs to your library?`}
          onClose={() => setDownloadAlertVisible(false)}
          buttons={[
            { text: 'Cancel', style: 'cancel', onPress: () => {} },
            { text: 'Download', onPress: confirmDownload }
          ]}
        />

        <CustomAlert
          visible={startedAlertVisible}
          title="Download Started"
          message={`${vault.length} songs added to queue. Would you like to clear your vault?`}
          onClose={() => setStartedAlertVisible(false)}
          buttons={[
            { text: 'Clear Vault', style: 'destructive', onPress: () => clearVault() },
            { text: 'Keep and Close', style: 'cancel', onPress: () => onClose() }
          ]}
        />
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.9)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    backgroundColor: '#121212',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    paddingTop: 20,
    paddingBottom: 0,
    maxHeight: '85%',
    width: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -10 },
    shadowOpacity: 0.5,
    shadowRadius: 15,
    elevation: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    marginBottom: 20,
  },
  headerTitle: {
    color: '#fff',
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  gridContainer: {
    paddingHorizontal: 16,
    paddingBottom: 140,
  },
  columnWrapper: {
    justifyContent: 'flex-start',
    gap: 8,
    marginBottom: 8,
  },
  songCard: {
    width: (SCREEN_WIDTH - 48) / 3, // Precise calculation for 3 columns
    aspectRatio: 0.8,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#0A0A0A',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  coverArt: {
    width: '100%',
    height: '75%',
  },
  removeButton: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 12,
    zIndex: 5,
  },
  songInfo: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    height: '25%',
    justifyContent: 'center',
  },
  songTitle: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 1,
  },
  songArtist: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 9,
    fontWeight: '500',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 100,
  },
  emptyText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
    marginTop: 20,
  },
  emptySubtext: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 15,
    marginTop: 10,
    textAlign: 'center',
    paddingHorizontal: 40,
    lineHeight: 22,
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 20,
    paddingBottom: 40,
    backgroundColor: '#121212',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.05)',
  },
  downloadButton: {
    backgroundColor: '#2E2E2E',
    borderRadius: 18,
    paddingVertical: 16,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 10,
  },
  downloadButtonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
});
