# AGENTS.md — Involvex AI Agent

This file contains instructions for AI agents working on the Involvex AI Agent project. Follow these guidelines when reading, modifying, or reviewing code in this repository.

---

## Project Overview

**Involvex AI Agent** is a Chrome extension (Manifest V3) that provides an on-tap AI assistant. It reads and acts on the current web page, supports multiple AI providers, and includes a private backup system via GitHub Gists.

**Current version:** 0.9.0

### Key Features

- **On-tap AI chat** — opens as a panel/tab (works on Android)
- **Agent mode** — model can `read_page`, `click`, `fill`, `navigate`, and `scroll` (capped at 8 steps)
- **Multi-provider** — Gemini, OpenAI, Anthropic, OpenRouter, OpenCode Zen, custom OpenAI-compatible endpoints, Ollama local models
- **Page RAG** — TF-IDF retrieval of relevant excerpts from long pages
- **Vision** — viewport screenshot via FastVLM (LiteRT), Gemini, OpenAI, or Ollama vision models
- **Backup & Sync** — private GitHub Gist for bookmarks, settings, and extension list
- **Chat history** — local persistence with search, reopen, and delete (50-chat cap)
- **Prompt library** — editable quick-prompt chips with JSON export/import

---

## Architecture

```
involvex-ai-agent/
├── manifest.json           # MV3 config (permissions, service worker, icons)
├── src/
│   ├── background.js       # Service worker: panel routing, page extraction, agentic tool loop
│   ├── providers.js        # Unified chat() and listModels() across all providers
│   ├── backup.js           # Private GitHub Gist backup/restore
│   ├── env.js              # Optional .env loader for Gist token
│   ├── rag.js              # Page RAG (TF-IDF + optional Ollama embeddings)
│   ├── sessions.js         # Chat history persistence
│   ├── prompts.js          # Prompt library defaults and management
│   ├── panel.*             # Chat UI (panel.html, panel.js, panel.css)
│   ├── options.*           # Settings UI (options.html, options.js, options.css)
├── icons/                  # Extension icons (16/32/48/128)
├── scripts/
│   ├── adb-update.ps1      # Push extension to Android device via ADB
│   ├── package-extension.ps1  # Build store-ready zip
│   ├── package-extension.sh   # Linux/macOS equivalent
│   └── fastvlm-bridge.py   # FastVLM LiteRT bridge server
├── .env.example            # Template for local secrets (gitignored)
├── CHANGELOG.md            # Release notes
├── ROADMAP.md              # Backlog source of truth (v0.7 / v0.8 / Later)
└── suggestions.md          # Archived ideas (status tags → ROADMAP)
```

### Data Flow

1. User taps toolbar icon → `background.js` opens `panel.html` as a tab
2. Panel sends messages via `chrome.runtime.Port` to the service worker
3. `background.js` extracts page content via `chrome.scripting.executeScript`
4. `providers.js` routes the request to the configured provider (Gemini/OpenAI/etc.)
5. In Agent mode, the model returns tool calls as JSON → `background.js` executes them in the page → result is fed back until `finish`

---

## Useful Commands

### Load Extension (Desktop)

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked** and select this project folder

### Push to Android Device

```powershell
# Push extension to connected Android device
pwsh scripts/adb-update.ps1

# Force-stop + clear cache, then open extensions page
pwsh scripts/adb-update.ps1 -ClearCache

# Specify browser package explicitly
pwsh scripts/adb-update.ps1 -Package app.involvex.browser

# Push only (no restart)
pwsh scripts/adb-update.ps1 -SkipRestart
```

After the script runs, **tap Reload** on the device's extensions page (automated reload is not possible for unpacked extensions on Android).

### Package for Distribution

```powershell
# Windows
pwsh scripts/package-extension.ps1
# -> dist/involvex-ai-agent-<version>.zip
```

```bash
# Linux/macOS
bash scripts/package-extension.sh
# -> dist/involvex-ai-agent-<version>.zip
```

### FastVLM Vision Bridge

```bash
# Install dependencies
pip install litert-lm pillow

# Run the bridge server
python scripts/fastvlm-bridge.py /path/to/FastVLM-0.5B.litertlm
# -> http://127.0.0.1:8765/v1
```

### ADB Port Forwarding (Android Vision)

```bash
adb reverse tcp:8765 tcp:8765
```

---

## Technologies

| Technology | Purpose |
|---|---|
| **Chrome Extension Manifest V3** | Extension platform (service worker, permissions, context menus) |
| **Vanilla JavaScript (ES Modules)** | All source code — no frameworks, no build step |
| **Chrome APIs** | `activeTab`, `scripting`, `storage`, `contextMenus`, `tabs`, `bookmarks`, `alarms` |
| **HTML/CSS** | Panel and options UI (no templates or preprocessors) |
| **GitHub Gist API** | Private backup/restore of bookmarks, settings, extensions |
| **OpenAI-compatible API** | Unified interface for Gemini, OpenAI, Anthropic, OpenRouter, OpenCode Zen, custom endpoints, Ollama |
| **TF-IDF** | Local page RAG (no external dependencies) |
| **LiteRT (TensorFlow Lite)** | FastVLM local vision model inference |
| **Python** | FastVLM bridge script only |

---

## Best Practices and Guidelines

### Code Style

- **No build step required.** All JS is vanilla ES modules loaded directly by Chrome.
- **No external dependencies** in the extension itself (no npm, no bundler).
- Use modern JavaScript (async/await, optional chaining, template literals).
- Keep functions small and focused; the service worker (`background.js`) is the largest file at ~480 lines.
- Functions injected into the page via `chrome.scripting.executeScript` must be **self-contained** — they cannot reference closures or external imports.

### File Conventions

- `*.html` / `*.js` / `*.css` pairs for UI surfaces (panel, options).
- Background logic lives in `background.js`; provider abstraction in `providers.js`.
- Secrets (API keys, tokens) are stored in `chrome.storage.local` and **never** included in backups.

### Chrome Extension Patterns

- **Manifest V3 only** — no background pages; use the service worker.
- The panel opens as a **tab** (not a side panel) for Android compatibility.
- Use `chrome.scripting.executeScript` with `world: "MAIN"` for page access.
- Agent mode tool calls are executed via injected functions — ensure they are pure and self-contained.
- The agentic loop is provider-agnostic: the model returns a JSON block with one tool per turn.
  Tools include read/click/fill/navigate/scroll plus wait_for_element, scroll_to_element,
  and extract_data. Sensitive navigate/click actions can require panel confirmation.

### Security

- **Agent mode is OFF by default.** Users must explicitly enable it per session.
- Navigation in Agent mode is restricted to `http(s)` only.
- API keys are stored locally in `chrome.storage.local` and stripped from all backups.
- The `.env` file is gitignored — never commit secrets.
- The Gist backup only includes bookmarks, settings, and extension list — **never** API keys or tokens.

### Provider Abstraction

When adding or modifying a provider:

1. Add the provider entry to `PROVIDERS` in `providers.js` with `label`, `defaultModel`, `needsKey`, and `knownModels`.
2. Implement `chat()` and `listModels()` cases for the new provider.
3. Use the OpenAI-compatible format (`/v1/chat/completions`) for custom endpoints.
4. The model dropdown automatically uses `knownModels` and can fetch live lists via `listModels()`.

### Adding Features

- Keep the extension self-contained — no build tools, no npm packages.
- Test on both desktop Chrome and Android (Involvex Browser / Helium / Kiwi).
- The panel UI must work as a standalone tab, not just in a side panel.
- For new permissions, add them to `manifest.json` and document why.
- Update `CHANGELOG.md` and `ROADMAP.md` for each release.

### Testing

- Load the extension unpacked in Chrome and configure a provider.
- Test the Agent mode toggle and verify tool execution.
- Test backup/restore flow with a GitHub Gist token.
- Verify Android deployment via `adb-update.ps1`.
- Test with multiple providers to ensure the abstraction layer works.

### Common Pitfalls

- **Functions injected into pages** cannot use imports or reference outer scope.
- **CORS**: Ollama requires `OLLAMA_ORIGINS=*` or explicit `chrome-extension://*` origin.
- **Android differences**: The `sidePanel` API is not used; the panel always opens as a tab.
- **Extension reload**: Chromium Android cannot click "Reload" programmatically — users must tap it manually.
- **Max page chars**: Page content is capped at 12,000 characters (`MAX_PAGE_CHARS`).
- **Agent steps**: Agentic loops are capped at 8 steps (`MAX_AGENT_STEPS`).

---

## Version Management

- Version is defined in `manifest.json` (`version` field).
- `CHANGELOG.md` documents all notable changes per version.
- `ROADMAP.md` is the backlog source of truth (Done · v0.7 · v0.8 · Later).
  `suggestions.md` is an archived idea list with status tags.
- Package scripts read the version from `manifest.json` automatically.

---

## Git Conventions

- Commit messages should be concise and descriptive.
- The `.gitignore` excludes: `.env`, `dist/`, `*.zip`, `__pycache__/`, `*.pyc`, `.DS_Store`.
- Keep `src/`, `scripts/`, `icons/`, `manifest.json`, and docs tracked.

---

## File Map

| File | Description |
|---|---|
| `manifest.json` | Extension manifest (MV3, permissions, service worker) |
| `src/background.js` | Service worker — panel routing, page extraction, agentic tool loop |
| `src/providers.js` | Provider abstraction — `chat()` and `listModels()` for all providers |
| `src/backup.js` | GitHub Gist backup/restore |
| `src/env.js` | `.env` file loader |
| `src/rag.js` | Page RAG with TF-IDF and optional Ollama embeddings |
| `src/sessions.js` | Chat history persistence and search |
| `src/prompts.js` | Prompt library management |
| `src/panel.html` | Chat panel UI (HTML) |
| `src/panel.js` | Chat panel logic |
| `src/panel.css` | Chat panel styles |
| `src/options.html` | Settings page (HTML) |
| `src/options.js` | Settings logic |
| `src/options.css` | Settings styles |
| `icons/` | Extension icons (16, 32, 48, 128 px) |
| `scripts/adb-update.ps1` | Push extension to Android via ADB |
| `scripts/package-extension.ps1` | Package for Chrome Web Store |
| `scripts/fastvlm-bridge.py` | FastVLM LiteRT vision bridge server |
| `.env.example` | Template for local secrets |
| `CHANGELOG.md` | Release notes |
| `ROADMAP.md` | Feature roadmap (source of truth) |
| `suggestions.md` | Archived idea list (status tags → ROADMAP) |
