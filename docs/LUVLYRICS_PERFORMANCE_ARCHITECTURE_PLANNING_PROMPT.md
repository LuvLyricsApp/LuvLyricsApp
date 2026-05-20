# LuvLyrics Performance Architecture Planning Prompt

Use the following prompt with a strong architecture/planning model. This prompt is intentionally detailed and repo-specific. The goal is to produce a serious implementation plan for making LuvLyrics smoother, less laggy, and more native-feeling without defaulting to a rewrite.

---

## Prompt

```text
You are a senior mobile architect and performance engineer. I want a deep architectural planning pass for an existing React Native + Expo music app named LuvLyrics.

Your job is NOT to code yet.

Your job is to produce a serious, implementation-ready architecture and refactor plan for making this app significantly smoother, more isolated by feature, and less dependent on a single overloaded JS/render path.

You must think like someone planning a high-confidence refactor for a real production app, not like someone giving generic React Native tips.

Context:
- App name: LuvLyrics
- Domain: music player + lyrics + downloader + library management
- Platform stack:
  - React Native + Expo (managed workflow)
  - TypeScript strict
  - Zustand for app state
  - React Navigation
  - Reanimated 3 + Gesture Handler
  - expo-audio for playback
  - expo-sqlite for local library
  - FlashList for long lyrics/list rendering
- Main complaint:
  - app feels laggy
  - UI feels "component-ish" instead of smooth/native
  - too much seems to be happening in one app flow / one hot render path
  - likely too much JS-thread pressure, broad store subscriptions, render-heavy screens, and async orchestration living too close to UI
- Refactor budget:
  - we are comfortable with a large refactor
  - assume roughly 6000 LOC of meaningful architectural work if needed
- Important:
  - do NOT default to "rewrite the app from scratch"
  - do NOT casually recommend abandoning Expo unless you can justify it strongly
  - do NOT jump to "make everything native"
  - prefer high-impact architecture changes and runtime ownership cleanup first

Repository-specific context you must incorporate:

1. Playback engine and player state
- `src/contexts/PlayerContext.tsx`
  - wraps `useAudioPlayer`
  - syncs playback status into Zustand
  - handles auto-next via `didJustFinish` and a near-end fallback
- `src/contexts/playerStatusGuard.ts`
  - preserves playing state during seek/buffer transitions to avoid UI flicker
- `src/store/playerStore.ts`
  - single source of truth for:
    - `currentSong`
    - `currentSongId`
    - `isPlaying`
    - `position`
    - queue state
  - contains queue navigation such as `nextInPlaylist()`
  - currently includes a dynamic `require('./songsStore')` fallback for library auto-next when queue state is missing

2. Main playback UI hotspots
- `src/components/MiniPlayer.tsx`
  - owns expanded player UI
  - supports Dynamic Island style and Classic style
  - handles seek
  - likely a major interaction/render hotspot
- `src/screens/NowPlayingScreen.tsx`
  - large playback surface
  - interacts with synchronized lyrics
  - contains audio load guard logic using `activeLoadSongIdRef`
- `src/components/SynchronizedLyrics.tsx`
  - renders synchronized lyrics
  - uses FlashList
  - likely performance-sensitive because lyrics highlight/scroll can update frequently
- `src/components/TimelineScrubber.tsx`
  - seek interactions matter a lot for perceived smoothness

3. Lyrics flow
- `src/services/MultiSourceLyricsService.ts`
- `src/services/LyricaService.ts`
- `src/services/LyricsRepository.ts`
- `src/hooks/useSongStaging.ts`
  - stages songs
  - fetches covers
  - fetches lyrics in background
  - drives batch review and downloader flows
  - currently mixes staging state and async work orchestration
- `src/components/BatchReviewModal.tsx`
  - review flow for staged songs

4. Search and downloader flow
- `src/screens/AudioDownloaderScreen.tsx`
  - very large orchestration-heavy screen
  - owns tabs, search mode, selection mode, bulk mode, preview audio, queue prep, playlist flows, etc.
  - likely one of the biggest architectural and rerender hotspots
- `src/services/MultiSourceSearchService.ts`
  - search orchestration across providers
- `src/store/downloaderTabStore.ts`
- `src/store/downloadQueueStore.ts`
- `src/store/lyricsScanQueueStore.ts`

5. Library/data layer
- `src/store/songsStore.ts`
- `src/store/playlistStore.ts`
- `src/database/queries.ts`
- `src/database/playlistQueries.ts`
- SQLite is the source of persisted library data

6. Desktop/bridge/external integration
- `src/services/DesktopBridgeService.ts`
  - currently disabled / partially commented for start-stop lifecycle
  - should be treated carefully
  - do not casually recommend re-enabling it without lifecycle correctness

7. Project constraints and known notes
- seek pattern must preserve playback if user was already playing
- auto-next behavior in `PlayerContext` matters and should not regress
- `DesktopBridgeService` is currently disabled and should not be re-enabled casually
- `MAX_CONCURRENT` downloads is intentionally conservative
- app already has some state/workflow complexity, so over-abstraction is a risk

What I want from you:

1. Executive diagnosis
Give a blunt but fair diagnosis of what likely causes lag in an Expo/React Native music app of this exact shape.
Do NOT stay generic. Explain the likely failure modes in this repo shape:
- overloaded JS thread
- broad Zustand subscriptions
- large screens that orchestrate too much
- too many responsibilities in `AudioDownloaderScreen`
- playback status updates causing excessive rerenders
- synchronized lyrics updates competing with animation and rendering
- animation/gesture logic tied too closely to React state
- stale async work and competing fetches
- queue/player state coupled too tightly to screens
- feature boundaries not clean enough

2. Architectural target state
Design a target architecture for LuvLyrics that splits responsibilities clearly.
I want a modular feature architecture, not vague advice.
Define recommended boundaries for:
- Playback core
- Queue management
- Lyrics domain
- Search domain
- Download domain
- Library/indexing domain
- Desktop bridge/external integration domain
- UI shell / screen composition layer

For each domain, explain:
- responsibilities
- what state belongs there
- what should not belong there
- how it communicates with other domains
- what should live on UI thread vs JS thread vs deferred/background async queue

3. Performance-first runtime strategy
Explain how to reduce the "everything is happening in one thread" feeling in practical Expo/React Native terms.
Be explicit about:
- what should move to Reanimated/UI-thread ownership
- what should remain on JS thread
- what should become queued/deferred/batched work
- what should be memoized
- what should be virtualized
- what state should stay in Zustand vs local component state vs derived selectors
- when native/JSI escape hatches should be considered and when they should be avoided

4. Refactor strategy in phases
Create a phased roadmap that can realistically be executed.
Assume a total budget around 6000 LOC.
For each phase include:
- objective
- files/modules likely impacted
- why it matters
- expected smoothness/performance impact
- risks
- validation approach
- rough LOC estimate

I want a plan that feels like a real refactor program, not a random checklist.

5. Hotspot analysis checklist
Give me a concrete checklist to inspect in this codebase, including things like:
- broad Zustand subscriptions
- progress updates triggering large rerenders
- `MiniPlayer` render ownership
- `NowPlayingScreen` orchestration bloat
- `SynchronizedLyrics` update frequency
- `AudioDownloaderScreen` responsibility overload
- stale async flows in `useSongStaging`
- queue rebuild logic in `playerStore`
- provider/network/search error handling paths
- large prop identity churn for list rows

6. Risk assessment
Explain what can go wrong if we refactor aggressively:
- playback regressions
- auto-next regressions
- seek/scrub regressions
- lyrics desync
- stale state / race conditions
- UI state becoming harder to reason about
- over-abstraction without measurable gain

Then tell me how to minimize those risks.

7. Measurement plan
I do NOT want hand-wavy "it should feel smoother."
Define how to measure success:
- dropped frames / FPS indicators
- JS thread responsiveness
- rerender count reductions
- interaction latency
- seek responsiveness
- lyrics scroll/highlight smoothness
- tab switching responsiveness
- downloader/search responsiveness
- player transition smoothness

8. Required output format
Structure your response exactly as:
- Executive Summary
- Likely Root Causes
- Target Architecture
- Phase-by-Phase Refactor Plan
- Codebase Inspection Checklist
- Risks and Mitigations
- Success Metrics
- Recommended First 10 Files/Modules to Audit
- 6000 LOC Allocation Table
- Highest ROI 30-40% Version of the Plan
- Final Recommendation

9. Final requirement
At the end, give:
- a prioritized top 10 refactor target list
- rough LOC allocation by phase
- a "do this first if we only complete part of it" recommendation

Important tone constraints:
- be direct
- be opinionated
- avoid generic advice
- avoid motivational fluff
- explain tradeoffs clearly
- if you make assumptions, label them as assumptions
- if there are multiple strategies, compare them and recommend one
```

---

## Suggested use

- Give this prompt to the planning model together with the repo or relevant code excerpts.
- Ask it to produce the plan in markdown so it can be reviewed and turned into implementation phases.
- If needed, follow up by asking for a second pass focused only on:
  - playback and lyrics runtime ownership
  - downloader/search architectural split
  - Zustand subscription minimization

