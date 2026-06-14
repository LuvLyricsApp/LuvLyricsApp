# Contributing to LuvLyrics

Thanks for your interest in contributing.
This guide helps you set up quickly and submit high-quality pull requests.

## Code of Conduct

By participating, you agree to follow our Code of Conduct:
[CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md)

## GSSoC 2026 Contributors

LuvLyrics is an official GSSoC 2026 project.

**Assignment rule:** Comment on the issue you want to work on and wait for a
maintainer to assign it before writing any code. Unassigned PRs will not earn
GSSoC points and may be closed without review.

### Point levels

| Label | Points | What fits |
| --- | --- | --- |
| `gssoc-l1` | 10 pts | Docs, tests for existing code, small UI/copy fixes |
| `gssoc-l2` | 25 pts | New features, lyrics providers, UI improvements, moderate refactors |
| `gssoc-l3` | 45 pts | Native Kotlin modules, player engine, SQLite migrations, multi-store work |

Browse GSSoC-eligible issues: [`gssoc` label](https://github.com/LuvLyricsApp/LuvLyricsApp/issues?q=label%3Agssoc)

---

## Ways to Contribute

- Report bugs
- Propose features
- Improve documentation
- Add tests
- Refactor and optimize existing code

## Development Setup

### 1. Fork and clone

```bash
git clone https://github.com/<your-username>/LuvLyricsApp.git
cd LuvLyricsApp
```

### 2. Install dependencies

```bash
npm install
```

### 3. Set up Android Studio

Install [Android Studio](https://developer.android.com/studio) and ensure the
Android SDK and an emulator (or physical device) are configured. Run
`npx expo-doctor` after setup to verify your environment is ready.

### 4. Start the app

```bash
npm start
```

Run on Android:

```bash
npm run android
```

> **Note:** LuvLyrics targets Android only. iOS builds are not supported.

## Troubleshooting

If setup or local checks fail, start with these quick checks.

Confirm you are using Node.js 20 or newer:

```bash
node --version
```

If dependencies look stale after pulling changes or switching branches, install
them again:

```bash
npm install
```

If a local environment file is needed, copy the example file and fill only the
values you need for your work:

```bash
cp .env.example .env
```

On Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

Run the same checks that CI uses:

```bash
npm run lint
npm run typecheck
npm run test:ci
npm run test:providers
```

Docs-only work, linting, typechecking, and unit tests usually do not require
Firebase or Google credentials. If Android or emulator setup fails, check
the platform setup notes in `README.md`.

## Branch Naming

Use clear, scoped branch names:

- `feat/<short-description>`
- `fix/<issue-number>-short-description`
- `docs/<short-description>`
- `refactor/<short-description>`
- `test/<short-description>`

Examples:

- `feat/persistent-queue-sqlite`
- `fix/85-magic-number-comments`

## Commit Message Style

Prefer conventional commits:

- `feat: add local lrc export action`
- `fix: prevent queue duplication on retry`
- `docs: improve setup instructions`

## Pull Request Process

> **Rule: every PR must be linked to an issue. PRs opened without a linked issue will be closed without review.**
> If no issue exists yet, open one first and wait for a maintainer to confirm it's in scope before starting work.

1. Open or find an issue — get it confirmed before writing code
2. Create a focused branch from `main` following the branch naming convention above
3. Keep PR scope small — one issue per PR
4. Add/update tests where relevant
5. Run CI checks locally before pushing:

```bash
npm run lint
npm run typecheck
npm run test:ci
npm run test:providers
```

6. Open PR using the template, fill every section, and put `Closes #<issue-number>` in the Related Issue field
7. Wait for a maintainer review — do not merge your own PR

## Automated PR Checks

Every pull request to `main` runs GitHub Actions.

Required checks:

- Secret scan: blocks committed API keys, private keys, `.env`, and credential files
- Dependency review: blocks high-severity dependency changes
- Lint: runs `npm run lint`
- Typecheck: runs `npm run typecheck`
- Unit tests: runs `npm run test:ci` with coverage output

PRs should stay red until these checks pass. Maintainers can then enable branch protection in GitHub settings and require the `Lint, Typecheck, Test` and `Dependency Review` checks before merge.

## Coding Guidelines

- Use TypeScript types instead of `any` when possible
- Avoid large unrelated refactors in the same PR
- Preserve existing architecture and naming patterns
- Keep UI changes visually consistent with the app style

## Issue Labels

| Label | Purpose |
| --- | --- |
| `gssoc-l1` | GSSoC task — 10 pts |
| `gssoc-l2` | GSSoC task — 25 pts |
| `gssoc-l3` | GSSoC task — 45 pts |
| `good first issue` | Beginner-friendly, minimal context needed |
| `help wanted` | Open for community contributions |
| `bug` | Something is broken |
| `enhancement` | New feature or improvement |
| `documentation` | Docs-only change |
| `performance` | Speed or memory improvement |
| `security` | Security-related change |

For the full issue review process, see the [Issue Triage Guide](docs/issue-triage.md).

## Security and Secrets

- Do not commit secrets, API keys, or credentials
- If you find a security issue, follow:
[SECURITY.md](./SECURITY.md)

## Additional Resources

- [Issue Triage Guide](docs/issue-triage.md)

## Need Help?

- **Discord**: [Join our community](https://discord.gg/VeR3hAfUn) — fastest way to reach maintainers
- **GitHub Discussions**: for questions and idea brainstorming
- **Issues**: for actionable bugs and features only

Thank you for helping improve LuvLyrics.
