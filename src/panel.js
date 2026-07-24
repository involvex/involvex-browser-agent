import { PROVIDERS, providerSupportsVision, chat, chatStream, supportsStreaming } from "./providers.js";
import {
  saveSession,
  searchSessions,
  getSession,
  deleteSession,
  clearSessions,
} from "./sessions.js";
import { DEFAULT_PROMPTS } from "./prompts.js";

const messagesEl = document.getElementById("messages");
const emptyEl = document.getElementById("empty");
const inputEl = document.getElementById("input");
const formEl = document.getElementById("composer");
const sendBtn = document.getElementById("send");
const agentToggle = document.getElementById("agentToggle");
const settingsBtn = document.getElementById("settingsBtn");
const exportBtn = document.getElementById("exportBtn");
const newBtn = document.getElementById("newBtn");
const historyBtn = document.getElementById("historyBtn");
const toastEl = document.getElementById("toast");
const historyPanel = document.getElementById("historyPanel");
const historyBackdrop = document.getElementById("historyBackdrop");
const historyList = document.getElementById("historyList");
const historySearch = document.getElementById("historySearch");
const historyClose = document.getElementById("historyClose");
const historyClear = document.getElementById("historyClear");
const providerLine = document.getElementById("providerLine");
const providerSelect = document.getElementById("providerSelect");
const modelSelect = document.getElementById("modelSelect");
const ragToggle = document.getElementById("ragToggle");
const visionToggle = document.getElementById("visionToggle");
const visionWrap = document.getElementById("visionWrap");

const history = [];
let busy = false;
let statusEl = null;
let streamEl = null;
let streamText = "";
let targetTabId = null;
let currentSessionId = null;
let sessionCreatedAt = null;
let toastTimer = null;

function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function showToast(text, ms = 2800) {
  if (!toastEl) return;
  toastEl.textContent = text;
  toastEl.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastEl.hidden = true;
  }, ms);
}

function setOverlayVisible(el, visible) {
  if (!el) return;
  el.hidden = !visible;
}

/// Renders a small, safe subset of markdown to HTML.
function renderMarkdown(src) {
  const blocks = src.split(/```/);
  let html = "";
  blocks.forEach((block, idx) => {
    if (idx % 2 === 1) {
      const nl = block.indexOf("\n");
      const code = nl >= 0 ? block.slice(nl + 1) : block;
      html += `<pre><code>${escapeHtml(code)}</code></pre>`;
      return;
    }
    let t = escapeHtml(block);
    t = t.replace(/`([^`]+)`/g, "<code>$1</code>");
    t = t.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    t = t.replace(/\*([^*]+)\*/g, "<em>$1</em>");
    t = t.replace(
      /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener">$1</a>',
    );
    const lines = t.split("\n");
    let out = "";
    let inList = false;
    for (const line of lines) {
      const li = line.match(/^\s*[-*]\s+(.*)$/);
      if (li) {
        if (!inList) {
          out += "<ul>";
          inList = true;
        }
        out += `<li>${li[1]}</li>`;
      } else {
        if (inList) {
          out += "</ul>";
          inList = false;
        }
        if (line.trim()) out += `<p>${line}</p>`;
      }
    }
    if (inList) out += "</ul>";
    html += out;
  });
  return html;
}

function scrollToBottom() {
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function addMessage(role, text, kind) {
  if (emptyEl && emptyEl.parentNode) emptyEl.remove();
  const el = document.createElement("div");
  el.className = `msg ${kind || role}`;
  if (role === "assistant" && kind !== "step" && kind !== "error") {
    el.innerHTML = renderMarkdown(text);
  } else {
    el.textContent = text;
  }
  messagesEl.appendChild(el);
  scrollToBottom();
  return el;
}

function setStatus(text) {
  if (!statusEl) {
    statusEl = document.createElement("div");
    statusEl.className = "msg status";
    messagesEl.appendChild(statusEl);
  }
  statusEl.innerHTML = `<span class="blink">${escapeHtml(text)}</span>`;
  scrollToBottom();
}

function clearStatus() {
  if (statusEl) {
    statusEl.remove();
    statusEl = null;
  }
}

function setBusy(v) {
  busy = v;
  sendBtn.disabled = v;
  inputEl.disabled = v;
}

function finishAssistant(text) {
  clearStatus();
  if (streamEl) {
    streamEl.classList.remove("streaming");
    streamEl.innerHTML = renderMarkdown(text);
    streamEl = null;
    streamText = "";
  } else {
    addMessage("assistant", text);
  }
  history.push({ role: "assistant", content: text });
  persistSession();
}

function handlePortMessage(m, port) {
  if (m.event === "status") {
    setStatus(m.text);
  } else if (m.event === "stream_start") {
    clearStatus();
    if (emptyEl && emptyEl.parentNode) emptyEl.remove();
    streamEl = document.createElement("div");
    streamEl.className = "msg assistant streaming";
    messagesEl.appendChild(streamEl);
    scrollToBottom();
  } else if (m.event === "token") {
    streamText += m.text || "";
    if (streamEl) {
      streamEl.textContent = streamText;
      scrollToBottom();
    }
  } else if (m.event === "step") {
    clearStatus();
    const args =
      m.args && Object.keys(m.args).length ? " " + JSON.stringify(m.args) : "";
    addMessage("assistant", `▸ ${m.action}${args}`, "step");
    if (m.thought) setStatus(m.thought);
  } else if (m.event === "assistant") {
    finishAssistant(m.text);
  } else if (m.event === "error") {
    clearStatus();
    addMessage("assistant", `Error: ${m.text}`, "error");
  } else if (m.event === "done") {
    clearStatus();
    setBusy(false);
    port.disconnect();
  }
}

async function sendAsk(text) {
  try {
    setStatus("Loading page context…");
    const prep = await chrome.runtime.sendMessage({
      type: "prepareAsk",
      text,
      history: history.slice(0, -1),
      tabId: targetTabId,
      vision: visionToggle.checked,
      rag: ragToggle.checked,
    });
    if (!prep?.ok) throw new Error(prep?.error || "Could not prepare request");

    const settings = prep.settings || (await chrome.storage.local.get("settings")).settings;
    const s = { ...(settings || { provider: "gemini" }) };
    s.provider = providerSelect.value;
    s[s.provider] = {
      ...(s[s.provider] || {}),
      model: modelSelect.value,
    };

    setStatus("Thinking…");
    let answer;
    if (supportsStreaming(s.provider)) {
      clearStatus();
      if (emptyEl && emptyEl.parentNode) emptyEl.remove();
      streamEl = document.createElement("div");
      streamEl.className = "msg assistant streaming";
      messagesEl.appendChild(streamEl);
      scrollToBottom();
      answer = await chatStream(s, prep.messages, (chunk) => {
        streamText += chunk || "";
        if (streamEl) {
          streamEl.textContent = streamText;
          scrollToBottom();
        }
      });
    } else {
      answer = await chat(s, prep.messages);
    }
    finishAssistant(answer);
  } catch (e) {
    clearStatus();
    addMessage("assistant", `Error: ${String((e && e.message) || e)}`, "error");
  } finally {
    setBusy(false);
  }
}

function send(text) {
  if (busy || !text.trim()) return;
  const mode = agentToggle.checked ? "agent" : "ask";
  addMessage("user", text);
  history.push({ role: "user", content: text });
  persistSession();
  setBusy(true);
  setStatus("Connecting…");
  streamEl = null;
  streamText = "";

  if (mode === "ask") {
    sendAsk(text);
    return;
  }

  const port = chrome.runtime.connect({ name: "agent" });
  port.onMessage.addListener((m) => handlePortMessage(m, port));
  port.onDisconnect.addListener(() => {
    clearStatus();
    setBusy(false);
  });
  port.postMessage({
    type: "chat",
    text,
    mode: "agent",
    tabId: targetTabId,
    history: history.slice(0, -1),
    vision: visionToggle.checked,
    rag: ragToggle.checked,
  });
}

formEl.addEventListener("submit", (e) => {
  e.preventDefault();
  const text = inputEl.value;
  inputEl.value = "";
  inputEl.style.height = "auto";
  send(text);
});

inputEl.addEventListener("input", () => {
  inputEl.style.height = "auto";
  inputEl.style.height = Math.min(inputEl.scrollHeight, 140) + "px";
});

inputEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    formEl.requestSubmit();
  }
});

messagesEl.addEventListener("click", (e) => {
  const chip = e.target.closest(".chip");
  if (chip?.dataset?.prompt) send(chip.dataset.prompt);
});

settingsBtn.addEventListener("click", () => chrome.runtime.openOptionsPage());

async function persistSession() {
  if (!history.length) return;
  if (!sessionCreatedAt) sessionCreatedAt = Date.now();
  const record = await saveSession({
    id: currentSessionId,
    provider: providerSelect.value,
    model: modelSelect.value,
    mode: agentToggle.checked ? "agent" : "ask",
    messages: history.slice(),
    createdAt: sessionCreatedAt,
  });
  currentSessionId = record.id;
}

function formatWhen(ts) {
  const d = new Date(ts);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  return sameDay
    ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString();
}

async function renderHistory() {
  const list = await searchSessions(historySearch.value);
  historyList.innerHTML = "";
  if (!list.length) {
    const li = document.createElement("li");
    li.className = "history-empty";
    li.textContent = historySearch.value.trim()
      ? "No matching chats."
      : "No saved chats yet. Conversations appear here after you send a message.";
    historyList.appendChild(li);
    return;
  }
  for (const s of list) {
    const li = document.createElement("li");
    li.className = "history-item";
    li.dataset.id = s.id;

    const main = document.createElement("button");
    main.className = "history-open";
    main.dataset.id = s.id;
    main.type = "button";
    const title = document.createElement("span");
    title.className = "history-title";
    title.textContent = s.title;
    const meta = document.createElement("span");
    meta.className = "history-meta";
    const count = (s.messages || []).length;
    meta.textContent = `${formatWhen(s.updatedAt)} · ${count} msg${count === 1 ? "" : "s"}`;
    main.appendChild(title);
    main.appendChild(meta);

    const exp = document.createElement("button");
    exp.className = "history-export";
    exp.type = "button";
    exp.title = "Export";
    exp.dataset.export = s.id;
    exp.textContent = "⤓";

    const del = document.createElement("button");
    del.className = "history-del";
    del.type = "button";
    del.title = "Delete";
    del.dataset.del = s.id;
    del.textContent = "🗑";

    li.appendChild(main);
    li.appendChild(exp);
    li.appendChild(del);
    historyList.appendChild(li);
  }
}

function openHistory() {
  setOverlayVisible(historyPanel, true);
  setOverlayVisible(historyBackdrop, true);
  historySearch.value = "";
  renderHistory();
}

function closeHistory() {
  setOverlayVisible(historyPanel, false);
  setOverlayVisible(historyBackdrop, false);
}

async function loadSession(id) {
  const s = await getSession(id);
  if (!s) return;
  history.length = 0;
  messagesEl.innerHTML = "";
  currentSessionId = s.id;
  sessionCreatedAt = s.createdAt;
  for (const m of s.messages) {
    history.push({ role: m.role, content: m.content });
    addMessage(m.role, m.content);
  }
  closeHistory();
}

historyBtn.addEventListener("click", (e) => {
  e.preventDefault();
  e.stopPropagation();
  openHistory();
});
historyClose.addEventListener("click", (e) => {
  e.preventDefault();
  e.stopPropagation();
  closeHistory();
});
historyBackdrop.addEventListener("click", (e) => {
  e.preventDefault();
  closeHistory();
});
historySearch.addEventListener("input", renderHistory);
historyClear.addEventListener("click", async (e) => {
  e.preventDefault();
  await clearSessions();
  renderHistory();
});
historyList.addEventListener("click", async (e) => {
  const del = e.target.closest("[data-del]");
  if (del) {
    e.preventDefault();
    await deleteSession(del.dataset.del);
    renderHistory();
    return;
  }
  const exp = e.target.closest("[data-export]");
  if (exp) {
    e.preventDefault();
    const s = await getSession(exp.dataset.export);
    if (s) await exportSession(s);
    return;
  }
  const open = e.target.closest(".history-open");
  if (open) {
    e.preventDefault();
    loadSession(open.dataset.id);
  }
});

function buildMarkdown(messages, meta = {}) {
  const now = new Date();
  const lines = [
    `# Involvex AI — session`,
    "",
    `- Date: ${meta.date || now.toLocaleString()}`,
    `- Provider/model: ${meta.providerLine || providerLine.textContent} · ${meta.model || modelSelect.value}`,
    `- Mode: ${meta.mode || (agentToggle.checked ? "Agent" : "Ask")}`,
    "",
    "---",
    "",
  ];
  for (const m of messages) {
    const who = m.role === "user" ? "You" : "Assistant";
    const content = typeof m.content === "string" ? m.content : String(m.content || "");
    lines.push(`## ${who}`, "", content, "");
  }
  return lines.join("\n");
}

function downloadMarkdown(markdown, filename) {
  const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

async function exportSession(sessionOrNull) {
  const msgs = sessionOrNull?.messages || history;
  if (!msgs || !msgs.length) {
    showToast("Nothing to export yet — start a chat first.");
    return;
  }
  const now = new Date();
  const filename = `involvex-ai-${now.toISOString().slice(0, 19).replace(/[:T]/g, "-")}.md`;
  const markdown = buildMarkdown(msgs, {
    date: sessionOrNull?.updatedAt
      ? new Date(sessionOrNull.updatedAt).toLocaleString()
      : now.toLocaleString(),
    providerLine: sessionOrNull
      ? `${sessionOrNull.provider || "session"} · ${sessionOrNull.model || ""}`
      : providerLine.textContent,
    model: sessionOrNull?.model || modelSelect.value,
    mode: sessionOrNull?.mode || (agentToggle.checked ? "Agent" : "Ask"),
  });

  const file = new File([markdown], filename, { type: "text/markdown" });
  try {
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({
        files: [file],
        title: "Involvex AI chat",
        text: sessionOrNull?.title || "Exported chat",
      });
      showToast("Shared.");
      return;
    }
  } catch (e) {
    if (e && e.name === "AbortError") return;
  }

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(markdown);
      showToast("Copied — paste into Notes / Drive.");
      return;
    }
  } catch (_) {
    // fall through
  }

  downloadMarkdown(markdown, filename);
  showToast("Download started (desktop).");
}

async function exportMarkdown() {
  await exportSession(null);
}

async function loadPrompts() {
  const { settings } = await chrome.storage.local.get("settings");
  const custom = settings?.prompts;
  return Array.isArray(custom) && custom.length ? custom : DEFAULT_PROMPTS;
}

async function renderQuickChips(container) {
  const prompts = await loadPrompts();
  const quick = document.createElement("div");
  quick.className = "quick";
  for (const p of prompts) {
    if (!p || !p.prompt) continue;
    const btn = document.createElement("button");
    btn.className = "chip";
    btn.type = "button";
    btn.dataset.prompt = p.prompt;
    btn.textContent = p.label || p.prompt;
    quick.appendChild(btn);
  }
  container.appendChild(quick);
}

async function newChat() {
  history.length = 0;
  currentSessionId = null;
  sessionCreatedAt = null;
  messagesEl.innerHTML = "";
  const div = document.createElement("div");
  div.className = "empty";
  const title = document.createElement("p");
  title.className = "empty-title";
  title.textContent = "New chat";
  const sub = document.createElement("p");
  sub.className = "empty-sub";
  sub.textContent =
    "Ask about this page, or turn on Agent mode to let me act on it.";
  div.appendChild(title);
  div.appendChild(sub);
  messagesEl.appendChild(div);
  await renderQuickChips(div);
}

exportBtn.addEventListener("click", (e) => {
  e.preventDefault();
  exportMarkdown();
});
newBtn.addEventListener("click", (e) => {
  e.preventDefault();
  newChat();
});

agentToggle.addEventListener("change", () => {
  chrome.storage.local.set({ agentMode: agentToggle.checked });
});

ragToggle.addEventListener("change", () => {
  chrome.storage.local.set({ ragMode: ragToggle.checked });
});

visionToggle.addEventListener("change", () => {
  chrome.storage.local.set({ visionMode: visionToggle.checked });
});

modelSelect.addEventListener("change", async () => {
  const { settings } = await chrome.storage.local.get("settings");
  const s = settings || { provider: "gemini" };
  const p = s.provider;
  s[p] = { ...(s[p] || {}), model: modelSelect.value };
  await chrome.storage.local.set({ settings: s });
});

providerSelect.addEventListener("change", async () => {
  const { settings } = await chrome.storage.local.get("settings");
  const s = settings || { provider: "gemini" };
  s.provider = providerSelect.value;
  await chrome.storage.local.set({ settings: s });
  await refreshHeader();
});

const PANEL_PROVIDER_LABELS = {
  gemini: "Gemini",
  openai: "OpenAI",
  anthropic: "Claude",
  openrouter: "OpenRouter",
  opencode: "OpenCode",
  custom: "Custom",
  ollama: "Ollama",
  fastvlm: "FastVLM",
};

async function refreshHeader() {
  const { settings } = await chrome.storage.local.get("settings");
  const s = settings || { provider: "gemini" };
  const info = PROVIDERS[s.provider];
  const cfg = s[s.provider] || {};
  const currentModel = cfg.model || info?.defaultModel || "";

  providerSelect.innerHTML = "";
  for (const [id, p] of Object.entries(PROVIDERS)) {
    const opt = document.createElement("option");
    opt.value = id;
    opt.textContent =
      PANEL_PROVIDER_LABELS[id] ||
      p.label.replace(/ \(.*\)$/, "");
    if (id === s.provider) opt.selected = true;
    providerSelect.appendChild(opt);
  }

  const models = (cfg.models && cfg.models.length
    ? cfg.models
    : info?.knownModels || []
  ).slice();
  if (currentModel && !models.includes(currentModel)) models.unshift(currentModel);
  modelSelect.innerHTML = "";
  if (models.length === 0) {
    const opt = document.createElement("option");
    opt.textContent = currentModel || "(set model in Settings)";
    opt.value = currentModel;
    modelSelect.appendChild(opt);
  } else {
    for (const m of models) {
      const opt = document.createElement("option");
      opt.value = m;
      opt.textContent = m;
      if (m === currentModel) opt.selected = true;
      modelSelect.appendChild(opt);
    }
  }

  const missingKey = info?.needsKey && !cfg.apiKey;
  const backup = s.backup || {};
  let line = info?.label || s.provider;
  if (backup.lastBackup) {
    line += ` · backed up ${new Date(backup.lastBackup).toLocaleDateString()}`;
  }
  if (missingKey) {
    providerLine.textContent = `⚠ ${info.label}: no API key set — tap to open Settings`;
    providerLine.classList.add("warn");
    providerLine.onclick = () => chrome.runtime.openOptionsPage();
  } else {
    providerLine.textContent = line;
    providerLine.classList.remove("warn");
    providerLine.onclick = null;
  }

  const canVision = providerSupportsVision(s.provider);
  visionWrap.classList.toggle("disabled", !canVision);
  if (!canVision) visionToggle.checked = false;
}

async function init() {
  const { agentMode, pendingPrompt, targetTabId: tid, ragMode, visionMode } =
    await chrome.storage.local.get([
      "agentMode",
      "pendingPrompt",
      "targetTabId",
      "ragMode",
      "visionMode",
    ]);
  targetTabId = tid ?? null;
  agentToggle.checked = !!agentMode;
  ragToggle.checked = ragMode !== false;
  visionToggle.checked = !!visionMode;
  await refreshHeader();
  const staticQuick = emptyEl?.querySelector(".quick");
  if (staticQuick) {
    staticQuick.remove();
    await renderQuickChips(emptyEl);
  }
  if (pendingPrompt) {
    await chrome.storage.local.remove("pendingPrompt");
    send(pendingPrompt);
  }
  inputEl.focus();
}

chrome.runtime.onMessage.addListener(async (msg) => {
  if (msg && msg.event === "panel-refocus") {
    const { pendingPrompt, targetTabId: tid } = await chrome.storage.local.get([
      "pendingPrompt",
      "targetTabId",
    ]);
    if (tid != null) targetTabId = tid;
    if (pendingPrompt) {
      await chrome.storage.local.remove("pendingPrompt");
      send(pendingPrompt);
    }
  }
});

chrome.storage.onChanged.addListener((changes) => {
  if (changes.settings) refreshHeader();
});

init();
