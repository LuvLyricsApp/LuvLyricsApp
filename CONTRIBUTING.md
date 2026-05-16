# Contributing to LuvLyrics

Thanks for your interest in contributing.
This guide helps you set up quickly and submit high-quality pull requests.

## Code of Conduct

By participating, you agree to follow our Code of Conduct:
[CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md)

## Ways to Contribute

- Report bugs
- Propose features
- Improve documentation
- Add tests
- Refactor and optimize existing code

## Development Setup

### 1. Fork and clone

```bash
git clone https://github.com/<your-username>/LuvLyrics.git
cd LuvLyrics
```

### 2. Install dependencies

```bash
npm install
```

### 3. Start the app

```bash
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

## Branch Naming

Use clear, scoped branch names:

- `feat/<short-description>`
- `fix/<short-description>`
- `docs/<short-description>`
- `refactor/<short-description>`
- `test/<short-description>`

Examples:

- `feat/persistent-queue-sqlite`
- `fix/webview-lyrics-copy-fallback`

## Commit Message Style

Prefer conventional commits:

- `feat: add local lrc export action`
- `fix: prevent queue duplication on retry`
- `docs: improve setup instructions`

## Pull Request Process

1. Create an issue first (or reference an existing issue)
2. Create a focused branch from `main`
3. Keep PR scope small and reviewable
4. Add/update tests where relevant
5. Run the same quality checks used by CI before opening PR:

```bash
npm run ci
```

6. Open PR using the PR template and link the issue

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

Recommended labels:

- `good first issue` for beginner-friendly tasks
- `help wanted` for open contributions
- `bug`, `enhancement`, `documentation`, `performance`, `security`

## Security and Secrets

- Do not commit secrets, API keys, or credentials
- If you find a security issue, follow:
[SECURITY.md](./SECURITY.md)

## Additional Resources

- [Issue Triage Guide](docs/issue-triage.md)

## Need Help?

- Use GitHub Discussions for questions
- Use Issues for actionable bugs/features

Thank you for helping improve LuvLyrics.
