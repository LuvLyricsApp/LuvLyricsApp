## Pre-flight check

> **PRs without a linked issue will be closed without review.**
> Open or find an issue first, then come back here.

- [ ] I have opened or referenced an existing issue that tracks this work (required)

## Related Issue

Closes #

## Summary

Briefly describe what this PR changes and why.

## Type of Change

- [ ] Bug fix
- [ ] New feature
- [ ] Refactor
- [ ] Performance improvement
- [ ] Documentation update
- [ ] Test improvement

## What Changed

-
-
-

## Testing

- [ ] `npm run ci` passes (lint + typecheck + tests)
- [ ] Tested on Android
- [ ] Tested on iOS
- [ ] Manual testing completed
- [ ] Relevant test cases added/updated (if applicable)

Describe how you tested this change:

## Player / Audio changes

If this PR touches playback, scrubbing, auto-next, or queue logic, confirm:

- [ ] Scrub resumes playback if song was playing (`wasPlaying → seekTo → play()` pattern)
- [ ] Auto-next does not fire when user manually pauses near end of song
- [ ] No duplicate `player.replace()` calls on fast navigation
- [ ] Tested with both Dynamic Island and Classic MiniPlayer styles

## Screenshots / Recordings (if UI change)

Add screenshots or short recordings here.

## Checklist

- [ ] PR is focused — no unrelated changes bundled in
- [ ] Followed existing code style and project structure
- [ ] No `console.log` outside `if (__DEV__)` blocks
- [ ] No secrets or sensitive credentials committed
- [ ] `CLAUDE.md` updated if new patterns or rules were introduced
