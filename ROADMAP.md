# Roadmap — Involvex AI Agent

**Source of truth** for the product backlog. Idea details and status tags for
older brainstorm items live in [`suggestions.md`](suggestions.md) (archive).

Status legend: ✅ done · ⏭ planned · ⏸ later · ❌ won't do

Prioritization rules (all planned work must fit these):

1. Manifest V3 + vanilla JS + no npm/build step
2. High daily-use value for chat / agent users
3. Low risk to Android tab-panel UX
4. Reuse existing surfaces (`panel.*`, `options.*`, `backup.js`, `providers.js`,
   `background.js`)
5. Defer multi-user infra and plugin marketplaces

```
v0.8.0 (today) → Later
```

---

## Done ✅

### Core

- On-tap chat panel (tab-based, Android-safe)
- Page reading + grounded Q&A
- Selection actions (explain / translate / rewrite)
- Agent mode (`read_page` / `click` / `fill` / `navigate` / `scroll` /
  `wait_for_element` / `scroll_to_element` / `extract_data`, 8-step cap)
- Providers: Gemini, OpenAI, Anthropic, OpenRouter, OpenCode Zen, Custom
  (OpenAI-compatible), Ollama
- Model dropdown + live model listing
- Private-Gist backup/restore of bookmarks + settings + extension list
- `.env` token loading
- Custom icon set
- Export session as Markdown

### v0.4.0

- Scheduled auto-backup (`chrome.alarms`) with last-synced indicator
- Streaming SSE responses (Gemini + OpenAI-compatible) in Ask mode
- Per-provider quick switch in panel header

### v0.5.0

- Chat history persistence with search (reopen/delete, 50-chat cap)
- Prompt library — editable quick-prompt chips in Settings
- Extension restore links after a Gist restore
- ccache / WSL2 build docs for custom browser APKs

### v0.6.x

- History panel bottom-sheet / Android overlay fixes
- FastVLM LiteRT vision provider + PC bridge script
- Page RAG (TF-IDF + optional Ollama embeddings)
- Prompt library JSON export/import
- Gist chat history sync (optional include on backup; merge on restore)
- Mobile composer / Chats / Export polish (through 0.6.5)

### v0.8.0

- Agent streaming, per-site allow/deny, safety confirmations
- Tools: `wait_for_element`, `scroll_to_element`, `extract_data`
- Agent step bar with pause/cancel

**Note:** Prompt library values already ride along in the full settings Gist
backup when `includePrompts` is enabled. Without the flag, prompts are omitted
from the Gist and local chips are kept on restore.

---

## v0.7 ✅ — UX polish & control (extension-only)

Shipped in **0.7.0**:

| Item | Notes |
| --- | --- |
| Keyboard shortcuts | `Ctrl+Shift+A/N/G/R` via `chrome.commands` |
| Response regenerate | Button on latest assistant message |
| Light / dark theme | System / Dark / Light in Settings |
| Custom system prompts | Editable Ask + Agent base prompts |
| Prompt-library Gist UX | `includePrompts` checkbox + restore keep-local when omitted |
| Screenshot-to-vision polish | Article crop + resize/compress in `captureTabScreenshot` |

---

## v0.8 ✅ — Agent depth & safety

Shipped in **0.8.0**:

| Item | Notes |
| --- | --- |
| Streaming in agent mode | Uses `chatStream` when provider supports it |
| Per-site agent allow/deny | Settings → Agent sites |
| Agent safety confirmations | Navigate + sensitive clicks |
| Expanded tools | `wait_for_element`, `scroll_to_element`, `extract_data` |
| Agent step clarity | Numbered steps + Pause / Cancel bar |

---

## v0.9 ⏩ — Near-term quick wins

- **JSON parsing robustness** ✅ — Fix `parseAction` to reliably handle fenced/non-fenced JSON output from agent
- **Agent "continue" after step limit** ✅ — Allow continuing agent loops beyond 8 steps when user requests
- **Agent debugging info** ✅ — Show truncated raw output when `parseAction` fails, for troubleshooting
- **Panel keyboard shortcut enhancer** ✅ — Display available shortcuts in panel header
- **Conversation virtualization** ✅ — Render only visible messages + buffer; "Load older" indicator for long histories; auto-trim at 50 messages
- **Caching system** ✅ — Page content cache (localStorage, 10-min TTL); reduces redundant extractions on repeated asks
- **Minimal automated tests** ✅ — Test suite for rag.js pure functions (chunkText, tokenize, TF-IDF scoring); no npm build step required

---

## Later ⏸ — platform & research

Do not schedule into near releases unless a concrete need appears.

### Product depth

| Item | Why parked |
| --- | --- |
| Multi-turn conversation memory | New persistence + retrieval model; large UX surface |
| Context window management UI | Needs token estimates + section picker; useful after vision/RAG polish |
| Message pinning / bookmarks | Wait until regenerate proves message-action UX patterns |
| Voice input/output | Platform permission + Android variability |
| Multi-language UI (i18n) | Large string surface; prefer response-language setting first if needed |

### Integrations / infra

| Item | Why parked |
| --- | --- |
| MEGA backup backend | Needs MEGA SDK; Gist stays default (serverless, free) |
| Notion / Obsidian / Slack / email / calendar | Scope creep; export Markdown covers the common case |
| Local REST API / webhooks / CLI | MV3 service-worker constraints; not core |
| Plugin system / marketplace | Conflicts with no-build, self-contained extension |
| Real-time collaboration / conversation VCS | Multi-user infra; single-user product |

### Hygiene (when capacity allows)

- Optional local usage analytics (opt-in only)
- Conversation virtualization / response caching
- Minimal automated tests for providers + backup pure functions (prefer no npm)
- Incremental CSP / privacy dashboard (not a rewrite)

### Won't do ❌ (unless requirements change)

- Extension-to-extension storage reading — fragile and permission-hostile
- Custom theme marketplace / full markdown WYSIWYG / Zapier-style automation —
  out of scope for a lean MV3 extension

---

*Last prioritized: August 2026 (merged from prior Next/Ideas + suggestions.md; v0.9 quick wins + conversation virtualization + automated tests added).*
