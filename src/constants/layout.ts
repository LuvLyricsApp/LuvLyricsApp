/**
 * Shared heights for the persistent bottom chrome.
 *
 * These used to be typed out separately in CustomTabBar, MiniPlayer and every
 * screen that had to float something above them. When they drifted, content ended
 * up underneath the bars — the playlist scroll-to-top button sat fully behind the
 * classic mini player because it cleared 80pt against a stack that is 134pt tall.
 *
 * All of these exclude the safe-area inset; add `insets.bottom` at the use site.
 */

/** CustomTabBar / ModernPillTabBar content height. */
export const TAB_BAR_HEIGHT = 64;

/** Collapsed height of the classic (bar-style) mini player. */
export const CLASSIC_MINI_PLAYER_HEIGHT = 70;

/**
 * Total bottom chrome to clear, given what is actually on screen.
 *
 * @param insetBottom  Safe-area inset from `useSafeAreaInsets().bottom`.
 * @param hasTabBar    Whether the bottom tab bar is rendered on this route.
 * @param hasClassicBar Whether the classic mini player is rendered (bar style with a loaded song).
 */
export const bottomChromeHeight = (
  insetBottom: number,
  hasTabBar: boolean,
  hasClassicBar: boolean
): number =>
  insetBottom +
  (hasTabBar ? TAB_BAR_HEIGHT : 0) +
  (hasClassicBar ? CLASSIC_MINI_PLAYER_HEIGHT : 0);
