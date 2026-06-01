import React, { memo, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList,
  TouchableOpacity, Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useDownloadQueueStore, QueueItem } from '../store/downloadQueueStore';

const getStatusColor = (status: string): { color: string } => {
  switch (status) {
    case 'completed': return { color: '#4CAF50' };
    case 'failed':    return { color: '#F44336' };
    case 'downloading': return { color: '#2196F3' };
    case 'staging':   return { color: '#FFC107' };
    case 'paused':    return { color: '#FFA000' };
    default:          return { color: '#999' };
  }
};

const QueueRow = memo(({ item }: { item: QueueItem }) => {
  const removeItem  = useDownloadQueueStore(s => s.removeItem);
  const pauseItem   = useDownloadQueueStore(s => s.pauseItem);
  const resumeItem  = useDownloadQueueStore(s => s.resumeItem);
  const retryItem   = useDownloadQueueStore(s => s.retryItem);

  const handlePause = useCallback(() => pauseItem(item.id), [pauseItem, item.id]);
  const handleResume = useCallback(() => resumeItem(item.id), [resumeItem, item.id]);
  const handleRetry = useCallback(() => retryItem(item.id), [retryItem, item.id]);
  const handleRemove = useCallback(() => removeItem(item.id), [removeItem, item.id]);

  if (!item?.song) return null;

  return (
    <View style={styles.item}>
      <Image source={{ uri: item.song.highResArt }} style={styles.art} />
      <View style={styles.info}>
        <Text style={styles.title} numberOfLines={1}>{item.song.title || 'Unknown Title'}</Text>
        <Text style={styles.artist} numberOfLines={1}>{item.song.artist || 'Unknown Artist'}</Text>

        {(item.status === 'downloading' || item.status === 'completed' || item.status === 'paused') ? (
          <View style={styles.progressContainer}>
            <View style={styles.progressRow}>
              <Text style={[styles.stageText, item.status === 'paused' && { color: '#FFA000' }]} numberOfLines={1}>
                {item.status === 'completed' ? 'Done' :
                 item.status === 'paused'    ? 'Paused' :
                 item.stageStatus || 'Downloading...'}
              </Text>
              <Text style={styles.pct}>
                {item.status === 'completed' ? '100%' : `${Math.round((item.progress || 0) * 100)}%`}
              </Text>
            </View>
            <View style={styles.track}>
              <View style={[
                styles.bar,
                { width: `${item.status === 'completed' ? 100 : (item.progress || 0) * 100}%` as any },
                item.status === 'completed' && { backgroundColor: '#4CAF50' },
                item.status === 'paused'    && { backgroundColor: '#FFA000' },
              ]} />
            </View>
          </View>
        ) : (
          <View style={styles.statusRow}>
            <Text style={[styles.status, getStatusColor(item.status)]}>
              {item.status ? item.status.charAt(0).toUpperCase() + item.status.slice(1) : 'Pending'}
            </Text>
            {item.status === 'failed' && item.error && (
              <Text style={styles.error} numberOfLines={1}> — {item.error}</Text>
            )}
          </View>
        )}
      </View>

      <View style={styles.actions}>
        {item.status === 'downloading' && (
          <TouchableOpacity onPress={handlePause} style={styles.actionBtn}>
            <Ionicons name="pause" size={20} color="#fff" />
          </TouchableOpacity>
        )}
        {item.status === 'paused' && (
          <TouchableOpacity onPress={handleResume} style={styles.actionBtn}>
            <Ionicons name="play" size={20} color="#4CAF50" />
          </TouchableOpacity>
        )}
        {item.status === 'failed' && (
          <TouchableOpacity onPress={handleRetry} style={styles.actionBtn}>
            <Ionicons name="refresh" size={20} color="#2196F3" />
          </TouchableOpacity>
        )}
        <TouchableOpacity onPress={handleRemove} style={styles.actionBtn}>
          <Ionicons name="close-circle" size={24} color="#666" />
        </TouchableOpacity>
      </View>
    </View>
  );
});

// Isolated: only this subtree re-renders on queue changes (max 4/sec due to store throttle)
export const AudioDownloaderQueueTab = memo(() => {
  const queue = useDownloadQueueStore(s => s.queue);
  const clearCompleted = useDownloadQueueStore(s => s.clearCompleted);
  const hasCompleted = queue.some(i => i.status === 'completed');

  return (
    <View style={styles.container}>
      <FlatList
        data={queue}
        keyExtractor={item => item.id}
        renderItem={({ item }) => <QueueRow item={item} />}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="download-outline" size={48} color="#333" />
            <Text style={styles.emptyText}>No active downloads</Text>
          </View>
        }
      />
      {hasCompleted && (
        <TouchableOpacity onPress={clearCompleted} style={styles.clearBtn}>
          <Text style={styles.clearBtnText}>Clear Completed</Text>
        </TouchableOpacity>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  container: { flex: 1 },
  listContent: { padding: 16, paddingBottom: 100 },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    padding: 10,
  },
  art: { width: 56, height: 56, borderRadius: 8, backgroundColor: '#333' },
  info: { flex: 1, marginLeft: 12, justifyContent: 'center' },
  title: { color: '#fff', fontSize: 15, fontWeight: '600', marginBottom: 2 },
  artist: { color: '#aaa', fontSize: 13, marginBottom: 4 },
  statusRow: { flexDirection: 'row', alignItems: 'center' },
  status: { fontSize: 12, fontWeight: '500' },
  error: { color: '#F44336', fontSize: 12, flex: 1 },
  progressContainer: { marginTop: 2 },
  progressRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  stageText: { color: '#ccc', fontSize: 11, maxWidth: '80%' },
  pct: { color: '#4CAF50', fontSize: 11, fontWeight: 'bold' },
  track: { height: 4, backgroundColor: '#333', borderRadius: 2, overflow: 'hidden' },
  bar: { height: '100%', backgroundColor: '#4CAF50', borderRadius: 2 },
  actions: { flexDirection: 'row', alignItems: 'center' },
  actionBtn: { padding: 8 },
  empty: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60 },
  emptyText: { color: '#444', marginTop: 12, fontSize: 16 },
  clearBtn: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    margin: 16,
    padding: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  clearBtnText: { color: '#fff', fontWeight: '600' },
});
