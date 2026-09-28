/**
 * Sheets that rise over Now Playing: the queue ("Playing next") and the
 * sleep timer. Frosted glass, springs up from the bottom, tap outside or
 * pick something to close.
 */
import React, { useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Frosted from '../allegra/Frosted';
import Artwork from '../allegra/Artwork';
import { Motion } from '../../constants/allegraTheme';
import { usePlayerStore } from '../../store/playerStore';
import { SLEEP_CHOICES, SleepChoice, useSleepTimerStore } from '../../store/sleepTimerStore';
import { durationSV, positionSV } from '../../playback/positionBus';
import * as Haptics from '../../utils/haptics';

interface PlayerSheetProps {
  visible: boolean;
  /** Leave out for a sheet that starts straight with its content (the ••• menu). */
  title?: string;
  /** Room for a long list (the menu, Listen together): up to 88% of the screen. */
  tall?: boolean;
  onClose: () => void;
  children: React.ReactNode;
}

export const PlayerSheet: React.FC<PlayerSheetProps> = ({ visible, title, tall = false, onClose, children }) => {
  const insets = useSafeAreaInsets();
  const [mounted, setMounted] = useState(visible);
  const shown = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      shown.value = withSpring(1, Motion.spring.sheet);
    } else if (mounted) {
      shown.value = withTiming(0, { duration: Motion.duration.base, easing: Motion.ease.accelerate }, done => {
        if (done) runOnJS(setMounted)(false);
      });
    }
  }, [visible, mounted, shown]);

  const scrim = useAnimatedStyle(() => ({ opacity: shown.value }));
  const travel = tall ? 900 : 520;
  const sheet = useAnimatedStyle(() => ({ transform: [{ translateY: (1 - shown.value) * travel }] }));

  if (!mounted) return null;
  return (
    <View style={[StyleSheet.absoluteFill, styles.layer]} pointerEvents={visible ? 'auto' : 'none'}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.scrim, scrim]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
      </Animated.View>
      <Animated.View style={[styles.sheet, tall && styles.tall, { paddingBottom: insets.bottom + 12 }, sheet]}>
        <Frosted radius={28} intensity={70} tint={0.5} />
        <View style={styles.grabber} />
        {title ? <Text style={styles.title}>{title}</Text> : <View style={styles.untitled} />}
        {children}
      </Animated.View>
    </View>
  );
};

/** "Playing next": the rest of the queue. Tap a song to jump to it. */
export const QueueList: React.FC<{ onPicked: () => void }> = ({ onPicked }) => {
  const queue = usePlayerStore(s => s.playlistQueue);
  const index = usePlayerStore(s => s.currentQueueIndex);
  const playlistId = usePlayerStore(s => s.currentPlaylistId);
  const upcoming = (queue ?? []).map((song, i) => ({ song, i })).filter(x => x.i > index);

  if (upcoming.length === 0) {
    return <Text style={styles.empty}>Nothing queued after this song.</Text>;
  }
  return (
    <FlatList
      data={upcoming}
      keyExtractor={x => `${x.song.id}-${x.i}`}
      style={styles.list}
      renderItem={({ item }) => (
        <Pressable
          style={({ pressed }) => [styles.row, pressed && styles.pressed]}
          onPress={() => {
            Haptics.selectionAsync().catch(() => {});
            if (queue) usePlayerStore.getState().setPlaylistQueue(playlistId ?? 'queue', queue, item.i);
            onPicked();
          }}
        >
          <Artwork uri={item.song.coverImageUri} title={item.song.title} artist={item.song.artist} size={44} style={styles.art} />
          <View style={styles.rowText}>
            <Text style={styles.rowTitle} numberOfLines={1}>{item.song.title}</Text>
            <Text style={styles.rowSub} numberOfLines={1}>{item.song.artist}</Text>
          </View>
        </Pressable>
      )}
    />
  );
};

const choiceLabel = (c: SleepChoice) => (c === 'end' ? 'End of this song' : `${c} minutes`);

/** Sleep timer choices; the active one is ticked. */
export const SleepTimerList: React.FC<{ onPicked: () => void }> = ({ onPicked }) => {
  const choice = useSleepTimerStore(s => s.choice);
  const { start, cancel } = useSleepTimerStore.getState();
  const pick = (c: SleepChoice | null) => {
    Haptics.selectionAsync().catch(() => {});
    if (c === null) cancel();
    else start(c, Math.max(0, durationSV.value - positionSV.value));
    onPicked();
  };
  return (
    <View>
      {SLEEP_CHOICES.map(c => (
        <Pressable key={String(c)} style={({ pressed }) => [styles.option, pressed && styles.pressed]} onPress={() => pick(c)}>
          <Text style={styles.optionText}>{choiceLabel(c)}</Text>
          {choice === c ? <Ionicons name="checkmark" size={20} color="#fff" /> : null}
        </Pressable>
      ))}
      {choice !== null ? (
        <Pressable style={({ pressed }) => [styles.option, pressed && styles.pressed]} onPress={() => pick(null)}>
          <Text style={[styles.optionText, styles.off]}>Turn off timer</Text>
        </Pressable>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  // Above the player's header (zIndex 20) and controls (15), which otherwise
  // drew their buttons straight through the menu.
  layer: { zIndex: 100, elevation: 100 },
  scrim: { backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: {
    position: 'absolute',
    left: 8,
    right: 8,
    bottom: 8,
    maxHeight: '70%',
    borderRadius: 28,
    overflow: 'hidden',
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  tall: { maxHeight: '88%' },
  untitled: { height: 12 },
  grabber: { alignSelf: 'center', width: 36, height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.35)' },
  title: { color: '#fff', fontSize: 18, fontWeight: '700', marginTop: 14, marginBottom: 8, marginLeft: 4 },
  list: { flexGrow: 0 },
  empty: { color: 'rgba(255,255,255,0.6)', fontSize: 15, paddingVertical: 24, textAlign: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 4, borderRadius: 12 },
  art: { width: 44, height: 44, borderRadius: 8 },
  rowText: { flex: 1, marginLeft: 12 },
  rowTitle: { color: '#fff', fontSize: 15, fontWeight: '600' },
  rowSub: { color: 'rgba(255,255,255,0.6)', fontSize: 13, marginTop: 2 },
  option: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 15, paddingHorizontal: 6, borderRadius: 12 },
  optionText: { color: '#fff', fontSize: 16 },
  off: { color: '#ff8a80' },
  pressed: { backgroundColor: 'rgba(255,255,255,0.08)' },
});
