import React, { memo } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, withSequence, interpolate, Easing, cancelAnimation, SharedValue } from 'react-native-reanimated';
import { RenderItemParams } from 'react-native-draggable-flatlist';
import { Song } from '../types/song';
import { useLyricsScanQueueStore } from '../store/lyricsScanQueueStore';
import { useThemeColors } from '../contexts/ThemeContext';
import Artwork from './allegra/Artwork';

interface PlaylistItemProps extends Partial<RenderItemParams<Song>> {
  item: Song;
  currentSongId: string | null;
  isEditMode: boolean;
  onPress: (song: Song, index: number) => void;
  onMagicPress?: (song: Song) => void;
  onDelete: (songId: string) => void;
  isPlaying: boolean;
  displayIndex: number;
}

const VisualizerBar = ({ anim }: { anim: SharedValue<number> }) => {
  const style = useAnimatedStyle(() => ({
    transform: [{ scaleY: interpolate(anim.value, [0, 1], [4 / 14, 1]) }],
    opacity: interpolate(anim.value, [0, 1], [0.5, 1]),
  }));
  return <Animated.View style={[styles.visualizerBar, style]} />;
};

const LiveVisualizer = ({ isPlaying }: { isPlaying: boolean }) => {
  const sv1 = useSharedValue(0.3);
  const sv2 = useSharedValue(0.4);
  const sv3 = useSharedValue(0.3);
  const animations = React.useMemo(() => [sv1, sv2, sv3], [sv1, sv2, sv3]);

  React.useEffect(() => {
    if (!isPlaying) {
      animations.forEach(anim => { cancelAnimation(anim); anim.value = withTiming(0.3, { duration: 300 }); });
      return;
    }
    animations.forEach((anim, i) => {
      const delay = i * 50;
      setTimeout(() => {
        anim.value = withRepeat(
          withSequence(
            withTiming(Math.random(), { duration: 150, easing: Easing.linear }),
            withTiming(Math.random(), { duration: 100, easing: Easing.quad }),
            withTiming(Math.random(), { duration: 250, easing: Easing.inOut(Easing.quad) }),
            withTiming(Math.random(), { duration: 120, easing: Easing.linear }),
          ), -1, true
        );
      }, delay);
    });
    return () => { animations.forEach(anim => cancelAnimation(anim)); };
  }, [isPlaying, animations]);

  return (
    <View style={styles.visualizerContainer}>
      {animations.map((anim, i) => <VisualizerBar key={i} anim={anim} />)}
    </View>
  );
};

const PlaylistItemComponent: React.FC<PlaylistItemProps> = ({
  item, drag, isActive, currentSongId, isEditMode,
  onPress, onMagicPress, onDelete, isPlaying, displayIndex
}) => {
  const colors = useThemeColors();
  const isActiveSong = currentSongId === item.id;
  const scanJob = useLyricsScanQueueStore(state => state.queue[item.id]);
  const isScanning = scanJob?.status === 'scanning' || scanJob?.status === 'pending';
  const isCompleted = scanJob?.status === 'completed';

  const tapCountRef = React.useRef(0);
  const lastTapRef = React.useRef(0);
  const timerRef = React.useRef<NodeJS.Timeout | null>(null);

  const handlePress = () => {
    if (isEditMode) return;
    const now = Date.now();
    const delay = 400;
    if (now - lastTapRef.current < delay) { tapCountRef.current += 1; } else { tapCountRef.current = 1; }
    lastTapRef.current = now;
    if (timerRef.current) clearTimeout(timerRef.current);
    if (tapCountRef.current === 3) {
      if (onMagicPress) onMagicPress(item);
      tapCountRef.current = 0;
    } else {
      timerRef.current = setTimeout(() => {
        if (tapCountRef.current === 1) onPress(item, displayIndex);
        tapCountRef.current = 0;
      }, delay);
    }
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <Pressable
      onLongPress={isEditMode ? drag : undefined}
      onPress={handlePress}
      disabled={isActive}
      style={[styles.songRow, isActiveSong && !isEditMode && styles.songRowActive, isActive && styles.songRowDragging]}
    >
      <View style={styles.leftAction}>
        {isEditMode ? (
          <Pressable onPressIn={drag} hitSlop={20}>
            <Ionicons name="reorder-two" size={24} color="#666" />
          </Pressable>
        ) : (
          <Text style={styles.songNumber}>{displayIndex + 1}</Text>
        )}
      </View>

      <View style={styles.smallCoverContainer}>
        <Artwork uri={item.coverImageUri} title={item.title} artist={item.artist} size={48} style={styles.smallCover} />
        {isScanning && (
          <View style={styles.scanningOverlay}>
            <Ionicons name="sync" size={16} color="#FFF" />
          </View>
        )}
        {isActiveSong && !isEditMode && !isScanning && (
          <View style={styles.visualizerOverlay}>
            <LiveVisualizer isPlaying={isPlaying} />
          </View>
        )}
      </View>

      <View style={styles.songInfo}>
        <View style={styles.titleRow}>
          <Text style={[styles.songTitle, isActiveSong && !isEditMode && styles.songTitleActive]} numberOfLines={1}>
            {item.title}
          </Text>
          {(isCompleted || (item.lyrics && item.lyrics.length > 0)) && (
            <Ionicons name="checkmark-circle" size={12} color={colors.primary} style={styles.checkIcon} />
          )}
        </View>
        <Text style={styles.songArtist} numberOfLines={1}>{item.artist || 'Unknown Artist'}</Text>
      </View>

      {isEditMode ? (
        <Pressable onPress={() => onDelete(item.id)} hitSlop={10}>
          <Ionicons name="remove-circle" size={24} color="#ff4444" />
        </Pressable>
      ) : (
        <Text style={styles.songDuration}>{formatDuration(item.duration || 0)}</Text>
      )}

      {!isEditMode && (
        <Pressable style={styles.moreButton} hitSlop={10}>
          <Ionicons name="ellipsis-vertical" size={20} color="rgba(255,255,255,0.6)" />
        </Pressable>
      )}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  songRow: { flexDirection: 'row', alignItems: 'center', height: 76, paddingHorizontal: 16, borderRadius: 8, marginHorizontal: 8 },
  songRowActive: { backgroundColor: 'rgba(255,255,255,0.07)' },
  songRowDragging: { backgroundColor: 'rgba(255,255,255,0.2)', transform: [{ scale: 1.02 }] },
  leftAction: { width: 30, alignItems: 'center', justifyContent: 'center', marginRight: 8 },
  songNumber: { fontSize: 14, color: 'rgba(255,255,255,0.6)', fontWeight: '600' },
  smallCoverContainer: { marginRight: 12 },
  smallCover: { width: 48, height: 48, borderRadius: 4, backgroundColor: '#333' },
  placeholderCover: { backgroundColor: '#333', justifyContent: 'center', alignItems: 'center' },
  scanningOverlay: { position: 'absolute', bottom: 0, right: 0, left: 0, top: 0, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 4, justifyContent: 'center', alignItems: 'center' },
  visualizerOverlay: { position: 'absolute', bottom: 0, right: 0, left: 0, top: 0, backgroundColor: 'rgba(0,0,0,0.4)', borderRadius: 4, justifyContent: 'center', alignItems: 'center' },
  visualizerContainer: { flexDirection: 'row', alignItems: 'flex-end', height: 16, gap: 2 },
  visualizerBar: { width: 3, height: 14, backgroundColor: '#FFF', borderRadius: 2, transformOrigin: 'bottom' },
  songInfo: { flex: 1, justifyContent: 'center' },
  titleRow: { flexDirection: 'row', alignItems: 'center' },
  songTitle: { fontSize: 16, color: '#fff', fontWeight: '500', marginBottom: 2 },
  songTitleActive: { color: '#fff', fontWeight: '600' },
  checkIcon: { marginLeft: 4 },
  songArtist: { fontSize: 13, color: 'rgba(255,255,255,0.6)' },
  songDuration: { fontSize: 13, color: 'rgba(255,255,255,0.6)', marginLeft: 8 },
  moreButton: { padding: 8, marginLeft: 4 },
});

export const PlaylistItem = memo(PlaylistItemComponent, (prevProps, nextProps) => {
  const idChanged = prevProps.item.id !== nextProps.item.id;
  const activeChanged = prevProps.isActive !== nextProps.isActive;
  const editModeChanged = prevProps.isEditMode !== nextProps.isEditMode;
  const indexChanged = prevProps.displayIndex !== nextProps.displayIndex;
  const currentSongChanged = prevProps.currentSongId !== nextProps.currentSongId;
  const isActiveSong = prevProps.item.id === prevProps.currentSongId || nextProps.item.id === nextProps.currentSongId;
  if (idChanged || activeChanged || editModeChanged || indexChanged) return false;
  if (currentSongChanged && isActiveSong) return false;
  return true;
});
