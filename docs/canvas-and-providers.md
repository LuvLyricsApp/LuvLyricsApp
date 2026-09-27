# Canvas, lyrics providers and the Allegra player look

This is how the Now Playing experience is put together: Allegra's "Soft Signal"
visual language, an Apple Music-style player layout, and Echo Music's provider
cascades, ported from Kotlin to TypeScript.

## Canvas (motion artwork)

A canvas is the looping video behind the player. `useCanvasArtwork(song)` asks
`CanvasService.resolve()`, which tries these providers in order and stops at the
first hit:

| # | Provider | Needs | What it returns |
|---|----------|-------|-----------------|
| 1 | Echo Canvas manifest (`canvas.echomusic.fun/canvas.json`) | nothing | community-mapped mp4 / m3u8 loops |
| 2 | ArchiveTune artwork service | nothing | animated covers by song + artist |
| 3 | Tidal search | a Tidal client token in Settings | album video covers (mp4) |
| 4 | Apple Music API (`api.music.apple.com`) | **your** MusicKit developer token in Settings | album editorial motion (HLS) |

- Hits are cached for 24 h and misses for 30 min, so an offline moment doesn't
  hide a canvas for the rest of the day.
- Matching is ported from Echo: artists are split on `feat.`/`&`/`x`, compilations
  ("Essentials", "DJ Mix", "Session"…) are rejected, and an unexpected "Deluxe"
  loses to the studio album.
- `CanvasVideoLayer` plays it muted with `audioMixingMode: 'mixWithOthers'` and
  no now-playing notification, so it can never duck or pause the music. It fades
  in on its first frame, pauses with the song, and holds a still frame when
  Reduce Motion is on. The artwork ambient layer stays underneath as the fallback.
- Where it shows: `NowPlayingScreen` (full-bleed) and the MiniPlayer's expanded
  classic and island stages (album-art background mode only; a collapsed bar never
  decodes video).

### About the Apple Music token

Echo Music gets its Apple token by scraping the web player's JavaScript bundle.
LuvLyrics does **not** do that. That token is Apple's credential and using it is
against Apple's terms. Instead, the Apple provider is off until you paste a
MusicKit developer token (Apple Developer Program → Keys → MusicKit) into
Settings → Appearance → Canvas. It is stored only on the device. Providers 1 and 2
cover many popular songs without any token.

## Lyrics

`LyricaService.fetchLyrics()` now runs the Echo cascade first, then the existing
Lyrica backend:

`YouLyPlus → Paxsenix → Unison → BetterLyrics → SimpMusic → LRCLIB → KuGou → Lyrica`

- The first **synced** result wins. The first plain result is kept as a fallback,
  and it is also returned if the Lyrica backend is down.
- `LyricsRepository.searchSmart()` (the lyrics picker) asks every provider in
  parallel and ranks everything with `SmartLyricMatcher`.
- Word-synced sources (TTML, enhanced LRC, KPoe syllables) are flattened to line
  LRC (`src/services/lyrics/lrc.ts`), because LuvLyrics renders line-synced lyrics.
- SimpMusic only answers when the song has a `youtubeVideoId`.

## Design tokens

`src/constants/allegraTheme.ts` is the React Native port of Allegra's tokens:

- **Signal**: the stable colors. Chartreuse `wave` is for primary actions and
  selected states (play button, active tab marker, lyrics toggle). Coral `accent`
  marks liked songs. Artwork tints the ambient layer, never these colors.
- **Glass**: the frosted recipe (translucent fill, hairline, inset highlight).
- **Radius**: pills for controls, 24/30 for panels and sheets, 16 for artwork.
- **Motion**: durations, easings and springs. Animate transform and opacity only.

## Player layout (Apple Music style)

- Artwork stage: a large square cover that springs down to 82 % when paused and
  back to full size on play (`AppleArtworkStage`). It steps aside when a canvas is on.
- Controls float on a scrim instead of a card: title and artist on the left,
  like and more on the right, a full-width scrubber, and three large transport
  glyphs. Play/pause uses the chartreuse action color.
- A small `CANVAS · SOURCE` chip shows which provider supplied the motion.

## Streaming, recommendations and Downloads

### How playback works

Echo Music plays from YouTube Music. To get full audio streams it pretends to
be other YouTube apps (VisionOS, Android VR, TV) and generates BotGuard
"PoTokens", which is a way around YouTube's anti-bot protection. LuvLyrics does
**not** port that. Streaming uses the catalog providers the app already
downloads from (JioSaavn 320 kbps, with Gaana as fallback) and plays their CDN
URLs directly through the normal player queue:

- `StreamService.play(songs, i)` turns catalog results into transient `Song`s
  (`stream:saavn:<id>`, remote `audioUri`). Media3 plays and gaplessly stages them
  like library songs.
- `useStreamSession` (mounted in `RootNavigator`) runs whenever the current song
  changes. It records history, fetches synced lyrics through the Echo lyrics
  cascade, and **extends the queue with Saavn radio** when two or fewer songs are
  left (Echo's autoplay).
- Liking a streamed song downloads it into the library.

### Recommendations: Echo's logic, catalog audio (`recommend.ts`)

Echo gets its radio and "related" songs from YouTube Music, and LuvLyrics now
does the same. `src/services/ytmusic/` is a port of Echo's InnerTube WEB_REMIX
client (the music.youtube.com web client's own requests). It covers songs
search, `next` (following the automix endpoint for the endless mix) and the
Related tab, using Echo's renderer parsers. It is **metadata only**. For each
seed:

1. Find the seed on YouTube Music (title + artist + duration match).
2. Take its automix radio, or Related if there is no mix.
3. Resolve every track to a Saavn/Gaana song (`resolver.ts`: normalised title,
   artist overlap, duration within 8 s). Anything that doesn't match confidently
   is skipped.
4. If fewer than 3 tracks resolve, or YouTube Music is unreachable, fall back
   to Saavn's own radio.

Both the home feed and queue autoplay use this.

### Home feed (`homeFeed.ts`)

This ports the section structure of Echo's `HomeViewModel`:

| Section | Source |
|---------|--------|
| Quick picks | radio from your top 3 seeds (streams ranked by plays with a recency decay, topped up from your most-played downloads), interleaved and shuffled |
| Keep listening | recent streams (`streamHistoryStore`, persisted) |
| Daily discover | one pick per seed, "because you played X" |
| Similar to *artist* | the two artists you return to most |
| Forgotten favorites | liked or replayed downloads you haven't touched in 2+ weeks |

On a cold start (no history), it shows charts in your preferred Luvs languages.

### Pages and navigation

Tabs: **Home · Stream · (mic) · Luvs · Library · Search**. Downloads lives in
the Library stack, so the tab bar and mini player stay on screen. You can reach
it from the Library screen, from the Stream header, and from "Forgotten
favorites". The Dynamic Island mini player now shows on Stream as well as Home.

### Luvs (Spotify-style feed)

- The canvas video plays full-bleed behind the active clip, and the artwork
  steps aside once it lands.
- Clips start at the hook (about 30 % in, clamped to 25–70 s; songs under 90 s
  start from the top). This can be turned off under Settings → Playback.
- **Save** now downloads the song. **Luv** stays the vault bookmark.
- **Full song** hands the clip, plus the rest of the feed as the queue, to the
  main player and opens Now Playing.

## The Allegra look (live ambient + home composition)

`src/components/allegra/` ports Allegra's frontend to React Native:

- **`MusicFlowField`** — Allegra's `MusicFlowShader` (reeded-glass light
  columns, flutes, catch-light, film grain) rewritten in SkSL and run by Skia on
  the GPU. It renders at half resolution and scales up, eases between song
  palettes every frame, never leaps after a stall, stops when its screen loses
  focus, and holds a still frame under Reduce Motion. Like Allegra, it leaves
  the orb out.
- **`DynamicAura`** — the same layer stack as Allegra's `.dynamic-aura`: radial
  cover glows, the field (0.88 opacity playing / 0.3 paused, a little brighter
  than web because React Native has no `screen` blend), flutes, vignette and
  scrim.
- **Palette** — Android's native Palette swatches go through Allegra's rules:
  vivify colours into a readable range, fall back to lighter/darker stops of
  the primary for one-colour covers, and use a quiet neutral for greyscale
  covers. Eyebrows use `accentInk` (the primary mixed 38 % toward white).
- **Home blocks** (`home.tsx`) mirror the web CSS: spotlight wash (a Skia
  masked blur that dissolves into the field), a sleeve of two tilted glass
  plates behind a -2° cover, the chartreuse play bubble, the quick-card rail,
  tiles, ranked chart rows, mood cards, and primary/glass buttons.
- **Motion** — `RiseIn` is Allegra's `riseIn` (opacity 0→1, y 18→0,
  scale 0.97→1, 400 ms decelerate, 40 ms stagger); `Tactile` is the press
  spring (stiffness 400, damping 30). Transform and opacity only.

## Cover art

- **One component:** every song cover renders through `Artwork`. The real
  cover cross-dissolves in over a designed placeholder, and if it fails to
  load, the placeholder stays.
- **Designed fallback:** `GeneratedArtwork` builds a cover from the song
  itself: a duotone from Allegra's colour family (picked by hashing the title
  and artist, so a song always gets the same one), an oversized monogram, faint
  vinyl grooves, and the title and artist set in Inter. Empty playlists get one
  made from the playlist name. The Luvs card uses the same duotone as its
  background.
- **Backfill:** a few seconds after launch, `useCoverArtBackfill` looks up
  library songs that have no cover, most-played first and 40 per session. It
  tries iTunes at 1000×1000 first, then JioSaavn. A cover is only accepted when
  the title, artist and duration agree; a wrong cover is worse than the designed
  one. Misses are retried after a week. The result is saved with a
  single-column update that never overwrites a cover you already have.
- Stream tracks resolved from YouTube Music fall back to YouTube Music's own
  thumbnail if the Saavn row has no art.

## Motion system

Grounded in Material 3 motion and Apple's interaction guidance: springs for
anything a finger can interrupt, 200–400 ms for state changes, 30–60 ms list
staggers, and at most two effects moving on a screen at once.

| Moment | Motion |
|--------|--------|
| Now Playing opens | the cover rises in (scale 0.9, +24 px) on a spring |
| Next / previous | the cover slides out and the new one slides in from the direction of travel; title and artist lift out and rise in (`SwapText`) |
| Play/pause, like | the glyph morphs (rotate, scale, cross-fade) instead of snapping (`MorphIcon`) |
| Skip buttons | the glyph leans the way it skips (`NudgeIcon`), plus a haptic |
| Any tap | tactile press spring (`Tactile`) |
| Stream scroll | the hero drifts at parallax speed and dims; a compact glass header takes over past the title |
| Lists and sections | rise in with a 40 ms stagger (`RiseIn`) |
| Tabs | a glass highlight springs to the selected tab, and the icon lifts once |

Reduce Motion collapses every one of these to a fade.
