export const DarkColors = {
  background: '#020A16',
  card: '#06152B',
  cardHover: '#0B1F3A',
  textPrimary: '#F7F4EC',
  textSecondary: '#AAB4C0',
  textMuted: '#6F7A86',
  primary: '#2F8CFF',
  accent: '#2F8CFF',
  accentSoft: '#63B7FF',
  lyricHighlight: '#7ED957',
  lyricHighlightSoft: '#A7E86F',
  divider: '#112A4A',
  border: '#112A4A',
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
  primary: '#2F8CFF',
  accent: '#2F8CFF',
  accentSoft: '#63B7FF',
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

export type ColorKey = keyof typeof DarkColors;
export type AppColors = { [K in ColorKey]: string };
