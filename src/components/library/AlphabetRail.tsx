/**
 * The A–Z rail down the right edge of a long list (iOS Contacts): slide a
 * thumb along it and the list jumps letter by letter, with a tick for each
 * new letter and the letter shown large beside your thumb. Only the letters
 * that exist are on the rail.
 */
import React, { useCallback, useRef, useState } from 'react';
import { LayoutChangeEvent, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { FadeIn, FadeOut, runOnJS } from 'react-native-reanimated';
import { Glass, Signal } from '../../constants/allegraTheme';
import * as Haptics from '../../utils/haptics';
import { railPick } from './libraryShape';

export const AlphabetRail: React.FC<{
  letters: { letter: string; index: number }[];
  onPick: (index: number) => void;
  style?: object;
}> = ({ letters, onPick, style }) => {
  const [height, setHeight] = useState(0);
  const [active, setActive] = useState<{ letter: string; y: number } | null>(null);
  const last = useRef(-1);

  const pick = useCallback((y: number) => {
    const at = railPick(y, height, letters.length);
    const entry = letters[at];
    if (!entry) return;
    setActive({ letter: entry.letter, y: Math.max(0, Math.min(height, y)) });
    if (at !== last.current) {
      last.current = at;
      Haptics.selectionAsync().catch(() => {});
      onPick(entry.index);
    }
  }, [height, letters, onPick]);
  const release = useCallback(() => {
    last.current = -1;
    setActive(null);
  }, []);

  const pan = Gesture.Pan()
    .minDistance(0)
    .onBegin(e => { runOnJS(pick)(e.y); })
    .onUpdate(e => { runOnJS(pick)(e.y); })
    .onFinalize(() => { runOnJS(release)(); });

  if (letters.length < 4) return null;
  return (
    <View style={[styles.wrap, style]} pointerEvents="box-none">
      {active ? (
        <Animated.View entering={FadeIn.duration(120)} exiting={FadeOut.duration(160)} style={[styles.bubble, { top: active.y - 28 }]} pointerEvents="none">
          <Text style={styles.bubbleText}>{active.letter}</Text>
        </Animated.View>
      ) : null}
      <GestureDetector gesture={pan}>
        <View
          style={styles.rail}
          onLayout={(e: LayoutChangeEvent) => setHeight(e.nativeEvent.layout.height)}
          accessibilityRole="adjustable"
          accessibilityLabel="Jump to a letter"
        >
          {letters.map(l => (
            <Text key={l.letter} style={[styles.letter, active?.letter === l.letter && styles.letterOn]}>{l.letter}</Text>
          ))}
        </View>
      </GestureDetector>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'flex-start' },
  rail: {
    width: 26,
    paddingVertical: 8,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(10, 11, 14, 0.42)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Glass.hairline,
  },
  letter: { color: Signal.inkSoft, fontSize: 11, fontWeight: '600', lineHeight: 15 },
  letterOn: { color: Signal.wave },
  bubble: {
    position: 'absolute',
    right: 40,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Signal.wave,
  },
  bubbleText: { color: Signal.waveInk, fontSize: 26, fontWeight: '700' },
});

export default AlphabetRail;
