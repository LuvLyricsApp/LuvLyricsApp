export const DarkColors = {
  background: '#000000',
  // Neutral greys only — the old navy surfaces were the source of the blue cast
  // that leaked into every screen through useThemeColors().
  card: '#0A0A0A',
  cardHover: '#1A1A1A',
  textPrimary: '#EDEDED',
  textSecondary: '#A1A1A1',
  textMuted: '#6E6E6E',
  // Monochrome accent (Vercel-style). On the dark palette the accent has to be
  // white — literal black would vanish against the black surfaces.
  primary: '#FFFFFF',
  accent: '#FFFFFF',
  accentSoft: '#A1A1A1',
  lyricHighlight: '#7ED957',
  lyricHighlightSoft: '#A7E86F',
  divider: '#1F1F1F',
  border: '#262626',
  lyricCurrent: '#7ED957',
  lyricPrevious: 'rgba(255, 255, 255, 0.45)',
  lyricUpcoming: 'rgba(255, 255, 255, 0.60)',
  success: '#7ED957',
  error: '#FF3B30',
  warning: '#FF9500',
  overlay: 'rgba(0, 0, 0, 0.7)',
  backdrop: 'rgba(0, 0, 0, 0.5)',
} as const;

export const LightColors = {
  background: '#F2F2F7',   // iOS system background — less harsh than pure white
  card: '#FFFFFF',
  cardHover: '#EBEBF0',
  textPrimary: '#1A1A1A',
  textSecondary: '#6B6B6B',
  textMuted: '#9B9B9B',
  // Light palette gets the true black accent.
  primary: '#000000',
  accent: '#000000',
  accentSoft: '#666666',
  lyricHighlight: '#1DB954',
  lyricHighlightSoft: '#1ED760',
  divider: '#E5E5EA',      // iOS separator color
  border: '#E5E5EA',
  lyricCurrent: '#1DB954',
  lyricPrevious: 'rgba(26, 26, 26, 0.45)',
  lyricUpcoming: 'rgba(26, 26, 26, 0.60)',
  success: '#34C759',
  error: '#FF3B30',
  warning: '#FF9500',
  overlay: 'rgba(0, 0, 0, 0.45)',
  backdrop: 'rgba(0, 0, 0, 0.25)',
} as const;

// Static alias kept for any file that hasn't migrated yet — points to dark
export const Colors = DarkColors;

// Shared surface tokens. Screens hardcoded these greys inline; import them
// instead so a single edit restyles every panel, button and chip.
export const Surface = {
  base: '#000000',
  raised: '#0A0A0A',
  overlay: '#141414',
  pressed: '#1A1A1A',
  hairline: 'rgba(255,255,255,0.14)',
  hairlineSoft: 'rgba(255,255,255,0.08)',
  fill: 'rgba(255,255,255,0.06)',
  fillStrong: 'rgba(255,255,255,0.11)',
} as const;

// Vercel-style lift: a soft dark shadow, never a coloured glow.
export const Elevation = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.5,
    shadowRadius: 4,
    elevation: 3,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.55,
    shadowRadius: 6,
    elevation: 4,
  },
} as const;

export type ColorKey = keyof typeof DarkColors;
export type AppColors = { [K in ColorKey]: string };
