# LuvLyrics — Project Reference

## Migration (LuvLyrics 2.0)

**Full rewrite to Kotlin + Jetpack Compose is in progress.** RN/Expo retires at Phase 8 only after native parity is verified.

| Doc | Purpose |
|-----|---------|
| `.planning/PROJECT.md` | Decision, architecture, what carries over |
| `.planning/ROADMAP.md` | Phases 0–9, sizes, exit criteria |
| `.planning/STATE.md` | **Living progress** — update when milestones are verified on device |
| `.planning/REQUIREMENTS.md` | Feature triage |

**Current phase:** 0 (shell, launch-safe) + 1 (data migration UI). Next: verify counts against live `lyricflow.db`, then Phase 2 player.

**Hard rules:**
1. **Never run `expo prebuild`** — wipes 20 custom Kotlin modules.
2. **Do not delete `src/`** until Phase 8.
3. **Verify on device** — `adb install` + manual UAT; `tsc`/jest prove nothing about native.
4. **Lyrics priority unchanged:** rich-sync/word-timed first, then line-sync, then plain.
5. **Room uses `lyricflow-room.db`** — never write to live `lyricflow.db` from Kotlin until cutover.
6. **Compose-first debug launch** skips Expo DevLauncher; legacy RN lazy-inits in `MainActivity`.

**Native shell entry:** `LauncherActivity` → `LyricFlowComposeApp` (tabs: Home, Local, Playlists, Luvs, Search).

**Build/install:**
```
cd android
.\gradlew.bat :app:assembleDebug
adb install -r app\build\outputs\apk\debug\app-debug.apk
adb shell am start -n com.lyricflow.app/.LauncherActivity
```

## Commit style
- Never add AI attribution lines (no "Co-Authored-By" footers). Commits look like normal human commits.
- Use conventional commits: `fix(scope):`, `feat(scope):`, `refactor(scope):`, etc.
- Keep messages short — one imperative sentence, body only when the why needs explaining.

## Stack
- **Target:** Kotlin + Jetpack Compose + Room (migration in progress)
- **Current UI:** React Native + Expo (managed workflow, `expo run:android` / `expo run:ios`)
- **expo-audio** for playback (`useAudioPlayer`, `useAudioPlayerStatus`)
- **Zustand** for all app state (`src/store/`)
- **React Navigation** (native-stack + bottom-tabs)
- **Reanimated 3** + **Gesture Handler** for animations and gestures
- **SQLite** via `expo-sqlite` for the local song library (RN); Room `lyricflow-room.db` for native
- **TypeScript** strict — run `npm run typecheck` before pushing

## Key architecture

### Player
- `PlayerContext.tsx` — wraps `useAudioPlayer` (iOS) / `NativeAudioPlayer` (Android), syncs status to Zustand, handles auto-next
- `playerStatusGuard.ts` — returns `true` to preserve playing state during buffering/seek to prevent UI flicker
- `playbackIntent.ts` — suppresses stale native status echoes (see below)
- `usePlayerStore` (Zustand) — single source of truth for `isPlaying`, `currentSong`, `currentSongId`, `position`, queue
- `MiniPlayer.tsx` — the sole docked player surface: Classic Bar, Dynamic Island, lyrics, seek, and title marquee
- `ArtworkFlowBackground.tsx` — Skia cover-art palette flow shared by both player presentations
- `SynchronizedLyrics.tsx` — UI-thread timestamp lookup and centred lyric follow; do not restore active-text scaling

### Play/pause — the three invariants (all three were broken once; don't regress them)

**1. All UI play/pause goes through `usePlayerStore.requestPlayback(playing)`.**
Never call `setIsPlaying` + `playerControls.play()/pause()` by hand. `setIsPlaying` is
the raw setter, reserved for `PlayerContext` syncing native status. `requestPlayback`
does the optimistic set, arms the echo guard, and issues the command in the right order.

**2. Audio-load effects must never depend on `isPlaying`.**
A load effect that reads `storePlaying` in its dep array and calls `play()` will
re-fire on the user's own pause and immediately resume — pause appears to do nothing.
Read play state via `usePlayerStore.getState()` inside the effect, never as a dep.

**3. Who owns `isPlaying` differs by platform — don't unify them carelessly.**

*Android:* Media3 owns it. `requestPlayback` only sends the command; it does **not**
set the store. `PlayerBridge` emits `playWhenReady` (flips the instant a command is
applied, unlike `isPlaying` which stays false while buffering) and JS adopts it
verbatim. There is no optimistic update, so there is nothing for a status tick to
contradict and no guard is needed. `setNativeOwnsPlaybackState(true)` selects this
path at mount.

*iOS:* still JS-driven via expo-audio, so it keeps the optimistic update plus both
guards — `shouldPreservePlayingStateDuringSeek` and `isStalePlayingEcho`, which
self-clears once the player agrees or after `INTENT_WINDOW_MS` (1500ms). Deleting
`playbackIntent.ts` requires doing the equivalent native work on iOS first.

### Scrub/seek pattern (must follow everywhere)
```ts
const wasPlaying = usePlayerStore.getState().isPlaying;
await player.seekTo(time);
if (wasPlaying) player.play();
```
`seekTo` is async and pauses playback — always resume if the user was playing.

### Auto-next (end of song)
`PlayerContext` uses `didJustFinish` (cross-platform signal) as primary, plus a `isNearEndFallback` (within 0.35s of end) as secondary. The fallback only triggers when `store.isPlaying` is true — prevents auto-advancing when user manually pauses near end.

### Player presentation
There is no standalone Now Playing screen. Keep lyrics in `MiniPlayer` so controls stay docked when the reader opens. The Dynamic Island and Classic Bar must use the same opaque artwork-flow background. Settings and Audio Downloader are hidden tab routes, so the normal tab bar remains visible there.

### Library auto-next
`nextInPlaylist()` in `playerStore.ts` dynamically `require`s `songsStore` (circular dep workaround) to rebuild queue when `currentPlaylistId === 'library'` and queue is null.

## File map

| Area | Files |
|------|-------|
| Playback engine | `src/contexts/PlayerContext.tsx`, `src/contexts/playerStatusGuard.ts` |
| Player state | `src/store/playerStore.ts` |
| Main UI | `src/components/MiniPlayer.tsx`, `src/components/ArtworkFlowBackground.tsx` |
| Lyrics | `src/components/SynchronizedLyrics.tsx`, `src/components/LyricsLine.tsx` |
| Scrubber | `src/components/TimelineScrubber.tsx` |
| Downloads | `src/services/DownloadManager.ts`, `src/components/BackgroundDownloader.tsx` |
| Native data (Compose) | `android/.../data/` — `LibraryDatabase`, `LegacyLibraryMigrator`, `LibraryRepository` |
| Compose shell | `android/.../compose/` — `LyricFlowComposeApp`, `LibraryScreens`, `LaunchPrefs` |
| Desktop bridge | `src/services/DesktopBridgeService.ts` — **live**, auto-starts at boot via `App.tsx` → `desktopBridgeSettingsStore.load()` |
| Stores | `src/store/` — songsStore, playlistStore, settingsStore, downloadQueueStore, etc. |
| Screens | `src/screens/` — Library, NowPlaying, Playlist, Search, Settings, etc. |

## Rules
- No `console.log` in production paths — wrap with `if (__DEV__)` or use the existing `logDesktopEvent` pattern
- No `as any` unless unavoidable
- No mock DB in tests — always hit real SQLite
- Don't reintroduce a standalone Now Playing route or an active-lyric text-scale animation
- `DesktopBridgeService` is **enabled and auto-starts at boot** when the Settings toggle is on. It is 1300+ lines and reachable — treat removing or disabling it as a product decision, not cleanup. If you change `start()`, check `stop()` tears down symmetrically.
- `MAX_CONCURRENT` downloads is 2 — don't raise it without testing on low-end Android

## Branch naming
- `fix/<issue-number>-short-description`
- `feat/short-description`

## CI / verifying a change
```
npm run ci
# runs: check-secrets → lint → typecheck → jest --coverage
```

**If `npm` fails with `Cannot find module '...npm-cli.js'`** (broken global npm install
on this Windows box), call the binaries directly — same result, no npm shim:
```
node_modules\.bin\tsc.cmd --noEmit          # expect exit 0, zero output
node_modules\.bin\eslint.cmd src index.ts   # expect exit 0
node_modules\.bin\jest.cmd                  # expect 13 suites / 165 tests passing
```
Jest prints "A worker process has failed to exit gracefully" — that warning is
pre-existing and not a failure; check the `Tests:` summary line instead.

**Deleting files?** `tsc --noEmit` is the real gate — it catches directory-barrel
imports (`from './navigation'`) and root-level entry points (`index.ts` imports
`src/widget/SongWidget`) that a grep for `from '../thing'` will miss.
