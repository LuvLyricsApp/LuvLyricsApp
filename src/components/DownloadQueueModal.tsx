import React from 'react';
import { View, Text, Modal, StyleSheet, FlatList, TouchableOpacity, Image } from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { useDownloadQueueStore, QueueItem } from '../store/downloadQueueStore';

interface DownloadQueueModalProps {
  visible: boolean;
  onClose: () => void;
}

export const DownloadQueueModal = ({ visible, onClose }: DownloadQueueModalProps) => {
  const queue = useDownloadQueueStore(state => state.queue);
  const removeItem = useDownloadQueueStore(state => state.removeItem);
  const clearCompleted = useDownloadQueueStore(state => state.clearCompleted);
  const pauseItem = useDownloadQueueStore(state => state.pauseItem);
  const resumeItem = useDownloadQueueStore(state => state.resumeItem);
  const retryItem = useDownloadQueueStore(state => state.retryItem);

  const renderItem = ({ item }: { item: QueueItem }) => {
    if (!item || !item.song) return null;
    
    return (
      <View style={styles.itemContainer}>
        <Image source={{ uri: item.song.highResArt }} style={styles.art} />
        <View style={styles.info}>
          <Text style={styles.title} numberOfLines={1}>{item.song.title || 'Unknown Title'}</Text>
          <Text style={styles.artist} numberOfLines={1}>{item.song.artist || 'Unknown Artist'}</Text>
          
          {(item.status === 'downloading' || item.status === 'completed' || item.status === 'paused') ? (
             <View style={styles.progressContainer}>
                <View style={styles.progressRow}>
                    <Text style={[styles.stageText, item.status === 'paused' && { color: '#FFA000' }]} numberOfLines={1}>
                        {item.status === 'completed' ? 'Download Complete' : 
                         item.status === 'paused' ? 'Download Paused' : 
                         item.stageStatus || 'Downloading...'}
                    </Text>
                    <Text style={styles.percentageText}>
                        {item.status === 'completed' ? '100%' : `${Math.round((item.progress || 0) * 100)}%`}
                    </Text>
                </View>
                <View style={styles.track}>
                    <View style={[
                        styles.bar, 
                        { width: item.status === 'completed' ? '100%' : `${(item.progress || 0) * 100}%` },
                        item.status === 'completed' && { backgroundColor: '#4CAF50' },
                        item.status === 'paused' && { backgroundColor: '#FFA000' }
                    ]} />
                </View>
             </View>
          ) : (
             <View style={styles.statusRow}>
                <Text style={[styles.status, getStatusColor(item.status)]}>
                 {item.status ? item.status.charAt(0).toUpperCase() + item.status.slice(1) : 'Pending'}
                </Text>
                {item.status === 'failed' && !!item.error && (
                  <Text style={styles.error} numberOfLines={1}> - {item.error}</Text>
                )}
             </View>
          )}
        </View>

        <View style={styles.actions}>
          {item.status === 'downloading' && (
            <TouchableOpacity onPress={() => pauseItem(item.id)} style={styles.actionBtn}>
              <Ionicons name="pause" size={20} color="#fff" />
            </TouchableOpacity>
          )}
          {item.status === 'paused' && (
            <TouchableOpacity onPress={() => resumeItem(item.id)} style={styles.actionBtn}>
              <Ionicons name="play" size={20} color="#4CAF50" />
            </TouchableOpacity>
          )}
          {item.status === 'failed' && (
            <TouchableOpacity onPress={() => retryItem(item.id)} style={styles.actionBtn}>
              <Ionicons name="refresh" size={20} color="#A1A1A1" />
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={() => removeItem(item.id)} style={styles.actionBtn}>
            <Ionicons name="close-circle" size={24} color="#666" />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return { color: '#4CAF50' };
      case 'failed': return { color: '#F44336' };
      case 'downloading': return { color: '#A1A1A1' };
      case 'staging': return { color: '#FFC107' };
      case 'paused': return { color: '#FFA000' };
      default: return { color: '#999' };
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={true} onRequestClose={onClose}>
      <BlurView intensity={80} tint="dark" style={styles.absolute}>
        <View style={styles.container}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Downloads</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={24} color="#fff" />
            </TouchableOpacity>
          </View>
          
          <FlatList
            data={queue}
            renderItem={renderItem}
            keyExtractor={item => item.id}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Ionicons name="download-outline" size={48} color="#666" />
                <Text style={styles.emptyText}>No active downloads</Text>
              </View>
            }
          />

          {queue.some(i => i.status === 'completed') && (
            <TouchableOpacity onPress={clearCompleted} style={styles.clearBtn}>
              <Text style={styles.clearBtnText}>Clear Completed</Text>
            </TouchableOpacity>
          )}
        </View>
      </BlurView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  absolute: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  container: {
    height: '80%',
    backgroundColor: 'rgba(20,20,20,0.95)',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  closeButton: {
    padding: 5,
  },
  listContent: {
    padding: 20,
  },
  itemContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    padding: 10,
  },
  art: {
    width: 60,
    height: 60,
    borderRadius: 8,
    backgroundColor: '#333',
  },
  info: {
    flex: 1,
    marginLeft: 15,
    justifyContent: 'center',
  },
  title: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  artist: {
    color: '#aaa',
    fontSize: 14,
    marginBottom: 4,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  status: {
    fontSize: 12,
    fontWeight: '500',
  },
  error: {
    color: '#F44336',
    fontSize: 12,
    marginLeft: 5,
    flex: 1,
  },
  removeBtn: {
    padding: 5,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionBtn: {
    padding: 8,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  emptyText: {
    color: '#666',
    marginTop: 10,
    fontSize: 16,
  },
  clearBtn: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    margin: 20,
    padding: 15,
    borderRadius: 12,
    alignItems: 'center',
  },
  clearBtnText: {
    color: '#fff',
    fontWeight: '600',
  },
  progressContainer: { marginTop: 4 },
  progressRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  stageText: { color: '#ccc', fontSize: 11, maxWidth: '80%' },
  percentageText: { color: '#4CAF50', fontSize: 11, fontWeight: 'bold' },
  track: { height: 4, backgroundColor: '#333', borderRadius: 2, overflow: 'hidden' },
  bar: { height: '100%', backgroundColor: '#4CAF50' }
});
