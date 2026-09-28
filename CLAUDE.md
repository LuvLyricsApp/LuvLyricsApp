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
| Lyrics | `src/components/SynchronizedLyrics.tsx` |
| Lyrics providers | `src/services/lyrics/` — Echo Music cascade (YouLyPlus, Paxsenix, Unison, BetterLyrics, SimpMusic, LRCLIB, KuGou), runs before the Lyrica backend in `LyricaService.fetchLyrics` |
| Canvas (motion artwork) | `src/services/canvas/`, `src/hooks/useCanvasArtwork.ts`, `src/components/CanvasVideoLayer.tsx` — see `docs/canvas-and-providers.md` |
| Design tokens | `src/constants/allegraTheme.ts` — Allegra "Soft Signal" colors, radius, motion |
| Artwork | `src/components/allegra/Artwork.tsx` — **every** song cover renders through `<Artwork>`: real cover cross-dissolves over `GeneratedArtwork` (per-song duotone + monogram, `artworkSeed.ts`); never a grey box / note icon. `useCoverArtBackfill` (RootNavigator) fills missing library covers from iTunes 1000px → Saavn via `services/covers/CoverArtResolver.ts`, persisted with the one-column `patchCoverImageUri` |
| Allegra UI system | `src/components/allegra/` — `MusicFlowField` (Allegra's WebGL shader ported to a Skia runtime shader), `DynamicAura` (field + flutes + vignette + scrim, used by Stream, Downloads and Now Playing), `palette.ts` / `useArtworkPalette` (cover colours via native Palette, Allegra's vivify rules), `motion.tsx` (`RiseIn`, `Tactile`), `home.tsx` (section heading, buttons, Downloads sleeve) |
| Streaming | `src/services/stream/` — `StreamService` (play/queue/radio/lyrics for `stream:` songs), `homeFeed.ts` (Echo-style feed), `src/screens/StreamScreen.tsx` + `src/components/stream/StreamHome.tsx` (mood chips, shortcut grid, paged Quick picks, cover shelves), `src/hooks/useStreamSession.ts` (mounted in RootNavigator) |
| Library | `src/screens/LibraryScreen.tsx` — the Library tab root (the old Downloads layout + old Home's recently played, download queue); long-press song actions in `components/library/useSongActions.tsx`; Playlists behind its header button |
| Recommendations | `src/services/stream/recommend.ts` — YouTube Music automix/related (`src/services/ytmusic/`, WEB_REMIX metadata only, ported from Echo) resolved to Saavn/Gaana audio; Saavn radio fallback |
| YouTube Music browse | `src/services/ytmusic/browse.ts` (artist / home + chips / album-playlist / artist-search parsers, ported from Echo's `ArtistPage`/`HomePage`), `YTMusicClient.artist/findArtist/home/homeMore/collection/searchArtists/endpointSongs`, `services/stream/browsePlay.ts` (tap → first song resolves and plays, the rest joins the queue), `screens/ArtistScreen.tsx` + `CollectionScreen.tsx` in the hidden `Browse` tab stack, shelves in `components/browse/BrowseShelf.tsx` |
| Scrubber | `src/components/TimelineScrubber.tsx` |
| Downloads | `src/services/DownloadManager.ts`, `src/components/BackgroundDownloader.tsx` |
| Desktop bridge | `src/services/DesktopBridgeService.ts` — **live**, auto-starts at boot via `App.tsx` → `desktopBridgeSettingsStore.load()` |
| Stores | `src/store/` — songsStore, playlistStore, settingsStore, downloadQueueStore, voiceSearchStore, etc. |
| Voice | `src/hooks/useVoiceCommands.ts`, `src/utils/voiceIntentParser.ts`, `src/store/voiceSearchStore.ts`, `src/components/VoiceSearchCard.tsx` |
| Player menu | `src/components/player/PlayerMenu.tsx` (Echo's PlayerMenu in a tall `PlayerSheet`), actions in `src/services/player/playerMenuActions.ts`, `StreamService.startRadio`, `store/playbackModesStore.ts` (repeat-one, tempo/pitch → `MainPlayer.setRepeatOne/setPlaybackParameters`), `player/PlayerExtras.tsx` (Details with Edit lyrics → `screens/LyricsEditorScreen.tsx` for songs on the phone / Change cover, Tempo and pitch). There is no "add lyrics without a song" screen, `player/AmbientMode.tsx` |
| Listen together | `src/services/listenTogether/` — `protocol.ts` (Echo's message shapes), `codec.ts` (hand-rolled protobuf for Echo's `listentogether.proto` + gzip via fflate), `client.ts` (socket, ping, backoff reconnect, session resume), `sync.ts` (host broadcast + 10s heartbeat; guests resolve the track to catalog audio, buffer handshake, drift tolerance); `store/listenTogetherStore.ts`; `components/listenTogether/` (`ListenTogetherPanel` sheet in the player, `ListenTogetherHost` at the root for join requests) |
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
- Mini player: always the bottom player — no Dynamic Island (retired; saved `island` settings migrate to `bar`). With the pill nav it is a matching pill floating `PILL_STACK_GAP` above the tab bar (geometry from `pillBarTop` / `pillBarInset` in `src/navigation/tabs.ts`) and widens into the sheet as it expands. Scrolling lists must clear both pills (~220pt)
- Search is Echo's model: `services/stream/officialSearch.ts` (`searchOfficial`) asks YouTube Music which songs a query means, shows their official title/artists/art and takes only the audio from the catalog match (`resolver.ts`, which rejects covers, lofi, slowed, female-version etc. unless the title asked for one). Stream search, the Stream feed and voice search use it — don't point user-facing search back at raw `searchMusic`, which returns re-uploads with their own covers
- Haptics go through `src/utils/haptics.ts` (same API as expo-haptics, plus `vibrate`), which honours the Settings "Haptics" switch — never import `expo-haptics` or call `Vibration` directly from UI code
- Listen together speaks the protocol of Echo Music / Metrolist's `metroserver` so rooms mix LuvLyrics and Echo listeners. The server is **protobuf-only** (JSON frames are ignored) and gzips payloads over 100 bytes; it has no chat and only the host may control playback. The server URL comes from Echo's `server.json` (fallback `wss://metroserverx.meowery.eu/ws`) — a public server we don't run. Track ids on the wire are YouTube Music ids (`youtubeIdFor`); audio still comes from the catalog via `resolver.ts`
- The player ••• menu is a sheet, not an anchored dropdown. Rows that can't work for the song or platform are left out (Cast / Equalizer / Advanced are Android-only, Download only for streams, ringtone only for files on the phone). Set as ringtone needs the user to grant "modify system settings" (WRITE_SETTINGS)
- Now Playing's backdrop draws to the player's measured frame (`usePlayerFrame`), not `useWindowDimensions` — on Android edge-to-edge the window leaves out the nav bar and the blur used to fade into a dark strip there. Blur uses `mode="clamp"`
- Mini player (pill nav): `components/PillPlayer.tsx`, Echo Music's compact pill — round cover disc that turns while playing with a progress ring, title/artist, skip / scalloped "cookie" play / skip, background a calm tone of the cover (`pillTint`) that cross-fades per song. Tap or swipe up opens `NowPlayingScreen`; swipe sideways skips. `MiniPlayer` still owns audio loading and renders the pill in pill mode
- Now Playing is Apple Music's layout, no header bar (a grabber only): `player/AppleBackdrop` draws with Skia the cover blurred full-screen plus the sharp cover full-bleed on top, faded out through a real alpha mask; `NowPlayingControls` is title/artist + ••• + heart, `player/AppleSlider` scrubber (10pt, Echo) with elapsed / song length, white transport, system volume (`MainPlayer.getVolume/setVolume/onVolumeChanged`), then queue · [output switcher | sleep timer] · lyrics. Queue and sleep timer are `player/PlayerSheet` sheets; the timer is `store/sleepTimerStore` and pauses through `requestPlayback`. Lyrics mode hides the sharp cover and the volume row, sung line at 30% height
- The shader's clock runs at a constant tempo; energy changes brightness only and colours ease on a time basis. Never scale `uTime` by a changing uniform — the phase jump reads as a burst of speed
- Background playback: `PlaybackService` calls `addSession()` on its own session in `onCreate` — the app starts the service with `startService` and never binds a `MediaController`, so without it Media3 never tracked the session, posted no notification, never went foreground, and Android stopped the service ~1 min after the app left the screen (music dead, UI still "playing"). When playback can't be fixed in place the service says why through `MainPlayer.onPlaybackError` (`expired` link refused, `network`, `stall`, `error`, `released` on teardown, after a final stopped status) and `play()` returns false with no player; `playback/recovery.ts` reloads the song where it stopped (`resumeNextLoadAt` → the loader seeks before it plays), fetching a fresh link for a stream first, at most twice a minute per song on its own. `PlaybackService` runs ExoPlayer with `WAKE_MODE_NETWORK` (CPU + Wi-Fi lock — without it streams froze a few minutes after the screen went off while the UI still said playing), a 4-minute buffer, and re-prepares on network errors (1/2/4/8s) before pausing so the transport tells the truth. `MainPlayer.play()` re-prepares an idle player. Keep all three
- Performance: `src/utils/performanceTier.ts` (native `Startup.deviceProfile`) marks old/budget phones `low`. There the shader draws ~0.6px/pt at 30fps and rests while paused, `Frosted` drops the live blur for a deeper tint, and `RiseIn` fades. Everywhere: things that move every frame animate transforms, never `width`/`height`/`left` (scrubber fill and thumb translate, equaliser bars `scaleY` with `transformOrigin`), RN `Animated` uses the native driver, lyric lines far from the sung one get plain values, and the Now Playing shader pauses under a canvas video
- Browse is Echo's model too: YouTube Music supplies artist pages, home shelves, mood chips, albums and playlists (metadata only); every song plays through `browsePlay` → `resolver.ts` → catalog audio. Artist and album pages live in the hidden `Browse` tab (a native stack with `getId`, so back walks the trail and the bar stays). Stream shows YouTube Music's chips (a chip loads its own shelves), its home shelves under the personal ones, "Your artists" from `followedArtistsStore`, and artists above song results. The artist header plays the top song's motion canvas when one exists. The Now Playing artist line opens the artist
- Audio focus: when another app takes focus for a moment, Media3 keeps `playWhenReady` but suppresses playback. `PlayerBridge` sends `suppressed`, JS shows it as paused, and `MainPlayer.play()` toggles playWhenReady so ExoPlayer asks for focus again. `PlaybackService` also runs a stall watchdog (buffering with no progress for ~16s → reload at the same position) and the app re-reads status when it returns to the foreground (`refreshStatus`)
- Mood chips are personal: `services/stream/moodMix.ts` searches YouTube Music for the mood by the listener's followed + most-played artists (only their own songs kept) and in their preferred languages, interleaved — shown as "Your <mood> mix" above the chip's YouTube Music shelves
- Player looks follow Echo Music's settings (Settings → Appearance), ported from Echo's Player.kt / MiniPlayer.kt: **Mini player background** `glow` (Echo's GLOW_ANIMATED, two glows) or `tint`; **Apple Music inspired** (full-bleed cover; off = floating artwork card) with **Hide volume slider**; **Player background style** `blend` ("Apple + glow", default: Apple Music for the cover, glow once lyrics open) or `apple` — `glow` alone was retired and migrates to `blend` (settings store `version` 1); **Canvas**. `player/GlowBackground` + `glowMath.ts` are Echo's glow exactly (base #050505, colours walk the palette over 20s, sine-drifting centres/radii, 1200ms palette cross-fade); its palette is `Palette.extractGlowColors` (maximumColorCount 8, 100×100, six swatches, distinct). Apple Music style is Echo's too: hero = 65% of height, mask stops 0/0.75/0.92/1 → 1/1/0.4/0, black 5%→40% overlay; the canvas plays across the hero and a Skia veil (`AppleBackdrop veil`) paints the blurred room back over it through the inverse mask — MaskedView cannot mask a hardware video texture on Android (the video ended in a hard edge)
- Canvas follows Echo's player order: Echo Canvas manifest → Apple Music → Tidal (listener's token) → ArchiveTune artist video (extra), each keyless step retried with the lead artist and without "(From …)". Apple Music uses the listener's MusicKit token if set, otherwise Apple's web-player token read live from music.apple.com (`canvas/appleWebToken.ts`, Echo's AppleMusicTokenProvider: page → index-*.js → JWT; re-read once when Apple rejects it). Never hard-code a copied token. Now Playing opens on the cover (lyrics are a tap away) — opening on lyrics hid the canvas
- A resting shader (paused / off-screen) must still apply a new palette: `MusicFlowField` snaps colours when its frame loop isn't running; `useArtworkPalette` retries a failed read twice
- Settings is one scrolling page in Allegra's language (`components/settings/SettingsKit.tsx`: frosted `Section` panels with a round chartreuse icon, `Row` label + hint, chartreuse `Switch`, pill `Choice`, `Action`; jump chips; the live shader behind). Sections: Player, Playback, Lyrics, Navigation and voice, Discover, Library and data, Desktop Connect, About. Only controls that change something — no placeholder rows
- `lyricflow://` deep links (`hooks/useDeepLinks.ts`): `play?q=…[&lyrics=1]`, `open/<stream|luvs|library|playlists|search|settings>`, `player?sheet=menu|together|queue|timer`, `together?code=<room>` (Listen together invite, in the shared room message), `diagnose` (turns on `utils/diag` logging in release). The Android smoke test drives the release build with these and publishes screenshots (launch, player cover ×2, player lyrics, back from the player with the pill, reopened from the pill, the ••• menu, Listen together, transition frames, Library, Settings, Search, Playlists, Luvs), a background-playback check (`playback.txt`) and `diag.txt` to the `smoke-latest` release
- Luvs follows streaming taste: `services/luvsTaste.ts` seeds from stream history (plays × recency, one seed per artist) + most-played library songs, runs Echo-style YouTube Music radio via `recommendFor`, and `luvsEngine` hands the result to Kotlin (`setTasteCandidates`), which weaves it into every page alternately with its artist discovery. Language filters don't apply to taste songs
- Bottom bar, in order: Stream, Luvs, mic (if enabled), Library, ••• (`components/MoreMenu.tsx`: Search, Playlists, Get songs, Settings). Stream is the start screen; there is no Home tab (it was merged into Library). The bar shows on every screen except the full-screen player — menu destinations and the YouTube Music `Browse` pages are hidden routes in the tab navigator (`VISIBLE_TABS` in `src/navigation/tabs.ts`), not root-stack screens. Add a destination to `MORE_ITEMS`, not a new tab icon. Full-bleed screens pad by `TAB_BAR_CLEARANCE + insets.bottom`
- Voice: hold the mic, say a song, let go → `VoiceSearchCard` (mounted once in RootNavigator) shows the best match with Play. `useVoiceCommands` feeds `voiceSearchStore`; library matches rank instantly (`rankSongs`), the catalog search starts from the partial transcript. Transport words (next/stop/…) only act when they are the whole utterance. The mic (`VoiceMicButton`) shows every stage — press sink, listening bloom + live halo, a spinning arc while searching, a shake on error — and the card never covers the tab bar while listening or searching. Speech comes from the native Android `VoiceInput` module — iOS has none yet (`expo-speech-recognition` would add it). `VoiceInput` prefers the on-device recognizer (Android 12+, falls back to Google's once per session when the language has no local model), reuses one recognizer, passes the language as a tag string, and answers a release within 350ms (the final text if it lands, else the last partial) — never wait for the server's final result. Every callback is tied to its session. Hold mode (default; settings v2 migrates the old `tap` default): a press longer than 280ms stops on release, a quick tap listens until silence. The microphone permission is asked on the first press (`useVoiceCommands`), and errors read from `utils/voiceErrors.ts` — no "something went wrong". The live mic level is a shared value (`playback/voiceLevel.ts`), not React state
- Floating glass (menus, sheets, cards) uses `allegra/Frosted` — expo-blur is a flat tint on Android unless `experimentalBlurMethod` is set, which `Frosted` does. Don't put it on always-visible chrome (the tab bar): the Android blur re-renders with every scroll frame
- Covers never print their title twice: `GeneratedArtwork`'s on-cover label is opt-in (`label`) — only where no title sits beside it
- `DynamicAura` must get `active={isFocused}` (or equivalent) so the shader's frame loop stops when its screen isn't visible
- Android uses a **checked-in** `android/app/src/main/java/expo/modules/ExpoModulesPackageList.kt`, not autolinking. A new Expo package with native code does nothing on Android until its module is added there — missing `expo-video` once made the release APK throw at import and sit on a grey screen. `src/nativeModuleList.test.ts` fails CI when the list falls behind `package.json`. The `Android smoke test` workflow boots the release build on an emulator and publishes a screenshot + logcat to the `smoke-latest` release
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
node_modules\.bin\jest.cmd                  # expect 34 suites / 333 tests passing
```
Jest prints "A worker process has failed to exit gracefully" — that warning is
pre-existing and not a failure; check the `Tests:` summary line instead.

**Deleting files?** `tsc --noEmit` is the real gate — it catches directory-barrel
imports (`from './navigation'`) and root-level entry points (`index.ts` imports
`src/widget/SongWidget`) that a grep for `from '../thing'` will miss.
