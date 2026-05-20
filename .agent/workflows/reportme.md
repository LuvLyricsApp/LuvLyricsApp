---
description: Activates on keyword 'reportme' to generate the Daily LuvLyricsApp PR Review Report
---
# Daily LuvLyricsApp PR Review Report Workflow

When the USER triggers this workflow by saying `reportme`, the AI Assistant MUST immediately execute the following steps to fetch, analyze, and generate a comprehensive open PR report.

## Step 1: Check GitHub CLI Authentication
Run `gh auth status` to ensure the session is active.

## Step 2: Fetch Active Open PRs
Run:
```bash
gh pr list --repo LuvLyricsApp/LuvLyricsApp --state open --limit 50
```

## Step 3: Fetch Detail and Diff for each Open PR
For each open PR, run:
```bash
gh pr view <number> --repo LuvLyricsApp/LuvLyricsApp
gh pr diff <number> --repo LuvLyricsApp/LuvLyricsApp
```

## Step 4: Perform Deep Code Review and Report Generation
Analyze each PR's diff against the linked issue/problem, and output the report matching the exact structure requested by the user.
