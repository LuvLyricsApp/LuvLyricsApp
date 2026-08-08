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
- **Reanimated 3** shared values and Gesture Handler own timed lyric follow and player motion; keep playback tracking off the React render path
- **SQLite** via `expo-sqlite` for the local song library
- **TypeScript** strict — run `npm run typecheck` before pushing

## Key architecture

### Player
- `PlayerContext.tsx` — wraps `useAudioPlayer`, syncs status to Zustand, handles auto-next
- `playerStatusGuard.ts` — returns `true` to preserve playing state during buffering/seek to prevent UI flicker
- `usePlayerStore` (Zustand) — single source of truth for `isPlaying`, `currentSong`, `currentSongId`, `position`, queue
- `MiniPlayer.tsx` — the sole docked player surface: Classic Bar, Dynamic Island, lyrics, seek, and title marquee
- `ArtworkFlowBackground.tsx` — Skia cover-art palette flow shared by both player presentations
- `SynchronizedLyrics.tsx` — UI-thread timestamp lookup and centred lyric follow; do not restore active-text scaling

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
There is no standalone Now Playing screen. Keep lyrics in `MiniPlayer` so controls stay docked when the reader opens. The Dynamic Island and Classic Bar must use the same opaque artwork-flow background. Settings is a hidden tab route, so the normal tab bar remains visible there.

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
| Desktop bridge | `src/services/DesktopBridgeService.ts` (currently disabled — start/stop fully commented) |
| Stores | `src/store/` — songsStore, playlistStore, settingsStore, downloadQueueStore, etc. |
| Screens | `src/screens/` — Library, NowPlaying, Playlist, Search, Settings, etc. |

## Rules
- No `console.log` in production paths — wrap with `if (__DEV__)` or use the existing `logDesktopEvent` pattern
- No `as any` unless unavoidable
- No mock DB in tests — always hit real SQLite
- Don't reintroduce a standalone Now Playing route or an active-lyric text-scale animation
- `DesktopBridgeService` is disabled — don't re-enable without also enabling the full `stop()` cleanup
- `MAX_CONCURRENT` downloads is 2 — don't raise it without testing on low-end Android

## Branch naming
- `fix/<issue-number>-short-description`
- `feat/short-description`

## CI
```
npm run ci
# runs: check-secrets → lint → typecheck → jest --coverage
```
