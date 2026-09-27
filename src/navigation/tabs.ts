/**
 * Routes that get an icon in the bottom bar. Settings and the downloader are
 * tab routes too — so the bar stays on screen while they're open, like any
 * pushed page in Spotify or Apple Music — but they have no icon of their own.
 * Only the full-screen player (root stack) covers the bar.
 */
export const VISIBLE_TABS: ReadonlySet<string> = new Set(['Home', 'Stream', 'Luvs', 'Library', 'Search']);

/**
 * Height the floating pill bar takes above the safe-area inset, including its
 * gap from the edge. Screens pad their scroll content (or full-bleed layout) by
 * this plus `insets.bottom` so nothing ends up under the bar.
 */
export const TAB_BAR_CLEARANCE = 92;
