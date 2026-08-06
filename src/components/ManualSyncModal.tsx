import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, Modal, StyleSheet, Pressable, FlatList, Alert
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors } from '../contexts/ThemeContext';
import { usePlayerStore, playerControls } from '../store/playerStore';
import { usePositionStore } from '../store/positionStore';
import Slider from '@react-native-community/slider';
import { formatTime } from '../utils/formatters';
import { BlurView } from 'expo-blur';

interface ManualSyncModalProps {
  visible: boolean;
  onClose: () => void;
  lyricsText: string;
  onSave: (syncedLyrics: string) => void;
  audioUri?: string;
  duration?: number;
}

interface LyricLine {
  id: string;
  text: string;
  timestamp?: number;
  isSynced: boolean;
}

export const ManualSyncModal: React.FC<ManualSyncModalProps> = ({
  visible, onClose, lyricsText, onSave, duration = 0
}) => {
  const colors = useThemeColors();
  const { play, seekTo } = playerControls;
  const storePosition = usePositionStore(state => state.position);
  const storeDuration = usePositionStore(state => state.duration);
  const storePlaying = usePlayerStore(state => state.isPlaying);

  const [isPlayingLocal, setIsPlayingLocal] = useState(false);
  const [positionLocal, setPositionLocal] = useState(0);

  useEffect(() => { setIsPlayingLocal(storePlaying); }, [storePlaying]);
  useEffect(() => { setPositionLocal(storePosition); }, [storePosition]);

  const playerDuration = storeDuration || duration || 0;
  const [lines, setLines] = useState<LyricLine[]>([]);
  const [activeLineIndex, setActiveLineIndex] = useState<number>(-1);
  const flatListRef = useRef<FlatList>(null);

  useEffect(() => {
    if (visible && lyricsText) {
      const rawLines = lyricsText.split('\n');
      const parsedLines = rawLines.map((line, index) => {
        const match = line.match(/^\[(\d+):(\d+(\.\d+)?)\](.*)/);
        let timestamp: number | undefined;
        let text = line;
        let isSynced = false;
        if (match) {
          timestamp = parseInt(match[1], 10) * 60 + parseFloat(match[2]);
          text = match[4];
          isSynced = true;
        }
        return { id: `line-${index}-${Date.now()}`, text: text.trim(), timestamp, isSynced };
      });
      setLines(parsedLines);
    }
  }, [visible, lyricsText]);

  useEffect(() => {
    if (!visible || !isPlayingLocal) return;
    let currentIdx = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].timestamp !== undefined && lines[i].timestamp! <= positionLocal) currentIdx = i;
      else if (lines[i].timestamp !== undefined && lines[i].timestamp! > positionLocal) break;
    }
    if (currentIdx !== activeLineIndex) {
      setActiveLineIndex(currentIdx);
      if (flatListRef.current && currentIdx >= 0) {
        flatListRef.current.scrollToIndex({ index: currentIdx, viewPosition: 0.3, animated: true });
      }
    }
  }, [positionLocal, visible, isPlayingLocal, lines, activeLineIndex]);

  const handleTapLine = (index: number) => {
    const newLines = [...lines];
    newLines[index].timestamp = positionLocal;
    newLines[index].isSynced = true;
    setLines(newLines);
  };

  // Route through the store so the icon updates immediately and the echo guard is
  // armed — calling playerControls directly leaves the store stale until the next
  // native status tick (up to 250ms of wrong icon).
  const togglePlay = () => {
    usePlayerStore.getState().requestPlayback(!usePlayerStore.getState().isPlaying);
  };

  const handleSeek = (val: number) => {
    // seekTo pauses on iOS — dragging the sync slider must not stop playback.
    const wasPlaying = usePlayerStore.getState().isPlaying;
    seekTo(val);
    if (wasPlaying) play();
    setPositionLocal(val);
  };

  const clearTimestamp = (index: number) => {
    const newLines = [...lines];
    newLines[index].timestamp = undefined;
    newLines[index].isSynced = false;
    setLines(newLines);
  };

  const handleAutoFill = () => {
    const newLines = [...lines];
    const syncedIndices = newLines.map((l, i) => l.isSynced ? i : -1).filter(i => i !== -1);
    if (syncedIndices.length < 2) {
      Alert.alert('Not enough data', 'You need to sync at least the start and end of a section to auto-fill.');
      return;
    }
    let filledCount = 0;
    for (let k = 0; k < syncedIndices.length - 1; k++) {
      const startIdx = syncedIndices[k];
      const endIdx = syncedIndices[k + 1];
      const gap = endIdx - startIdx - 1;
      if (gap > 0) {
        const startTime = newLines[startIdx].timestamp!;
        const endTime = newLines[endIdx].timestamp!;
        const step = (endTime - startTime) / (gap + 1);
        for (let j = 1; j <= gap; j++) {
          const targetIdx = startIdx + j;
          if (!newLines[targetIdx].isSynced) {
            newLines[targetIdx].timestamp = startTime + step * j;
            newLines[targetIdx].isSynced = true;
            filledCount++;
          }
        }
      }
    }
    setLines(newLines);
    Alert.alert('Auto-Fill', `Interpolated timestamps for ${filledCount} lines.`);
  };

  const handleSaveInternal = () => {
    const result = lines.map(line => {
      if (line.timestamp !== undefined) {
        const min = Math.floor(line.timestamp / 60);
        const sec = (line.timestamp % 60).toFixed(2);
        const secFormatted = parseFloat(sec) < 10 ? `0${sec}` : sec;
        return `[${min}:${secFormatted}]${line.text}`;
      }
      return line.text;
    }).join('\n');
    onSave(result);
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Tap to Sync</Text>
            <Text style={styles.subtitle}>Tap a line when it's sung</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <Pressable style={styles.autoBtn} onPress={handleAutoFill}>
              <Ionicons name="flash" size={16} color="#000" />
              <Text style={styles.autoBtnText}>Auto-Fill</Text>
            </Pressable>
            <Pressable onPress={handleSaveInternal} style={[styles.saveBtn, { backgroundColor: colors.accent }]}>
              <Text style={styles.saveBtnText}>Done</Text>
            </Pressable>
          </View>
        </View>

        <FlatList
          ref={flatListRef}
          data={lines}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item, index }) => (
            <Pressable
              style={[styles.lineRow, activeLineIndex === index && styles.activeRow, item.isSynced && styles.syncedRow]}
              onPress={() => handleTapLine(index)}
              onLongPress={() => clearTimestamp(index)}
            >
              <View style={styles.timeContainer}>
                {item.timestamp !== undefined ? (
                  <Text style={[styles.timestamp, { color: colors.accent }, activeLineIndex === index && styles.activeTimestamp]}>
                    {formatTime(item.timestamp)}
                  </Text>
                ) : (
                  <Ionicons name="ellipse-outline" size={12} color="#444" />
                )}
              </View>
              <Text style={[styles.lineText, activeLineIndex === index && styles.activeText, !item.text && styles.emptyLine]}>
                {item.text || '...'}
              </Text>
            </Pressable>
          )}
        />

        <BlurView intensity={20} tint="dark" style={styles.controls}>
          <Slider
            style={styles.slider}
            minimumValue={0}
            maximumValue={playerDuration}
            value={positionLocal}
            onSlidingComplete={handleSeek}
            minimumTrackTintColor={colors.accent}
            maximumTrackTintColor="#555"
            thumbTintColor={colors.accent}
          />
          <View style={styles.buttonsRow}>
            <Pressable onPress={() => seekTo(Math.max(0, positionLocal - 5))}>
              <Ionicons name="play-back" size={24} color="#fff" />
            </Pressable>
            <Pressable onPress={togglePlay} style={styles.playBtn}>
              <Ionicons name={isPlayingLocal ? 'pause' : 'play'} size={32} color="#000" />
            </Pressable>
            <Pressable onPress={() => seekTo(Math.min(playerDuration, positionLocal + 5))}>
              <Ionicons name="play-forward" size={24} color="#fff" />
            </Pressable>
          </View>
          <Pressable style={styles.cancelBtn} onPress={onClose}>
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
        </BlurView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F0F0F' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, backgroundColor: '#181818', borderBottomWidth: 1, borderBottomColor: '#333' },
  title: { fontSize: 18, fontWeight: 'bold', color: '#fff' },
  subtitle: { fontSize: 12, color: '#888' },
  saveBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
  saveBtnText: { color: '#000', fontWeight: '600' },
  autoBtn: { backgroundColor: '#fff', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, flexDirection: 'row', alignItems: 'center', gap: 4 },
  autoBtnText: { color: '#000', fontWeight: '600', fontSize: 12 },
  listContent: { paddingBottom: 200, paddingTop: 10 },
  lineRow: { flexDirection: 'row', paddingVertical: 12, paddingHorizontal: 16, alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#1A1A1A' },
  activeRow: { backgroundColor: 'rgba(62,166,255,0.1)' },
  syncedRow: { backgroundColor: 'rgba(255,255,255,0.02)' },
  timeContainer: { width: 60, alignItems: 'center', marginRight: 10 },
  timestamp: { fontSize: 12, fontFamily: 'monospace' },
  activeTimestamp: { fontWeight: 'bold' },
  lineText: { color: '#aaa', fontSize: 16, flex: 1 },
  activeText: { color: '#fff', fontWeight: '600' },
  emptyLine: { fontStyle: 'italic', opacity: 0.5 },
  controls: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 20, backgroundColor: 'rgba(15,15,15,0.9)', borderTopWidth: 1, borderTopColor: '#333' },
  slider: { width: '100%', height: 40 },
  buttonsRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 40, marginBottom: 20 },
  playBtn: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  cancelBtn: { alignItems: 'center', padding: 10 },
  cancelText: { color: '#666' },
});
