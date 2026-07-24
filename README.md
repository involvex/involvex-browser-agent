# Involvex AI Agent (browser extension)

An on-tap AI assistant that reads — and, in Agent mode, acts on — the current
web page, plus private backup of your bookmarks and settings. Built as a
Manifest V3 extension so it runs in Involvex Browser (Helium/Kiwi fork) and in
desktop Chrome/Edge without rebuilding the browser.

## Features

- **On tap**: tap the toolbar button to open the AI chat for the current tab.
  The panel opens as a page/tab, so it works on Android too (the desktop-only
  `sidePanel` API is not used).
- **Reads the page**: summaries, Q&A, and answers grounded in the page content.
- **Selection actions**: right-click selected text → Explain / Translate / Rewrite.
- **Agent mode** (toggle): the model can `read_page`, `click`, `fill`,
  `navigate`, `scroll`, `wait_for_element`, `scroll_to_element`, and
  `extract_data` (8-step cap). Pause/cancel + confirmations for sensitive
  actions.
- **Multi-provider**: Google Gemini, OpenAI, Anthropic Claude, **OpenRouter**
  (hundreds of models, incl. free), **OpenCode Zen** (default `mimo-v2.5-free`),
  a **Custom OpenAI-compatible endpoint** (Kilo Code, LM Studio, vLLM, LiteLLM…),
  or a **local model via Ollama**. Keys are stored locally and sent straight to
  the provider — no Involvex server.
- **Model dropdown**: pick the model in Settings (with a **Load models** button
  that fetches the provider's live list) or switch quickly from the panel header.
- **Backup & Sync**: back up bookmarks + settings + installed-extension list to
  a **private GitHub Gist**. Serverless, free, and API keys are never included.
- **Export session as Markdown**: the ⤓ button saves the whole conversation
  (with the provider/model/mode header) to a `.md` file.
- **Chat history**: the 🕘 button lists past chats — search by title or content,
  reopen to continue, delete one or clear all (keeps the 50 most recent).
- **Prompt library**: edit the New chat quick-prompt chips in Settings →
  Prompt library.
- **Extension restore links**: after a Gist restore, Settings lists the
  backed-up extensions with best-effort install links.
- **Page RAG**: toggle **RAG** in the panel to send only relevant excerpts from
  long pages (TF-IDF locally; optional Ollama embeddings in Settings).
- **Vision**: toggle **Vision** to attach a viewport screenshot — works with
  **FastVLM** (LiteRT), Gemini, OpenAI, and Ollama vision models (`llava`, etc.).
- **Prompt library JSON**: Export / Import in Settings.
- **Gist chat sync**: optional chat history in backup (Settings → Backup).
- **Keyboard shortcuts**: `Ctrl+Shift+A` open, `N` new chat, `G` Agent, `R` RAG
  (customize under `chrome://extensions` → Keyboard shortcuts).
- **Regenerate**: redo the latest assistant reply from the same user turn.
- **Theme**: System / Dark / Light in Settings → Appearance.
- **Custom system prompts**: edit Ask and Agent base instructions in Settings.
- **Prompt library Gist sync**: optional include on backup (like chat history).
- **Vision polish**: screenshots crop toward main content and compress before send.

## Install (developer load)

### Desktop Chrome / Edge / Involvex desktop

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked** and select this `involvex/ai-agent` folder.
4. Open **Details → Extension options** and set your provider + API key.
5. Tap the toolbar icon to open the AI chat panel.

### Involvex Browser on Android

Extension loading is enabled in this fork. Push the extension to your device
and load it unpacked:

```powershell
# From E:\repos\involvex-ai-agent (USB or wireless debugging)
pwsh scripts/adb-update.ps1
pwsh scripts/adb-update.ps1 -ClearCache   # force-stop + clear cache, then open extensions
```

On the device the script opens `chrome://extensions/?id=…`. **Tap Reload**
(Chromium Android cannot click that button for you), confirm version **0.8.0**,
then close and reopen the AI panel tab.

Browser package defaults to auto-detect (`io.github.jqssun.helium` or
`app.involvex.browser`). Override with `-Package app.involvex.browser` if needed.

## Configure a provider

Open the options page and pick one:

| Provider   | Needs key | Get a key                     | Example model              |
| ---------- | --------- | ----------------------------- | -------------------------- |
| Gemini     | yes       | aistudio.google.com/apikey    | `gemini-2.0-flash`         |
| OpenAI     | yes       | platform.openai.com/api-keys  | `gpt-4o-mini`              |
| Anthropic  | yes       | console.anthropic.com         | `claude-3-5-haiku-latest`  |
| OpenRouter | yes       | openrouter.ai/keys            | `openrouter/auto`          |
| OpenCode Zen | yes     | opencode.ai                   | `mimo-v2.5-free`           |
| Custom     | optional  | your own server               | server-defined             |
| Ollama     | no        | local install                 | `qwen2.5:3b`               |
| FastVLM    | no        | LiteRT + bridge script        | `fastvlm-0.5b`             |

Use **Load models** to fetch the live model list into the dropdown, then
**Test connection** to verify before chatting.

### OpenCode / Kilo Code / other OpenAI-compatible servers

Choose **Custom (OpenAI-compatible)** and set the Base URL to your server's
`/v1` endpoint (e.g. `http://localhost:8080/v1`), plus a key if it needs one.
Anything exposing `/v1/chat/completions` and `/v1/models` works.

## Backup & Sync (private GitHub Gist)

1. Create a GitHub token with only the **`gist`** scope at
   github.com/settings/tokens.
2. Open Settings → **Backup & Sync**, paste the token, click **Back up now**.
   A private (secret) Gist is created and its id is saved for future backups.
3. On another device, install the extension, paste the same token + Gist id,
   and click **Restore**. Bookmarks are added into a new "Involvex Restore"
   folder (existing bookmarks are never overwritten); non-secret settings are
   merged.

API keys and the Gist token itself are stripped from every backup, so secrets
never leave the device.

## Local small models (Ollama)

1. Install Ollama and pull a small model:
   ```bash
   ollama pull qwen2.5:3b
   ```
2. Let the extension reach Ollama (CORS). Start the server allowing the
   extension origin:
   ```bash
   OLLAMA_ORIGINS=* ollama serve
   ```
   (or set `OLLAMA_ORIGINS` to include `chrome-extension://*`).
3. In options choose **Local (Ollama)**, set base URL `http://localhost:11434`
   and the model name.

On Android, point the base URL at a reachable host running Ollama (e.g. your PC
on the LAN) since the phone itself won't run the server.

## FastVLM vision (LiteRT local)

1. Download [FastVLM-0.5B.litertlm](https://huggingface.co/litert-community/FastVLM-0.5B) (~1.2 GB).
2. Install bridge deps and run:
   ```bash
   pip install litert-lm pillow
   python involvex/ai-agent/scripts/fastvlm-bridge.py /path/to/FastVLM-0.5B.litertlm
   ```
3. In Settings choose **FastVLM (LiteRT local)**, base URL `http://127.0.0.1:8765/v1`.
4. In the panel enable **Vision** before asking about the page.

On Android with USB debugging, port-forward the bridge from your PC:
```bash
adb reverse tcp:8765 tcp:8765
```
Then use `http://127.0.0.1:8765/v1` as the base URL on the device.

## How it works

- `manifest.json` — MV3 config (context menus, `scripting`, `bookmarks`).
- `src/background.js` — service worker: opens the panel as a tab, extracts page
  content and performs actions via `chrome.scripting.executeScript`, runs the
  ask flow and the agentic tool loop, routes chat over a `Port`, and handles
  backup requests.
- `src/providers.js` — unified `chat()` and `listModels()` across
  Gemini/OpenAI/Anthropic/OpenRouter/custom/Ollama.
- `src/backup.js` — private-Gist backup/restore of bookmarks + settings.
- `src/env.js` — optional `.env` loader for the Gist token.
- `src/panel.*` — the chat UI (on-tap surface, model dropdown, export, quick
  prompts, Agent toggle). Opens as a tab so it works on Android.
- `src/options.*` — provider settings, model picker, connection test, backup.
- `icons/` — extension icon set (16/32/48/128).
- `scripts/package-extension.*` — build a store-ready zip.

## Packaging

```bash
# from involvex/ai-agent
bash scripts/package-extension.sh          # -> dist/involvex-ai-agent-<version>.zip
```

```powershell
# Windows
pwsh scripts/package-extension.ps1
```

See `CHANGELOG.md` for release notes and `ROADMAP.md` for what's next
(backlog source of truth: Done · v0.7 · v0.8 · Later). Archived
brainstorm items with status tags live in `suggestions.md`.

The agent loop is provider-agnostic: the model requests one tool per turn as a
JSON block, the worker executes it in the page and feeds back the result until
the model calls `finish`. This avoids depending on any single vendor's
function-calling format.

## Safety notes

- Agent mode can click and submit forms. It is **off by default**; enable it per
  session with the **Agent** toggle. Navigation is restricted to `http(s)`.
- Page content is only sent to the provider you configured, when you send a
  message. Nothing is sent on page load.

## Roadmap

See **`ROADMAP.md`** for the full prioritized backlog. Near-term highlights:

- **v0.7–v0.8** (shipped) — UX polish and agent depth (streaming, site
  allow/deny, confirmations, new tools, pause/cancel).
- **Later** — memory, voice, i18n, MEGA, plugins.
