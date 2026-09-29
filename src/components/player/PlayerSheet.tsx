/**
 * Sheets that rise over Now Playing: the sleep timer, the ••• menu, details,
 * Listen together. Frosted glass, springs up from the bottom, tap outside or
 * pick something to close. (The queue is Up next, `UpNextPanel`.)
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { NativeScrollEvent, NativeSyntheticEvent, Pressable, ScrollView, ScrollViewProps, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as GestureHandler from 'react-native-gesture-handler';
import Animated, { runOnJS, SharedValue, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Frosted from '../allegra/Frosted';
import { Motion } from '../../constants/allegraTheme';
import { SLEEP_CHOICES, SleepChoice, useSleepTimerStore } from '../../store/sleepTimerStore';
import { durationSV, positionSV } from '../../playback/positionBus';
import * as Haptics from '../../utils/haptics';
import { shouldCloseSheet } from '../../navigation/sheetClose';
import { diag } from '../../utils/diag';

const { Gesture, GestureDetector } = GestureHandler;

/**
 * How far the sheet's own list is scrolled. A drag down closes the sheet only
 * while that is 0 — otherwise the drag scrolls the list back up. Lists that
 * live in a sheet report through `useSheetScroll`; ones that don't leave it at 0.
 */
interface SheetScrollState {
  offset: SharedValue<number>;
  /** The list's native scroll, recognised alongside the sheet's pan. */
  list: GestureHandler.NativeGesture;
}

const SheetScrollContext = createContext<SheetScrollState | null>(null);

export const useSheetScroll = () => {
  const sheet = useContext(SheetScrollContext);
  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (sheet) sheet.offset.value = e.nativeEvent.contentOffset.y;
  }, [sheet]);
  return { onScroll, scrollEventThrottle: 16 } as const;
};

/**
 * Wraps a sheet's scroll view. On Android a native scroll view that starts
 * dragging cancels every gesture-handler gesture, so without this a swipe
 * down that begins on the list never reaches the sheet's pan.
 */
export const SheetScrollable: React.FC<{ children: React.ReactElement }> = ({ children }) => {
  const sheet = useContext(SheetScrollContext);
  return sheet ? <GestureDetector gesture={sheet.list}>{children}</GestureDetector> : children;
};

/** A ScrollView that lives in a sheet: reports its offset and lets a drag down at the top close the sheet. */
export const SheetScrollView: React.FC<ScrollViewProps> = props => {
  const scroll = useSheetScroll();
  return (
    <SheetScrollable>
      <ScrollView {...scroll} {...props} />
    </SheetScrollable>
  );
};

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
  const drag = useSharedValue(0);
  const scrolled = useSharedValue(0);
  const list = useMemo(() => Gesture.Native()
    .onStart(() => {
      'worklet';
      runOnJS(diag)('sheet', 'list scroll start');
    }), []);
  const scrollState = useMemo(() => ({ offset: scrolled, list }), [scrolled, list]);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      drag.value = 0;
      scrolled.value = 0;
      shown.value = withSpring(1, Motion.spring.sheet);
    } else if (mounted) {
      shown.value = withTiming(0, { duration: Motion.duration.base, easing: Motion.ease.accelerate }, done => {
        if (done) runOnJS(setMounted)(false);
      });
    }
  }, [visible, mounted, shown, drag, scrolled]);

  const scrim = useAnimatedStyle(() => ({ opacity: shown.value }));
  const travel = tall ? 900 : 520;
  const sheet = useAnimatedStyle(() => ({ transform: [{ translateY: (1 - shown.value) * travel + drag.value }] }));

  // Swiping down closes this sheet and nothing else: the player's own
  // swipe-down is off while a sheet is open, so the next swipe closes the player.
  const pan = Gesture.Pan()
    .activeOffsetY(10)
    .failOffsetY(-8)
    .failOffsetX([-22, 22])
    .simultaneousWithExternalGesture(list)
    .onTouchesDown((_e, state) => {
      'worklet';
      if (scrolled.value > 2) state.fail();
    })
    .onUpdate(e => {
      'worklet';
      drag.value = Math.max(0, e.translationY);
    })
    .onStart(() => {
      'worklet';
      runOnJS(diag)('sheet', `pan start (list scrolled ${scrolled.value.toFixed(0)})`);
    })
    .onEnd(e => {
      'worklet';
      const close = shouldCloseSheet(e.translationY, e.velocityY);
      runOnJS(diag)('sheet', `pan end dy ${e.translationY.toFixed(0)} vy ${e.velocityY.toFixed(0)} -> ${close ? 'close' : 'settle'}`);
      if (close) runOnJS(onClose)();
      else drag.value = withSpring(0, Motion.spring.sheet);
    })
    .onFinalize((_e, success) => {
      'worklet';
      // A pan the list's scroll cancels never reaches onEnd: settle back
      // instead of leaving the sheet where the finger let go.
      if (success) return;
      runOnJS(diag)('sheet', 'pan cancelled or failed');
      drag.value = withSpring(0, Motion.spring.sheet);
    });

  if (!mounted) return null;
  return (
    <View style={[StyleSheet.absoluteFill, styles.layer]} pointerEvents={visible ? 'auto' : 'none'}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.scrim, scrim]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
      </Animated.View>
      <GestureDetector gesture={pan}>
        <Animated.View style={[styles.sheet, tall && styles.tall, { paddingBottom: insets.bottom + 12 }, sheet]}>
          <Frosted radius={28} intensity={70} tint={0.5} />
          <View style={styles.grabber} />
          {title ? <Text style={styles.title}>{title}</Text> : <View style={styles.untitled} />}
          <SheetScrollContext.Provider value={scrollState}>{children}</SheetScrollContext.Provider>
        </Animated.View>
      </GestureDetector>
    </View>
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
  option: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 15, paddingHorizontal: 6, borderRadius: 12 },
  optionText: { color: '#fff', fontSize: 16 },
  off: { color: '#ff8a80' },
  pressed: { backgroundColor: 'rgba(255,255,255,0.08)' },
});
