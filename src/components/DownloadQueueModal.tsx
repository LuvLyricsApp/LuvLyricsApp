import React, { useMemo } from 'react';
import { View, Text, Modal, StyleSheet, FlatList, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDownloadQueueStore, QueueItem } from '../store/downloadQueueStore';
import { useDownloadItem, useQueueShape } from '../store/downloadQueueSelectors';
import { Frosted } from './allegra/Frosted';
import { Artwork } from './allegra/Artwork';
import { DownloadButton } from './stream/DownloadButton';
import { Glass, Signal } from '../constants/allegraTheme';
import * as Haptics from '../utils/haptics';

interface DownloadQueueModalProps {
  visible: boolean;
  onClose: () => void;
}

/** One plain line under the song: what is happening to it right now. */
const statusLine = (item: QueueItem): string => {
  switch (item.status) {
    case 'completed': return 'Saved to your library';
    case 'paused': return `Paused at ${Math.round((item.progress || 0) * 100)}%`;
    case 'downloading': {
      const pct = `${Math.round((item.progress || 0) * 100)}%`;
      return item.stageStatus ? `${item.stageStatus.replace(/\.+$/, '')} · ${pct}` : `Downloading · ${pct}`;
    }
    case 'staging': return item.stageStatus?.replace(/\.+$/, '') || 'Getting ready';
    case 'failed': return item.error ? `Didn't download: ${item.error}` : "Didn't download";
    default: return 'Waiting for a slot';
  }
};

// Reads its own item, so a progress tick re-renders one row, not the sheet.
const QueueRow: React.FC<{ id: string }> = ({ id }) => {
  const item = useDownloadItem(id);
  const removeItem = useDownloadQueueStore(state => state.removeItem);
  const retryItem = useDownloadQueueStore(state => state.retryItem);
  if (!item?.song) return null;
  const title = item.song.title || 'Untitled';
  const artist = item.song.artist || 'Unknown artist';
  const moving = item.status === 'downloading' || item.status === 'paused';
  const progress = item.status === 'completed' ? 1 : Math.max(0, Math.min(1, item.progress || 0));

  return (
    <View style={styles.row}>
      <Artwork uri={item.song.highResArt} title={title} artist={artist} size={52} style={styles.art} />
      <View style={styles.info}>
        <Text style={styles.title} numberOfLines={1}>{title}</Text>
        <Text
          style={[styles.status, item.status === 'failed' && styles.statusFailed, item.status === 'completed' && styles.statusDone]}
          numberOfLines={1}
        >
          {statusLine(item)}
        </Text>
        {moving ? (
          <View style={styles.track}>
            {/* Scaled from the left edge, not resized. */}
            <View style={[styles.bar, { transform: [{ scaleX: progress }] }]} />
          </View>
        ) : null}
      </View>
      <DownloadButton song={{ id: item.id, title, artist }} onSave={() => retryItem(item.id)} />
      <Pressable
        onPress={() => { Haptics.selectionAsync().catch(() => {}); removeItem(item.id); }}
        hitSlop={8}
        style={styles.remove}
        accessibilityRole="button"
        accessibilityLabel={`Remove ${title} from downloads`}
      >
        <Ionicons name="close" size={18} color={Signal.inkMuted} />
      </Pressable>
    </View>
  );
};

const renderItem = ({ item }: { item: string }) => <QueueRow id={item} />;

export const DownloadQueueModal = ({ visible, onClose }: DownloadQueueModalProps) => {
  // The list follows the queue's shape (items and their state), not its progress.
  const shape = useQueueShape();
  const clearCompleted = useDownloadQueueStore(state => state.clearCompleted);
  const insets = useSafeAreaInsets();
  const { ids, done } = useMemo(() => {
    const queue = useDownloadQueueStore.getState().queue;
    return { ids: queue.map(i => i.id), done: queue.filter(i => i.status === 'completed').length };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shape]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.root}>
        <Pressable style={[StyleSheet.absoluteFill, styles.scrim]} onPress={onClose} accessibilityLabel="Close downloads" />
        <View style={[styles.sheet, { paddingBottom: 16 + insets.bottom }]}>
          <Frosted radius={28} intensity={60} tint={0.55} />
          <View style={styles.grabber} />
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Downloads</Text>
            <Pressable onPress={onClose} style={styles.closeButton} hitSlop={8} accessibilityRole="button" accessibilityLabel="Close">
              <Ionicons name="close" size={20} color={Signal.ink} />
            </Pressable>
          </View>

          <FlatList
            data={ids}
            renderItem={renderItem}
            keyExtractor={id => id}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Ionicons name="arrow-down-circle-outline" size={40} color={Signal.inkFaint} />
                <Text style={styles.emptyTitle}>Nothing downloading</Text>
                <Text style={styles.emptyText}>Songs you save from Stream or Search show up here while they download.</Text>
              </View>
            }
          />

          {done > 0 && (
            <Pressable onPress={clearCompleted} style={styles.clearBtn} accessibilityRole="button">
              <Text style={styles.clearBtnText}>Clear {done === 1 ? 'the saved song' : `${done} saved songs`}</Text>
            </Pressable>
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  scrim: { backgroundColor: Glass.scrim },
  sheet: {
    height: '78%',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: 'hidden',
  },
  grabber: {
    alignSelf: 'center',
    width: 36,
    height: 5,
    borderRadius: 3,
    marginTop: 8,
    backgroundColor: Glass.hairlineStrong,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
  },
  headerTitle: { fontSize: 20, fontWeight: '700', color: Signal.ink },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Glass.fillLight,
  },
  listContent: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 12, flexGrow: 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 8,
    marginBottom: 6,
    borderRadius: 16,
    backgroundColor: Glass.fillLight,
  },
  art: { width: 52, height: 52, borderRadius: 8 },
  info: { flex: 1, marginLeft: 12, marginRight: 4, justifyContent: 'center' },
  title: { color: Signal.ink, fontSize: 15, fontWeight: '600', marginBottom: 2 },
  status: { color: Signal.inkMuted, fontSize: 13 },
  statusFailed: { color: Signal.accent },
  statusDone: { color: Signal.wave },
  track: {
    alignSelf: 'stretch',
    height: 3,
    marginTop: 6,
    borderRadius: 2,
    overflow: 'hidden',
    backgroundColor: Glass.hairline,
  },
  bar: { width: '100%', height: '100%', borderRadius: 2, backgroundColor: Signal.wave, transformOrigin: 'left' },
  remove: { paddingHorizontal: 6, paddingVertical: 8 },
  emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, paddingVertical: 48 },
  emptyTitle: { color: Signal.ink, fontSize: 17, fontWeight: '600', marginTop: 12 },
  emptyText: { color: Signal.inkMuted, fontSize: 14, marginTop: 6, textAlign: 'center', lineHeight: 20 },
  clearBtn: {
    marginHorizontal: 20,
    marginTop: 4,
    paddingVertical: 14,
    borderRadius: 999,
    alignItems: 'center',
    backgroundColor: Glass.fillLight,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Glass.hairline,
  },
  clearBtnText: { color: Signal.ink, fontSize: 15, fontWeight: '600' },
});
