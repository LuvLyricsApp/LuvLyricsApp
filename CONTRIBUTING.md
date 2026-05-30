# Contributing to LuvLyrics

Thanks for stopping by. Whether you're fixing a bug, adding a feature, or improving docs — this guide will get you from zero to a clean PR.

## Quick Start (5 minutes)

```bash
# 1. Fork the repo on GitHub, then clone your fork
git clone https://github.com/<your-username>/LuvLyricsApp.git
cd LuvLyricsApp

# 2. Install dependencies
npm install

# 3. Create environment file
cp .env.example .env

# 4. Start the app
npm start
```

For Android:

```bash
npm run android
```

For iOS:

```bash
npm run ios
```

That's it — you're ready to contribute. For the full workflow, read on.

---

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Ways to Contribute](#ways-to-contribute)
- [Full Contribution Workflow](#full-contribution-workflow)
- [Branch Naming](#branch-naming)
- [Commit Message Style](#commit-message-style)
- [PR Checklist](#pr-checklist)
- [Automated PR Checks](#automated-pr-checks)
- [Coding Guidelines](#coding-guidelines)
- [Issue Labels](#issue-labels)
- [Troubleshooting / FAQ](#troubleshooting--faq)
- [Security and Secrets](#security-and-secrets)
- [Additional Resources](#additional-resources)
- [Need Help?](#need-help)

## Code of Conduct

By participating, you agree to follow our Code of Conduct:
[CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md)

## Ways to Contribute

- Report bugs
- Propose features
- Improve documentation
- Add tests
- Refactor and optimize existing code

## Full Contribution Workflow

> **Rule: every PR must be linked to an issue. PRs opened without a linked issue will be closed without review.**
> If no issue exists yet, open one first and wait for a maintainer to confirm it's in scope before starting work.

### 1. Find and claim an issue

Browse [open issues](https://github.com/LuvLyricsApp/LuvLyricsApp/issues). Look for labels like `good first issue`, `help wanted`, or `gssoc`. Comment on the issue you want to tackle and wait for a maintainer to assign it to you.

### 2. Fork and clone

```bash
git clone https://github.com/<your-username>/LuvLyricsApp.git
cd LuvLyricsApp
```

Add the upstream remote to stay in sync:

```bash
git remote add upstream https://github.com/LuvLyricsApp/LuvLyricsApp.git
```

### 3. Create a branch

Create a focused branch from `main`. Use a descriptive name:

```bash
git checkout main
git pull upstream main
git checkout -b fix/12-improve-contributing-examples
```

### 4. Make your changes

Edit the relevant files in your editor. Stick to what the issue asks for — avoid sneaking in unrelated refactors.

### 5. Run CI checks locally

Before committing, make sure everything passes:

```bash
npm run ci
```

This runs: secret scan → lint → typecheck → tests with coverage.

You can also run checks individually:

```bash
npm run lint          # Check code style
npm run typecheck     # Check TypeScript types
npm run test:ci       # Run unit tests with coverage
```

### 6. Commit and push

Stage your files and write a [conventional commit](#commit-message-style) message:

```bash
git add .
git commit -m "docs: improve CONTRIBUTING onboarding examples"
git push origin fix/12-improve-contributing-examples
```

### 7. Open a pull request

- Open a PR against the `main` branch using the PR template
- Fill every section of the template
- Put `Closes #<issue-number>` in the Related Issue field
- Wait for a maintainer review — do not merge your own PR

## Branch Naming

Use clear, scoped branch names that include the issue number when applicable:

| Scope | Pattern | Example |
|-------|---------|---------|
| Feature | `feat/<short-description>` | `feat/persistent-queue-sqlite` |
| Bug fix | `fix/<issue-number>-<short-description>` | `fix/42-webview-lyrics-copy` |
| Documentation | `docs/<issue-number>-<short-description>` | `docs/12-improve-contributing` |
| Refactor | `refactor/<short-description>` | `refactor/player-store-cleanup` |
| Tests | `test/<short-description>` | `test/download-manager-coverage` |

## Commit Message Style

Prefer conventional commits with optional scope:

```
<type>(<optional-scope>): <description>
```

| Type | When to use |
|------|-------------|
| `feat` | A new feature |
| `fix` | A bug fix |
| `docs` | Documentation-only changes |
| `refactor` | Code change that neither fixes a bug nor adds a feature |
| `test` | Adding or updating tests |
| `chore` | CI, build, or tooling changes |

Examples:

- `feat: add local lrc export action`
- `fix: prevent queue duplication on retry`
- `docs: improve setup instructions`
- `refactor(player): extract seek logic into helper`
- `test: add download manager unit tests`
- `chore: bump expo to 54.0.33`

## PR Checklist

Before opening your PR, make sure:

- [ ] Linked to an existing issue (`Closes #N` in the PR description)
- [ ] Branch named per the [branch naming convention](#branch-naming)
- [ ] Passes `npm run ci` locally (lint, typecheck, tests, secrets)
- [ ] No secrets, API keys, or `.env` files committed
- [ ] Changes are scoped to a single issue (no unrelated refactors)
- [ ] UI changes match the existing app style (if applicable)

## Automated PR Checks

Every pull request to `main` runs GitHub Actions.

Required checks:

- Secret scan: blocks committed API keys, private keys, `.env`, and credential files
- Dependency review: blocks high-severity dependency changes
- Lint: runs `npm run lint`
- Typecheck: runs `npm run typecheck`
- Unit tests: runs `npm run test:ci` with coverage output

PRs should stay green until these checks pass.

## Coding Guidelines

- Use TypeScript types instead of `any` when possible
- Avoid large unrelated refactors in the same PR
- Preserve existing architecture and naming patterns
- Keep UI changes visually consistent with the app style

## Issue Labels

Recommended labels:

- `good first issue` for beginner-friendly tasks
- `help wanted` for open contributions
- `bug`, `enhancement`, `documentation`, `performance`, `security`

For the full issue review process, see the [Issue Triage Guide](docs/issue-triage.md).

## Troubleshooting / FAQ

### `npm run lint` fails

Run the auto-fixer:

```bash
npx eslint . --fix
```

Still failing? Look for unused imports, missing semicolons, or trailing whitespace. Run `npm run lint` again to check.

### `npm run typecheck` fails

A few things to check:

- Did you use `as any`? Swap it for a proper TypeScript type
- Did a function signature change? The callers might need updating too
- An imported module could have a type error

Read the error message — it tells you the exact file and line.

### `npm run test:ci` fails

```bash
npm test -- --watch
```

This keeps tests running as you edit so you can narrow down the problem. If you changed a component that has snapshot tests:

```bash
npm test -- -u
```

### Merge conflicts when updating your branch

```bash
git fetch upstream
git merge upstream/main
# Resolve conflicts, then:
npm run ci
git add .
git commit -m "chore: merge main"
```

### Build fails on Android

Check that Android Studio and the NDK are installed. See `README.md` for platform setup notes. Docs-only, linting, and unit test changes do not require Android or iOS builds.

### Build fails on iOS

Xcode is required for iOS builds (macOS only). If you're on Linux or Windows, you can still contribute — focus on docs, linting, typecheck, and tests.

## Security and Secrets

- Do not commit secrets, API keys, or credentials
- If you find a security issue, follow:
[SECURITY.md](./SECURITY.md)

## Additional Resources

- [Issue Triage Guide](docs/issue-triage.md)

## Need Help?

- Use GitHub Discussions for questions
- Use Issues for actionable bugs/features
- Join the [Discord community](https://discord.gg/VeR3hAfUn) for real-time help

Thank you for helping improve LuvLyrics.
