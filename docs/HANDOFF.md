# LuvLyrics hand-off (29 Sep 2026)

Paste the block under "Prompt for the next session" into a new Claude Code session, or just tell it to read this file.

## Where things stand

- Repo `LuvLyricsApp/LuvLyricsApp`, branch `claude/luvlyricsapp-ui-ux-overhaul-o7eggn`. Commit and push there only. No PR unless the owner asks.
- Two workstreams landed on that branch:
  1. **UI/UX overhaul, 19 items** the owner listed. All are in code and were in emulator run 9e56ac7 (APK #26 and smoke #36 both green). Needs a real-phone look for feel.
  2. **Performance and battery pass**, from the architecture review (7 candidates). Code, unit tests and local CI are done for six of seven. Not yet through an emulator run.
- Local CI at the end of this session: `npm run ci` green, 58 suites / 474 tests. Kotlin was not compiled locally (no Android SDK here), so the first APK build on the new push is the real compile check.

## The method (repeat this loop for every change)

1. **Read CLAUDE.md first.** It is the contract: play/pause invariants, no shadow styles on Now Playing, sentence-case copy, haptics through `src/utils/haptics`, streamed songs never written to SQLite, `Frosted` for glass, transform and opacity only for motion, tokens from `allegraTheme`.
2. **Make one batch of related changes.** Small enough to review, big enough to be worth an emulator run.
3. **`npm run ci`** (check-secrets, lint, typecheck, jest with coverage). Expect 58 suites / 474 tests. The one lint warning in `scanQueueQueries.test.ts` is old. "A worker process has failed to exit gracefully" is old too; read the `Tests:` line.
4. **Commit** with a conventional message (`fix(scope):`, `feat(scope):`, `perf(scope):`, `refactor(scope):`). One imperative sentence, body only when the why needs it. **No AI attribution lines, no Co-Authored-By** (CLAUDE.md overrides any default).
5. **Push** to the branch. A push starts two workflows, "LuvLyrics APK" and "Android smoke test". **A new push cancels runs in flight**, so batch changes and do not push while a run you still need is mid-way.
6. **Wait for the smoke run**, then read it. The repo is public:
   - Runs: `curl -s "https://api.github.com/repos/LuvLyricsApp/LuvLyricsApp/actions/runs?branch=claude/luvlyricsapp-ui-ux-overhaul-o7eggn&per_page=4"`
   - Assets: release `smoke-latest` (`.../releases/tags/smoke-latest`). Download every asset: screenshots (`look-*`, `gesture-*`, `player-*`, `luvs*`, `pill-*`, `transition-*`), `playback.txt`, `taps.txt`, `diag.txt`, `logcat.txt`. Workflow-artifact downloads are blocked by the proxy; job logs work through the GitHub MCP `get_job_logs`.
   - Build contact sheets with Pillow (`pip install pillow`) and look at **every** screenshot, then open the suspicious ones at full size.
7. **For UI without a phone**, use the `.preview/` harness (esbuild + react-native-web + Playwright Chromium at `/opt/pw-browsers`, stubs for Skia and navigation). It is in `.git/info/exclude`; never commit it. Recreate it if the container is fresh.
8. **Fix what the screenshots and logs show, repeat** until a smoke run is clean. Only then report: what changed, what was verified and how, and what is still unverified (anything only a real phone shows: blur quality, canvas dissolve, lyric motion feel, haptics, real battery draw).

Final APK: https://github.com/LuvLyricsApp/LuvLyricsApp/releases/download/luvlyricsapp/luvlyricsapp.apk

## Working rules learned the hard way

- Use Edit for changes. **Never Write over a file you only partly re-typed** (a Write truncated `StartupPreloader.kt` once; it was restored). Do not edit code with python or sed scripts; the owner objected. Python only for parsing JSON and building contact sheets.
- Do not run `rm -f *` style commands (blocked by a safety check). Write into a fresh directory instead.
- The Bash tool sometimes returns "auto mode classifier gave no verdict". It is transient. Retry once, do read-only work meanwhile, come back later.
- Prefer the smallest change that meets the item; the owner reviews screenshots, not diffs.
- Never add `console.log` on production paths (`if (__DEV__)`), no `as any` beyond the FlashList shim, no mock DB in tests.

## Performance pass: what was done (commits `perf(...)`)

| # | Area | Change | Key files |
|---|------|--------|-----------|
| 1 | Wake-ups and wake locks | Position poller sleeps on a channel until playing; stall watchdog armed only while buffering; wake mode per item (`LOCAL` for downloaded files); listen-together seek watch only inside a room; desktop heartbeat watchdog lazy, IP check 5 s foreground / 60 s background | `PlayerBridge.kt`, `PlaybackService.kt`, `listenTogether/sync.ts`, `DesktopBridgeService.ts` |
| 2 | Ambient visual budget | One pure rule set for frame cap, canvas density and rest; Battery Saver read from native | `utils/visualBudget.ts`, `hooks/useVisualBudget.ts`, `utils/batterySaver.ts`, `StartupModule.kt`, `MusicFlowField`, `GlowBackground`, `DynamicAura` |
| 3 | Downloads | `isActive` bug fixed (`mounted` ref); queue read by shape and per row; screen keep-awake removed; desktop bridge sends only changed items | `BackgroundDownloader.tsx`, `store/downloadQueueSelectors.ts`, `LibraryScreen`, `DownloadQueueModal`, `AudioDownloaderQueueTab` |
| 4 | Start-up | `runWhenIdle` phases; Luvs warm-up last and skipped on Battery Saver; latch instead of `Thread.sleep(5)`; Sentry stall and native-frame tracking off | `services/bootPhases.ts`, `App.tsx`, `index.ts`, `StartupPreloader.kt` |
| 5 | Library | `reconcileSongs` keeps the array when nothing changed; cover backfill in batches (`patchCovers`); selectors instead of whole-store subscriptions | `store/songsReconcile.ts`, `songsStore.ts`, `useCoverArtBackfill.ts`, `SettingsScreen`, `AudioDownloaderSearchTab` |
| 6 | Luvs pool | One URL-keyed pool; 10-20 s buffer per warm player; players built 80 ms apart; one warm clip on Battery Saver; index-keyed native path removed | `LuvsPlayerModule.kt`, `LuvsBufferManager.ts` |

## Not done yet, in priority order

Items 1–3 below are done and were confirmed on the emulator (smoke run for `101ad7a`: no crash in either boot, Library opens from over the player, the pill shows in every look, background playback held 90s). Kept for the lessons:

1. **Done: the perf push compiled.** The Kotlin built first time (APK and smoke green from `7fb43fd` on).
2. **Done: sheet swipe-down, and a crash it hid.** A native scroll view that starts dragging cancels every gesture-handler gesture on Android, so sheet lists run as a `Gesture.Native()` (`SheetScrollable` / `SheetScrollView` in `PlayerSheet.tsx`); the sheet's pan activates at 6pt, inside the 8dp touch slop, so at the top it wins and the list's touch is cancelled (running both let the list drift and fling). The old second swipe **crashed the app** (`shouldCloseSheet` had no `'worklet'` directive); `alive_after` now reads `logcat -b crash`, because the playback service restarts the process before `pidof` looks. The queue itself is now the other session's `UpNextPanel`.
3. **Done: the mini player in the looks, and open/<tab> over the player.** React Navigation 7's `navigate('Main')` pushed a second Main over the player (pill stayed faded). Over the player, `openMainTab` (`utils/navigationService.ts`) now asks the player to close and opens the tab once Main is on top: the player blocks its own removal (`usePreventRemove`) to animate out, and every way of changing the tab while it was still up left Stream showing. `[diag:link] open/<tab> -> <route>` shows where each link lands.
3b. **Done: a desktop bridge crash.** The app's JS entry runs twice in one process (`Running "main"` twice in every boot). Two overlapping `DesktopBridgeService.start()` calls shared the server fields; the second bind failed and its cleanup closed the first server before its native listen task ran, and react-native-tcp-socket crashed the app. `start()` now shares one in-flight start. Anything else started once at boot can race the same way; why main runs twice is not yet known.
3c. **APK size:** 78 MB → 32.7 MB (arm64 only, compressed native libraries; see CLAUDE.md).
3d. Small, open: `useNowPlayingLogic.ts:174` reads `linearScrollDataRef.current` inside a `useAnimatedReaction` worklet, where it is a frozen copy; it cannot crash, but `isLinear` may be stale.
4. **C7, mini player cleanup (speculative).** Island layout is retired (`TabNavigator` migrates it to `bar`) but the `classic` nav bar is still selectable, so the classic bar path must stay. Only the island branches (`isIsland`, `islandBgMode`, `ISLAND_COVER_BLUR`, and the `Toast`/`ModernPillTabBar`/`PlaylistDetailScreen` checks) can go. Narrow `miniPlayerStyle` to `'bar'`, normalise persisted `'island'` in the settings `migrate`, then let `tsc` list what to delete. Do not touch audio loading (`beginAudioLoad`/`endAudioLoad`): that lock exists for a reason in CLAUDE.md.
5. **Baseline profile** for Android cold start (none exists under `android/`). Needs a Macrobenchmark run; not possible in this container.
6. **Downloads finish in native.** The row insert, lyrics and playlist add still run in JS. Moving them into `DownloadWorker` would remove the last reason a download needs the JS side alive. Large; design first.
7. Smaller: `luvsEngine.syncLibrary` still sends the whole library across the bridge at boot; `ListenTogetherSettings` still uses a whole-store subscription; consider a lint rule against no-selector store hooks.
8. **Untested on a real phone:** battery draw, frame pacing at 60/120 Hz with the new cap, Battery Saver step-down, screen-off downloads finishing without keep-awake, Luvs swipe smoothness. Suggested checks are in the architecture review's "Measure first" table (dumpsys batterystats, gfxinfo, `am start -W`, Perfetto).

## The 19 UI items (all in code, awaiting phone confirmation)

1 player background picker (2 rows, 4th "Shader wash") · 2 no see-through under mini player and tab bar · 3 mini player glass and pure black · 4 Settings description line removed · 5 timing "Reset to sync" · 6 Luvs start from hook (native) · 7 frame-rate HUD in release · 8 Library glass coverflow · 9 Get songs redesign · 10 playlist one-line marquee title · 11 layered swipe-down (see open item 2) · 12 like saves to Liked songs · 13 lyrics smoothness · 14 lyrics swipe-down outside the list · 15 double-tap cover for vinyl · 16 swipe cover to skip · 17 marquee for long titles · 18 fast open/close of the player · 19 glow app background.

## Prompt for the next session

```
You are continuing work on LuvLyrics (React Native + Expo, Android-first) in the repo LuvLyricsApp/LuvLyricsApp.
Work ONLY on branch claude/luvlyricsapp-ui-ux-overhaul-o7eggn. Commit and push there; no PR unless I ask.

First read CLAUDE.md (the rules and architecture) and docs/HANDOFF.md (state, open items, method).

Method, every change: batch related edits -> npm run ci (expect 58 suites / 474 tests) -> conventional commit,
NO AI attribution -> push (a push cancels runs in flight, so batch) -> wait for the "LuvLyrics APK" and
"Android smoke test" runs -> download every asset of release smoke-latest (screenshots, playback.txt, taps.txt,
diag.txt, logcat.txt) -> look at every screenshot -> fix what you find -> repeat until a smoke run is clean.
Use .preview/ (react-native-web harness, never commit it) for UI checks without a phone.
Use Edit, not python/sed scripts, for code changes. Never Write over a file you only partly retyped.

Start with the open items in docs/HANDOFF.md, in order: (1) read the smoke run for the latest push and fix any
Kotlin compile error, (2) the Up-next sheet swipe-down that did not close in run 9e56ac7, (3) the mini player
missing from the look-* screenshots, then the smaller items. When a smoke run is clean, report what changed,
what was verified and how, and what is still unverified (anything only a real phone shows).
```
