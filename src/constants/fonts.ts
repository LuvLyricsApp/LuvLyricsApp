import { Platform, type TextStyle } from 'react-native';

/**
 * Custom font family keys (must match Font.loadAsync names in App.tsx).
 *
 * Lyrics are Apple Music style: bold active line, regular the rest.
 * - iOS: native SF Pro via the system family ('System') — fontWeight picks the weight.
 * - Android: real SF Pro files (from Apple's official SF-Pro.pkg, subset) — face
 *   names carry weight, so fontWeight must be left undefined there.
 *   NOTE: Apple's license restricts SF Pro to Apple-platform software — the
 *   bundled OTFs are for personal/internal builds only, not Play Store release.
 */
const isIOS = Platform.OS === 'ios';

export const Fonts = {
  interRegular: 'Inter-Regular',
  interMedium: 'Inter-Medium',
  interSemiBold: 'Inter-SemiBold',
  interBold: 'Inter-Bold',
  interExtraBold: 'Inter-ExtraBold',
  interBlack: 'Inter-Black',
  /** Lyrics base face — regular for inactive lines */
  lyrics: isIOS ? 'System' : 'SF-Pro-Text-Regular',
  /** Active lyric line — bold, Apple Music style */
  lyricsActive: isIOS ? 'System' : 'SF-Pro-Text-Bold',
  /** MiniPlayer lyric tray */
  lyricsTray: isIOS ? 'System' : 'SF-Pro-Text-Semibold',
  /** Brand header (LuvLyrics) — SF Pro, heavy black on iOS, bold face on Android */
  /**
   * LuvLyrics wordmark — platform default face, weight only. Deliberately NOT
   * SF Pro: the brand reads better in the system font, and it keeps the
   * wordmark free of Apple's font licensing.
   */
  brand: undefined as TextStyle['fontFamily'],
  /**
   * iOS-only weights — required to pick an SF Pro weight from 'System'.
   * Cast is needed: a ternary that can yield `undefined` is not a literal, so
   * the outer `as const` rejects it (TS1355). Typing it as RN's own fontWeight
   * keeps it assignable straight into a Text style.
   */
  lyricsWeight: (isIOS ? '400' : undefined) as TextStyle['fontWeight'],
  lyricsActiveWeight: (isIOS ? '700' : undefined) as TextStyle['fontWeight'],
  lyricsTrayWeight: (isIOS ? '600' : undefined) as TextStyle['fontWeight'],
  /** Both platforms: the system face carries weight via fontWeight, so set it. */
  brandWeight: '900' as TextStyle['fontWeight'],
} as const;

/** Map for expo-font loadAsync */
export const INTER_FONT_MAP = {
  'Inter-Regular': require('../../assets/fonts/Inter-Regular.ttf'),
  'Inter-Medium': require('../../assets/fonts/Inter-Medium.ttf'),
  'Inter-SemiBold': require('../../assets/fonts/Inter-SemiBold.ttf'),
  'Inter-Bold': require('../../assets/fonts/Inter-Bold.ttf'),
  'Inter-ExtraBold': require('../../assets/fonts/Inter-ExtraBold.ttf'),
  'Inter-Black': require('../../assets/fonts/Inter-Black.ttf'),
} as const;

/** SF Pro faces used on Android (subset OTFs, Apple-design licensed) */
export const SF_FONT_MAP = {
  'SF-Pro-Text-Regular': require('../../assets/fonts/SF-Pro-Text-Regular.otf'),
  'SF-Pro-Text-Bold': require('../../assets/fonts/SF-Pro-Text-Bold.otf'),
  'SF-Pro-Text-Semibold': require('../../assets/fonts/SF-Pro-Text-Semibold.otf'),
} as const;
