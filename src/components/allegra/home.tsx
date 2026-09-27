/**
 * Shared building blocks for the Stream and Downloads pages: section heading,
 * primary / glass buttons and the Downloads sleeve. Each maps to Allegra's web
 * original in apps/web/src/styles/app.css:
 *
 *   SectionHeading           → .section-heading
 *   Sleeve                   → .home-stage__sleeve / __cover / __play
 *   PrimaryButton/GlassButton→ .btn-primary / .btn-glass
 *
 * Labels stay in sentence case in the body font. Monospace capitals with wide
 * tracking read as generated UI, not as a music app.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Glass, Radius, Signal, Space } from '../../constants/allegraTheme';
import { Tactile } from './motion';
import Artwork from './Artwork';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

// ─── Type ──────────────────────────────────────────────────────────────────

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

// ─── Styles ────────────────────────────────────────────────────────────────

export const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  disabled: { opacity: 0.4 },
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

});
