import { Platform, type TextStyle } from 'react-native';

/**
 * The whole app is set in SF Pro — Apple Music's typeface.
 *
 * - iOS: the system font *is* SF Pro. Leave fontFamily unset and fontWeight
 *   picks the weight; Core Text switches between the Text and Display cuts and
 *   applies Apple's tracking by point size, exactly as in Apple Music.
 * - Android: the bundled SF Pro Text faces (Apple's SF-Pro.pkg, subset). Each
 *   face is its own family, so `installAppleTypography` maps every <Text>'s
 *   final fontWeight to a face and applies Apple's tracking table — styles in
 *   the app only ever say `fontWeight`.
 *   NOTE: Apple's license restricts SF Pro to Apple-platform software — the
 *   bundled OTFs are for personal/internal builds only, not Play Store release.
 */
const isIOS = Platform.OS === 'ios';

export const SF_FACES = {
  regular: 'SF-Pro-Text-Regular',
  semibold: 'SF-Pro-Text-Semibold',
  bold: 'SF-Pro-Text-Bold',
} as const;

export const Fonts = {
  /** Lyrics base face — regular for inactive lines */
  lyrics: isIOS ? 'System' : SF_FACES.regular,
  /** Active lyric line — bold, Apple Music style */
  lyricsActive: isIOS ? 'System' : SF_FACES.bold,
  /** MiniPlayer lyric tray */
  lyricsTray: isIOS ? 'System' : SF_FACES.semibold,
  /** Brand header (LuvLyrics) — SF Pro, heavy black on iOS, bold face on Android */
  brand: isIOS ? 'System' : SF_FACES.bold,
  /**
   * iOS-only weights — required to pick an SF Pro weight from 'System'.
   * Cast is needed: a ternary that can yield `undefined` is not a literal, so
   * the outer `as const` rejects it (TS1355). Typing it as RN's own fontWeight
   * keeps it assignable straight into a Text style.
   */
  lyricsWeight: (isIOS ? '400' : undefined) as TextStyle['fontWeight'],
  lyricsActiveWeight: (isIOS ? '700' : undefined) as TextStyle['fontWeight'],
  lyricsTrayWeight: (isIOS ? '600' : undefined) as TextStyle['fontWeight'],
  brandWeight: (isIOS ? '900' : undefined) as TextStyle['fontWeight'],
} as const;

/** SF Pro faces for expo-font loadAsync (used on Android and web) */
export const SF_FONT_MAP = {
  [SF_FACES.regular]: require('../../assets/fonts/SF-Pro-Text-Regular.otf'),
  [SF_FACES.bold]: require('../../assets/fonts/SF-Pro-Text-Bold.otf'),
  [SF_FACES.semibold]: require('../../assets/fonts/SF-Pro-Text-Semibold.otf'),
} as const;

const NAMED_WEIGHTS: Record<string, number> = {
  normal: 400, regular: 400, bold: 700, ultralight: 100, thin: 200, light: 300,
  medium: 500, semibold: 600, heavy: 800, black: 900, condensed: 400, condensedBold: 700,
};

export const numericWeight = (weight: TextStyle['fontWeight']): number => {
  if (weight == null) return 400;
  if (typeof weight === 'number') return weight;
  const n = Number(weight);
  return Number.isNaN(n) ? NAMED_WEIGHTS[weight] ?? 400 : n;
};

/** Only three faces ship; Medium reads closest as Regular, Heavy/Black as Bold. */
export const sfFaceForWeight = (weight: TextStyle['fontWeight']): string => {
  const w = numericWeight(weight);
  if (w >= 700) return SF_FACES.bold;
  if (w >= 600) return SF_FACES.semibold;
  return SF_FACES.regular;
};

/**
 * Apple's SF Pro tracking (points) by point size — what iOS applies to the
 * system font automatically. Sizes of 20pt and up use the tighter Display
 * values, so the Text cut on Android reads like Display at title sizes.
 */
const SF_TRACKING: ReadonlyArray<readonly [number, number]> = [
  [10, 0.12], [11, 0.07], [12, 0], [13, -0.08], [14, -0.15], [15, -0.24],
  [16, -0.32], [17, -0.43], [20, -0.6], [22, -0.7], [28, -0.8], [34, -1.05],
];

export const sfTracking = (fontSize: number): number => {
  const first = SF_TRACKING[0];
  const last = SF_TRACKING[SF_TRACKING.length - 1];
  if (fontSize <= first[0]) return first[1];
  if (fontSize >= last[0]) return Math.round((last[1] * fontSize / last[0]) * 100) / 100;
  for (let i = 1; i < SF_TRACKING.length; i++) {
    const [s1, t1] = SF_TRACKING[i];
    if (fontSize <= s1) {
      const [s0, t0] = SF_TRACKING[i - 1];
      return Math.round((t0 + (t1 - t0) * (fontSize - s0) / (s1 - s0)) * 100) / 100;
    }
  }
  return last[1];
};

const SF_FACE_NAMES = new Set<string>(Object.values(SF_FACES));
const ANDROID_DEFAULT_FONT_SIZE = 14;

/**
 * The override that puts one flattened Android text style into SF Pro, or null
 * when there is nothing to change or the style names another family on purpose
 * (monospace, icon fonts). A `nested` span inherits family, weight and size
 * from its parent, so it only gets what it sets itself.
 */
export const resolveSfStyle = (style: TextStyle | null | undefined, nested = false): TextStyle | null => {
  const family = style?.fontFamily;
  if (family && !SF_FACE_NAMES.has(family)) return null;
  const override: TextStyle = {};
  if (!family && (!nested || style?.fontWeight != null)) {
    override.fontFamily = sfFaceForWeight(style?.fontWeight);
    // The face carries the weight; a weight on top makes Android fake-bold it.
    override.fontWeight = 'normal';
  }
  if (style?.letterSpacing == null && (!nested || style?.fontSize != null)) {
    override.letterSpacing = sfTracking(style?.fontSize ?? ANDROID_DEFAULT_FONT_SIZE);
  }
  return Object.keys(override).length > 0 ? override : null;
};
