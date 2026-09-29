/**
 * Your Luvs: the songs you hearted, in a frosted sheet — a three-column grid
 * of covers and one button to download them all.
 */

import React from 'react';
import {
  View,
  Text,
  Modal,
  StyleSheet,
  Pressable,
  FlatList,
  Dimensions,
} from 'react-native';
const { width: SCREEN_WIDTH } = Dimensions.get('window');
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Frosted } from './allegra/Frosted';
import Artwork from './allegra/Artwork';
import { Glass, Signal } from '../constants/allegraTheme';
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
      <Artwork uri={item.highResArt} title={item.title} artist={item.artist} size={(SCREEN_WIDTH - 48) / 3} style={styles.coverArt} />
      <Pressable
        style={styles.removeButton}
        onPress={() => handleRemoveSong(item.id)}
        hitSlop={6}
        accessibilityLabel={`Remove ${item.title}`}
      >
        <Ionicons name="close" size={14} color={Signal.ink} />
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
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.modalContainer}>
          <Frosted radius={30} intensity={60} tint={0.55} />
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Your Luvs <Text style={styles.headerCount}>{vault.length}</Text></Text>
            <Pressable onPress={onClose} hitSlop={10} style={styles.closeButton}>
              <Ionicons name="close" size={20} color={Signal.ink} />
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
              <MaterialCommunityIcons name="heart-multiple-outline" size={64} color={Signal.inkFaint} />
              <Text style={styles.emptyText}>Nothing here yet</Text>
              <Text style={styles.emptySubtext}>
                Tap the heart on a Luv and it waits here.
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
                <Ionicons name="arrow-down" size={20} color={Signal.waveInk} />
                <Text style={styles.downloadButtonText}>
                  Download all {vault.length}
                </Text>
              </Pressable>
            </View>
          )}
        </View>

        {/* Custom Alerts */}
        <CustomAlert
          visible={emptyAlertVisible}
          title="Nothing to download"
          message="Heart a few Luvs first."
          onClose={() => setEmptyAlertVisible(false)}
          buttons={[{ text: 'OK', onPress: () => {} }]}
        />

        <CustomAlert
          visible={downloadAlertVisible}
          title="Download all"
          message={`Download all ${vault.length} songs to your library?`}
          onClose={() => setDownloadAlertVisible(false)}
          buttons={[
            { text: 'Cancel', style: 'cancel', onPress: () => {} },
            { text: 'Download', onPress: confirmDownload }
          ]}
        />

        <CustomAlert
          visible={startedAlertVisible}
          title="Downloading"
          message={`${vault.length} songs are on their way. Clear them from your Luvs?`}
          onClose={() => setStartedAlertVisible(false)}
          buttons={[
            { text: 'Clear', style: 'destructive', onPress: () => clearVault() },
            { text: 'Keep them', style: 'cancel', onPress: () => onClose() }
          ]}
        />
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: Glass.scrim,
    justifyContent: 'flex-end',
  },
  modalContainer: {
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    overflow: 'hidden',
    paddingTop: 22,
    maxHeight: '85%',
    width: '100%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    marginBottom: 18,
  },
  headerTitle: {
    color: Signal.ink,
    fontSize: 24,
    fontWeight: '700',
  },
  headerCount: {
    color: Signal.inkMuted,
    fontWeight: '600',
  },
  closeButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: Glass.fillLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  gridContainer: {
    paddingHorizontal: 16,
    paddingBottom: 130,
  },
  columnWrapper: {
    justifyContent: 'flex-start',
    gap: 8,
    marginBottom: 12,
  },
  songCard: {
    width: (SCREEN_WIDTH - 48) / 3,
  },
  coverArt: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 12,
    overflow: 'hidden',
  },
  removeButton: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(10, 11, 14, 0.66)',
    zIndex: 5,
  },
  songInfo: {
    paddingTop: 6,
  },
  songTitle: {
    color: Signal.ink,
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 1,
  },
  songArtist: {
    color: Signal.inkMuted,
    fontSize: 11,
  },
  emptyState: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 80,
  },
  emptyText: {
    color: Signal.ink,
    fontSize: 20,
    fontWeight: '700',
    marginTop: 18,
  },
  emptySubtext: {
    color: Signal.inkMuted,
    fontSize: 15,
    marginTop: 8,
    textAlign: 'center',
    paddingHorizontal: 40,
    lineHeight: 22,
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 36,
  },
  downloadButton: {
    backgroundColor: Signal.wave,
    borderRadius: 999,
    paddingVertical: 15,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  downloadButtonText: {
    color: Signal.waveInk,
    fontSize: 16,
    fontWeight: '700',
  },
});
