/**
 * Settings building blocks in Allegra's language (allegra/DESIGN.md §3–5 and
 * apps/web/src/components/SettingsPage.tsx):
 *
 *   Section — one dark glass panel (22 radius, hairline, light along the top
 *             edge) with a chartreuse icon tile, a title and a one-line lead
 *   Row     — label + plain hint on the left, the control on the right,
 *             hairline dividers between rows
 *   Switch  — chartreuse track when on, the thumb slides by transform
 *   Choice  — a pill segmented control (Allegra's settings-choice)
 *   Action  — a tappable row that opens something, with its current value
 *
 * Only controls that change something go in these — no placeholders.
 */
import React, { useEffect } from 'react';
import { LayoutChangeEvent, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming, interpolateColor } from 'react-native-reanimated';
import { Motion, Radius, Signal } from '../../constants/allegraTheme';
import * as Haptics from '../../utils/haptics';
import { choiceColumns } from './choiceLayout';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

export const Section: React.FC<{
  icon: IconName;
  title: string;
  lead: string;
  onLayout?: (e: LayoutChangeEvent) => void;
  children: React.ReactNode;
}> = ({ icon, title, lead, onLayout, children }) => (
  <View style={styles.section} onLayout={onLayout}>
    {/* Light along the top edge, brightest in the middle. */}
    <LinearGradient
      colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.16)', 'rgba(255,255,255,0)']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 0 }}
      style={styles.sectionHighlight}
      pointerEvents="none"
    />
    <View style={styles.head}>
      <View style={styles.headIcon}><Ionicons name={icon} size={18} color={Signal.wave} /></View>
      <View style={styles.flex}>
        <Text style={styles.headTitle} accessibilityRole="header">{title}</Text>
        <Text style={styles.headLead}>{lead}</Text>
      </View>
    </View>
    {children}
  </View>
);

export const Row: React.FC<{ label: string; hint?: string; stack?: boolean; children?: React.ReactNode }> = ({ label, hint, stack, children }) => (
  <View style={[styles.row, stack && styles.rowStack]}>
    <View style={[styles.copy, !stack && styles.flex]}>
      <Text style={styles.label}>{label}</Text>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
    {children ? <View style={stack ? undefined : styles.control}>{children}</View> : null}
  </View>
);

const TRACK_W = 48;
const THUMB = 20;

export const Switch: React.FC<{ label: string; hint?: string; value: boolean; onChange: (next: boolean) => void }> = ({ label, hint, value, onChange }) => {
  const on = useSharedValue(value ? 1 : 0);
  useEffect(() => {
    on.value = withSpring(value ? 1 : 0, Motion.spring.tactile);
  }, [value, on]);
  const track = useAnimatedStyle(() => ({ backgroundColor: interpolateColor(on.value, [0, 1], ['rgba(255,255,255,0.12)', Signal.wave]) }));
  const thumb = useAnimatedStyle(() => ({
    transform: [{ translateX: on.value * (TRACK_W - THUMB - 8) }],
    backgroundColor: interpolateColor(on.value, [0, 1], ['#ffffff', Signal.waveInk]),
  }));
  return (
    <Pressable
      onPress={() => { Haptics.selectionAsync().catch(() => {}); onChange(!value); }}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      accessibilityLabel={label}
      style={({ pressed }) => [pressed && styles.pressed]}
    >
      <Row label={label} hint={hint}>
        <Animated.View style={[styles.track, track]}>
          <Animated.View style={[styles.thumb, thumb]} />
        </Animated.View>
      </Row>
    </Pressable>
  );
};

/**
 * Never wraps or cuts a label: see choiceLayout. Every cell is the same width,
 * so a label can't drop to a row of its own.
 */
export function Choice<T extends string>({ label, hint, value, options, onChange }: {
  label: string;
  hint?: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (next: T) => void;
}) {
  const columns = choiceColumns(options.map(o => o.label));
  // One row is a segmented pill: the box and the selected pill share a curve
  // (the box's radius is the pill's plus the padding around it). Several rows
  // are separate pills with no box around them, so no two curves ever disagree.
  const segmented = columns === options.length;
  const rows: { value: T; label: string }[][] = [];
  for (let i = 0; i < options.length; i += columns) rows.push(options.slice(i, i + columns));
  return (
    <Row label={label} hint={hint} stack>
      <View style={segmented ? styles.choice : styles.choiceGrid} accessibilityRole="radiogroup" accessibilityLabel={label}>
        {rows.map((row, r) => (
          <View key={r} style={segmented ? styles.choiceRow : styles.choiceGridRow}>
            {row.map(o => {
              const selected = o.value === value;
              return (
                <Pressable
                  key={o.value}
                  onPress={() => { if (!selected) { Haptics.selectionAsync().catch(() => {}); onChange(o.value); } }}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  style={[styles.choiceOption, !segmented && styles.choiceChip, selected && styles.choiceOptionOn]}
                >
                  <Text style={[styles.choiceText, selected && styles.choiceTextOn]} numberOfLines={1}>{o.label}</Text>
                </Pressable>
              );
            })}
            {/* A short last row keeps its cells the same width as the rows above. */}
            {Array.from({ length: columns - row.length }, (_, i) => <View key={`pad${i}`} style={styles.choicePad} />)}
          </View>
        ))}
      </View>
    </Row>
  );
}

export const Action: React.FC<{ label: string; hint?: string; value?: string; destructive?: boolean; onPress: () => void }> = ({ label, hint, value, destructive, onPress }) => (
  <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [pressed && styles.pressed]}>
    <View style={styles.row}>
      <View style={[styles.copy, styles.flex]}>
        <Text style={[styles.label, destructive && styles.destructive]}>{label}</Text>
        {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      </View>
      <View style={[styles.control, styles.actionControl]}>
        {value ? <Text style={styles.value} numberOfLines={1}>{value}</Text> : null}
        {destructive ? null : <Ionicons name="chevron-forward" size={16} color={Signal.inkMuted} />}
      </View>
    </View>
  </Pressable>
);

/** Allegra's jump links: pill chips that scroll to each section. */
export const JumpChips: React.FC<{ items: { key: string; label: string }[]; onJump: (key: string) => void }> = ({ items, onJump }) => (
  <View style={styles.jump}>
    {items.map(item => (
      <Pressable key={item.key} onPress={() => onJump(item.key)} accessibilityRole="button" style={({ pressed }) => [styles.jumpChip, pressed && styles.pressed]}>
        <Text style={styles.jumpText}>{item.label}</Text>
      </Pressable>
    ))}
  </View>
);

export const FadeIn: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const o = useSharedValue(0);
  useEffect(() => { o.value = withTiming(1, { duration: Motion.duration.base }); }, [o]);
  const s = useAnimatedStyle(() => ({ opacity: o.value }));
  return <Animated.View style={s}>{children}</Animated.View>;
};

const styles = StyleSheet.create({
  flex: { flex: 1 },
  // Dark glass on a dark room: a whisper of white over black, a hairline edge
  // and light along the top — depth from light, not from grey fill.
  section: {
    marginHorizontal: 16,
    marginTop: 14,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 4,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.09)',
    overflow: 'hidden',
  },
  sectionHighlight: { position: 'absolute', top: 0, left: 0, right: 0, height: 1 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingBottom: 14 },
  headIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(217, 230, 106, 0.1)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(217, 230, 106, 0.28)',
  },
  headTitle: { color: Signal.ink, fontSize: 18, fontWeight: '700', letterSpacing: -0.2 },
  headLead: { color: Signal.inkMuted, fontSize: 13, marginTop: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingVertical: 14, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(255, 255, 255, 0.07)' },
  rowStack: { flexDirection: 'column', alignItems: 'stretch', gap: 12 },
  copy: { gap: 3 },
  label: { color: Signal.ink, fontSize: 15, fontWeight: '600' },
  hint: { color: Signal.inkMuted, fontSize: 13, lineHeight: 18 },
  control: { flexShrink: 0 },
  actionControl: { flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: '45%' },
  value: { color: Signal.inkSoft, fontSize: 14 },
  destructive: { color: Signal.accent },
  track: { width: TRACK_W, height: 28, borderRadius: 14, padding: 4, justifyContent: 'center' },
  thumb: { width: THUMB, height: THUMB, borderRadius: THUMB / 2 },
  // Segmented: 38pt pills 4pt inside the box, so the box's radius is 19 + 4 = 23.
  choice: { padding: 4, borderRadius: 23, backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.08)' },
  choiceRow: { flexDirection: 'row', gap: 4 },
  // Grid: each option is its own pill.
  choiceGrid: { gap: 8 },
  choiceGridRow: { flexDirection: 'row', gap: 8 },
  choiceOption: { flex: 1, flexBasis: 0, minHeight: 38, paddingHorizontal: 10, borderRadius: Radius.pill, alignItems: 'center', justifyContent: 'center' },
  choiceChip: { minHeight: 42, backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.1)' },
  choicePad: { flex: 1, flexBasis: 0 },
  choiceOptionOn: { backgroundColor: Signal.wave },
  choiceText: { color: Signal.inkSoft, fontSize: 13, fontWeight: '600' },
  choiceTextOn: { color: Signal.waveInk },
  pressed: { opacity: 0.75 },
  jump: { flexDirection: 'row', gap: 6, paddingHorizontal: 16, paddingVertical: 8 },
  jumpChip: { minHeight: 36, paddingHorizontal: 15, borderRadius: Radius.pill, justifyContent: 'center', backgroundColor: 'rgba(22, 22, 25, 0.88)', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.1)' },
  jumpText: { color: Signal.inkSoft, fontSize: 13, fontWeight: '600' },
});
