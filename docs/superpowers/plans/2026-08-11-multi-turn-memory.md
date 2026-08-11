# Multi-Turn Conversation Memory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add context window management so long conversations don't exceed provider token limits, with a visual indicator showing context usage.

**Architecture:** A new `context.js` module handles token estimation and conversation truncation. The panel gains a small context-usage indicator. `background.js` and `panel.js` are updated to route conversation context through the new module. No new permissions needed — all work stays within existing `chrome.storage.local` and vanilla JS.

**Tech Stack:** Vanilla JS (ES modules), Chrome Extension Manifest V3, no npm/build step.

## Context

The extension already sends conversation history to providers — the `history` array in `panel.js` is passed to `buildAskMessages()` and `runAgent()` on every turn. However, there is no token estimation or truncation: a long conversation will eventually exceed the provider's context window and cause API errors.

This plan adds:
1. A lightweight token estimator (chars ÷ 4 approximation)
2. A context builder that truncates old messages when the budget is exceeded
3. A settings toggle for max context messages
4. A small UI indicator showing context usage percentage

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `src/context.js` | **Create** | Token estimation, conversation truncation, context budget management |
| `src/panel.js` | **Modify** | Add context indicator element, wire up context usage display |
| `src/panel.html` | **Modify** | Add context indicator element |
| `src/panel.css` | **Modify** | Style the context indicator |
| `src/background.js` | **Modify** | Use context builder in `buildAskMessages()` and `runAgent()` |
| `src/options.js` | **Modify** | Add "Max context messages" setting |
| `src/options.html` | **Modify** | Add setting input for max context messages |
| `manifest.json` | **No change** | No new permissions needed |

---

### Task 1: Create `src/context.js` — token estimation and truncation

**Files:**
- Create: `src/context.js`

**Interfaces:**
- Consumes: none (standalone module)
- Produces: `estimateTokens(msg)`, `buildContextWindow(messages, opts)`, `contextStats(messages, opts)`

- [ ] **Step 1: Create `src/context.js` with token estimation**

```javascript
// src/context.js
// Lightweight token estimation and conversation context management.
// Uses a chars/4 approximation — good enough for budget trimming.

/// Estimates token count for a single message content (string or array).
export function estimateTokens(content) {
  if (typeof content === "string") return Math.ceil(content.length / 4);
  if (Array.isArray(content)) {
    return content.reduce((sum, part) => {
      if (part.type === "text") return sum + Math.ceil((part.text || "").length / 4);
      if (part.type === "image_url") return sum + 85; // fixed overhead for vision
      return sum;
    }, 0);
  }
  return 0;
}

/// Estimates tokens for a full message object { role, content }.
function messageTokens(msg) {
  return 4 + estimateTokens(msg?.content); // +4 for role/formatting overhead
}

const DEFAULT_MAX_MESSAGES = 30;
const DEFAULT_MAX_TOKENS = 8000;

/// Builds a context window that fits within budget.
/// Always keeps: system message(s), the last user message, and as many
/// recent messages as possible. Older messages are dropped first.
///
/// @param {Array} messages - Full conversation [{ role, content }]
/// @param {object} opts
/// @param {number} [opts.maxMessages] - Hard cap on message count (default 30)
/// @param {number} [opts.maxTokens] - Soft token budget (default 8000)
/// @returns {{ messages: Array, droppedCount: number, tokenEstimate: number }}
export function buildContextWindow(messages, opts = {}) {
  const maxMessages = opts.maxMessages || DEFAULT_MAX_MESSAGES;
  const maxTokens = opts.maxTokens || DEFAULT_MAX_TOKENS;

  if (!messages || !messages.length) {
    return { messages: [], droppedCount: 0, tokenEstimate: 0 };
  }

  // Separate system messages from conversation messages
  const systemMsgs = messages.filter((m) => m.role === "system");
  const convoMsgs = messages.filter((m) => m.role !== "system");

  // Always keep system messages in the token budget
  let systemTokens = systemMsgs.reduce((s, m) => s + messageTokens(m), 0);
  const availableTokens = maxTokens - systemTokens;
  if (availableTokens <= 0) {
    // System messages alone exceed budget — return them anyway
    return {
      messages: systemMsgs,
      droppedCount: convoMsgs.length,
      tokenEstimate: systemTokens,
    };
  }

  // Apply hard message cap first (keep the most recent N)
  let kept = convoMsgs.slice(-maxMessages);

  // Then trim from the oldest until within token budget
  let tokenCount = kept.reduce((s, m) => s + messageTokens(m), 0);
  while (kept.length > 1 && tokenCount > availableTokens) {
    const dropped = kept.shift();
    tokenCount -= messageTokens(dropped);
  }

  const droppedCount = convoMsgs.length - kept.length;
  const tokenEstimate = systemTokens + tokenCount;

  return {
    messages: [...systemMsgs, ...kept],
    droppedCount,
    tokenEstimate,
  };
}

/// Returns context usage stats without modifying the conversation.
/// Useful for the UI indicator.
export function contextStats(messages, opts = {}) {
  const { messages: trimmed, droppedCount, tokenEstimate } = buildContextWindow(
    messages,
    opts,
  );
  const maxTokens = opts.maxTokens || DEFAULT_MAX_TOKENS;
  const maxMessages = opts.maxMessages || DEFAULT_MAX_MESSAGES;
  const convoMsgs = messages.filter((m) => m.role !== "system");
  const totalMsgs = convoMsgs.length;
  const keptMsgs = trimmed.filter((m) => m.role !== "system").length;

  return {
    totalMessages: totalMsgs,
    keptMessages: keptMsgs,
    droppedMessages: droppedCount,
    tokenEstimate,
    maxTokens,
    usagePercent: Math.min(100, Math.round((tokenEstimate / maxTokens) * 100)),
    maxMessages,
  };
}
```

- [ ] **Step 2: Verify the module exports are correct**

Run: `node -e "import('./src/context.js').then(m => console.log(Object.keys(m)))"` from the project root.
Expected: `{ estimateTokens, buildContextWindow, contextStats }`

- [ ] **Step 3: Commit**

```bash
git add src/context.js
git commit -m "feat: add context.js — token estimation and conversation truncation"
```

---

### Task 2: Wire context builder into `background.js`

**Files:**
- Modify: `src/background.js:1` (imports)
- Modify: `src/background.js:437-472` (`buildAskMessages`)
- Modify: `src/background.js:474-622` (`runAgent`)

**Interfaces:**
- Consumes: `buildContextWindow`, `contextStats` from `src/context.js`
- Produces: Modified `buildAskMessages()` and `runAgent()` use context-windowed messages

- [ ] **Step 1: Add import to `background.js`**

At the top of `src/background.js`, add `buildContextWindow` to the imports:

```javascript
import { chat, chatStream, supportsStreaming, buildUserMessage } from "./providers.js";
import { pushBackup, fetchBackup, restoreBackup } from "./backup.js";
import { loadEnv, envGistToken, envGistId } from "./env.js";
import { buildPageContext } from "./rag.js";
import { DEFAULT_ASK_SYSTEM, DEFAULT_AGENT_SYSTEM } from "./prompts.js";
import { buildContextWindow } from "./context.js";
```

- [ ] **Step 2: Update `buildAskMessages` to use context window**

Replace the `buildAskMessages` function (lines 437-472) with:

```javascript
async function buildAskMessages(userText, history, tabId, opts = {}) {
  const settings = await loadSettings();
  const tab = await resolveTargetTab(tabId);
  let page = null;
  try {
    if (tab) page = await runInPage(tab.id, pageExtract, [MAX_PAGE_CHARS]);
  } catch (_) {
    // restricted page (chrome://, store, etc.) — continue without context
  }
  const ragEnabled = opts.rag ?? settings.rag?.enabled ?? false;
  const ragOptions = {
    enabled: ragEnabled,
    useEmbeddings: settings.rag?.useEmbeddings ?? false,
    ollamaBase: settings.ollama?.baseUrl || "http://localhost:11434",
    embedModel: settings.rag?.embedModel || "nomic-embed-text",
  };
  const ctx = await buildPageContext(userText, page, ragOptions);
  const askBase =
    (settings.systemPrompts && settings.systemPrompts.ask) || DEFAULT_ASK_SYSTEM;
  const system = `${askBase}\n\n${ctx}`;
  let userMsg = { role: "user", content: userText };
  const useVision = opts.vision ?? settings.vision?.enabled ?? false;
  if (useVision && tab) {
    const shot = await captureTabScreenshot(tab);
    if (shot) {
      userMsg = buildUserMessage(
        `${userText}\n\n(Attached: screenshot of the page content region.)`,
        shot,
      );
    }
  }

  // Apply context window management
  const contextMax = settings.contextMaxMessages || 30;
  const { messages: windowed } = buildContextWindow(
    [{ role: "system", content: system }, ...history, userMsg],
    { maxMessages: contextMax, maxTokens: 8000 },
  );

  return { messages: windowed, settings };
}
```

- [ ] **Step 3: Update `runAgent` to use context window**

In the `runAgent` function, replace the convo construction (around line 505-509) with:

```javascript
  // Apply context window management
  const contextMax = settings.contextMaxMessages || 30;
  const { messages: windowed } = buildContextWindow(
    [
      { role: "system", content: system },
      ...history,
      { role: "user", content: userText },
    ],
    { maxMessages: contextMax, maxTokens: 8000 },
  );
  const convo = windowed;
```

- [ ] **Step 4: Commit**

```bash
git add src/background.js
git commit -m "feat: wire context window builder into background.js"
```

---

### Task 3: Add context indicator to panel UI

**Files:**
- Modify: `src/panel.html:38-39` (add indicator element)
- Modify: `src/panel.js:43-55` (add state + references)
- Modify: `src/panel.js:298-345` (`sendAsk`)
- Modify: `src/panel.js:347-384` (`send`)
- Modify: `src/panel.css` (style the indicator)

**Interfaces:**
- Consumes: `contextStats` from `src/context.js`
- Produces: `updateContextIndicator()` function, UI element `#contextIndicator`

- [ ] **Step 1: Add indicator element to `panel.html`**

After the `providerLine` div (line 38-39 in panel.html), add:

```html
    <div id="providerLine" class="provider-line">Loading settings…</div>
    <div id="contextIndicator" class="context-indicator" hidden>
      <span id="contextLabel" class="context-label"></span>
      <div class="context-bar">
        <div id="contextFill" class="context-fill"></div>
      </div>
    </div>
```

- [ ] **Step 2: Add state variables and imports to `panel.js`**

At the top of `panel.js`, add the import:

```javascript
import { PROVIDERS, providerSupportsVision, chat, chatStream, supportsStreaming } from "./providers.js";
import {
  saveSession,
  searchSessions,
  getSession,
  deleteSession,
  clearSessions,
} from "./sessions.js";
import { DEFAULT_PROMPTS } from "./prompts.js";
import { contextStats } from "./context.js";
```

Add state variables after the existing state declarations (around line 55):

```javascript
let agentPolicyNote = "";
```

Add after `agentPolicyNote`:

```javascript
const contextIndicator = document.getElementById("contextIndicator");
const contextLabel = document.getElementById("contextLabel");
const contextFill = document.getElementById("contextFill");
```

- [ ] **Step 3: Add `updateContextIndicator` function to `panel.js`**

Add this function after the `setBusy` function (around line 190):

```javascript
async function updateContextIndicator() {
  if (!contextIndicator || !history.length) {
    if (contextIndicator) contextIndicator.hidden = true;
    return;
  }
  const { settings } = await chrome.storage.local.get("settings");
  const s = settings || {};
  const maxMessages = s.contextMaxMessages || 30;
  const stats = contextStats(history, { maxMessages, maxTokens: 8000 });
  if (stats.droppedMessages > 0) {
    contextIndicator.hidden = false;
    contextLabel.textContent = `${stats.tokenEstimate.toLocaleString()} tokens · ${stats.droppedMessages} older messages trimmed`;
    contextFill.style.width = `${stats.usagePercent}%`;
    contextFill.style.background =
      stats.usagePercent > 80
        ? "var(--warn)"
        : stats.usagePercent > 60
          ? "var(--accent)"
          : "var(--ok)";
  } else {
    contextIndicator.hidden = true;
  }
}
```

- [ ] **Step 4: Call `updateContextIndicator` after messages change**

In the `finishAssistant` function (around line 224), add a call at the end:

```javascript
function finishAssistant(text) {
  clearStatus();
  let el;
  if (streamEl) {
    streamEl.classList.remove("streaming");
    streamEl.innerHTML = renderMarkdown(text);
    el = streamEl;
    streamEl = null;
    streamText = "";
  } else {
    el = addMessage("assistant", text);
  }
  history.push({ role: "assistant", content: text });
  attachRegenerate(el);
  persistSession();
  updateContextIndicator();
}
```

Also in `send()`, add after `persistSession()` (around line 353):

```javascript
  if (!opts.regenerate) {
    addMessage("user", text);
    history.push({ role: "user", content: text });
    persistSession();
    updateContextIndicator();
  }
```

And in `loadSession()`, add after the loop (around line 532):

```javascript
  if (lastAssistantEl) attachRegenerate(lastAssistantEl);
  updateContextIndicator();
```

And in `regenerate()`, add after `persistSession()`:

```javascript
  persistSession();
  updateContextIndicator();
```

- [ ] **Step 5: Add CSS for the context indicator to `panel.css`**

Add at the end of the file:

```css
.context-indicator {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 12px;
  background: var(--bg);
  border-bottom: 1px solid var(--border);
  font-size: 11px;
}

.context-label {
  color: var(--muted);
  white-space: nowrap;
}

.context-bar {
  flex: 1;
  height: 4px;
  background: var(--panel-2);
  border-radius: 2px;
  overflow: hidden;
  max-width: 100px;
}

.context-fill {
  height: 100%;
  border-radius: 2px;
  transition: width 0.3s ease;
}
```

- [ ] **Step 6: Commit**

```bash
git add src/panel.html src/panel.js src/panel.css
git commit -m "feat: add context usage indicator to panel UI"
```

---

### Task 4: Add max context messages setting to Options

**Files:**
- Modify: `src/options.html` (add input)
- Modify: `src/options.js` (load/save setting)

**Interfaces:**
- Consumes: `contextMaxMessages` from settings
- Produces: Persisted `contextMaxMessages` setting

- [ ] **Step 1: Add setting input to `options.html`**

Find the "RAG settings" section in `options.html` and add a new section after it:

```html
    <section class="settings-section">
      <h3>Context Window</h3>
      <label class="field">
        <span>Max conversation messages to send</span>
        <input type="number" id="contextMaxMessages" min="5" max="100" step="5" value="30" />
        <span class="field-hint">Older messages are dropped when this limit is exceeded. Default: 30.</span>
      </label>
      <div class="row">
        <button type="button" id="contextSave">Save</button>
        <span id="contextStatus" class="status"></span>
      </div>
    </section>
```

- [ ] **Step 2: Add load/save logic to `options.js`**

In the `load()` function, after the RAG settings loading, add:

```javascript
  el("contextMaxMessages").value = s.contextMaxMessages || 30;
```

Add a new function and event listener:

```javascript
async function saveContextSettings() {
  const maxMessages = parseInt(el("contextMaxMessages").value, 10) || 30;
  const clamped = Math.max(5, Math.min(100, maxMessages));
  el("contextMaxMessages").value = clamped;
  const { settings } = await chrome.storage.local.get("settings");
  const s = settings || { provider: "gemini" };
  s.contextMaxMessages = clamped;
  await chrome.storage.local.set({ settings: s });
  const node = el("contextStatus");
  node.textContent = `Max messages saved: ${clamped}.`;
  node.className = "status ok";
}

el("contextSave").addEventListener("click", saveContextSettings);
```

- [ ] **Step 3: Commit**

```bash
git add src/options.html src/options.js
git commit -m "feat: add max context messages setting to Options"
```

---

### Task 5: Add field hint styling to options.css

**Files:**
- Modify: `src/options.css`

**Interfaces:**
- Consumes: none
- Produces: `.field-hint` style rule

- [ ] **Step 1: Add CSS rule for field hints**

Find an appropriate spot in `options.css` (after existing `.field` styles) and add:

```css
.field-hint {
  display: block;
  font-size: 12px;
  color: var(--muted);
  margin-top: 2px;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/options.css
git commit -m "style: add field-hint class for settings descriptions"
```

---

### Task 6: Verify end-to-end flow

**Files:**
- None (verification only)

- [ ] **Step 1: Load the extension in Chrome**

1. Open `chrome://extensions`
2. Enable Developer mode
3. Click "Load unpacked" and select the project folder
4. Verify no errors on the extension card

- [ ] **Step 2: Verify panel loads and context indicator is hidden**

1. Click the toolbar icon to open the panel
2. Verify the panel opens with the "New chat" screen
3. Verify no context indicator is visible (it should be hidden when no messages exist)

- [ ] **Step 3: Send a message and verify context indicator remains hidden**

1. Type a message and send it
2. Verify the assistant responds
3. Verify the context indicator is still hidden (1 message is well under the 30-message limit)

- [ ] **Step 4: Verify context indicator appears after many messages**

1. Send several messages (10+) in the same conversation
2. Verify the context indicator eventually appears showing token count and trimmed message count
3. Verify the progress bar fills proportionally

- [ ] **Step 5: Verify settings persist**

1. Open Options → Context Window section
2. Change "Max conversation messages" to 10
3. Save
4. Return to panel and send messages — verify trimming happens sooner

- [ ] **Step 6: Verify agent mode still works**

1. Enable Agent mode
2. Send a message that triggers agent actions
3. Verify the agent loop completes without errors

- [ ] **Step 7: Final commit if any fixes were needed**

```bash
git add -A
git commit -m "fix: context window adjustments from verification"
```

---

## Design Decisions

1. **Token estimation via chars÷4**: Approximation is sufficient for budget trimming. Real tokenizers vary by provider; this avoids shipping large tokenizer data.

2. **Hard cap + soft budget**: `maxMessages` is a hard cap (always enforced). `maxTokens` (8000 default) is a soft budget — trimming stops at 1 message minimum to preserve the last exchange.

3. **System messages never trimmed**: The system prompt + page context is always included. Only conversation history is trimmed.

4. **Indicator shows only when trimming active**: The context bar is hidden when under limits, shown only when messages have been dropped. This avoids noise.

5. **Default 30 messages**: Conservative enough for most providers (well under 8K tokens of conversation). Users can increase to 100 for large-context models.

6. **No new permissions**: All work stays within existing `chrome.storage.local`. No network calls, no new APIs.
