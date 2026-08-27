# Task Report: File Backup/Restore with API Keys

## What Was Implemented

Two new exported functions in `src/backup.js` (`buildFullBackup` and `restoreFullBackup`) plus UI and event handlers in `options.html`/`options.js` for local file export/import that **includes API keys**.

## Files Changed

| File | Change |
|---|---|
| `src/backup.js` | Added `FULL_BACKUP_SCHEMA` constant, `buildFullBackup()`, and `restoreFullBackup()` (~67 lines) |
| `src/options.html` | Added "File Backup" section after the Gist backup section with Export/Import buttons and hidden file input |
| `src/options.js` | Added import of `buildFullBackup`/`restoreFullBackup` from backup.js, `setFullBackupStatus`, `exportFullBackup`, `importFullBackup` functions, and event listeners for the three new elements |

## Self-Review Findings

- `buildFullBackup()` does **not** call `stripSecrets()` — API keys are preserved in the export.
- `restoreFullBackup()` writes `backup.settings` directly to storage (no merge like Gist restore) — settings including API keys are replaced wholesale.
- Sessions are still merged (not replaced) via `mergeSessions()`.
- Bookmarks are added to a new folder (same pattern as Gist restore).
- Export pattern mirrors `exportPromptsJson` (Blob → URL → anchor click → cleanup).
- Import pattern mirrors `importPromptsJson` (file input → parse → restore → reload UI).
- New buttons include `type="button"` (best practice).
- Schema identifier `involvex-full-backup/1` is distinct from Gist's `involvex-backup/2`.

## Commit

`44b107f` — `feat: add file backup/restore with API keys`
