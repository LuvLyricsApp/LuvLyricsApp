# ECC for Codex CLI

This supplements the root `AGENTS.md` with a repo-local ECC baseline.

## Migration context (LuvLyrics 2.0)

The repo is actively migrating from React Native/Expo to Kotlin + Jetpack Compose.

- Read `.planning/STATE.md` first for current phase and verified facts.
- **Never run `expo prebuild`.** Do not delete `src/` until Phase 8.
- Native verification: `cd android && .\gradlew.bat :app:assembleDebug` then `adb install`.
- Compose shell launches via `LauncherActivity`; legacy RN via `MainActivity` (lazy Expo init in debug).

## Repo Skill

- Repo-generated Codex skill: `.agents/skills/LuvLyricsApp/SKILL.md`
- Claude-facing companion skill: `.claude/skills/LuvLyricsApp/SKILL.md`
- Keep user-specific credentials and private MCPs in `~/.codex/config.toml`, not in this repo.

## MCP Baseline

Treat `.codex/config.toml` as the default ECC-safe baseline for work in this repository.
The generated baseline enables GitHub, Context7, Exa, Memory, Playwright, and Sequential Thinking.

## Multi-Agent Support

- Explorer: read-only evidence gathering
- Reviewer: correctness, security, and regression review
- Docs researcher: API and release-note verification

## Workflow Files

- `.claude/commands/feature-development.md`
- `.claude/commands/refactoring.md`
- `.claude/commands/fix-bug-or-issue-across-multiple-screens.md`

Use these workflow files as reusable task scaffolds when the detected repository workflows recur.
