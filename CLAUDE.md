# LuvLyrics — Project Reference

## Commit style
- Never add AI attribution lines (no "Co-Authored-By" footers). Commits look like normal human commits.
- Use conventional commits: `fix(scope):`, `feat(scope):`, `refactor(scope):`, etc.
- Keep messages short — one imperative sentence, body only when the why needs explaining.

## Stack
- **React Native + Expo** (managed workflow, `expo run:android` / `expo run:ios`)
- **expo-audio** for playback (`useAudioPlayer`, `useAudioPlayerStatus`)
- **Zustand** for all app state (`src/store/`)
- **React Navigation** (native-stack + bottom-tabs)
- **Reanimated 3** + **Gesture Handler** for animations and gestures
- **FlashList** (`@shopify/flash-list`) — used in `SynchronizedLyrics`; prefer over FlatList for long lists
- **SQLite** via `expo-sqlite` for the local song library
- **TypeScript** strict — run `npm run typecheck` before pushing

## Key architecture

### Player
- `PlayerContext.tsx` — wraps `useAudioPlayer` (iOS) / `NativeAudioPlayer` (Android), syncs status to Zustand, handles auto-next
- `playerStatusGuard.ts` — returns `true` to preserve playing state during buffering/seek to prevent UI flicker
- `playbackIntent.ts` — suppresses stale native status echoes (see below)
- `usePlayerStore` (Zustand) — single source of truth for `isPlaying`, `currentSong`, `currentSongId`, `position`, queue
- `MiniPlayer.tsx` — owns the expanded player UI, Dynamic Island style + Classic style, handles seek

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

### Audio load ownership
`MiniPlayer` and `NowPlayingScreen` both watch `loadedAudioId`, so both will try to
`replace()` the same track. Claim it with `beginAudioLoad(songId)` / release with
`endAudioLoad(songId)` (module-level, in `playerStore.ts`) — a per-component ref is
not enough, because the two components race across component boundaries.
`NowPlayingScreen` additionally uses a `cancelled` flag to abort if deps change or it
unmounts mid-load.

### Library auto-next
`nextInPlaylist()` in `playerStore.ts` reads `useSongsStore.getState().songs` at call time to rebuild the queue when `currentPlaylistId === 'library'` and queue is null. `songsStore` must never statically import `playerStore` (only `await import`) — the init-time back-edge used to leave `playerStore` half-initialised.

## File map

| Area | Files |
|------|-------|
| Playback engine | `src/contexts/PlayerContext.tsx`, `src/contexts/playerStatusGuard.ts` |
| Player state | `src/store/playerStore.ts` |
| Main UI | `src/components/MiniPlayer.tsx`, `src/screens/NowPlayingScreen.tsx` |
| Lyrics | `src/components/SynchronizedLyrics.tsx`, `src/components/LyricsLine.tsx` |
| Lyrics providers | `src/services/lyrics/` — Echo Music cascade (YouLyPlus, Paxsenix, Unison, BetterLyrics, SimpMusic, LRCLIB, KuGou), runs before the Lyrica backend in `LyricaService.fetchLyrics` |
| Canvas (motion artwork) | `src/services/canvas/`, `src/hooks/useCanvasArtwork.ts`, `src/components/CanvasVideoLayer.tsx` — see `docs/canvas-and-providers.md` |
| Design tokens | `src/constants/allegraTheme.ts` — Allegra "Soft Signal" colors, radius, motion |
| Artwork | `src/components/allegra/Artwork.tsx` — **every** song cover renders through `<Artwork>`: real cover cross-dissolves over `GeneratedArtwork` (per-song duotone + monogram, `artworkSeed.ts`); never a grey box / note icon. `useCoverArtBackfill` (RootNavigator) fills missing library covers from iTunes 1000px → Saavn via `services/covers/CoverArtResolver.ts`, persisted with the one-column `patchCoverImageUri` |
| Allegra UI system | `src/components/allegra/` — `MusicFlowField` (Allegra's WebGL shader ported to a Skia runtime shader), `DynamicAura` (field + flutes + vignette + scrim, used by Stream, Downloads, Now Playing), `palette.ts` / `useArtworkPalette` (cover colours via native Palette, Allegra's vivify rules), `motion.tsx` (`RiseIn`, `Tactile`), `home.tsx` (spotlight, sleeve, rail, tiles, chart rows, mood cards, buttons) |
| Streaming | `src/services/stream/` — `StreamService` (play/queue/radio/lyrics for `stream:` songs), `homeFeed.ts` (Echo-style feed), `src/screens/StreamScreen.tsx`, `src/hooks/useStreamSession.ts` (mounted in RootNavigator) |
| Downloads | `src/screens/DownloadsScreen.tsx` — inside the Library tab stack |
| Recommendations | `src/services/stream/recommend.ts` — YouTube Music automix/related (`src/services/ytmusic/`, WEB_REMIX metadata only, ported from Echo) resolved to Saavn/Gaana audio; Saavn radio fallback |
| Scrubber | `src/components/TimelineScrubber.tsx` |
| Downloads | `src/services/DownloadManager.ts`, `src/components/BackgroundDownloader.tsx` |
| Desktop bridge | `src/services/DesktopBridgeService.ts` — **live**, auto-starts at boot via `App.tsx` → `desktopBridgeSettingsStore.load()` |
| Stores | `src/store/` — songsStore, playlistStore, settingsStore, downloadQueueStore, etc. |
| Screens | `src/screens/` — Library, NowPlaying, Playlist, Search, Settings, etc. |

## Rules
- No `console.log` in production paths — wrap with `if (__DEV__)` or use the existing `logDesktopEvent` pattern
- No `as any` unless unavoidable (FlashList type shim is the one exception)
- No mock DB in tests — always hit real SQLite
- Don't introduce shadow styles on NowPlayingScreen — intentionally removed for clean look
- `DesktopBridgeService` is **enabled and auto-starts at boot** when the Settings toggle is on. It is 1300+ lines and reachable — treat removing or disabling it as a product decision, not cleanup. If you change `start()`, check `stop()` tears down symmetrically.
- Every provider call (canvas, lyrics) goes through `src/services/net/fetchWithTimeout.ts` — timeout + returns null, never throws, so one dead provider can't stop a cascade
- The canvas video is decorative: muted, `audioMixingMode: 'mixWithOthers'`, no now-playing notification. It must never take audio focus from the music player
- Streamed songs are transient `Song`s with a `stream:<source>:<id>` id and a remote `audioUri` — never write them to SQLite. Liking one downloads it (`songsStore.toggleLike` routes to `StreamService.save`)
- `src/services/ytmusic/` is metadata only (search / next / related). Never add stream-URL extraction, client spoofing or PoToken code there — audio always comes from the catalog providers via `resolver.ts`
- After changing the queue under a playing track, call `prepareNextInQueue()` — Media3 may have staged the old "next" for gapless advance
- Type is SF Pro everywhere (Apple Music's face). Styles set only `fontWeight` (and `fontSize`) — never a `fontFamily` for UI text, and no `letterSpacing` (iOS applies Apple's tracking itself; Android gets it from `sfTracking`). iOS uses the system font, which is SF Pro. Android maps the final weight to a bundled SF Pro Text face in `src/theme/appleTypography.ts`, imported first in `index.ts` — keep it first. Only Regular/Semibold/Bold ship: 500 renders Regular, 800+ Bold. The OTFs are Apple-licensed for personal builds only, not a Play Store release
- Fonts in `assets/fonts/` must be real font binaries — the old Inter files were once saved GitHub HTML pages, which Android silently swapped for Roboto
- Motion: springs for anything a finger can interrupt, 200–400ms for state changes, 40ms list staggers, max two moving effects per screen, transform/opacity only. Primitives live in `components/allegra/motion.tsx` (`RiseIn`, `Tactile`, `SwapText`, `MorphIcon`, `NudgeIcon`) — reuse them instead of hand-rolling
- UI copy is sentence case ("Good morning", "Now playing"), never all caps. No `textTransform: 'uppercase'`, no positive `letterSpacing` on labels, no monospace as decoration, no emoji in UI strings, no sparkle icons or "magic" wording — these read as generated UI. Shelves use `SectionHeading` title + optional plain `subtitle`, not an eyebrow over every heading
- `DynamicAura` must get `active={isFocused}` (or equivalent) so the shader's frame loop stops when its screen isn't visible
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
node_modules\.bin\jest.cmd                  # expect 24 suites / 280 tests passing
```
Jest prints "A worker process has failed to exit gracefully" — that warning is
pre-existing and not a failure; check the `Tests:` summary line instead.

**Deleting files?** `tsc --noEmit` is the real gate — it catches directory-barrel
imports (`from './navigation'`) and root-level entry points (`index.ts` imports
`src/widget/SongWidget`) that a grep for `from '../thing'` will miss.
