```markdown
# LuvLyricsApp Development Patterns

> Auto-generated skill from repository analysis

## Overview

This skill teaches you the core development patterns, coding conventions, and common workflows used in the LuvLyricsApp repository. The project is a React application written in TypeScript, following modern best practices for code organization, testing, and collaboration. You'll learn how to structure code, write and run tests, and contribute effectively using established workflows and commands.

## Coding Conventions

- **File Naming:** Use PascalCase for all file names.
  - Example: `SongList.tsx`, `UserProfile.tsx`
- **Import Style:** Use relative imports for all modules.
  - Example:
    ```typescript
    import { fetchLyrics } from '../services/lyricsService';
    ```
- **Export Style:** Use named exports for all modules.
  - Example:
    ```typescript
    // In src/utils/formatDate.ts
    export function formatDate(date: Date): string { ... }
    ```
- **Commit Messages:** Follow the Conventional Commits standard.
  - Prefixes: `fix`, `feat`, `docs`, `chore`, `refactor`
  - Example: `fix: resolve crash on empty lyrics list`
- **Component Structure:** Place components in `src/components/` and screens in `src/screens/`.

## Workflows

### Fix Bug or Issue Across Multiple Screens
**Trigger:** When a bug fix or feature impacts several screens/components.
**Command:** `/fix-multi-screen`

1. Identify all affected screens/components.
2. Modify relevant files to implement the fix or feature.
3. Update constants or shared resources if needed.
4. Test across all affected screens.

**Files Involved:**  
`src/App.tsx`, `src/components/*.tsx`, `src/constants/*.ts`, `src/screens/*.tsx`

---

### Refactor Handler UseCallback
**Trigger:** When optimizing re-renders and ensuring stable function references in React components.
**Command:** `/refactor-usecallback`

1. Identify inline event handlers in components.
2. Wrap handlers in `useCallback`.
3. Test for regressions.

**Example:**
```typescript
// Before
<button onClick={() => handleLike(song.id)}>Like</button>

// After
const handleLikeClick = useCallback(() => handleLike(song.id), [song.id]);
<button onClick={handleLikeClick}>Like</button>
```

**Files Involved:**  
`src/components/*.tsx`, `src/screens/*.tsx`

---

### Add or Update Database Queries and Tests
**Trigger:** When adding new database functionality or improving query safety.
**Command:** `/db-query-update`

1. Edit or add query logic in `src/database/*.ts`.
2. Update or create tests in `src/database/*.test.ts`.
3. Run tests to verify correctness.

**Files Involved:**  
`src/database/queries.ts`, `src/database/queries.test.ts`

---

### Remove Dead Code and Unused Imports
**Trigger:** When cleaning up the codebase for maintainability.
**Command:** `/cleanup-dead-code`

1. Identify dead/commented-out code and unused imports.
2. Remove them from relevant files.
3. Test app to ensure no regressions.

**Example:**
```typescript
// Before
import { unusedFunction } from './utils';
// ... code ...
// const oldFeature = () => { /* ... */ };

// After
// (unused import and commented code removed)
```

**Files Involved:**  
`src/components/*.tsx`, `src/screens/*.tsx`, `src/services/*.ts`, `src/store/*.ts`

---

### Documentation Update or Revamp
**Trigger:** When updating project documentation for clarity, new features, or events.
**Command:** `/docs-update`

1. Edit documentation files (`README.md`, `CONTRIBUTING.md`, etc.).
2. Add or update badges, contact info, or event sections.
3. Commit and push changes.

**Files Involved:**  
`README.md`, `CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`, `.github/ISSUE_TEMPLATE/*.yml`, `.github/PULL_REQUEST_TEMPLATE.md`, `docs/*.md`

---

### Add or Update Unit Tests for Utilities or Services
**Trigger:** When improving test coverage for utilities or services.
**Command:** `/add-unit-tests`

1. Write or update test files for utilities/services.
2. Ensure tests cover edge cases.
3. Run tests to verify correctness.

**Example:**
```typescript
// src/utils/formatDate.test.ts
import { formatDate } from './formatDate';

test('formats date correctly', () => {
  expect(formatDate(new Date('2023-01-01'))).toBe('Jan 1, 2023');
});
```

**Files Involved:**  
`src/utils/*.test.ts`, `src/services/*.test.ts`

---

## Testing Patterns

- **Framework:** Jest
- **Test File Pattern:** Use `*.test.ts` for test files.
- **Test Placement:** Place tests alongside the module or in the same directory.
- **Example:**
  ```typescript
  // src/services/apiService.test.ts
  import { fetchSongs } from './apiService';

  test('fetchSongs returns song list', async () => {
    const songs = await fetchSongs();
    expect(Array.isArray(songs)).toBe(true);
  });
  ```

## Commands

| Command             | Purpose                                                        |
|---------------------|----------------------------------------------------------------|
| /fix-multi-screen   | Fix or implement a feature affecting multiple screens/components|
| /refactor-usecallback | Refactor handlers to use `useCallback` for stable references |
| /db-query-update    | Add or update database queries and corresponding tests         |
| /cleanup-dead-code  | Remove dead code and unused imports from the codebase         |
| /docs-update        | Update or revamp documentation files                          |
| /add-unit-tests     | Add or update unit tests for utilities or services            |
```