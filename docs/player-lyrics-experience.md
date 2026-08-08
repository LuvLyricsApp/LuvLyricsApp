# Player & Lyrics Experience

This document is the source of truth for the in-app player and lyrics reader. The previous standalone Now Playing surface is intentionally gone: `MiniPlayer.tsx` owns both player presentations and the lyrics experience.

## Player surfaces

- **Classic Bar** and the bottom-centred **Dynamic Island** are both docked above the tab bar and device inset.
- Lyrics expand upward from the docked player. Playback, seeking, and action controls stay available at the bottom; opening lyrics must not navigate to a new player screen.
- The Dynamic Island uses one open/close transition rather than separate tray and full-screen stages. It is opaque and has the same animated artwork treatment as the Classic Bar.
- Show the player on the normal app routes, including Settings. Luvs is the intentional exception.
- Settings is a hidden route within the tab navigator. The normal navigation bar remains visible while Settings is open.

## Artwork colour flow

`ArtworkFlowBackground.tsx` uses Skia to render a GPU colour field behind both player presentations.

1. A native palette is extracted locally from the current cover art.
2. The outgoing palette remains visible while the next cover is being analysed; do not clear it or show a generic fallback colour.
3. Once the next palette is ready, the renderer cross-fades straight from the outgoing palette to the incoming palette.
4. Large blurred colour blobs drift at a calm but visible pace on a measured canvas. Blur is derived from the actual layout size so it does not look like a static, full-screen cover blur.
5. Reduced-motion mode keeps the palette stable while preserving its track-specific colours.

## Timed lyric reader

`SynchronizedLyrics.tsx` keeps playback tracking and motion off the React render path where possible.

- The player publishes shared position and duration values. The active timestamp is found with binary search instead of scanning every lyric line.
- Each lyric row reports its measured height. Its midpoint, not its top edge, is used to calculate the reader target.
- The active line is centred at 50% of the lyric viewport. A large initial jump or seek is immediate; ordinary active-line changes glide with a 460 ms cubic-bezier animation on the UI thread.
- The scroll command only runs when the active-line destination changes, avoiding repeated native scroll work for every position tick.
- The focused lyric changes colour, opacity, and a small vertical settle only. Font family, weight, and size stay fixed so the highlighted line never looks larger. Past and upcoming lines are dimmed without changing layout geometry.

## Scrubber and titles

- `TimelineScrubber.tsx` uses optimistic seek feedback with no floating thumb. Its track grows only slightly while dragging (3.5 px to 6 px).
- Long song titles use a one-way marquee: wait 3.5 seconds, scroll left once, reset, then wait again. The same behaviour is shared by the Classic Bar and both Dynamic Island states.

## Verification

For code changes in this area, run:

```powershell
node_modules\.bin\tsc.cmd --noEmit
git diff --check
```

Then check a physical Android device for: direct palette transitions between two different covers, lyrics centred at the active line, drag thickness, long-title reset timing, player visibility in Settings, and tab-bar clearance.
