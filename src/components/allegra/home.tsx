/**
 * Allegra's home-page building blocks, for React Native. Each maps to the web
 * original in apps/web/src/styles/app.css:
 *
 *   Eyebrow / SectionHeading → .eyebrow, .section-heading
 *
 * Labels stay in sentence case in the body font. Monospace capitals with wide
 * tracking read as generated UI, not as a music app.
 *   Spotlight                → .home-spotlight (+ -wash, ::after veil)
 *   Sleeve                   → .home-stage__sleeve / __cover / __play
 *   QuickCard                → .home-quick-card (rail)
 *   Tile                     → .tile / .tile-art / .tile-play
 *   ChartRow                 → .chart-row / .chart-rank / .chart-art
 *   MoodCard                 → .mood-card
 *   PrimaryButton/GlassButton→ .btn-primary / .btn-glass
 */
import React, { useState } from 'react';
import { LayoutChangeEvent, StyleSheet, Text, View } from 'react-native';
import { Blur, Canvas, Image as SkiaImage, LinearGradient as SkiaLinearGradient, Mask, Rect, useImage, vec } from '@shopify/react-native-skia';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Glass, Radius, Signal, Space } from '../../constants/allegraTheme';
import { Tactile } from './motion';
import Artwork from './Artwork';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

// ─── Type ──────────────────────────────────────────────────────────────────

export const Eyebrow: React.FC<{ children: React.ReactNode; accent?: string }> = ({ children, accent }) => (
  <Text style={[styles.eyebrow, accent ? { color: accent } : null]} numberOfLines={1}>
    {children}
  </Text>
);

/** Title first, then an optional plain-language line under it — the way Apple Music and Spotify head a shelf. */
export const SectionHeading: React.FC<{
  title: string;
  subtitle?: string;
  action?: string;
  onAction?: () => void;
}> = ({ title, subtitle, action, onAction }) => (
  <View style={styles.sectionHeading}>
    <View style={styles.flex}>
      <Text style={styles.h2} numberOfLines={1}>{title}</Text>
      {subtitle ? <Text style={styles.sectionSub} numberOfLines={1}>{subtitle}</Text> : null}
    </View>
    {action && onAction ? (
      <Tactile onPress={onAction} accessibilityRole="button" style={styles.shelfLink}>
        <Text style={styles.shelfLinkText}>{action}</Text>
        <Ionicons name="chevron-forward" size={13} color={Signal.inkSoft} />
      </Tactile>
    ) : null}
  </View>
);

// ─── Buttons ───────────────────────────────────────────────────────────────

export const PrimaryButton: React.FC<{ label: string; icon?: IconName; onPress: () => void; disabled?: boolean; compact?: boolean }> = ({ label, icon, onPress, disabled, compact }) => (
  <Tactile
    onPress={onPress}
    disabled={disabled}
    accessibilityRole="button"
    accessibilityLabel={label}
    style={[styles.btn, styles.btnPrimary, compact && styles.btnCompact, disabled && styles.disabled]}
  >
    {icon ? <Ionicons name={icon} size={compact ? 14 : 16} color={Signal.waveInk} /> : null}
    <Text style={[styles.btnText, { color: Signal.waveInk }]}>{label}</Text>
  </Tactile>
);

export const GlassButton: React.FC<{ label?: string; icon?: IconName; onPress: () => void; disabled?: boolean; compact?: boolean; accessibilityLabel?: string }> = ({ label, icon, onPress, disabled, compact, accessibilityLabel }) => (
  <Tactile
    onPress={onPress}
    disabled={disabled}
    accessibilityRole="button"
    accessibilityLabel={accessibilityLabel ?? label}
    style={[styles.btn, styles.btnGlass, compact && styles.btnCompact, !label && styles.btnIconOnly, disabled && styles.disabled]}
  >
    {icon ? <Ionicons name={icon} size={compact ? 14 : 16} color={Signal.ink} /> : null}
    {label ? <Text style={[styles.btnText, { color: Signal.ink }]}>{label}</Text> : null}
  </Tactile>
);

// ─── Artwork ───────────────────────────────────────────────────────────────

/** Cover art with the designed fallback — never a grey box. */
const Art: React.FC<{ uri?: string; title: string; artist?: string; size: number; priority?: 'low' | 'normal' | 'high' }> = ({ uri, title, artist, size, priority }) => (
  <Artwork uri={uri} title={title} artist={artist} size={size} priority={priority} style={StyleSheet.absoluteFill} />
);

// ─── Spotlight hero ────────────────────────────────────────────────────────

/**
 * The blurred cover wash behind the hero (.home-spotlight-wash). Drawn with
 * Skia so it can be masked: the cover dissolves into the ambient field below
 * instead of ending on the hero's edge.
 */
export const SpotlightWash: React.FC<{ artwork?: string }> = ({ artwork }) => {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const image = useImage(artwork ?? null);
  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width !== size.width || height !== size.height) setSize({ width, height });
  };
  const { width, height } = size;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none" onLayout={onLayout}>
      {image && width > 0 ? (
        <Canvas style={StyleSheet.absoluteFill}>
          <Mask
            mode="luminance"
            mask={
              <Rect x={0} y={0} width={width} height={height}>
                <SkiaLinearGradient start={vec(0, 0)} end={vec(0, height)} colors={['#ffffff', '#b0b0b0', '#000000']} positions={[0, 0.45, 1]} />
              </Rect>
            }
          >
            <SkiaImage image={image} x={-width * 0.2} y={-height * 0.2} width={width * 1.4} height={height * 1.4} fit="cover" opacity={0.42}>
              <Blur blur={48} />
            </SkiaImage>
          </Mask>
        </Canvas>
      ) : null}
      {/* Veil darkens behind the copy, then dissolves so the ambient field runs
          straight on under the sections. */}
      <LinearGradient
        colors={['rgba(10, 11, 14, 0.45)', 'rgba(10, 11, 14, 0.55)', 'rgba(10, 11, 14, 0)']}
        locations={[0, 0.6, 1]}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
};

/** Two tilted glass plates behind a slightly rotated cover, with the play bubble. */
export const Sleeve: React.FC<{ artwork?: string; title: string; artist?: string; size: number; playing?: boolean; onPress: () => void; label: string }> = ({ artwork, title, artist, size, playing, onPress, label }) => (
  <View style={{ width: size, height: size }}>
    <View style={[styles.plate, { width: size, height: size, opacity: 0.65, transform: [{ translateX: -size * 0.09 }, { translateY: size * 0.03 }, { rotate: '-10deg' }] }]} />
    <View style={[styles.plate, styles.plateFront, { width: size, height: size, transform: [{ translateX: -size * 0.045 }, { translateY: size * 0.015 }, { rotate: '-6deg' }] }]} />
    <Tactile onPress={onPress} pressScale={0.98} accessibilityRole="button" accessibilityLabel={label} style={[styles.cover, { width: size, height: size }]}>
      <Art uri={artwork} title={title} artist={artist} size={size} priority="high" />
      <View style={styles.coverPlay}>
        <Ionicons name={playing ? 'pause' : 'play'} size={20} color={Signal.waveInk} style={playing ? undefined : styles.playNudge} />
      </View>
    </Tactile>
  </View>
);

// ─── Rail, tiles, rows ─────────────────────────────────────────────────────

export const QuickCard: React.FC<{ title: string; subtitle?: string; artwork?: string; isCurrent?: boolean; onPress: () => void; onLongPress?: () => void }> = ({ title, subtitle, artwork, isCurrent, onPress, onLongPress }) => (
  <Tactile onPress={onPress} onLongPress={onLongPress} pressScale={0.98} accessibilityRole="button" accessibilityLabel={title} style={[styles.quick, isCurrent && styles.currentBorder]}>
    <View style={styles.quickArt}>
      <Art uri={artwork} title={title} artist={subtitle} size={64} />
    </View>
    <View style={styles.quickCopy}>
      <Text style={[styles.quickTitle, isCurrent && { color: Signal.wave }]} numberOfLines={1}>{title}</Text>
      {subtitle ? <Text style={styles.quickSub} numberOfLines={1}>{subtitle}</Text> : null}
    </View>
    <View style={styles.quickPlay}>
      <Ionicons name={isCurrent ? 'volume-medium' : 'play'} size={13} color={Signal.ink} />
    </View>
  </Tactile>
);

export const Tile: React.FC<{
  title: string;
  subtitle?: string;
  eyebrow?: string;
  artwork?: string;
  size?: number;
  isCurrent?: boolean;
  onPress: () => void;
  onLongPress?: () => void;
  onAction?: () => void;
  actionIcon?: IconName;
}> = ({ title, subtitle, eyebrow, artwork, size = 156, isCurrent, onPress, onLongPress, onAction, actionIcon = 'arrow-down-circle-outline' }) => (
  <View style={{ width: size }}>
    <Tactile onPress={onPress} onLongPress={onLongPress} pressScale={0.97} accessibilityRole="button" accessibilityLabel={title} style={[styles.tileArt, { width: size, height: size }, isCurrent && styles.currentBorder]}>
      <Art uri={artwork} title={title} artist={subtitle} size={size} />
      <View style={styles.tilePlay}>
        <Ionicons name={isCurrent ? 'volume-medium' : 'play'} size={18} color={Signal.waveInk} style={isCurrent ? undefined : styles.playNudge} />
      </View>
    </Tactile>
    <View style={styles.tileMeta}>
      <View style={styles.flex}>
        {eyebrow ? <Text style={styles.tileEyebrow} numberOfLines={1}>{eyebrow}</Text> : null}
        <Text style={[styles.tileTitle, isCurrent && { color: Signal.wave }]} numberOfLines={1}>{title}</Text>
        {subtitle ? <Text style={styles.tileSub} numberOfLines={1}>{subtitle}</Text> : null}
      </View>
      {onAction ? (
        <Tactile onPress={onAction} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Save ${title}`} style={styles.tileAction}>
          <Ionicons name={actionIcon} size={20} color={Signal.inkMuted} />
        </Tactile>
      ) : null}
    </View>
  </View>
);

export const ChartRow: React.FC<{
  rank: number;
  title: string;
  subtitle?: string;
  artwork?: string;
  isCurrent?: boolean;
  onPress: () => void;
  onLongPress?: () => void;
  onAction?: () => void;
  actionIcon?: IconName;
  actionLabel?: string;
}> = ({ rank, title, subtitle, artwork, isCurrent, onPress, onLongPress, onAction, actionIcon = 'arrow-down-circle-outline', actionLabel }) => (
  <View style={[styles.chartRow, isCurrent && styles.chartRowCurrent]}>
    <Tactile onPress={onPress} onLongPress={onLongPress} pressScale={0.985} accessibilityRole="button" accessibilityLabel={`${title}${subtitle ? `, ${subtitle}` : ''}`} wrapperStyle={styles.flex} style={styles.chartMain}>
      <Text style={[styles.rank, isCurrent && { color: Signal.wave }]}>{rank}</Text>
      <View style={styles.chartArt}>
        <Art uri={artwork} title={title} artist={subtitle} size={48} />
        <View style={styles.chartPlay}>
          <Ionicons name={isCurrent ? 'volume-medium' : 'play'} size={14} color="#fff" />
        </View>
      </View>
      <View style={styles.flex}>
        <Text style={[styles.chartTitle, isCurrent && { color: Signal.wave }]} numberOfLines={1}>{title}</Text>
        {subtitle ? <Text style={styles.chartSub} numberOfLines={1}>{subtitle}</Text> : null}
      </View>
    </Tactile>
    {onAction ? (
      <Tactile onPress={onAction} hitSlop={8} accessibilityRole="button" accessibilityLabel={actionLabel ?? 'More'} style={styles.chartAction}>
        <Ionicons name={actionIcon} size={21} color={Signal.inkMuted} />
      </Tactile>
    ) : null}
  </View>
);

export const MoodCard: React.FC<{ label: string; note: string; tint: string; icon: IconName; onPress: () => void }> = ({ label, note, tint, icon, onPress }) => (
  <Tactile onPress={onPress} pressScale={0.985} accessibilityRole="button" accessibilityLabel={`${label} mood`} style={[styles.mood, { borderColor: `${tint}57` }]}>
    <LinearGradient colors={[`${tint}75`, `${tint}1f`]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
    <View style={[styles.moodChip, { backgroundColor: tint }]}>
      <Ionicons name={icon} size={13} color="#0a0b0e" />
    </View>
    <Text style={styles.moodLabel}>{label}</Text>
    <Text style={styles.moodNote} numberOfLines={1}>{note}</Text>
  </Tactile>
);

// ─── Styles ────────────────────────────────────────────────────────────────

export const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  fill: { width: '100%', height: '100%' },
  disabled: { opacity: 0.4 },
  eyebrow: { fontWeight: '600', fontSize: 13, color: Signal.inkMuted, marginBottom: 4 },
  sectionHeading: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Space.md,
    paddingHorizontal: Space.lg - 4,
    marginTop: Space.xl + 4,
    marginBottom: Space.sm,
  },
  h2: { fontWeight: '700', fontSize: 22, color: Signal.ink },
  sectionSub: { fontWeight: '400', fontSize: 13, color: Signal.inkMuted, marginTop: 2 },
  shelfLink: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingVertical: 6, paddingLeft: 10 },
  shelfLinkText: { fontWeight: '600', fontSize: 13, color: Signal.inkSoft },

  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    height: 44,
    paddingHorizontal: 18,
    borderRadius: Radius.pill,
  },
  btnCompact: { height: 36, paddingHorizontal: 14 },
  btnIconOnly: { width: 44, paddingHorizontal: 0 },
  btnPrimary: {
    backgroundColor: Signal.wave,
    shadowColor: Signal.wave,
    shadowOpacity: 0.45,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  btnGlass: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Glass.hairlineStrong,
  },
  btnText: { fontWeight: '600', fontSize: 15 },


  plate: {
    position: 'absolute',
    borderRadius: Radius.panel,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.14)',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  plateFront: { backgroundColor: 'rgba(255, 255, 255, 0.13)', opacity: 0.9 },
  cover: {
    overflow: 'hidden',
    borderRadius: Radius.panel,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.22)',
    backgroundColor: Signal.bgSubtle,
    transform: [{ rotate: '-2deg' }],
    shadowColor: '#000',
    shadowOpacity: 0.7,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 22 },
    elevation: 16,
  },
  coverPlay: {
    position: 'absolute',
    right: 10,
    bottom: 10,
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Signal.wave,
  },
  playNudge: { marginLeft: 2 },

  quick: {
    width: 244,
    height: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingRight: 10,
    overflow: 'hidden',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },
  quickArt: { width: 64, height: 64 },
  quickCopy: { flex: 1, minWidth: 0 },
  quickTitle: { fontWeight: '600', fontSize: 14, color: Signal.ink },
  quickSub: { fontWeight: '400', fontSize: 12, color: Signal.inkMuted, marginTop: 2 },
  quickPlay: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  currentBorder: { borderColor: 'rgba(217, 230, 106, 0.6)', borderWidth: 1 },

  tileArt: {
    overflow: 'hidden',
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Glass.hairlineStrong,
    backgroundColor: Signal.bgSubtle,
    shadowColor: '#000',
    shadowOpacity: 0.6,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 14 },
    elevation: 8,
  },
  tilePlay: {
    position: 'absolute',
    right: 10,
    bottom: 10,
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Signal.wave,
  },
  tileMeta: { flexDirection: 'row', alignItems: 'flex-start', gap: 4, marginTop: 10 },
  tileEyebrow: { fontWeight: '500', fontSize: 12, color: Signal.inkMuted, marginBottom: 2 },
  tileTitle: { fontWeight: '600', fontSize: 14, color: Signal.ink },
  tileSub: { fontWeight: '400', fontSize: 12, color: Signal.inkMuted, marginTop: 2 },
  tileAction: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },

  chartRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: Space.sm,
    borderRadius: 14,
  },
  chartRowCurrent: { backgroundColor: 'rgba(217, 230, 106, 0.07)' },
  chartMain: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, paddingLeft: 6, paddingRight: 6 },
  rank: { width: 26, fontWeight: '600', fontSize: 15, color: Signal.inkFaint, textAlign: 'right', fontVariant: ['tabular-nums'] },
  chartArt: { width: 48, height: 48, borderRadius: 10, overflow: 'hidden', backgroundColor: Signal.bgSubtle },
  chartPlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0, 0, 0, 0.32)' },
  chartTitle: { fontWeight: '600', fontSize: 15, color: Signal.ink },
  chartSub: { fontWeight: '400', fontSize: 12.5, color: Signal.inkMuted, marginTop: 2 },
  chartAction: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },

  mood: {
    minHeight: 96,
    justifyContent: 'flex-end',
    padding: 14,
    overflow: 'hidden',
    borderRadius: 18,
    borderWidth: 1,
  },
  moodChip: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  moodLabel: { fontWeight: '700', fontSize: 17, color: Signal.ink },
  moodNote: { fontWeight: '400', fontSize: 12, color: 'rgba(244, 241, 234, 0.72)', marginTop: 2 },
});
