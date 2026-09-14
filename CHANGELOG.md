# Changelog — Involvex AI Agent

All notable changes to the extension. Versions follow the `manifest.json`
`version` field.

## 0.9.0

- **Image attachment (#47)** — 📎 button in the composer attaches a user image
  (5MB cap, downscaled to 1280px JPEG 0.72) alongside the optional page
  screenshot. Ask-mode only. Fixed Anthropic image blocks, Ollama multi-image,
  and Gemini-stream image passthrough. Attachments are never persisted to
  sessions (storage-quota safe).
- **PDF summarization (#48)** — 📎 button also accepts PDFs (10MB cap). New
  `src/pdf.js` vanilla extractor (literal/hex Tj/TJ, FlateDecode via
  `DecompressionStream`, no dependencies) feeds the existing RAG path with the
  filename as title. Honest fallback for scanned/encrypted PDFs.
- **Agent recipes, subset (#51)** — three starter recipes (summarize+extract,
  survey form fields, compare options) as `🤖` chips in the empty state when
  Agent mode is on. Each is a canned first prompt for the existing agent loop
  (8-step cap, confirmations unchanged).

## 0.8.0

- **Agent streaming** — planning replies stream token-by-token (same providers as
  Ask mode) before each tool step.
- **Per-site Agent allow/deny** — Settings → Agent sites; deny forces Agent off,
  allow auto-enables for matching hostnames.
- **Safety confirmations** — navigate and sensitive clicks (submit/delete/pay/…)
  ask Allow/Deny in the panel before running.
- **New agent tools** — `wait_for_element`, `scroll_to_element`, `extract_data`.
- **Agent step bar** — numbered steps plus Pause / Resume / Cancel while the
  agent loop runs.
- **File backup & restore** — Export / Import buttons in Settings → Backup & Sync
  download a JSON file containing all settings, prompt library, bookmarks, and
  installed-extension list. API keys are included in the export (unlike Gist
  backups) so a single file fully restores a device. Import validates the backup
  schema before applying.
- **Agent JSON resilience** — models that wrap tool-call JSON in outer double
  quotes are now unquoted automatically; agent mode no longer hallucinates page
  content because page context is injected into the system prompt.
- **Agent continue after step limit** — when an agent hits the 8-step cap, a
  Continue button appears. Click it and type to resume the same task from where
  it stopped; conversation history and page context are preserved.
- **Agent debug panel** — when the model's JSON output can't be parsed, a
  collapsible details element shows the raw output (up to 2000 chars) for
  troubleshooting instead of a truncated 200-char snip.
- **Keyboard shortcut bar** — a thin bar below the mode toggles shows the
  available shortcuts (`Ctrl+Shift+A/N/G/R`); hidden on narrow mobile screens.
- **ADB push auto-packages** — `scripts/adb-update.ps1` now runs
  `package-extension.ps1` before pushing to the device.

## 0.7.0

- **Keyboard shortcuts** — `Ctrl+Shift+A` open panel; `Ctrl+Shift+N` new chat;
  `Ctrl+Shift+G` toggle Agent; `Ctrl+Shift+R` toggle RAG (rebind in
  `chrome://extensions` → Keyboard shortcuts).
- **Regenerate** — button on the latest assistant reply re-runs the last user
  turn without duplicating it in history.
- **Light / dark theme** — System / Dark / Light in Settings → Appearance;
  applies to panel and options.
- **Custom system prompts** — editable Ask and Agent base prompts in Settings
  (page context and tool docs still appended automatically).
- **Prompt library Gist UX** — optional “Include prompt library” on backup;
  restore keeps local prompts when the Gist omitted them.
- **Vision screenshot polish** — crop toward main/article region, max edge
  1280px, re-encode JPEG ~0.72 for smaller vision payloads.

## 0.6.5

- **Fix broken Chats / Close on Android** — `[hidden]` was overridden by
  `display: flex` on overlays; now forced with `display: none !important`.
  History sheet is a fixed full-screen overlay with a labeled **Close** button.
- **Simpler toolbar** — always-visible **Chats · Export · New · Settings** (no
  flaky ⋯ menu that stayed open over the sheet).
- **Split repo** — canonical source moves to `E:\repos\involvex-ai-agent`; this
  tree stays as a mirror until you delete it.

## 0.6.4

- **Mobile chat cutoff** — messages keep bottom padding so the last bubble clears
  the composer; composer respects `safe-area-inset-bottom` on Android gesture bars.
- **Labeled Chats / Export** — visible **Chats** button; on narrow screens a **⋯**
  menu with Chats, Export chat, New chat, Settings.
- **Android-safe export** — Web Share (file) → clipboard copy → blob download;
  toast confirms the result. History rows include an Export button.
- **Earlier session save** — chats are persisted after the user message (not only
  after the assistant reply), so History is less often empty.

## 0.6.0

- **History panel fix** — chat history opens as a bottom sheet inside the chat
  area only; header and composer stay visible. Tap the dim backdrop or ✕ to
  close.
- **FastVLM vision** — new LiteRT-local provider + `scripts/fastvlm-bridge.py`
  for `FastVLM-0.5B.litertlm`. Enable **Vision** in the panel to attach a page
  screenshot (also works with Gemini, OpenAI, Ollama llava/moondream).
- **Page RAG** — toggle **RAG** to retrieve relevant excerpts from long pages
  (local TF-IDF; optional Ollama `nomic-embed-text` embeddings in Settings).
- **Prompt library JSON** — Export / Import buttons in Settings.
- **Gist chat sync** — optional “Include chat history” checkbox; sessions are
  merged on restore (newest wins, 50 cap).

## 0.5.0

- **Chat history** — past conversations are saved locally and reachable from the
  new 🕘 button in the panel. Search by title or message text, reopen a chat to
  continue it, or delete individual chats / clear all. Keeps the 50 most recent.
- **Prompt library** — edit the quick-prompt chips shown on the New chat screen
  from Settings → Prompt library (label + prompt, add/remove, reset to
  defaults).
- **Extension restore links** — after a Gist restore, Settings lists the
  extensions from the backup with a best-effort install link (declared homepage
  or Chrome Web Store detail page) since extensions can't be reinstalled
  automatically.
- **Build**: `build-debug-wsl2.sh` auto-enables ccache when installed;
  `BUILD-WSL2.md` documents the self-hosted runner and local WSL2 + ccache paths
  for custom APKs (hosted CI can't finish in 6h).
- Fix: restored the missing `.blink` status-cursor CSS rule in the panel.

## 0.4.0

- **Scheduled auto-backup** — daily or weekly Gist backup via `chrome.alarms`.
  Configure in Settings → Backup & Sync. Last backup date shown in the panel.
- **Streaming responses** — token-by-token rendering for Gemini and
  OpenAI-compatible providers (OpenAI, OpenRouter, OpenCode Zen, Custom) in Ask
  mode.
- **Provider quick-switch** — dropdown in the panel header to change provider
  without opening Settings.
- Docs: `adb-update.ps1` linked from README; CI 6-hour limit documented in
  `BUILD-WSL2.md`.

## 0.3.0

- **New provider: OpenCode Zen** (`https://opencode.ai/zen/v1`), OpenAI-compatible.
  Default model `mimo-v2.5-free`; free models end with `-free`. Use **Load
  models** for the full live list.
- **Custom icon set** (16/32/48/128) — blue→purple emblem, shown on the toolbar
  button and in the panel header.
- **Export session as Markdown** — new ⤓ button in the panel downloads the
  whole conversation (with provider/model/mode header) as a `.md` file.
- **New chat** — ＋ button clears the current session.
- Packaging: `scripts/package-extension.*` zips a store-ready build.

## 0.2.1

- Load the GitHub Gist token from a bundled `.env` (`GITHUB_TOKEN`, `GIST_ID`)
  so backups work without typing keys into Settings.

## 0.2.0

- **Android fix**: removed the desktop-only `sidePanel` API (was throwing
  "'sidePanel' is not allowed for specified platform"). The panel now opens as a
  normal tab and tracks the originating page tab, so it works on Android.
- **New providers**: OpenRouter and a Custom OpenAI-compatible endpoint
  (OpenCode, Kilo Code, LM Studio, vLLM, LiteLLM…).
- **Model dropdown** in Settings and in the panel header, with a **Load models**
  button that fetches the provider's live list.
- **Backup & Sync**: bookmarks + non-secret settings + installed-extension list
  to a private GitHub Gist. Secrets are stripped from every backup.

## 0.1.0

- Initial release: on-tap chat, page reading, selection actions (explain /
  translate / rewrite), Agent mode (read/click/fill/navigate/scroll), and
  providers Gemini / OpenAI / Anthropic / Ollama.
