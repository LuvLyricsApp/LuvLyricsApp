# Plan Review Log: Native LuvLyrics frontend — Local tab + shell restyle
Act 1 (grill) complete — plan locked with the user. MAX_ROUNDS=5.

## Round 1 — Codex

**Findings**
1. `PLAN.md` turns long-press into a `LibraryBottomSheet` equivalent [PLAN.md](/C:/Users/nithy/Desktop/apps/LuvLyricsApp/LuvLyrics/.claude/worktrees/compose-player/PLAN.md:53), but the repo still treats Room as a separate staging DB and explicitly forbids Kotlin writes to live `lyricflow.db` before cutover [STATE.md](/C:/Users/nithy/Desktop/apps/LuvLyricsApp/LuvLyrics/.claude/worktrees/compose-player/.planning/STATE.md:80) [AGENTS.md](/C:/Users/nithy/Desktop/apps/LuvLyricsApp/LuvLyrics/.claude/worktrees/compose-player/AGENTS.md:21). Most legacy bottom-sheet actions are mutating, and Compose currently only exposes `setLiked` as a Room write path [LibraryRepository.kt](/C:/Users/nithy/Desktop/apps/LuvLyricsApp/LuvLyrics/.claude/worktrees/compose-player/android/app/src/main/java/com/lyricflow/app/data/LibraryRepository.kt:42). Fix: keep Local read-only this pass or route every mutation through the existing legacy/live-DB path until Phase 8.

2. The `RecentlyPlayedGrid` plan is materially incomplete: native playback never persists `last_played` or `play_count`, so “recently played” will freeze at migrated values after the first Compose session [PLAN.md](/C:/Users/nithy/Desktop/apps/LuvLyricsApp/LuvLyrics/.claude/worktrees/compose-player/PLAN.md:48) [PLAN.md](/C:/Users/nithy/Desktop/apps/LuvLyricsApp/LuvLyrics/.claude/worktrees/compose-player/PLAN.md:98). Room has the columns [LibraryEntities.kt](/C:/Users/nithy/Desktop/apps/LuvLyricsApp/LuvLyrics/.claude/worktrees/compose-player/android/app/src/main/java/com/lyricflow/app/data/LibraryEntities.kt:33), but `NativePlaybackController` only updates in-memory queue/current-song state [NativePlaybackController.kt](/C:/Users/nithy/Desktop/apps/LuvLyricsApp/LuvLyrics/.claude/worktrees/compose-player/android/app/src/main/java/com/lyricflow/app/player/NativePlaybackController.kt:61) [NativePlaybackController.kt](/C:/Users/nithy/Desktop/apps/LuvLyricsApp/LuvLyrics/.claude/worktrees/compose-player/android/app/src/main/java/com/lyricflow/app/player/NativePlaybackController.kt:118), while RN explicitly writes play stats on playback [songsStore.ts](/C:/Users/nithy/Desktop/apps/LuvLyricsApp/LuvLyrics/.claude/worktrees/compose-player/src/store/songsStore.ts:186). Fix: add a native play-history write path on confirmed play/track advance before shipping the recents header.

3. The centre mic is not a harmless “may ship inert” detail; under the current architecture it is broken on the default Compose cold start [PLAN.md](/C:/Users/nithy/Desktop/apps/LuvLyricsApp/LuvLyrics/.claude/worktrees/compose-player/PLAN.md:37) [PLAN.md](/C:/Users/nithy/Desktop/apps/LuvLyricsApp/LuvLyrics/.claude/worktrees/compose-player/PLAN.md:101). `VoiceInputModule` requires `appContext.reactContext` [VoiceInputModule.kt](/C:/Users/nithy/Desktop/apps/LuvLyricsApp/LuvLyrics/.claude/worktrees/compose-player/android/app/src/main/java/com/lyricflow/app/modules/VoiceInputModule.kt:32), and the project state says Compose-first launch skips Expo and only lazy-inits RN when legacy opens [STATE.md](/C:/Users/nithy/Desktop/apps/LuvLyricsApp/LuvLyrics/.claude/worktrees/compose-player/.planning/STATE.md:83). Fix: hide/disable the mic in Compose until you have a Compose-native speech path or an explicit RN bootstrap.

4. The downloader icon/badge is underspecified to the point of non-implementable in this pass [PLAN.md](/C:/Users/nithy/Desktop/apps/LuvLyricsApp/LuvLyrics/.claude/worktrees/compose-player/PLAN.md:45). In RN, the badge comes from `useDownloadQueueStore` and the action navigates to the hidden `AudioDownloader` route [LibraryScreen.tsx](/C:/Users/nithy/Desktop/apps/LuvLyricsApp/LuvLyrics/.claude/worktrees/compose-player/src/screens/LibraryScreen.tsx:166) [LibraryScreen.tsx](/C:/Users/nithy/Desktop/apps/LuvLyricsApp/LuvLyrics/.claude/worktrees/compose-player/src/screens/LibraryScreen.tsx:448); the Compose shell only has its own settings panel and placeholder tabs [LyricFlowComposeApp.kt](/C:/Users/nithy/Desktop/apps/LuvLyricsApp/LuvLyrics/.claude/worktrees/compose-player/android/app/src/main/java/com/lyricflow/app/compose/LyricFlowComposeApp.kt:122) [LyricFlowComposeApp.kt](/C:/Users/nithy/Desktop/apps/LuvLyricsApp/LuvLyrics/.claude/worktrees/compose-player/android/app/src/main/java/com/lyricflow/app/compose/LyricFlowComposeApp.kt:176). Fix: either build a native download status model plus a Compose downloader destination, or drop the badge/action from this pass.

5. The tab-bar plan ignores the shell chrome/inset structure that already exists, so a naive implementation will double-stack headers and miscompute bottom spacing [PLAN.md](/C:/Users/nithy/Desktop/apps/LuvLyricsApp/LuvLyrics/.claude/worktrees/compose-player/PLAN.md:33) [PLAN.md](/C:/Users/nithy/Desktop/apps/LuvLyricsApp/LuvLyrics/.claude/worktrees/compose-player/PLAN.md:45). The root shell currently applies `safeDrawingPadding()`, renders a global `ShellTopBar`, keeps `PlayerDock` above the nav, and adds `navigationBarsPadding()` to the bar [LyricFlowComposeApp.kt](/C:/Users/nithy/Desktop/apps/LuvLyricsApp/LuvLyrics/.claude/worktrees/compose-player/android/app/src/main/java/com/lyricflow/app/compose/LyricFlowComposeApp.kt:119) [LyricFlowComposeApp.kt](/C:/Users/nithy/Desktop/apps/LuvLyricsApp/LuvLyrics/.claude/worktrees/compose-player/android/app/src/main/java/com/lyricflow/app/compose/LyricFlowComposeApp.kt:122) [LyricFlowComposeApp.kt](/C:/Users/nithy/Desktop/apps/LuvLyricsApp/LuvLyrics/.claude/worktrees/compose-player/android/app/src/main/java/com/lyricflow/app/compose/LyricFlowComposeApp.kt:152) [LyricFlowComposeApp.kt](/C:/Users/nithy/Desktop/apps/LuvLyricsApp/LuvLyrics/.claude/worktrees/compose-player/android/app/src/main/java/com/lyricflow/app/compose/LyricFlowComposeApp.kt:154). Fix: refactor shell chrome first so Local owns its top bar and the custom tab bar owns bottom insets explicitly.

6. “Pull-to-refresh” has no defined source of truth in the Compose Local architecture [PLAN.md](/C:/Users/nithy/Desktop/apps/LuvLyricsApp/LuvLyrics/.claude/worktrees/compose-player/PLAN.md:54). `LocalLibraryScreen` is backed by reactive Room flows and search queries [LibraryScreens.kt](/C:/Users/nithy/Desktop/apps/LuvLyricsApp/LuvLyrics/.claude/worktrees/compose-player/android/app/src/main/java/com/lyricflow/app/compose/LibraryScreens.kt:61) [LibraryRepository.kt](/C:/Users/nithy/Desktop/apps/LuvLyricsApp/LuvLyrics/.claude/worktrees/compose-player/android/app/src/main/java/com/lyricflow/app/data/LibraryRepository.kt:14) [LibraryRepository.kt](/C:/Users/nithy/Desktop/apps/LuvLyricsApp/LuvLyrics/.claude/worktrees/compose-player/android/app/src/main/java/com/lyricflow/app/data/LibraryRepository.kt:37), while the live library is still owned by RN [STATE.md](/C:/Users/nithy/Desktop/apps/LuvLyricsApp/LuvLyrics/.claude/worktrees/compose-player/.planning/STATE.md:80). Fix: define refresh as an explicit remigration/rescan operation with locking and user-visible status, or remove it from scope.

7. The verification section is too weak for the exact failure modes this plan introduces [PLAN.md](/C:/Users/nithy/Desktop/apps/LuvLyricsApp/LuvLyrics/.claude/worktrees/compose-player/PLAN.md:59). “Library renders and a tap plays” does not validate queue-context correctness, recents freshness, header-action behavior, tab-bar/player overlap, or the one-DB-writer constraints. Fix: add a device checklist for queue order from grid/search/list, recents update after one play, every enabled header action, and shell inset/player overlap on gesture-nav devices.

VERDICT: REVISE

### Claude's response

Accepted all seven. They are specific and repo-grounded; two would have shipped as real bugs.

- **(1)+(2) merged into one fix.** Codex is right that Local must not mutate, and
  right that recents freeze without a native play-stats write. These interact in a
  way neither finding states on its own: `PAYLOAD_VERSION` was just bumped to 4,
  which sets `fullCopy = true`, and `insertAll` is `OnConflictStrategy.REPLACE` —
  so a full re-copy **overwrites Room rows from legacy**. Any Compose-side write
  (`setLiked`, play stats) is silently reverted on the next payload bump. Fix is
  therefore not "don't write" but "make re-copy preserve locally-mutated columns":
  `is_liked`, `play_count`, `last_played`. Local stays read-only for edit/delete.
- **(3) Mic dropped**, not deferred — `VoiceInputModule` needs `reactContext` and
  Compose-first launch never initialises Expo. An inert control is worse than none.
- **(4) Downloader badge dropped** from this pass. No native download-queue model
  exists and building one is a separate piece.
- **(5) Accepted, and it is the ordering constraint.** The shell's global
  `ShellTopBar` + `safeDrawingPadding()` would double-stack against Local's brand
  row. Shell chrome refactor now happens *first*, before Local is built.
- **(6) Pull-to-refresh removed.** Room flows are already reactive; there is
  nothing to pull. Re-scan is a separate explicit operation.
- **(7) Verification checklist expanded** to cover queue-context per entry point,
  recents freshness after one play, insets/overlap, and the write-preservation case.

Nothing rejected.

## Round 2 — Codex

Most of the earlier blockers are addressed: the revised plan now constrains Compose writes, removes the dead mic, drops the unsupported downloader badge, removes pull-to-refresh, and adds a real device verification checklist.

- `Play stats are still specified too loosely.` The plan writes them on “confirmed playback start” [PLAN.md](/C:/Users/nithy/Desktop/apps/LuvLyricsApp/LuvLyrics/.claude/worktrees/compose-player/PLAN.md:61) and only says “likely first transition to `isPlaying`” as a risk [PLAN.md](/C:/Users/nithy/Desktop/apps/LuvLyricsApp/LuvLyrics/.claude/worktrees/compose-player/PLAN.md:144), but RN currently waits 5 seconds before counting a play [songsStore.ts](/C:/Users/nithy/Desktop/apps/LuvLyricsApp/LuvLyrics/.claude/worktrees/compose-player/src/store/songsStore.ts:186). Counting on first `isPlaying` will overcount accidental taps, pause/resume, and seek-driven restarts. Fix: persist once per media id only after at least 5 seconds of continuous playback, or track completion if shorter.
- `The shell chrome refactor still risks breaking every non-Local tab.` The plan removes the root shell inset/top bar [PLAN.md](/C:/Users/nithy/Desktop/apps/LuvLyricsApp/LuvLyrics/.claude/worktrees/compose-player/PLAN.md:36), but the current placeholder tabs still rely on shell-level padding and have no replacement top inset of their own [LyricFlowComposeApp.kt](/C:/Users/nithy/Desktop/apps/LuvLyricsApp/LuvLyrics/.claude/worktrees/compose-player/android/app/src/main/java/com/lyricflow/app/compose/LyricFlowComposeApp.kt:258), while the root shell currently supplies `safeDrawingPadding()` [LyricFlowComposeApp.kt](/C:/Users/nithy/Desktop/apps/LuvLyricsApp/LuvLyrics/.claude/worktrees/compose-player/android/app/src/main/java/com/lyricflow/app/compose/LyricFlowComposeApp.kt:119). Fix: define per-tab top-inset/header ownership for Home, Playlists, Luvs, and Search before removing the root padding.
- `The long-press "queue action" is still undefined against the current native APIs.` The plan promises song info plus play/queue actions [PLAN.md](/C:/Users/nithy/Desktop/apps/LuvLyricsApp/LuvLyrics/.claude/worktrees/compose-player/PLAN.md:85), but the native controller currently exposes current-queue state and skip/select-in-queue operations, not an enqueue/add-to-queue mutation path [NativePlaybackController.kt](/C:/Users/nithy/Desktop/apps/LuvLyricsApp/LuvLyrics/.claude/worktrees/compose-player/android/app/src/main/java/com/lyricflow/app/player/NativePlaybackController.kt:61). Fix: either cut queue actions from this pass or add and name the exact native enqueue behavior first.

VERDICT: REVISE

### Claude's response

All three accepted; nothing rejected.

- **Play stats:** correct and concrete — RN waits 5s (`songsStore.ts:186`) before
  counting a play. First-`isPlaying` would overcount accidental taps, pause/resume
  and seek restarts. Now specified as: once per media id, after 5s of continuous
  playback, reset on track change.
- **Shell chrome:** correct that removing root `safeDrawingPadding()` strands
  Home/Playlists/Luvs/Search. Resolved by introducing a shared `ScreenScaffold`
  that owns the top inset — Local passes its own brand row, the others keep a
  default header — so no tab is left without an inset at any point.
- **Queue actions:** correct, there is no enqueue API on the controller. Cut from
  this pass; long-press shows info + play only.

## Round 3 — Codex

Most of the prior problems are addressed. The revised plan now correctly handles shell header ownership, removes the dead mic, drops unsupported queue/download actions, and matches RN’s 5-second play-count rule.

- `Full re-migration still is not a true re-sync.` Step 1 fixes overwritten `is_liked` / `play_count` / `last_played` on surviving songs [PLAN.md](/C:/Users/nithy/Desktop/apps/LuvLyricsApp/LuvLyrics/.claude/worktrees/compose-player/PLAN.md:27), but the current migrator still does `REPLACE` inserts only and never deletes/prunes rows missing from legacy during `fullCopy` [LegacyLibraryMigrator.kt](/C:/Users/nithy/Desktop/apps/LuvLyricsApp/LuvLyrics/.claude/worktrees/compose-player/android/app/src/main/java/com/lyricflow/app/data/LegacyLibraryMigrator.kt:73) [LegacyLibraryMigrator.kt](/C:/Users/nithy/Desktop/apps/LuvLyricsApp/LuvLyrics/.claude/worktrees/compose-player/android/app/src/main/java/com/lyricflow/app/data/LegacyLibraryMigrator.kt:108) [LibraryDao.kt](/C:/Users/nithy/Desktop/apps/LuvLyricsApp/LuvLyrics/.claude/worktrees/compose-player/android/app/src/main/java/com/lyricflow/app/data/LibraryDao.kt:14). If RN deletes a song, playlist, or playlist link before a payload bump, Room will keep stale rows and “legacy remains source of truth” becomes false. Fix: make `fullCopy` a transactional table replacement or explicit prune of rows absent from legacy IDs, while merging preserved song-local columns for rows that still exist.

VERDICT: REVISE

### Claude's response

Accepted. Correct and it undermines step 1's own premise: `fullCopy` REPLACE-inserts
only and never prunes, so a song/playlist/link deleted in RN lingers in Room
indefinitely and "legacy is source of truth" stops being true. Step 1 is now split
into (a) preserve native-written columns and (b) prune rows absent from the legacy
id set, both inside the existing transaction — with an explicit note that the prune
must never run outside one, since a partial prune would drop the library. Lyrics
cascade via the existing FK.

## Round 4 — Codex

Two issues remain.

- `Playlist-link pruning is still underspecified against the actual schema.` The plan says to delete stale `playlist_songs` links by “id” [PLAN.md](/C:/Users/nithy/Desktop/apps/LuvLyricsApp/LuvLyrics/.claude/worktrees/compose-player/PLAN.md:41), but `playlist_songs` has no single `id`; it uses the composite key `("playlist_id","song_id")` [LibraryEntities.kt](/C:/Users/nithy/Desktop/apps/LuvLyricsApp/LuvLyrics/.claude/worktrees/compose-player/android/app/src/main/java/com/lyricflow/app/data/LibraryEntities.kt:97). If that ambiguity survives into implementation, stale links can remain or the delete query can be wrong. Fix: specify pruning links by composite `(playlist_id, song_id)` membership, with parent-song/playlist cascades as a secondary cleanup path.
- `The new deletion-propagation fix still is not verified.` The checklist proves likes/play-stats survive re-migration [PLAN.md](/C:/Users/nithy/Desktop/apps/LuvLyricsApp/LuvLyrics/.claude/worktrees/compose-player/PLAN.md:144), but it never tests the new high-risk behavior from step 1b: a song, playlist, or playlist link deleted in RN must disappear from Room after a forced `fullCopy` [PLAN.md](/C:/Users/nithy/Desktop/apps/LuvLyricsApp/LuvLyrics/.claude/worktrees/compose-player/PLAN.md:38). Fix: add an explicit verification step that deletes one song, one playlist membership, and one playlist in legacy/RN, forces re-migration, and confirms Room no longer shows them.

VERDICT: REVISE

### Claude's response

Both accepted.

- **Composite key:** correct — `playlist_songs` has no `id`; its PK is
  `(playlist_id, song_id)`. "Prune by id" was genuinely ambiguous and would have
  produced a wrong DELETE. Now specified per-table, with the explicit note that a
  link can be removed while both parents survive, so parent cascade is a secondary
  path and not sufficient on its own.
- **Verification gap:** correct — step 1b was the riskiest new behaviour and had no
  test. Added an explicit device step covering all three deletion shapes (song,
  membership-only, whole playlist) plus a check that nothing else was pruned.

## Round 5 — Codex

Prior findings are addressed.

- The stale-row sync gap is now explicitly fixed: the plan distinguishes preserved mutable song columns from legacy-owned columns and adds transactional pruning for missing songs, playlists, and `playlist_songs` composite keys [PLAN.md](/C:/Users/nithy/Desktop/apps/LuvLyricsApp/LuvLyrics/.claude/worktrees/compose-player/PLAN.md:27).
- The schema ambiguity is addressed: `playlist_songs` is now correctly specified as composite-key pruning on `(playlist_id, song_id)`, not a fictitious single `id` [PLAN.md](/C:/Users/nithy/Desktop/apps/LuvLyricsApp/LuvLyrics/.claude/worktrees/compose-player/PLAN.md:44).
- The missing verification is addressed: the checklist now explicitly tests deletion propagation for a song, a playlist membership, and a whole playlist after forced `fullCopy` [PLAN.md](/C:/Users/nithy/Desktop/apps/LuvLyricsApp/LuvLyrics/.claude/worktrees/compose-player/PLAN.md:152).

I do not see a new material flaw in the revised plan. It is specific enough to implement against the current repo and it now covers the highest-risk migration and shell edge cases.

VERDICT: APPROVED

---

**Converged: APPROVED after 5 rounds.** 13 findings raised, 13 accepted, 0 rejected.
