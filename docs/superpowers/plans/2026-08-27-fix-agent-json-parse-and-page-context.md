# Fix Agent JSON Parse Error & Missing Page Context

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix two bugs in agent mode: (1) JSON parsing fails when models wrap tool-call JSON in outer double quotes, and (2) agent mode doesn't inject page context into the system prompt, causing hallucinated summaries (e.g., "example.com").

**Architecture:** Strengthen the JSON extraction pipeline in `parseAction()` to handle outer-quoted JSON, and inject page content into the agent system prompt (mirroring ask mode's `buildPageContext()` approach).

**Tech Stack:** Vanilla JavaScript (Chrome Extension Manifest V3), no dependencies.

## Global Constraints

- No build step — all JS is vanilla ES modules loaded directly by Chrome
- No external npm packages
- Functions injected into the page via `chrome.scripting.executeScript` must be self-contained
- Max page chars: 12,000 (`MAX_PAGE_CHARS`)
- Max agent steps: 8 (`MAX_AGENT_STEPS`)

---

## File Map

| File | Changes |
|------|---------|
| `src/background.js` | Fix `extractJsonWithActionKey()`, add `extractJsonFromOuterQuotes()`, update `parseAction()`, update `runAgent()` to inject page context into system prompt |

---

### Task 1: Fix JSON extraction to handle outer-quoted responses

**Files:**
- Modify: `src/background.js:360-423`

**Interfaces:**
- Consumes: raw text string from model reply
- Produces: parsed `{ action, args, thought }` object or null

**Context:** Models like Gemini, OpenAI, and smaller open-source models sometimes wrap their tool-call JSON in outer double quotes (`"{"action":..."}`) instead of returning bare JSON or using ``` fenced blocks. The current `extractJsonWithActionKey()` searches for `{` AFTER `"action":`, which finds the wrong brace when the opening `{` precedes `"action"`.

- [ ] **Step 1: Add `extractJsonFromOuterQuotes()` function**

Add this new function right after `extractJsonFromFenced()` (after line 364):

```javascript
/// Handles the case where the model wraps JSON in outer double quotes:
/// "{"action":"read_page","args":{}}"  →  {"action":"read_page","args":{}}
function extractJsonFromOuterQuotes(raw) {
  const trimmed = raw.trim();
  if (trimmed.length < 2) return null;
  if (trimmed[0] === '"' && trimmed[trimmed.length - 1] === '"') {
    // Strip outer quotes, then try to parse
    const inner = trimmed.slice(1, -1);
    try {
      const obj = JSON.parse(inner);
      if (obj && typeof obj.action === "string") return JSON.stringify(obj);
    } catch (_) {
      // inner content isn't valid JSON — maybe escaped quotes inside?
      // Try unescaping common patterns
      try {
        const unescaped = inner.replace(/\\"/g, '"');
        const obj = JSON.parse(unescaped);
        if (obj && typeof obj.action === "string") return JSON.stringify(obj);
      } catch (_) {
        return null;
      }
    }
  }
  return null;
}
```

- [ ] **Step 2: Fix `extractJsonWithActionKey()` to find the correct opening brace**

Replace the current `extractJsonWithActionKey()` function (lines 366-407) with this version that searches for `{` from the **beginning** of the string:

```javascript
function extractJsonWithActionKey(raw) {
  const actionMatch = raw.match(/"action"\s*:/);
  if (!actionMatch) return null;

  // Find the opening '{' that contains the "action" key.
  // Search from the start of the string, not from after "action",
  // because models may wrap JSON in outer quotes: "{"action":...}"
  const start = raw.indexOf("{");
  if (start === -1 || start > actionMatch.index) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < raw.length; i++) {
    const ch = raw[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === "\\" && inString) {
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        const candidate = raw.slice(start, i + 1);
        try {
          const obj = JSON.parse(candidate);
          if (obj && obj.action) return candidate;
        } catch (_) {
          return null;
        }
        return null;
      }
    }
  }
  return null;
}
```

- [ ] **Step 3: Update `parseAction()` to try outer-quote extraction**

Replace the current `parseAction()` function (lines 409-423) with:

```javascript
function parseAction(raw) {
  // 1. Try fenced code block first (```json ... ```)
  let jsonStr = extractJsonFromFenced(raw);
  // 2. Try outer-quoted JSON: " {"action":...} "
  if (!jsonStr) {
    jsonStr = extractJsonFromOuterQuotes(raw);
  }
  // 3. Try finding { "action": ... } anywhere in the text
  if (!jsonStr) {
    jsonStr = extractJsonWithActionKey(raw);
  }
  if (!jsonStr) return null;
  try {
    const obj = JSON.parse(jsonStr.trim());
    if (obj && typeof obj.action === "string") return obj;
    if (obj && obj.action != null) return obj;
  } catch (_) {
    // not a tool call; treat as prose
  }
  return null;
}
```

- [ ] **Step 4: Verify the fix handles all known model output patterns**

Manually verify these patterns all parse correctly:

| Model output pattern | Extractor used | Result |
|---|---|---|
| ```` ```json\n{"action":"read_page","args":{}}\n``` ```` | `extractJsonFromFenced` | Parsed ✓ |
| `{"action":"read_page","args":{}}` | `extractJsonWithActionKey` | Parsed ✓ |
| `"{"action":"read_page","args":{}}"` | `extractJsonFromOuterQuotes` | Parsed ✓ |
| `Here's what I'll do:\n{"action":"read_page","args":{}}` | `extractJsonWithActionKey` | Parsed ✓ |
| `Sure, let me help.\n\n"{"action":"finish","args":{"answer":"..."}}"` | `extractJsonFromOuterQuotes` | Parsed ✓ |
| Just prose text, no JSON | All return null | null ✓ |

- [ ] **Step 5: Commit**

```bash
git add src/background.js
git commit -m "fix: handle outer-quoted JSON in agent parseAction()
```

---

### Task 2: Inject page context into agent system prompt

**Files:**
- Modify: `src/background.js:535-570` (the `runAgent()` function)

**Interfaces:**
- Consumes: `buildPageContext()` from `rag.js` (already imported), `pageExtract()` (already defined), `loadSettings()`, `resolveTargetTab()`
- Produces: enriched system prompt with page content, sent to the model

**Context:** In ask mode, `buildAskMessages()` always extracts page content and includes it in the system prompt via `buildPageContext()`. In agent mode, the system prompt only has tool documentation — the model must call `read_page` to see the page. On regeneration, the model may skip `read_page` (since it "saw" the page before in history) and hallucinate content. The fix: always inject page content into the agent system prompt.

- [ ] **Step 1: Update `runAgent()` to extract page content and build context**

Replace the section of `runAgent()` that builds the system prompt and conversation (lines 539-570) with:

```javascript
async function runAgent(port, userText, history, tabId) {
  const ctrl = getAgentControl(port);
  ctrl.cancelled = false;
  ctrl.paused = false;
  const settings = await loadSettings();
  const tab = await resolveTargetTab(tabId);
  if (!tab) throw new Error("No active tab to act on.");

  // Extract page content and build context (mirrors ask mode behavior)
  let page = null;
  try {
    page = await runInPage(tab.id, pageExtract, [MAX_PAGE_CHARS]);
  } catch (_) {
    // restricted page (chrome://, store, etc.) — continue without context
  }
  const ragEnabled = settings.rag?.enabled ?? false;
  const ragOptions = {
    enabled: ragEnabled,
    useEmbeddings: settings.rag?.useEmbeddings ?? false,
    ollamaBase: settings.ollama?.baseUrl || "http://localhost:11434",
    embedModel: settings.rag?.embedModel || "nomic-embed-text",
  };
  const pageCtx = await buildPageContext(userText, page, ragOptions);

  const toolDoc =
    `You can control the current browser page with tools. To use a tool, ` +
    `reply with ONLY one fenced json block:\n` +
    "```json\n" +
    `{"thought":"why","action":"<name>","args":{...}}\n` +
    "```\n" +
    `Tools:\n` +
    `- read_page {} -> page title, url, text, and up to 40 interactive elements each with an index "i".\n` +
    `- get_selection {} -> currently selected text.\n` +
    `- click {"index":n} | {"selector":"css"} | {"text":"visible text"} -> click an element.\n` +
    `- fill {"index":n|"selector":"css","value":"text"} -> fill an input.\n` +
    `- navigate {"url":"https://..."} -> load a URL in the current tab.\n` +
    `- scroll {"direction":"down"|"up"} -> scroll the page.\n` +
    `- wait_for_element {"selector":"css","timeoutMs":5000} -> wait until an element appears.\n` +
    `- scroll_to_element {"index":n}|{"selector":"css"}|{"text":"..."} -> scroll an element into view.\n` +
    `- extract_data {"maxRows":20} -> extract tables and lists as structured text.\n` +
    `- finish {"answer":"final markdown answer"} -> end the task.\n` +
    `Rules: exactly one tool per reply. You already have the page content below; ` +
    `use read_page only if you need updated element indices for clicking/filling. ` +
    `Prefer element index from read_page. When done or no action is needed, use finish.`;

  const agentBase =
    (settings.systemPrompts && settings.systemPrompts.agent) ||
    DEFAULT_AGENT_SYSTEM;
  const system = `${agentBase}\n\n${pageCtx}\n\n${toolDoc}`;
  const convo = [
    { role: "system", content: system },
    ...history,
    { role: "user", content: userText },
  ];
  // ... rest of runAgent unchanged from line 572 onward
```

- [ ] **Step 2: Commit**

```bash
git add src/background.js
git commit -m "fix(agent): inject page context into agent system prompt"
```

---

### Task 3: End-to-end verification

- [ ] **Step 1: Load extension in Chrome and test agent JSON parsing**

1. Open `chrome://extensions`, enable Developer mode, load unpacked
2. Navigate to any website (e.g., a news article)
3. Open Involvex panel, enable Agent mode
4. Ask: "List the key links on this page"
5. **Verify:** No "Could not parse agent JSON output" error
6. **Verify:** Agent correctly calls `read_page` and returns real page links

- [ ] **Step 2: Test agent regeneration doesn't hallucinate**

1. On the same page, ask agent: "Summarize this page"
2. Wait for the summary
3. Click "Regenerate" on the assistant message
4. **Verify:** Second summary matches the actual page content (not example.com)

- [ ] **Step 3: Test ask mode still works (regression)**

1. Disable Agent mode
2. Ask: "Summarize this page"
3. **Verify:** Summary is about the actual page content

- [ ] **Step 4: Test context menu summarize**

1. Right-click on a page → "Involvex AI: Summarize page"
2. **Verify:** Panel opens and summarizes the correct page

- [ ] **Step 5: Final commit if any fixes needed**

```bash
git add src/background.js
git commit -m "fix: agent mode JSON parsing and page context injection"
```
