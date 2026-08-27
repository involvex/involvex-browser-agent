# Task 1 Report: Fix JSON extraction to handle outer-quoted responses

## What was implemented

Added `extractJsonFromOuterQuotes()` and fixed the extraction pipeline in `src/background.js`:

1. **New function `extractJsonFromOuterQuotes()`** — handles models that wrap tool-call JSON in outer double quotes (e.g., `"{"action":"read_page","args":{}}"`). Strips the outer quotes, attempts `JSON.parse`, and falls back to unescaping `\"` → `"`.

2. **Fixed `extractJsonWithActionKey()`** — changed `raw.indexOf("{", actionMatch.index)` to `raw.indexOf("{")` so it finds the correct opening brace from the start of the string, not after `"action":`.

3. **Updated `parseAction()`** — now tries extraction in order: fenced → outer-quoted → action-key, ensuring outer-quoted responses are caught before falling through to the brace-search fallback.

## Files changed

- `src/background.js` — lines 360–447 (26 insertions, 2 deletions)

## Self-review findings

- All three functions work together correctly; no duplicate logic or dead code paths.
- The `extractJsonFromOuterQuotes` function correctly handles both plain inner JSON and escaped-quote variants.
- The `extractJsonWithActionKey` guard `start > actionMatch.index` prevents false matches when the `{` is the outer-quote delimiter rather than the JSON object.
- No concerns found.

## Issues or concerns

None. The implementation matches the task brief exactly.
