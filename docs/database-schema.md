# Database Schema and Migration Guide

This guide is the contributor reference for the local SQLite database used by
LuvLyrics.

The database is initialized in `src/database/db.ts` with Expo SQLite. Query
helpers live in `src/database/queries.ts` and playlist-specific helpers live in
`src/database/playlistQueries.ts`.

## Database File

- Database name: `lyricflow.db`
- SQLite pragmas:
  - `journal_mode = WAL`
  - `synchronous = NORMAL`
  - `foreign_keys = ON`

The app uses a singleton database handle through `getDatabase()`. Reads should
use `withDbRead()` where possible. Writes should use `withDbWrite()` or
`withDbSafe()` so write operations stay serialized and retryable.

## Current Tables

### `songs`

Stores the library row for each song.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `TEXT PRIMARY KEY` | App-level song ID. |
| `title` | `TEXT NOT NULL` | Song title. |
| `artist` | `TEXT` | Optional artist name. |
| `album` | `TEXT` | Optional album name. |
| `gradient_id` | `TEXT NOT NULL` | UI gradient/theme ID. |
| `duration` | `INTEGER DEFAULT 0` | Duration in seconds. |
| `date_created` | `TEXT NOT NULL` | ISO timestamp string. |
| `date_modified` | `TEXT NOT NULL` | ISO timestamp string. |
| `play_count` | `INTEGER DEFAULT 0` | Incremented by playback tracking. |
| `last_played` | `TEXT` | ISO timestamp string for recent playback. |
| `scroll_speed` | `INTEGER DEFAULT 50` | Plain-lyrics scroll speed. |
| `cover_image_uri` | `TEXT` | Local or remote cover art URI. |
| `lyrics_align` | `TEXT DEFAULT 'left'` | Default lyric alignment: `left`, `center`, or `right`. |
| `text_case` | `TEXT DEFAULT 'normal'` | Added by migration for lyric text display casing. |
| `audio_uri` | `TEXT` | Local audio URI when available. |
| `is_liked` | `INTEGER DEFAULT 0` | Legacy liked-song flag, kept in sync with the default playlist path. |
| `is_hidden` | `INTEGER DEFAULT 0` | Hidden-library flag. |
| `vocal_stem_uri` | `TEXT` | Legacy AI karaoke stem URI. |
| `instrumental_stem_uri` | `TEXT` | Legacy AI karaoke stem URI. |
| `separation_status` | `TEXT DEFAULT 'none'` | Legacy stem-separation status. |
| `separation_progress` | `INTEGER DEFAULT 0` | Legacy stem-separation progress. |

Fresh installs get the base columns from `CREATE TABLE IF NOT EXISTS`. Older
installs receive later columns through idempotent `ALTER TABLE` checks in
`initializeTables()`.

### `lyrics`

Stores normalized lyric lines for a song.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `INTEGER PRIMARY KEY AUTOINCREMENT` | Database row ID. |
| `song_id` | `TEXT NOT NULL` | References `songs(id)`. |
| `timestamp` | `INTEGER NOT NULL` | Timestamp value used by lyric sync. |
| `text` | `TEXT NOT NULL` | Lyric line text. |
| `line_order` | `INTEGER NOT NULL` | Stable lyric ordering after normalization. |

`song_id` has `ON DELETE CASCADE`, so deleting a song removes its lyric rows.

### `playlists`

Stores playlist metadata.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `TEXT PRIMARY KEY` | App-level playlist ID. |
| `name` | `TEXT NOT NULL` | Playlist name. |
| `description` | `TEXT` | Optional description. |
| `cover_image_uri` | `TEXT` | Optional custom cover URI. |
| `is_default` | `INTEGER DEFAULT 0` | `1` for the default "Liked Songs" playlist. |
| `sort_order` | `INTEGER DEFAULT 0` | Playlist ordering hint. |
| `date_created` | `TEXT NOT NULL` | ISO timestamp string. |
| `date_modified` | `TEXT NOT NULL` | ISO timestamp string. |

The default playlist is seeded with `INSERT OR IGNORE` during initialization.

### `playlist_songs`

Joins songs to playlists.

| Column | Type | Notes |
| --- | --- | --- |
| `playlist_id` | `TEXT NOT NULL` | References `playlists(id)`. |
| `song_id` | `TEXT NOT NULL` | References `songs(id)`. |
| `added_at` | `TEXT NOT NULL` | ISO timestamp string. |
| `sort_order` | `INTEGER DEFAULT 0` | Song order within the playlist. |

The primary key is `(playlist_id, song_id)` so the same song cannot be inserted
twice into one playlist. Both foreign keys use `ON DELETE CASCADE`.

## Indexes

Current indexes are created in `initializeTables()`:

- `idx_songs_title` on `songs(title)`
- `idx_songs_artist` on `songs(artist)`
- `idx_lyrics_song_id` on `lyrics(song_id)`
- `idx_lyrics_timestamp` on `lyrics(timestamp)`
- `idx_playlist_songs_playlist` on `playlist_songs(playlist_id, sort_order)`

Add indexes only when a query path needs them. Keep index names descriptive and
idempotent with `CREATE INDEX IF NOT EXISTS`.

## Migration Flow

There is no separate schema-version table yet. Current migrations are
idempotent startup checks:

1. `getDatabase()` opens `lyricflow.db`.
2. `initializeTables()` creates missing base tables and indexes.
3. `initializeTables()` checks existing `songs` columns with
   `PRAGMA table_info(songs)`.
4. Missing columns are added with `ALTER TABLE ... ADD COLUMN`.
5. `migratePlaylistData()` handles the one-time default playlist migration for
   existing liked songs.

When adding a schema change:

1. Update the relevant `CREATE TABLE IF NOT EXISTS` statement for fresh installs.
2. Add an idempotent migration for existing installs.
3. Update TypeScript row types in query helpers.
4. Update mappers between snake_case database columns and camelCase app types.
5. Update insert/update paths that write the changed table.
6. Add or update focused tests when behavior changes.
7. Run `npm run typecheck` and relevant tests before opening a PR.

## Do

- Keep migrations backward-compatible and safe to run more than once.
- Prefer additive migrations (`ADD COLUMN`, new indexes, new tables).
- Keep database column names in `snake_case` and app types in `camelCase`.
- Use parameterized queries for new code where practical.
- Use `withDbWrite()` for writes so operations stay serialized.
- Preserve `ON DELETE CASCADE` behavior when adding relational tables.
- Document any new table or column in this file.

## Don't

- Do not drop or recreate user data tables in startup migrations.
- Do not add non-null columns without a default for existing rows.
- Do not remove legacy columns without a dedicated data migration plan.
- Do not bypass the shared database helpers for write-heavy paths.
- Do not mix unrelated schema refactors into feature PRs.
- Do not commit local database files or generated native build artifacts.

## Quick Contributor Checklist

Before opening a schema-related PR, verify:

- Fresh installs create the expected table or column.
- Existing installs receive the migration without data loss.
- Query helpers still map database rows to `Song`, `LyricLine`, or `Playlist`
  correctly.
- Playlist and lyric cascade behavior still works when deleting songs or
  playlists.
- The README links to this guide for future contributors.
