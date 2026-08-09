# Plan: Native LuvLyrics frontend — Local tab (legacy UI) + shell restyle
_Locked via grill — by Claude + peterish8. Revised after Codex round 1._

## Goal

The Compose app currently looks nothing like LuvLyrics: it opens on a placeholder
"Native shell first" card, uses a Material orange/teal colour scheme, and a
Material `NavigationBar` with text labels. The user's actual app is pure black
with a monochrome white accent, an artwork-driven ambient header, a
"LuvLyrics" wordmark row, a recently-played art grid, and a solid-black
icons-only tab bar.

This pass makes the native app read as LuvLyrics again: restyle the shell to the
legacy palette and tab bar, and build the **Local** tab as a faithful Compose
port of the legacy Home screen (`src/screens/LibraryScreen.tsx`) against the
already-migrated Room library (1052 songs, parity verified on device).

Tab meaning changes deliberately from legacy: **Home becomes streaming**
(Echo-style, `:innertube`) and **Local carries the legacy Home UI**. Home is
pass 2 in this same branch; stream playback is a separate later piece.

## Approach

Ordered. Steps 1 and 2 are prerequisites — building Local first would double-stack
chrome and silently lose writes.

1. **Make `fullCopy` a true re-sync.** Two defects, fixed together inside the
   existing migration transaction:

   a. *Native writes are silently reverted.* `PAYLOAD_VERSION` is now 4, which
      forces `fullCopy = true`, and `insertAll` is `OnConflictStrategy.REPLACE`,
      so a re-copy overwrites Room rows from legacy. Before anything writes from
      Compose, preserve the locally-mutated columns — `is_liked`, `play_count`,
      `last_played` — by reading the existing Room row and carrying those three
      forward instead of taking legacy's. Every other column still comes from
      legacy, so parity is unaffected.

   b. *Deletions never propagate.* `fullCopy` only ever REPLACE-inserts; it never
      removes rows absent from legacy. If RN deletes a song, playlist or playlist
      link, Room keeps a stale row forever and "legacy is source of truth"
      becomes false. Within the same transaction, prune:
      - `songs` — delete where `id` is not in the legacy song-id set.
      - `playlists` — delete where `id` is not in the legacy playlist-id set.
      - `playlist_songs` — this table has **no single `id`**; its primary key is
        the composite `(playlist_id, song_id)`. Prune by composite membership:
        delete links whose `(playlist_id, song_id)` pair is absent from the
        legacy link set. Cascades from a deleted parent song or playlist are a
        secondary cleanup path, not the primary one — a link can be removed while
        both its parents still exist.
      Lyrics cascade via the existing foreign key on `song_id`.

   Both must land before step 5 writes anything, and (b) must not run outside a
   transaction — a partial prune would drop the library.

2. **Refactor shell chrome via a shared `ScreenScaffold`.** The root shell
   currently applies `safeDrawingPadding()`, renders a global `ShellTopBar`, and
   puts `navigationBarsPadding()` on the nav bar. Local needs its own brand row,
   but simply deleting the root padding would strand Home, Playlists, Luvs and
   Search, which have no top inset of their own. So introduce one
   `ScreenScaffold` that owns the top inset and takes a header slot: Local passes
   its brand row, the remaining tabs pass the existing default header. Only then
   remove the root `safeDrawingPadding()` and global `ShellTopBar`. Every tab has
   an owner at every point in the refactor. The custom tab bar owns the bottom
   inset explicitly; `PlayerDock` stays docked directly above it.

3. **Theme** — replace `ShellSurfaceTheme`'s orange/teal `darkColorScheme` with
   the legacy tokens from `src/constants/colors.ts`: background `#000000`,
   card `#0A0A0A`, cardHover `#1A1A1A`, textPrimary `#EDEDED`,
   textSecondary `#A1A1A1`, textMuted `#6E6E6E`, accent `#FFFFFF`,
   divider `#1F1F1F`, border `#262626`, success `#7ED957`, error `#FF3B30`.
   Monochrome accent is deliberate — the old navy surfaces were removed because
   they leaked a blue cast through every screen.

4. **Tab bar** — port `CustomTabBar`: solid `#000000` (not a blur — list content
   read through it and collided with the icons), `TAB_BAR_HEIGHT` 64dp plus the
   navigation-bar inset as *padding* (edge-to-edge draws under the system bars,
   so growing height alone re-centres icons into the gesture pill), **icons
   only, no labels**. Tabs: Home · Local · Playlists · Luvs · Search. Settings
   and AudioDownloader never occupy a slot. **No centre mic this pass** —
   `VoiceInputModule` requires `appContext.reactContext` and Compose-first launch
   never initialises Expo, so the control would be dead. Layout leaves room for
   it.

5. **Native play-history writes.** Without this the recents grid freezes at
   migrated values forever. Mirror RN exactly (`songsStore.ts:186`): a play
   counts **only after 5 seconds of continuous playback**, and **at most once per
   media id** per load. Counting on the first `isPlaying` would overcount
   accidental taps, every pause/resume, and seek-driven restarts. The 5s timer
   resets on track change and does not re-arm after a seek within the same
   track. On qualifying, increment `play_count` and set `last_played` in Room.
   Safe only after step 1.

6. **Local tab** — Compose port of `LibraryScreen`, top to bottom:
   - Ambient artwork wash behind the header, driven by the current song's
     palette. Reuse the extraction in `compose/player/ArtworkFlow.kt`; do not add
     a second palette pipeline.
   - Brand row: "LuvLyrics" wordmark (platform font, weight only — deliberately
     not SF Pro, for licensing) + a settings action. **No downloader icon or
     badge this pass** — there is no native download-queue model to source it.
   - Recently-played grid as the list header: horizontal, cards 160dp wide,
     `snapToInterval` 172, gap 12, padding left 26 / right 16, capped at 16,
     `last_played` non-null ordered descending. Card: square art radius 8dp,
     title 14sp/700 letter-spacing -0.2, subtitle 12sp.
   - Song list: `LazyColumn` of rows — height 72dp, horizontal padding 12dp,
     corner 12dp, gap 10dp, bottom margin 8dp; art 48dp radius 6dp with
     `#2A2A2A` placeholder; title 15sp/600; artist 13sp; duration 12sp
     tabular-nums; pressed scale 0.98.
   - Tap plays **in list context** via `playFromLibrary(context, songs, song)` so
     next/previous follow what is on screen — this must hold separately for the
     recents grid, the search results and the full list.
   - Sort (recent/title/artist) and search field.
   - **Read-only otherwise.** No edit, rename, delete or hide from Compose while
     RN still owns the live DB. Long-press shows song info and **play only** —
     no "add to queue", because `NativePlaybackController` exposes queue *state*
     and skip/select, but no enqueue mutation; adding one is its own piece.
     **No pull-to-refresh** — Room flows are already reactive and there is
     nothing to pull; a re-scan is a separate explicit operation.

7. **Verify on device** — build, `adb install -r`, then the checklist below.

## Key decisions & tradeoffs

- **Home = stream, Local = local library.** Diverges from legacy tab semantics on
  purpose, so streaming has a permanent home without displacing the library UI.
- **Legacy look first, no "improvements".** Colour and opacity carry state; no
  active-lyric scaling, no bold-face swap, no Material tonal surfaces. Legacy
  constants carrying comments about what broke at other values are ported
  verbatim.
- **Local is read-only except play stats and likes.** Keeps the one-writer rule
  intact while still letting recents work. Enabled only because step 1 makes
  those columns survive re-migration.
- **`:innertube` is GPL-3.0.** Adopting it makes LuvLyrics GPL-3 on
  distribution. Accepted: the app already links NewPipeExtractor (also GPL-3).
- **FLAC is out.** Echo's "Lossless" is a curated JSON index on GitHub that
  fabricates a fake `audio/flac` format (hardcoded 1411000 bitrate) pointing at
  files in `EchoMusicApp/Lossless-Database`. That repo returns **404**, so Echo
  itself falls back to Opus. Real ceiling is Opus ~160 kbps.
- **Stream playback deferred.** Echo survives YouTube's churn via 7-client
  rotation, dual resolvers (innertube + NewPipeExtractor), a headless-WebView
  PoToken, HEAD validation before handing URLs to ExoPlayer, guest-session
  rotation on bot detection, and a fast update channel. Tractable, but it needs
  live device debugging and would consume this pass.

## Verification checklist (device)

1. Library renders all 1052 songs; scroll is smooth to the end.
2. Queue context holds from **each** entry point: recents grid, search results,
   full list — next/previous stay within the list that was tapped.
3. Play one song, background and reopen: it appears first in recents, and
   `play_count` incremented.
4. Force a payload re-migration; confirm likes and play stats survive it.
5. **Deletion propagation (step 1b — the highest-risk new behaviour).** In the
   legacy/RN app delete one song, remove one song from a playlist while leaving
   both song and playlist intact, and delete one whole playlist. Force a
   `fullCopy` re-migration. Confirm Room no longer shows any of the three, that
   counts still match legacy, and that nothing else was pruned.
6. Tab bar: icons only, solid black, no label text, correct inset on a
   gesture-nav device; no gap or overlap against the player.
7. Player dock sits directly above the tab bar at collapsed/half/full; the lyric
   sheet does not slide under the tab bar.
8. No double header on Local (shell top bar removed).
9. Lyrics: a line-synced song lands on the right line — validates the REAL
   timestamp fix end to end.

## Risks / open questions

- **Concurrent builds.** Another session builds in the main checkout; all
  `node_modules/*` Android modules share build directories across worktrees, so
  simultaneous Gradle runs fail with corrupt-output errors. Builds must not
  overlap.
- **CMake path length.** `:app:buildCMakeDebug[arm64-v8a]` fails at the deeper
  worktree path. Worked around by copying prebuilt `.so` objects (same config
  hash `2e4u5941`) and excluding the ABI-qualified task. Fragile if the native
  config changes.
- **Ambient header exactness.** Legacy `AuroraHeader` has its own palette and
  fade behaviour; reusing `ArtworkFlow`'s extraction may not match it pixel for
  pixel.
- **Play-stats write timing.** Settled: 5s continuous playback, once per media
  id, timer reset on track change. Remaining unknown is whether a track shorter
  than 5s should ever count — RN has the same gap.

## Out of scope

- Stream playback (`YTPlayerUtils`, PoToken, cipher, two-tier cache).
- The Echo-style Home feed itself (pass 2, same branch).
- Playlists, Luvs, Search, Settings screens (still placeholder after this pass).
- Any FLAC/lossless work.
- Voice mic in Compose; native download-queue model and downloader UI.
- Removing `src/` or any RN code — Phase 8 only.
- Transliteration, Spotify import UI.
