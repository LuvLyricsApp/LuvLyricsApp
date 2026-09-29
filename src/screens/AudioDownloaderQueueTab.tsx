/**
 * Downloads: what is arriving, in Allegra's language. Each song shows its
 * progress as a wave-coloured bar that grows by transform (never width), with
 * pause / resume / retry / remove one tap away.
 */
import React, { memo, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Artwork from '../components/allegra/Artwork';
import { Tactile } from '../components/allegra/motion';
import { GlassButton } from '../components/allegra/home';
import { Glass, Radius, Signal, Space } from '../constants/allegraTheme';
import * as Haptics from '../utils/haptics';
import { useDownloadQueueStore, QueueItem } from '../store/downloadQueueStore';
import { useDownloadItem, useQueueShape } from '../store/downloadQueueSelectors';
import { countOf } from '../utils/formatters';

const STATUS_TEXT: Record<QueueItem['status'], string> = {
  pending: 'Waiting',
  staging: 'Getting ready',
  downloading: 'Downloading',
  completed: 'Saved',
  failed: 'Failed',
  paused: 'Paused',
};

const statusColor = (status: QueueItem['status']): string =>
  status === 'completed' ? Signal.wave : status === 'failed' ? Signal.accent : status === 'paused' ? Signal.inkSoft : Signal.inkMuted;

const tick = () => { Haptics.selectionAsync().catch(() => {}); };

const IconAction: React.FC<{ icon: React.ComponentProps<typeof Ionicons>['name']; label: string; onPress: () => void; color?: string }> = ({ icon, label, onPress, color = Signal.ink }) => (
  <Tactile onPress={() => { tick(); onPress(); }} hitSlop={6} pressScale={0.88} accessibilityRole="button" accessibilityLabel={label} style={styles.action}>
    <Ionicons name={icon} size={19} color={color} />
  </Tactile>
);

// Each row reads its own item, so a progress tick re-renders one row, not the list.
const QueueRow = memo(({ id }: { id: string }) => {
  const item = useDownloadItem(id);
  const removeItem = useDownloadQueueStore(s => s.removeItem);
  const pauseItem = useDownloadQueueStore(s => s.pauseItem);
  const resumeItem = useDownloadQueueStore(s => s.resumeItem);
  const retryItem = useDownloadQueueStore(s => s.retryItem);

  const handlePause = useCallback(() => pauseItem(id), [pauseItem, id]);
  const handleResume = useCallback(() => resumeItem(id), [resumeItem, id]);
  const handleRetry = useCallback(() => retryItem(id), [retryItem, id]);
  const handleRemove = useCallback(() => removeItem(id), [removeItem, id]);

  if (!item?.song) return null;

  const showBar = item.status === 'downloading' || item.status === 'completed' || item.status === 'paused';
  const progress = item.status === 'completed' ? 1 : Math.max(0.02, Math.min(1, item.progress || 0));
  const stage = item.status === 'downloading' ? item.stageStatus || 'Downloading' : STATUS_TEXT[item.status];

  return (
    <View style={styles.item}>
      <Artwork uri={item.song.highResArt} title={item.song.title || 'Untitled'} artist={item.song.artist} size={56} style={styles.art} />
      <View style={styles.info}>
        <Text style={styles.title} numberOfLines={1}>{item.song.title || 'Unknown title'}</Text>
        <Text style={styles.artist} numberOfLines={1}>{item.song.artist || 'Unknown artist'}</Text>

        {showBar ? (
          <View style={styles.progressContainer}>
            <View style={styles.progressRow}>
              <Text style={[styles.stage, { color: statusColor(item.status) }]} numberOfLines={1}>{stage}</Text>
              <Text style={styles.pct}>{`${Math.round(progress * 100)}%`}</Text>
            </View>
            <View style={styles.track}>
              <View style={[styles.bar, { transform: [{ scaleX: progress }] }, item.status === 'paused' && styles.barPaused]} />
            </View>
          </View>
        ) : (
          <Text style={[styles.status, { color: statusColor(item.status) }]} numberOfLines={1}>
            {STATUS_TEXT[item.status] ?? 'Waiting'}
            {item.status === 'failed' && item.error ? ` · ${item.error}` : ''}
          </Text>
        )}
      </View>

      <View style={styles.actions}>
        {item.status === 'downloading' ? <IconAction icon="pause" label="Pause download" onPress={handlePause} /> : null}
        {item.status === 'paused' ? <IconAction icon="play" label="Resume download" onPress={handleResume} color={Signal.wave} /> : null}
        {item.status === 'failed' ? <IconAction icon="refresh" label="Try again" onPress={handleRetry} color={Signal.wave} /> : null}
        <IconAction icon="close" label="Remove from downloads" onPress={handleRemove} color={Signal.inkMuted} />
      </View>
    </View>
  );
});

// The list follows the queue's shape (items and their state), not its progress.
export const AudioDownloaderQueueTab = memo(() => {
  const shape = useQueueShape();
  const clearCompleted = useDownloadQueueStore(s => s.clearCompleted);
  const { ids, done } = useMemo(() => {
    const queue = useDownloadQueueStore.getState().queue;
    return { ids: queue.map(i => i.id), done: queue.filter(i => i.status === 'completed').length };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shape]);
  const active = ids.length - done;

  return (
    <View style={styles.container}>
      <FlatList
        data={ids}
        keyExtractor={id => id}
        renderItem={({ item }) => <QueueRow id={item} />}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          ids.length > 0 ? (
            <View style={styles.summary}>
              <Text style={styles.summaryText}>
                {active > 0 ? `${countOf(active, 'song')} on the way` : 'Everything is saved'}
                {done > 0 && active > 0 ? ` · ${done} saved` : ''}
              </Text>
              {done > 0 ? <GlassButton compact label="Clear saved" onPress={clearCompleted} /> : null}
            </View>
          ) : null
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <View style={styles.emptyIcon}>
              <Ionicons name="arrow-down" size={26} color={Signal.inkSoft} />
            </View>
            <Text style={styles.emptyTitle}>Nothing downloading</Text>
            <Text style={styles.emptyBody}>Songs you save show up here while they arrive, then live in your Library.</Text>
          </View>
        }
      />
    </View>
  );
});

const styles = StyleSheet.create({
  container: { flex: 1 },
  listContent: { paddingHorizontal: Space.md, paddingBottom: 220 },
  summary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: Space.sm, minHeight: 48 },
  summaryText: { color: Signal.inkSoft, fontSize: 14, fontWeight: '600', flex: 1 },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    padding: 10,
    borderRadius: Radius.panel,
    backgroundColor: Glass.fill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Glass.hairline,
  },
  art: { width: 56, height: 56, borderRadius: Radius.thumb + 2, overflow: 'hidden' },
  info: { flex: 1, marginLeft: 12, justifyContent: 'center' },
  title: { color: Signal.ink, fontSize: 15, fontWeight: '600' },
  artist: { color: Signal.inkMuted, fontSize: 13, marginTop: 1 },
  status: { fontSize: 12, fontWeight: '600', marginTop: 5 },
  progressContainer: { marginTop: 6 },
  progressRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 },
  stage: { fontSize: 12, fontWeight: '600', flex: 1, marginRight: 8 },
  pct: { color: Signal.inkSoft, fontSize: 12, fontWeight: '600', fontVariant: ['tabular-nums'] },
  track: { height: 4, backgroundColor: 'rgba(244,241,234,0.12)', borderRadius: 2, overflow: 'hidden' },
  bar: { height: '100%', width: '100%', backgroundColor: Signal.wave, borderRadius: 2, transformOrigin: 'left' },
  barPaused: { backgroundColor: Signal.inkMuted },
  actions: { flexDirection: 'row', alignItems: 'center', marginLeft: 4 },
  action: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  empty: { alignItems: 'center', paddingTop: 72, paddingHorizontal: Space.xl },
  emptyIcon: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', backgroundColor: Glass.fill, borderWidth: StyleSheet.hairlineWidth, borderColor: Glass.hairline },
  emptyTitle: { color: Signal.ink, fontSize: 18, fontWeight: '700', marginTop: Space.md },
  emptyBody: { color: Signal.inkMuted, fontSize: 14, lineHeight: 20, textAlign: 'center', marginTop: 6 },
});
