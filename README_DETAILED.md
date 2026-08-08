# 🎵 LuvLyrics (LyricFlow): The Deep Dive

> **A Premium, Privacy-First, Local Lyrics Experience.**

LuvLyrics isn't just a lyrics storage app; it's a visual instrument designed to turn your lyric-reading into a cinematic experience. This document provides a comprehensive breakdown of the project's architecture, technical decisions, and file-by-file organization.

---

## 📖 Table of Contents
1. [Project Philosophy](#project-philosophy)
2. [Technical Foundations](#technical-foundations)
3. [Directory Architecture](#directory-architecture)
4. [Design System](#design-system)
5. [Key Features](#key-features)
6. [Future Roadmap](#future-roadmap)

---

## 🌟 Project Philosophy

LuvLyrics was built on three core pillars:
1. **Local-First Reliability**: Your data belongs to you. No cloud dependencies, no tracking. Everything is stored in a structured SQLite database.
2. **Visual Immersion**: Inspired by Apple Music's aesthetic, the app uses real-time Skia-powered blurs and animated gradients to create a focused reading environment.
3. **Frictionless Input**: Parsing lyrics shouldn't be hard. The app is designed to "just work" with messy text pasted from ChatGPT or traditional timestamped LRC formats.

---

## 🧠 Technical Foundations

### Current Player & Lyrics Reader
The standalone Now Playing screen was removed. `MiniPlayer.tsx` is the only player surface: both the Classic Bar and bottom-centred Dynamic Island keep transport controls docked while lyrics expand upward.

- **Artwork flow**: `ArtworkFlowBackground.tsx` extracts a local cover-art palette and cross-fades directly from the outgoing track to the incoming track on a Skia canvas.
- **Tracking**: `SynchronizedLyrics.tsx` reads shared playback values and finds the active timestamp with binary search on the UI thread.
- **Glide**: Measured lyric-row midpoints are centred at 50% of the reader viewport. Destination changes use a 460 ms UI-thread glide; large seeks jump immediately.
- **Typography**: The active line changes colour, opacity, and font treatment without scaling, so the lyric layout remains stable.

See [Player & Lyrics Experience](./docs/player-lyrics-experience.md) for the maintained interaction contract.

### Robust Database Singleton
Expo SQLite can throw `NullPointerException` if multiple parts of the app try to open or query the database simultaneously.
- **Solution**: Implemented in `db.ts` using a `dbPromise` singleton pattern.
- **Recovery Path**: Automatic recovery mechanism that attempts to close, delete, and re-initialize the native state.
- **WAL Mode**: Enabled for concurrent reads/writes.

### Smart Timestamp Engine
The app handles "messy" data intelligently.
- **Regex**: `[\\[\\(]?(\\d{1,2})[:.](\\d{2})[\\]\\)]?`
- **Cleansing**: Aggressively cleans display text by stripping leading hyphens, colons, and pipes.

### Parallel Search Engine
The app implements a robust, tiered lyric fetching system.
- **Engine**: Orchestrated by `LyricsRepository.ts` using `MultiSourceLyricsService`.
- **Strategy**: 
    - **Parallel Fetching**: Hits **LRCLIB**, **JioSaavn**, and **Lyrica** simultaneously (5s race).
    - **Ranking**: Results are scored via `SmartLyricMatcher.ts` and ranked for the user.
    - **User Selection**: Preview mode allows users to pick the best source with colorful badges.
- **Hardware & Lock Screen Sync**: Fully integrated with `expo-audio`, supporting Bluetooth remote commands and system metadata.

### Instant Playback Architecture ⚡
To achieve <100ms startup times, the app uses an **Optimistic UI pattern**:
- **Problem**: Waiting for a full database query delays audio start by 300-500ms.
- **Solution**: The `loadSong` action in `playerStore.ts` immediately hydrates from memory cache and starts playback instantly.
- **Background Hydration**: Full lyrics and metadata are fetched asynchronously from SQLite.
- **Memoization**: The Library list uses strict `React.memo` and stable callbacks.

### Reliable End-of-Song Detection
The player needs to reliably advance to the next track when a song finishes, but `expo-av`'s `didJustFinish` flag can occasionally miss the exact end-of-playback moment.
- **Problem**: Songs sometimes hang at the end without advancing, especially on scrubbing or rapid track changes.
- **Solution**: `PlayerContext.tsx` implements a dual-detection strategy:
  - **Primary**: Uses `didJustFinish` from `expo-av` when it fires correctly.
  - **Fallback**: Detects near-end position (`currentTime >= duration - 0.35s`) combined with `!playing && !buffering` state to trigger the next track.
  - **Deduplication**: A `endHandledForSongIdRef` ensures the advance logic only fires once per song, preventing double-skipping or rapid-fire next calls.
- **Result**: Auto-next is now rock-solid even when the native player event system drops frames or reports slightly inaccurate finish states.

### Timed Lyric Reader
Timed lyrics use an animated scroll container rather than a separate screen. Playback time and active-index resolution stay on shared values; React only updates the reader when the target lyric line changes. This avoids issuing a native scroll command on every audio-position tick.

### Download Pipeline Performance
The download manager handles audio, cover art, and lyrics downloads while keeping the UI responsive.
- **Progress Throttling**: Progress callbacks are throttled to 120ms intervals instead of firing on every byte, preventing React re-render storms during fast downloads.
- **Concurrent Downloads**: `MAX_CONCURRENT` increased from 1 to 2, improving throughput without overwhelming the network stack.
- **Async Overhead Removal**: Progress updates no longer use `await` + `setTimeout` delays, keeping the download I/O thread unblocked.

### Lyric Reader Motion
`SynchronizedLyrics.tsx` measures row heights and uses their midpoints to centre the active line precisely. Normal active-line changes glide with a 460 ms cubic-bezier animation driven on the UI thread. An initial position or a seek that spans more than three lines snaps directly to its destination. The active line deliberately has no scale animation; only colour, opacity, vertical lift, and font treatment change.

### State Isolation Architecture
We implemented strict **Zustand Slicing** to prevent "render cascades".
- **Problem**: Subscribing to the whole store (`const { settings } = useStore()`) caused components to re-render when *any* setting changed.
- **Solution**: Components now only subscribe to atomic values.
  ```typescript
  // OLD (Bad)
  const { fontSize } = useSettingsStore(); // Re-renders on ANY store update
  
  // NEW (Good)
  const fontSize = useSettingsStore(state => state.fontSize); // Re-renders ONLY when fontSize changes
  ```
- **Impact**: The `Music Player` and `Lyrics Line` components now re-render 0 times during background operations.

### O(1) Queue Optimization
The Lyrics Scan Queue was rewritten from an Array to a HashMap (Record).
- **Previous**: `queue.find(id)` was O(n). With 500 songs queued, every status update triggered 500 checks.
- **Current**: `queue[id]` is O(1).
- **Result**: Queue operations are now instant regardless of size.

### Desktop Bridge Architecture *(Temporarily Disabled)*
The desktop bridge feature is **currently commented out** in `DesktopBridgeService.ts`. When enabled, the app can be remotely controlled from a desktop/web client over the local WiFi network through a custom bridge protocol.
- **Networking Stack**: Uses `react-native-tcp-socket` for raw TCP WebSocket and HTTP servers, plus `react-native-zeroconf` for mDNS service discovery.
- **Server Setup**: Two servers run concurrently on ports `8765` (WebSocket for real-time state/commands) and `8766` (HTTP for file serving — audio and cover art).
- **Handshake Protocol**: Desktop clients must send a WebSocket handshake with a SHA-1 computed challenge to authenticate.
- **State Synchronization**: The bridge pushes full player state (current song, position, duration, play/pause, queue) to all connected clients in real time via the WebSocket.
- **Command Handling**: Desktop clients send commands (`PLAY`, `PAUSE`, `SEEK`, `NEXT`, `PREV`, `SET_SOURCE`) which are routed directly into the `playerStore`.
- **Source Handoff**: A critical feature is automatic source transition between phone and desktop:
  - When desktop takes control (`SET_SOURCE: desktop`), the phone pauses and remembers its position.
  - When desktop disconnects (socket close, heartbeat timeout, or network loss), the phone waits a grace period (`HANDOFF_GRACE_MS: 1800ms`) then seamlessly resumes from the last known position.
  - This prevents audio clashes where both phone and desktop try to play simultaneously.
- **Heartbeat Health Monitoring**: The desktop client sends periodic heartbeats. The bridge runs a watchdog (`HEARTBEAT_TIMEOUT_MS: 3000ms`) to detect stale connections and trigger handoff back to the phone automatically.
- **mDNS Discovery**: The phone publishes `_luvlyrics._tcp.local` with TXT records containing `ip`, `deviceName`, `deviceId`, `name`, `app`, and `proto` so desktop clients can discover and connect without manual IP entry.
- **Per-Song Cover Art Serving**: The HTTP `/cover` endpoint accepts a `?songId=` query parameter, allowing the desktop client to fetch cover art for any song in the queue — not just the currently playing track.
- **Device Identity**: Each device generates a persistent `deviceId` stored in `AsyncStorage` and infers a human-readable `deviceName` from `Platform.constants` (model/brand), making multi-device setups identifiable.
- **IP Monitoring**: An IP watchdog refreshes the mDNS advertisement every 5 seconds and detects WiFi network changes so the bridge stays discoverable even when the phone's local IP changes.

---

## 📂 Directory Architecture

### `src/components/`
| Component | Description |
|-----------|-------------|
| `LrcSearchModal.tsx` | Unified search interface with **Preview Mode** |
| `AuroraHeader.tsx` | **Skia-powered** organic blurred background |
| `VinylRecord.tsx` | Rotating vinyl record UI |
| `LyricsLine.tsx` | Reusable lyric-line presentation helpers |
| `PlayerControls.tsx` | Playback control buttons |
| `MiniPlayer.tsx` | Docked Classic Bar and Dynamic Island player surface |
| `TimelineScrubber.tsx` | Slim timeline progress bar with optimistic seeking |
| `ArtworkFlowBackground.tsx` | Skia-rendered cover-art palette flow |
| `SynchronizedLyrics.tsx` | UI-thread synced lyrics reader with centred line follow |
| `MagicModeModal.tsx` | AI-powered magic lyrics search |
| `ManualSyncModal.tsx` | Manual timestamp synchronization |
| `LanguagePickerModal.tsx` | Transliteration language selector |
| `AIGeneratorModal.tsx` | AI lyrics generation |
| `BatchReviewModal.tsx` | Batch lyrics review |
| `BulkSwapModal.tsx` | Bulk operations |
| `CoverFlow.tsx` | 3D cover carousel |
| `MosaicCover.tsx` | Grid mosaic display |
| `DownloadGridCard.tsx` | Download item card |
| `DownloadQueueModal.tsx` | Download queue management |
| `ReelCard.tsx` | Social reels card |
| `PlaylistItem.tsx` | Playlist list item |
| `AddToPlaylistModal.tsx` | Add to playlist |
| `CreatePlaylistModal.tsx` | Create playlist |
| `GradientPicker.tsx` | Theme gradient selector |
| `BackgroundDownloader.tsx` | Background download manager with concurrent queue |

### `src/screens/`
| Screen | Description |
|--------|-------------|
| `LibraryScreen.tsx` | Home view (Grid + List) |
| `AddEditLyricsScreen.tsx` | Manual entry |
| `SearchScreen.tsx` | Library search |
| `SettingsScreen.tsx` | App preferences |
| `AudioDownloaderScreen.tsx` | Audio downloader |
| `CoverArtSearchScreen.tsx` | Cover art search |
| `LikedSongsScreen.tsx` | Favorites |
| `PlaylistDetailScreen.tsx` | Playlist view |
| `PlaylistsScreen.tsx` | Playlists |
| `ReelsScreen.tsx` | Short-form content |
| `YoutubeBrowserScreen.tsx` | YouTube browser |

### `src/contexts/`
| Context | Description |
|---------|-------------|
| `PlayerContext.tsx` | Global audio player wrapper with end-of-song detection, scrub debouncing, and bridge integration |

### `src/services/`
| Service | Description |
|---------|-------------|
| `MultiSourceLyricsService.ts` | Parallel fetching |
| `JioSaavnLyricsService.ts` | JioSaavn API |
| `LyricaService.ts` | Lyrica API |
| `LrcLibService.ts` | LRCLIB API |
| `GeniusService.ts` | Genius scraper |
| `SmartLyricMatcher.ts` | Match scoring |
| `Tamil2LyricsService.ts` | Tamil lyrics |
| `TransliterationService.ts` | Romanization |
| `DownloadManager.ts` | Download queue |
| `ReelsRecommendationEngine.ts` | Content recommendations |
| `DesktopBridgeService.ts` | WiFi desktop bridge (WebSocket + HTTP + mDNS) |

### `src/store/` (Zustand)
| Store | Description |
|-------|-------------|
| `songsStore.ts` | Master song list |
| `playerStore.ts` | Playback state |
| `settingsStore.ts` | UI preferences |
| `playlistStore.ts` | Playlist management |
| `downloadQueueStore.ts` | Download queue |
| `lyricsScanQueueStore.ts` | Lyrics scan queue (O(1) Record) |
| `reelsFeedStore.ts` | Reels feed |
| `dailyStatsStore.ts` | Daily statistics |
| `desktopBridgeSettingsStore.ts` | Desktop bridge toggle and settings |

### `src/database/`
| File | Description |
|------|-------------|
| `db.ts` | SQLite initialization |
| `queries.ts` | Song CRUD |
| `playlistQueries.ts` | Playlist CRUD |
| `db_migration.ts` | Migrations |

---

## 🔄 The Lifecycle of a Lyric

1. **Search**: User clicks the ✨ Magic button.
2. **Fetch**: `MultiSourceLyricsService` queries multiple providers in parallel.
3. **Preview**: User scrolls through results and previews the text.
4. **Parsing**: `timestampParser.ts` identifies timestamps and cleans text.
5. **Storage**: `queries.ts` saves to SQLite.
6. **Animation**: The docked timed lyric reader follows the active line.

---

## 🪄 Smart Search Workflow

1. **Access**: Tap the ✨ Magic button on Now Playing.
2. **Search**: Type title/artist (defaults to current song).
3. **Waterfall**: System searches all sources in parallel.
4. **Select**: Tap a result to enter **Preview Mode**.
5. **Apply**: Tap "Apply Lyrics" to update.

---

## ✨ Key Features

### Lyrics Display
- Spotify/Apple Music-style scrolling
- 60fps animation using requestAnimationFrame
- Text case transformation (Normal, UPPERCASE, Title Case, Sentence case)
- Alignment options (Left, Center, Right)
- Instrumental indicators with animated bars
- Glow effects on active lyrics

### Smart Search
- Multi-source parallel fetching
- Match scoring and ranking
- Preview before apply
- Dynamic gradient theming

### Library Management
- Grid/List hybrid view
- Custom cover art upload
- Recently played tracking
- Playlist management (CRUD)
- Liked songs collection

### Audio Features
- Multi-source downloads
- Quality selection
- Download queue
- Background playback

### Desktop Bridge Remote Control *(Temporarily Disabled)*
- WiFi-based remote control from desktop/web clients
- Real-time two-way sync (player state, queue, position)
- Automatic playback handoff between phone and desktop
- Heartbeat health monitoring with automatic fallback
- mDNS zero-configuration discovery on local network
- Per-song cover art serving to desktop clients
- Secure WebSocket handshake with SHA-1 challenge

### Social Features
- Reels feed
- Content recommendations
- Vault for favorites

### Regional Support
- Transliteration for Tamil/Hindi
- Language picker
- Toggle original/transliterated

---

## 🛣️ Future Roadmap

- [x] **Desktop Bridge**: WiFi remote control with automatic handoff — **Implemented but temporarily disabled**
- [x] **Reliable Auto-Next**: Robust end-of-song detection with fallback — **Implemented**
- [x] **Download Performance**: Throttled progress and concurrent downloads — **Implemented**
- [ ] **Persistent Queues**: Move queue to SQLite
- [ ] **Local LRC Export**: Export lyrics to .lrc files
- [ ] **Visualizer**: Real-time waveform
- [ ] **More Transliteration Languages**: Telugu, Malayalam, Kannada
- [ ] **Desktop Bridge v2**: WebRTC audio streaming, lyrics overlay on desktop

---

*LuvLyrics is a labor of love for people who still value their own personal library and the art of reading music.*
