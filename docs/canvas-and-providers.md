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
