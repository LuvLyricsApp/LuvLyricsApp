/**
 * Settings → About → Show frame rate: a small readout over every screen.
 *
 *   UI  — frames the UI thread drew (Reanimated's frame callback); animations
 *         and gestures live here
 *   JS  — frames the JavaScript thread kept up with; React renders and store
 *         updates live here
 *
 * Mounted once at the root, so it follows you everywhere and shows in release
 * builds, where smoothness is actually judged. It is a plain tinted pill, not
 * `Frosted`: a live blur under a meter would change the numbers it reports.
 * Updates once a second, so the meter itself costs almost nothing.
 */
import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { runOnJS, useFrameCallback, useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Glass, Signal } from '../constants/allegraTheme';
import { useSettingsStore } from '../store/settingsStore';

/** How a reading looks: the wave colour when smooth, coral when it drops. */
export const fpsColor = (fps: number): string => (fps >= 55 ? Signal.wave : fps >= 40 ? Signal.inkSoft : Signal.accent);

const Reading: React.FC<{ label: string; fps: number }> = ({ label, fps }) => (
  <View style={styles.reading}>
    <Text style={styles.label}>{label}</Text>
    <Text style={[styles.value, { color: fpsColor(fps) }]}>{fps}</Text>
  </View>
);

export const PerformanceHUD: React.FC = () => {
  const show = useSettingsStore(state => state.showPerformanceHUD);
  const insets = useSafeAreaInsets();
  const [uiFps, setUiFps] = useState(0);
  const [jsFps, setJsFps] = useState(0);
  const frames = useSharedValue(0);
  const since = useSharedValue(0);

  const uiLoop = useFrameCallback(frame => {
    'worklet';
    if (since.value === 0) {
      since.value = frame.timestamp;
      return;
    }
    frames.value += 1;
    const elapsed = frame.timestamp - since.value;
    if (elapsed >= 1000) {
      runOnJS(setUiFps)(Math.round((frames.value * 1000) / elapsed));
      frames.value = 0;
      since.value = frame.timestamp;
    }
  }, false);

  useEffect(() => {
    uiLoop.setActive(show);
    if (!show) {
      frames.value = 0;
      since.value = 0;
    }
  }, [show, uiLoop, frames, since]);

  // The JS thread's own frames: a busy thread runs fewer animation frames.
  useEffect(() => {
    if (!show) return undefined;
    let raf = 0;
    let count = 0;
    let last = Date.now();
    const tick = () => {
      count += 1;
      const now = Date.now();
      if (now - last >= 1000) {
        setJsFps(Math.round((count * 1000) / (now - last)));
        count = 0;
        last = now;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [show]);

  if (!show) return null;

  return (
    <View style={[styles.wrap, { top: insets.top + 6 }]} pointerEvents="none" accessible accessibilityLabel={`Frame rate: interface ${uiFps}, code ${jsFps}`}>
      <View style={styles.pill}>
        <Reading label="UI" fps={uiFps} />
        <View style={styles.divider} />
        <Reading label="JS" fps={jsFps} />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { position: 'absolute', right: 12, zIndex: 9999, elevation: 9999 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    height: 30,
    borderRadius: 15,
    backgroundColor: Glass.fillHeavy,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Glass.hairlineStrong,
  },
  reading: { flexDirection: 'row', alignItems: 'baseline', gap: 5 },
  label: { color: Signal.inkMuted, fontSize: 11, fontWeight: '600' },
  value: { fontSize: 14, fontWeight: '700', fontVariant: ['tabular-nums'], minWidth: 20, textAlign: 'right' },
  divider: { width: StyleSheet.hairlineWidth, height: 14, backgroundColor: Glass.hairlineStrong },
});

export default PerformanceHUD;
