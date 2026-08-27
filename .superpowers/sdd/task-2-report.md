# Task 2 Report: Inject page context into agent system prompt

## What was implemented

Added page content extraction and context injection into `runAgent()` in `src/background.js`. The agent system prompt now includes page content (via `buildPageContext()` from `rag.js`), matching ask mode behavior. This prevents the model from hallucinating page content on regeneration when it skips `read_page`.

## Files changed

- `src/background.js` — modified `runAgent()` (lines 566-611) to:
  1. Extract page content via `runInPage(tab.id, pageExtract, [MAX_PAGE_CHARS])`
  2. Build RAG options from settings
  3. Call `buildPageContext(userText, page, ragOptions)`
  4. Include `pageCtx` in the system prompt between agent base and tool doc
  5. Update tool doc rules text to note "You already have the page content below"

## Self-review findings

No issues. The edit is a clean, minimal replacement of exactly the intended lines. The agent loop (from `port.postMessage({ event: "agent_start" })` onward) is untouched. The page context extraction uses the same try/catch pattern as `buildAskMessages()` for restricted pages.

## Concerns

None.
