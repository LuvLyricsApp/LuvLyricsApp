---
name: LuvLyrics — Soft Signal for mobile
status: active
inherits: Allegra "Soft Signal" (allegra/DESIGN.md)
source_of_truth:
  - src/constants/allegraTheme.ts
  - src/components/allegra/
  - src/components/PillPlayer.tsx
  - src/navigation/playerSheet.ts
  - src/widget/
---

# LuvLyrics design system

LuvLyrics is a lyrics-first music player. It shares Allegra's visual language —
album art supplies the atmosphere, frosted material separates content, one
stable action colour stays legible over any artwork — and adapts it to a phone
held in one hand, on hardware as old as a five-year-old mid-range Android.

The feeling to aim for: a dark listening room lit by the cover that is playing.
Calm at rest, responsive under the finger, never busy.

This is the contract for new screens and for visual refactors. When this file
and the code disagree, fix one of them in the same change.

---

## 1. Colour

### Stable colours (`Signal` in `allegraTheme.ts`)

| Token | Hex | Use |
| --- | --- | --- |
| `wave` | `#d9e66a` | Primary action, selected state, progress, the playing row |
| `waveInk` | `#17180d` | Text and icons on a `wave` fill |
| `accent` | `#ee6b5f` | Liked, love, destructive-but-warm (remove from playlist) |
| `ink` | `#f4f1ea` | Primary text |
| `inkSoft` | `#d1d0c9` | Secondary text that must still read over art |
| `inkMuted` | `#8e9498` | Metadata, hints |
| `inkFaint` | `#626b70` | Placeholders, disabled |
| `bg` / `bgDeep` / `bgSubtle` | `#0a0b0e` / `#07080b` / `#12141a` | Page, deepest room, wells |

Rules

- Chartreuse means "act here" or "this one is on". Never decoration.
- Coral means love. The heart, the Luv button, the liked badge. Nothing else.
- No new one-off accent. If a role is missing, add a token first.
- The app is dark. Light mode exists for text-heavy settings only; the player,
  Stream, Luvs, Search and Library are always the dark room.

### Artwork colour

`useArtworkPalette(uri)` extracts the cover's colours natively on Android
(`NativePalette`) with Allegra's vivify rules, falling back to a supplied
duotone, then to Allegra's default room. Artwork colour may tint:

- the live shader (`DynamicAura`),
- glass washes (`Frosted` palette prop),
- the colour that rises at the foot of a Luvs card,
- glows behind featured art.

It must never recolour text or the `wave` action colour.

---

## 2. Material

### Frosted glass

Floating surfaces (menus, sheets, the voice card) use `allegra/Frosted`: real
blur on both platforms (`experimentalBlurMethod` on Android), a thin dark tint,
an optional cover wash, a specular sheen and a lit top edge.

**Never put live blur on always-visible chrome.** The tab bar and the now
playing pill blur a *bitmap* of the cover once (`Image blurRadius`) under a dark
tint. A live Android blur re-renders on every scroll frame.

### The cheap blur

For any large blurred background (Luvs backdrop, cover glows): decode a tiny copy
(`resizeMethod="resize"`, 24–36 px), blur that, and scale it up with a
transform. Blurring a thumbnail is instant; blurring a full-resolution cover on
the CPU takes 1–2 s on older phones, which is exactly the "sharp, then fogs
over" glitch Luvs used to have. Every mounted card carries its blur from the
first frame — never gate blur on `isActive`.

### Hierarchy

One glass surface plus quieter wells. Don't stack opaque cards to fake depth.

| Surface | Radius | Treatment |
| --- | --- | --- |
| Tab bar | pill | cover bitmap blur + tint, hairline, top highlight |
| Now playing pill | pill, 56 px, max 330 | blurred cover / glow / solid; `wave` progress ring round the art |
| More menu / sheets | 26–30 | `Frosted`, dim + blur behind |
| Luvs card | 30 | art full-bleed, cover colour rising at the foot |
| Content wells, search field | 16 / pill | `rgba(255,255,255,0.06–0.10)` + hairline |
| Artwork | 16 (thumbs 10–12) | crisp; never over-rounded |
| Icon buttons | circle, ≥ 40 px | `Glass.fillLight` + hairline |

---

## 3. Type

SF Pro everywhere (see CLAUDE.md for how Android gets it). Styles set only
`fontWeight` and `fontSize`.

| Role | Size / weight |
| --- | --- |
| Page title (Stream, Search, Library, Luvs) | 28 / 700 |
| Shelf heading (`SectionHeading`) | 22 / 700 + optional 13 / 400 subtitle |
| Featured title, player title | 22 / 700, 22 / 600 |
| Row title / subtitle | 15–16 / 600 · 13 / 400 |
| Chip / button label | 14–15 / 600 |
| Meta, times | 12–13, tabular numbers |

Sentence case, always. No all-caps, no tracking on labels, no emoji or sparkle
glyphs in UI copy, no "magic" wording.

---

## 4. Layout and the bottom chrome

```
┌──────────────────────────┐
│ status bar scrim         │
│ Title          (glass ○) │
│ search field / mood chips│
│ …content…                │
│                          │
│ ╭ now playing pill ────╮ │  ← every screen except Luvs & the player
│ ╰──────────────────────╯ │
│ ╭ Stream Luvs 🎙 Library •••╮│  ← floating tab bar
└──────────────────────────┘
```

- Gutter: 20 px (`GUTTER` in `StreamHome`). Headings and content share it.
- Everything that scrolls pads its bottom with `useBottomClearance()` — tab bar
  plus the pill when it shows. Don't hardcode 100/180/208 again.
- The ••• menu, the pill and the voice card are mounted at the **root**
  (`RootNavigator`), in that paint order: pill → menu (`MoreMenuHost`) → voice
  card. The tab bar owns the menu's state and publishes it through
  `HostedMoreMenu`, so the menu always opens on top of the pill.
- A new destination goes in `MORE_ITEMS`, not in the tab bar.

---

## 5. The player

### Now playing pill (`PillPlayer`)

Default mini player (`miniPlayerStyle: 'pill'`), modelled on Echo Music's
NewMiniPlayer. Shows on every screen in the tab shell except Luvs. Round art
inside a `wave` progress ring, title over artist, then previous · play · next.
The play button is Echo's nine-lobed "cookie": a circle at rest that grows soft
lobes and turns once every 8 s while music plays.

| Gesture | Result |
| --- | --- |
| Tap | open the player |
| Swipe up | open the player, carrying the flick's speed into the sheet |
| Drag sideways | the row follows the finger; past 60 px or faster than 600 px/s, it skips |

The row springs home without bounce. It is 54 px tall: 40 px art in its ring,
a 40 px cookie, 18 px skip glyphs.

The Dynamic Island (`island`) and classic bar (`bar`) remain as settings.

### Player sheet (`NowPlayingScreen` + `navigation/playerSheet.ts`)

The route is a transparent modal with no native animation; the screen animates
itself so it can be dragged.

- **Open:** rises with a clamped spring (`stiffness 240, damping 32`), no bounce.
- **Drag down from anywhere** to dismiss; the page underneath shows through,
  dimmed. Over the lyrics the drag belongs to the list until it is scrolled to
  its top (Apple Music's split).
- **Release:** past 22 % of the screen or faster than 900 px/s → falls away
  with an accelerate curve whose length follows the flick; otherwise springs back.
- Back button and the chevron use the same exit (`usePreventRemove`).
- The pill fades back in as the sheet starts falling.
- Controls never auto-hide.

### Player look (Settings → Player)

**Apple Music inspired** (switch): the cover runs full width across the top and
melts into its own blur — Echo's hero, with the canvas playing inside it. Off
shows a floating artwork card.

**Player background:**

| Style | What it is |
| --- | --- |
| **Blend** (default) | Apple Music's room under the cover, with the glow drifting through it |
| **Apple Music** | Echo's style: the cover blurred soft behind a sharp hero |
| **Glow animated** | Echo's glow: soft radial blobs of the cover's colours drifting over near-black — only their transforms move |

**Mini player background:** glow animated (two blobs in the cover's colours) or
cover tint.

### Canvas

Decorative, muted, never takes audio focus. The cover stays under it, so
whatever the canvas reveals is the cover, never a gap. It never vanishes mid-frame: when
the song changes the old clip fades out (520 ms) before the next one fades in
on its first frame, and the loop point dips to 20% and back so a clip that
isn't cut to loop doesn't visibly jump. `CanvasVideoLayer` sizes the video
from its real track dimensions to a true cover fit and renders into a
TextureView on Android (a SurfaceView ignores fades, clips and the sheet's
drag). The lookup keys on title + artist only, so metadata backfill mid-song
can't blank it.

---

## 6. Screens

| Screen | Recipe |
| --- | --- |
| **Stream** | `DynamicAura`, title, mood chips, shortcut grid, quick picks, cover shelves |
| **Search** | same room; one field for the phone *and* the catalog; scopes All · On this phone · Online; recent searches; mood tiles |
| **Library** | same room; glass "+", Downloads row, two-column playlist mosaics rising in 40 ms apart |
| **Playlist** | CoverFlow deck, playlist name, meta + sort chip, **Play / Shuffle** (transport lives in the pill), glass header that fades in on scroll |
| **Luvs** | dark frosted room; one rounded card per clip (art or canvas, thumb, title, "Full song" pill); scrubber and four round actions under it |
| **Player** | canvas or artwork stage, grab handle, controls on a scrim, `wave` play button; tap the artist to open their page |
| **Artist** | Echo's layout: one sharp square photo masked into the shader (drifts at ⅓ scroll, stretches on overscroll), 40/700 name on its foot, subscriber + `wave` monthly chips, About, Play · Radio · Shuffle, Top songs, On this phone, shelves (albums, singles, fans also like as round avatars) |

### Shader at rest

`DynamicAura` keeps the field lit when nothing plays (66% opacity, 0.34 energy)
— at 30% under the scrims the Stream page read as plain black. Screens pass a
small `dim` (0.06 Stream, ~0.14 elsewhere); don't stack extra dark scrims on it.

---

## 7. Motion

Primitives: `RiseIn`, `Tactile`, `SwapText`, `MorphIcon`, `NudgeIcon`
(`allegra/motion.tsx`). Reuse them.

- Springs for anything a finger can interrupt; 160–400 ms timings for state.
- 40 ms list staggers, capped at 10 items.
- **Transform and opacity only.** No animated `height`, `width`, `top`,
  `backgroundColor` or `borderRadius`. Equaliser bars use `scaleY` from the
  baseline; progress bars use `scaleX` from the left; a header "turns solid" by
  fading a scrim, not by animating its colour.
- At most two self-running effects per screen (e.g. the shader + a canvas).
- Reduce Motion collapses movement to fades; it never removes a feature.

### Old-phone budget

- One gesture per component, worklets on the UI thread, cross to JS only when a
  discrete value changes (the lyric line).
- `DynamicAura` gets `active={isFocused}` so hidden screens stop their shader.
- Lists over ~30 rows use FlashList.
- Blur thumbnails, not full covers.
- Rows respond on the first tap — no multi-tap timers in front of the common case.

---

## 8. Home-screen widgets (Android)

Built with `react-native-android-widget`; glyphs are inline SVG (`widget/icons.ts`).

**Now playing** (3×3, resizable): a soft frame around the cover full-bleed; a
glass pill with the song, share and like circles; elapsed / remaining; a white
progress bar; round dark-glass transport buttons. Below ~190 dp it drops text.

**Playlist** (4×3, resizable): cover, name, count, a `wave` play button and ›
to cycle playlists; a scrollable list where the playing row wears `wave`.

The app writes a snapshot (`widget/widgetData.ts`) on song, play-state, like and
playlist changes, plus a 20 s tick while playing. Transport acts on the live
player; rows, "play playlist" and share are `lyricflow://widget/…` deep links so
they work from a cold start. RemoteViews can't blur: "frosted" there means a
dark translucent fill.

---

## 9. Checklist for a new screen

1. Dark room: `Signal.bg`, `DynamicAura` (with `active={isFocused}`) or a
   cheap-blur backdrop — not flat black.
2. 28/700 sentence-case title on the gutter; glass round buttons for actions.
3. Shelves with `SectionHeading`; rows with `SongRow` / `PlaylistItem`.
4. Bottom padding from `useBottomClearance()`.
5. Play/pause through `requestPlayback`; open the player with `openPlayerSheet`.
6. Loading, empty and offline states designed, never blank glass.
7. Transform/opacity motion from the primitives; check on a low-end phone.
