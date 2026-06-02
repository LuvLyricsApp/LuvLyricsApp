---
name: fix-bug-or-issue-across-multiple-screens
description: Workflow command scaffold for fix-bug-or-issue-across-multiple-screens in LuvLyricsApp.
allowed_tools: ["Bash", "Read", "Write", "Grep", "Glob"]
---

# /fix-bug-or-issue-across-multiple-screens

Use this workflow when working on **fix-bug-or-issue-across-multiple-screens** in `LuvLyricsApp`.

## Goal

Fixes a bug or implements a UI/logic change that affects multiple screens/components in the app.

## Common Files

- `src/App.tsx`
- `src/components/*.tsx`
- `src/constants/*.ts`
- `src/screens/*.tsx`

## Suggested Sequence

1. Understand the current state and failure mode before editing.
2. Make the smallest coherent change that satisfies the workflow goal.
3. Run the most relevant verification for touched files.
4. Summarize what changed and what still needs review.

## Typical Commit Signals

- Identify all affected screens/components.
- Modify relevant files to implement the fix or feature.
- Update constants or shared resources if needed.
- Test across all affected screens.

## Notes

- Treat this as a scaffold, not a hard-coded script.
- Update the command if the workflow evolves materially.