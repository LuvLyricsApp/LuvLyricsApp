/**
 * The everyday tabs — the only routes with an icon in the bottom bar. Search,
 * Library, Downloads, the downloader and Settings are tab routes too (so the
 * bar stays on screen while they're open) but live behind the ••• menu
 * (components/MoreMenu.tsx). Only the full-screen player covers the bar.
 */
export const VISIBLE_TABS: ReadonlySet<string> = new Set(['Home', 'Stream', 'Luvs']);

/**
 * Height the floating pill bar takes above the safe-area inset, including its
 * gap from the edge. Screens pad their scroll content (or full-bleed layout) by
 * this plus `insets.bottom` so nothing ends up under the bar.
 */
export const TAB_BAR_CLEARANCE = 92;
