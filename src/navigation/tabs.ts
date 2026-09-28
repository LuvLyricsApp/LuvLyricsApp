import { Platform } from 'react-native';

/**
 * The everyday tabs — the only routes with an icon in the bottom bar, in bar
 * order: Stream, Luvs, (mic), Library, then •••. Search, Playlists, the
 * downloader, Settings and the YouTube Music pages are tab routes too (so the
 * bar stays on screen while they're open) but live behind the ••• menu
 * (components/MoreMenu.tsx). Only the full-screen player covers the bar.
 */
export const VISIBLE_TABS: ReadonlySet<string> = new Set(['Stream', 'Luvs', 'Library']);

/**
 * Height the floating pill bar takes above the safe-area inset, including its
 * gap from the edge. Screens pad their scroll content (or full-bleed layout) by
 * this plus `insets.bottom` so nothing ends up under the bar.
 */
export const TAB_BAR_CLEARANCE = 92;

/** The floating pill tab bar's own height (ModernPillTabBar). */
export const PILL_BAR_HEIGHT = 64;
/** Gap between the pill tab bar and the mini player pill floating above it. */
export const PILL_STACK_GAP = 8;

/**
 * Distance from the screen bottom to the pill tab bar's bottom edge. iOS floats
 * it into the home-indicator zone, as Apple Music does; Android has to clear the
 * gesture / 3-button bar, which edge-to-edge draws under.
 */
export const pillBarBottom = (insetBottom: number): number =>
  (Platform.OS === 'ios' ? 12 : insetBottom + 8);

/** Distance from the screen bottom to the pill tab bar's top edge. */
export const pillBarTop = (insetBottom: number): number => pillBarBottom(insetBottom) + PILL_BAR_HEIGHT;

/** Side inset of the pill (92% wide, at most 440pt, centred). */
export const pillBarInset = (screenWidth: number): number =>
  Math.max(8, (screenWidth - Math.min(screenWidth * 0.92, 440)) / 2);

/** The now-playing pill (PillPlayer): its height and where it floats. */
export const PILL_PLAYER_HEIGHT = 54;
/** Distance from the screen bottom to the now-playing pill's bottom edge. */
export const pillPlayerBottom = (insetBottom: number): number => pillBarTop(insetBottom) + PILL_STACK_GAP;
/** Side inset of the now-playing pill: a little narrower than the tab bar. */
export const pillPlayerInset = (screenWidth: number): number => pillBarInset(screenWidth) + 14;

/**
 * Where the closed player sheet rests, so it grows out of (and shrinks back
 * into) the pill: `y` is the pill's top edge from the top of the screen and
 * `scale` makes the sheet exactly as wide as the pill. Without a pill (the
 * classic bar) it rests below the screen at full width.
 */
export const playerSheetRest = (
  screenWidth: number,
  screenHeight: number,
  insetBottom: number,
  pill: boolean,
): { y: number; scale: number } =>
  pill
    ? {
      y: screenHeight - pillPlayerBottom(insetBottom) - PILL_PLAYER_HEIGHT,
      scale: (screenWidth - 2 * pillPlayerInset(screenWidth)) / screenWidth,
    }
    : { y: screenHeight, scale: 1 };
