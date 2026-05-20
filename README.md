# LuvLyrics

[![CI](https://github.com/peterish8/LuvLyrics/actions/workflows/ci.yml/badge.svg)](https://github.com/peterish8/LuvLyrics/actions/workflows/ci.yml)
[![Expo](https://img.shields.io/badge/Expo-54.0-000020?style=flat-square&logo=expo&logoColor=white)](https://expo.dev)
[![React Native](https://img.shields.io/badge/React_Native-0.81-61DAFB?style=flat-square&logo=react&logoColor=black)](https://reactnative.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org)

LuvLyrics is an open-source, local-first lyrics and music library app built with Expo, React Native, TypeScript, SQLite, and Zustand.

The app focuses on a premium lyrics-reading experience: synced lyrics, plain lyric auto-scroll, playlists, local library management, manual lyrics search, cover art tools, and multi-source lyric fetching.

## Project Status

This project is open for contributors.

Recent improvements:

- Player end-of-song detection is more reliable with a near-end fallback that triggers the next track even when `didJustFinish` misses
- Download progress UI is smoother with throttled callbacks and concurrent downloads increased to 2
- Lyrics scrolling is now buttery-smooth with `@shopify/flash-list` view recycling, debounced layout measurements, and binary-search active-line detection
- Lyrics now have a professional `MaskedView` + `LinearGradient` edge fade — text softly blurs at the top and bottom edges like Apple Music
- Desktop bridge is temporarily disabled (code preserved for future re-enablement)

Good places to start:

- Check open issues: https://github.com/peterish8/LuvLyrics/issues
- Pick issues labeled `good first issue` or `help wanted`
- Read [CONTRIBUTING.md](./CONTRIBUTING.md) before opening a PR
- Follow [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md)
- Report sensitive issues through [SECURITY.md](./SECURITY.md)

## Tech Stack

- Expo SDK 54
- React Native 0.81
- React 19
- TypeScript
- SQLite via `expo-sqlite`
- Zustand for state
- `react-native-tcp-socket` and `react-native-zeroconf` for desktop bridge networking
- `expo-av` for audio playback
- `expo-file-system` for local file and download management
- `@shopify/flash-list` for high-performance list virtualization (library and lyrics)
- Jest + ts-jest for unit tests
- GitHub Actions for PR checks

## Features

- Synced lyrics display with smooth active-line scrolling powered by `@shopify/flash-list`
- Plain lyrics auto-scroll for lyrics without timestamps
- Local SQLite song and playlist storage
- Playlist management and per-playlist loop behavior
- Manual lyrics search through in-app WebView
- Lyrics provider integrations through LRCLIB, Genius, Lyrica, JioSaavn-style APIs
- Cover art search and local media tooling
- Download queue and audio downloader flows
- **Desktop bridge** — *temporarily disabled*; remote control the app from a desktop/web client over WiFi, with automatic phone-to-desktop playback handoff, heartbeat health monitoring, and per-song cover art serving
- Open-source issue templates, PR template, CI checks, and contributor docs

## Repository Structure

```text
src/
  components/       Reusable UI components
  screens/          App screens and navigation destinations
  services/         Provider clients, download logic, search logic
  store/            Zustand stores
  database/         SQLite setup, migrations, and queries
  utils/            Parsers, formatters, import/export helpers
  types/            Shared TypeScript types
scripts/
  ci/               CI helper scripts
.github/
  workflows/        GitHub Actions workflows
  ISSUE_TEMPLATE/   Issue templates
```

## Prerequisites

Install these before starting:

- Node.js 20 or newer
- npm
- Git
- Expo tooling through npm scripts
- Android Studio for Android builds
- Xcode for iOS builds (macOS only)

## Local Setup

1. Fork the repository on GitHub.

2. Clone your fork:

```bash
git clone https://github.com/<your-username>/LuvLyrics.git
cd LuvLyrics
```

3. Install dependencies:

```bash
npm install
```

4. Create local environment file:

```bash
cp .env.example .env
```

On Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

5. Start Expo:

```bash
npm start
```

6. Run on Android:

```bash
npm run android
```

7. Run on iOS:

```bash
npm run ios
```

## Environment Variables

Most features work without API keys because several services have public/fallback paths. Some integrations are optional and need local env values.

Create `.env` from `.env.example` and fill only what you need.

| Variable | Required | Used by | Notes |
| --- | --- | --- | --- |
| `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` | Optional | `AuthService` | Needed for Google sign-in flows. |
| `EXPO_PUBLIC_GENIUS_ACCESS_TOKEN` | Optional | `GeniusService` | Improves Genius lyric search/scraping reliability. |
| `EXPO_PUBLIC_SAAVN_API_URL` | Optional | `SpotifyBridgeService` | Primary Saavn-compatible API base URL. |
| `EXPO_PUBLIC_SAAVN_SECONDARY_API_URL` | Optional | `MultiSourceSearchService`, `SpotifyBridgeService` | Secondary fallback API base URL. |
| `EXPO_PUBLIC_GAANA_API_URL` | Optional | `MultiSourceSearchService` | Gaana-compatible fallback API base URL. |
| `EXPO_PUBLIC_API_SECRET` | Optional | `MultiSourceSearchService` | Only use if your API endpoint expects a shared secret. |
| `EXPO_PUBLIC_SPOTIFY_CLIENT_ID` | Optional | `SpotifyService`, `SpotifyBridgeService` | Needed for Spotify metadata flows. |
| `EXPO_PUBLIC_SPOTIFY_CLIENT_SECRET` | Not recommended in public clients | `SpotifyService`, `SpotifyBridgeService` | Do not ship real client secrets in public mobile builds. Prefer a backend/proxy. |

Important security note:

- Do not commit `.env`, real tokens, private keys, `credentials.json`, or Firebase service files.
- `EXPO_PUBLIC_*` values are bundled into the client app. Treat them as public.
- Spotify client-secret based flows should be moved behind a backend before production release.

## Firebase / Google Services

The Expo config currently references `google-services.json` for Android builds.

For local native builds that use Firebase or Google sign-in, create your own Firebase project and place your local `google-services.json` at the repo root.

Do not commit that file. It is ignored by git.

If you are working on features unrelated to Firebase/auth, you usually do not need Firebase credentials for unit tests, linting, typechecking, docs, parser work, or most UI-only changes.

## Quality Checks

Run the full local CI bundle before opening a PR:

```bash
npm run ci
```

This runs:

- Secret scan: `npm run security:secrets`
- Lint: `npm run lint`
- Typecheck: `npm run typecheck`
- Tests with coverage: `npm run test:ci`

You can also run checks individually:

```bash
npm run lint
npm run typecheck
npm test
```

## Pull Request Checks

Every pull request to `main` runs GitHub Actions from `.github/workflows/ci.yml`.

The PR pipeline runs:

- Dependency review for high-severity dependency changes
- Secret scan
- Lint
- Typecheck
- Unit tests with coverage

Maintainers should enable branch protection for `main` and require:

- `Lint, Typecheck, Test`
- `Dependency Review`

## Testing

Current test coverage starts with focused unit tests around core pure logic:

- `src/utils/timestampParser.test.ts`
- `src/services/SpotifyBridgeService.test.ts`

Good future test areas:

- SQLite query helpers
- Lyrics provider fallback behavior
- Download queue state transitions
- Playlist store behavior
- Filename sanitization for export/import

## Contributing

Please keep PRs focused and linked to an issue.

Recommended workflow:

1. Pick or open an issue.
2. Create a branch from `main`.
3. Make the smallest useful change.
4. Add or update tests when behavior changes.
5. Run `npm run ci`.
6. Open a PR using the template.

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the full guide.

## Security

Please do not report secrets or vulnerabilities in public issues.

Read [SECURITY.md](./SECURITY.md) for responsible reporting and secret-handling rules.

## Documentation

- [CONTRIBUTING.md](./CONTRIBUTING.md): contributor workflow
- [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md): community standards
- [SECURITY.md](./SECURITY.md): security policy
- [Database Schema Guide](./docs/database-schema.md): SQLite tables, migrations, and schema-change checklist
- [README_DETAILED.md](./README_DETAILED.md): architecture notes and historical feature details

## License

License information is not yet defined. Maintainers should add a `LICENSE` file before wider distribution.
