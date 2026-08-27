# Task 2: Inject page context into agent system prompt

## Task Description

**Files:**
- Modify: `src/background.js:535-570` (the `runAgent()` function)

**Interfaces:**
- Consumes: `buildPageContext()` from `rag.js` (already imported), `pageExtract()` (already defined), `loadSettings()`, `resolveTargetTab()`
- Produces: enriched system prompt with page content, sent to the model

**Context:** In ask mode, `buildAskMessages()` always extracts page content and includes it in the system prompt via `buildPageContext()`. In agent mode, the system prompt only has tool documentation — the model must call `read_page` to see the page. On regeneration, the model may skip `read_page` (since it "saw" the page before in history) and hallucinate content (e.g., "example.com"). The fix: always inject page content into the agent system prompt.

## Steps

### Step 1: Update `runAgent()` to extract page content and build context

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

**Important:** Only replace lines 539-570. The rest of `runAgent()` (from line 572 onward — the agent loop) stays exactly the same. Make sure to preserve the closing `}` of the function and all the loop logic.

### Step 2: Commit

```bash
git add src/background.js
git commit -m "fix(agent): inject page context into agent system prompt"
```
