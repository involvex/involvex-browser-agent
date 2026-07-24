# Roadmap — Involvex AI Agent

Status legend: ✅ done · 🚧 in progress · ⏭ next · 💡 idea

## Done ✅

- On-tap chat panel (tab-based, Android-safe)
- Page reading + grounded Q&A
- Selection actions (explain / translate / rewrite)
- Agent mode (read_page / click / fill / navigate / scroll, 8-step cap)
- Providers: Gemini, OpenAI, Anthropic, OpenRouter, OpenCode Zen, Custom
  (OpenAI-compatible), Ollama
- Model dropdown + live model listing
- Private-Gist backup/restore of bookmarks + settings + extension list
- `.env` token loading
- Custom icon set
- Export session as Markdown

## Done (v0.5.0)

- Chat history persistence with search (🕘 button, reopen/delete, 50-chat cap)
- Prompt library — editable quick-prompt chips in Settings
- Extension restore links after a Gist restore (homepage / Web Store detail)
- ccache auto-enable in `build-debug-wsl2.sh`; self-hosted + WSL2 build docs

## Done (v0.4.0)

- Scheduled auto-backup (`chrome.alarms`) with last-synced indicator
- Streaming SSE responses (Gemini + OpenAI-compatible)
- Per-provider quick switch in panel header

## Done (v0.6.0)

- History panel bottom-sheet fix (no longer covers composer/header)
- FastVLM LiteRT vision provider + bridge script
- Page RAG (TF-IDF + optional Ollama embeddings)
- Prompt library JSON export/import
- Gist chat history sync

## Next ⏭

1. **Native FastVLM on Android** — embed LiteRT-LM in the Involvex browser APK
   so vision works without a PC bridge.
2. **Screenshot-to-vision** polish — crop to article region, compress smarter.
3. **Sync prompt library** through Gist (like chat history).

## Ideas 💡

- MEGA backend behind the same backup UI (needs the MEGA SDK; Gist is the
  default because it is serverless and free).
- Sync chat history through the same Gist backup.

## Browser build (separate track)

The full Chromium/Android build cannot finish inside GitHub-hosted runners (they
hard-cancel at 6 hours; our build reached ~5h45m before cancellation). Options:

- **Recommended now**: ship a prebuilt Helium/Kiwi APK and load this extension
  into it — no multi-hour compile needed.
- **Self-hosted runner** (a beefy Linux box/VM) removes the 6-hour cap.
- **Local Linux/WSL2 build** with `ccache`/`reclient` for incremental rebuilds.
