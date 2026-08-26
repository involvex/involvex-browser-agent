import {
  PROVIDERS,
  providerSupportsVision,
  chat,
  chatStream,
  supportsStreaming,
} from "./providers.js";
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
const agentBar = document.getElementById("agentBar");
const agentBarLabel = document.getElementById("agentBarLabel");
const agentPauseBtn = document.getElementById("agentPause");
const agentCancelBtn = document.getElementById("agentCancel");
const confirmBanner = document.getElementById("confirmBanner");
const confirmDetail = document.getElementById("confirmDetail");
const confirmOk = document.getElementById("confirmOk");
const confirmDeny = document.getElementById("confirmDeny");

const history = [];
let busy = false;
let pinnedIds = new Set();
let statusEl = null;
let pageContentCache = null; // cached {text, url, timestamp}
const PAGE_CACHE_TTL = 10 * 60 * 1000; // 10 minutes TTL
const MAX_HISTORY_MESSAGES = 50; // keep last N messages to manage memory
const VISIBLE_MESSAGE_BUFFER = 5; // render this many messages above/below viewport
let messageHeights = new Map(); // cache message element heights
let streamEl = null;
let streamText = "";
let targetTabId = null;
let currentSessionId = null;
let sessionCreatedAt = null;
let toastTimer = null;
let activeAgentPort = null;
let agentPaused = false;
let pendingConfirmId = null;
let agentPolicyNote = "";

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

function getMessageHeight(el) {
  if (!el) return 0;
  const cached = messageHeights.get(el.id || el.dataset.id);
  if (cached !== undefined) return cached;
  const height = el.offsetHeight || 36; // fallback default height
  messageHeights.set(el.id || el.dataset.id, height);
  return height;
}

function renderVisibleMessages() {
  if (!messagesEl) return;
  const viewportHeight = messagesEl.clientHeight;
  const scrollTop = messagesEl.scrollTop;
  const scrollBottom = scrollTop + viewportHeight;

  // Calculate total height of all message elements
  let totalHeight = 0;
  const visibleEls = [];
  const hiddenEls = [];

  // Get all message elements
  const allMsgs = messagesEl.querySelectorAll(".msg:not(.hidden)");

  // First pass: calculate heights and determine which are visible
  allMsgs.forEach((el, idx) => {
    const height = getMessageHeight(el);
    totalHeight += height;

    // Check if this message is in the visible range (with buffer)
    const messageTop = totalHeight - height;
    const messageBottom = totalHeight;

    if (
      messageBottom > scrollTop &&
      messageTop < scrollBottom + VISIBLE_MESSAGE_BUFFER * 36
    ) {
      // Visible (with buffer)
      el.classList.remove("hidden");
      visibleEls.push(el);
    } else {
      // Hidden
      el.classList.add("hidden");
      hiddenEls.push(el);
    }
  });

  // Add "Load older" indicator if there are more messages beyond what's visible
  const allMessages = history.length;
  const renderedCount = visibleEls.length;
  const loadMoreEl = messagesEl.querySelector(".load-older");

  if (renderedCount < allMessages && !loadMoreEl) {
    // There are more messages than visible - add load more indicator
    const lastVisible = visibleEls[visibleEls.length - 1];
    if (lastVisible) {
      const loadDiv = document.createElement("div");
      loadDiv.className = "load-older";
      loadDiv.textContent = `Show older messages (${allMessages - renderedCount} more)`;
      loadDiv.addEventListener("click", () => {
        // Show all messages by removing hidden class
        messagesEl
          .querySelectorAll(".msg.hidden")
          .forEach((el) => el.classList.remove("hidden"));
        scrollToBottom();
        if (loadMoreEl) loadMoreEl.remove();
      });
      messagesEl.insertBefore(loadDiv, lastVisible.nextSibling);
    }
  } else if (allMessages <= renderedCount && loadMoreEl) {
    // No more older messages to load - remove indicator
    if (loadMoreEl) loadMoreEl.remove();
  }
}

function addMessage(role, text, kind) {
  if (emptyEl && emptyEl.parentNode) emptyEl.remove();
  const el = renderMessageWithRegenerate(role, text, kind);
  // Assign id for height caching
  el.dataset.id = `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  messageHeights.set(el.dataset.id, 0); // will be calculated on first render
  messagesEl.appendChild(el);
  // Immediately render visible messages
  renderVisibleMessages();
  scrollToBottom();
  return el;
}

function clearRegenerateButtons() {
  messagesEl.querySelectorAll(".msg-actions").forEach((node) => node.remove());
}

function attachRegenerate(msgEl) {
  clearRegenerateButtons();
  if (!msgEl || !msgEl.classList.contains("assistant")) return;
  if (msgEl.classList.contains("step") || msgEl.classList.contains("error")) {
    return;
  }
  const actions = document.createElement("div");
  actions.className = "msg-actions";
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "regen-btn";
  btn.textContent = "Regenerate";
  btn.title = "Regenerate this response";
  btn.addEventListener("click", (e) => {
    e.preventDefault();
    regenerate();
  });
  actions.appendChild(btn);
  msgEl.appendChild(actions);
}

function renderMessageWithRegenerate(role, text, kind) {
  const el = document.createElement("div");
  el.className = `msg ${kind || role}`;
  if (role === "assistant" && kind !== "step" && kind !== "error") {
    el.innerHTML = renderMarkdown(text);
  } else {
    el.textContent = text;
  }
  attachRegenerate(el);
  attachPinButton(el);
  return el;
}

function attachPinButton(msgEl) {
  if (
    !msgEl ||
    msgEl.classList.contains("step") ||
    msgEl.classList.contains("error")
  )
    return;
  const alreadyPinned = pinnedIds.has(msgEl.dataset?.id || "");
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "pin-btn";
  btn.title = alreadyPinned ? "Unpin this message" : "Pin this message";
  btn.innerHTML = alreadyPinned ? "★" : "📌";
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (alreadyPinned) {
      pinnedIds.delete(msgEl.dataset.id || "");
      btn.innerHTML = "📌";
      btn.title = "Pin this message";
    } else {
      pinnedIds.add(msgEl.dataset.id || Date.now());
      btn.innerHTML = "★";
      btn.title = "Unpin this message";
    }
    savePinnedIds();
    renderPinnedSection();
  });
  // Insert pin button after the message content, before regenerate actions
  const actions = msgEl.querySelector(".msg-actions");
  if (actions) {
    // Pin button goes before regenerate
    const firstChild = actions.firstChild;
    msgEl.querySelector(".msg-content")?.insertBefore(btn, firstChild);
  } else {
    // No regenerate — pin goes at end of message
    el.lastChild?.after(btn);
    // or append if no children
    if (!msgEl.lastChild) msgEl.appendChild(btn);
  }
}

function savePinnedIds() {
  try {
    localStorage.setItem(
      "involvex-pinned-ids",
      JSON.stringify(Array.from(pinnedIds)),
    );
  } catch (_) {
    // localStorage full or blocked — silently persist what we can
  }
}

function loadPinnedIds() {
  try {
    const stored = localStorage.getItem("involvex-pinned-ids");
    if (stored) pinnedIds = new Set(JSON.parse(stored));
  } catch (_) {
    pinnedIds = new Set();
  }
}

function renderPinnedSection() {
  const count = pinnedIds.size;
  const countEl = document.getElementById("pinnedBarCount");
  if (countEl) countEl.textContent = count;
  const pinnedBar = document.getElementById("pinnedBar");
  if (pinnedBar) pinnedBar.hidden = !count;
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
  if (!v) {
    hideAgentBar();
    hideConfirm();
    activeAgentPort = null;
    agentPaused = false;
  }
}

function showAgentBar(text) {
  if (!agentBar) return;
  agentBar.hidden = false;
  agentBarLabel.textContent = text || "Agent running";
  agentPauseBtn.textContent = agentPaused ? "Resume" : "Pause";
}

function hideAgentBar() {
  if (agentBar) agentBar.hidden = true;
}

function hideConfirm() {
  if (confirmBanner) confirmBanner.hidden = true;
  pendingConfirmId = null;
}

function showConfirm(id, detail) {
  pendingConfirmId = id;
  confirmDetail.textContent = detail || "Allow this agent action?";
  confirmBanner.hidden = false;
}

function replyConfirm(ok) {
  if (!activeAgentPort || !pendingConfirmId) return;
  activeAgentPort.postMessage({
    type: "confirm_response",
    id: pendingConfirmId,
    ok,
  });
  hideConfirm();
}

function makeMessageId(role) {
  return `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

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
  const id = makeMessageId("msg");
  history.push({ role: "assistant", content: text, id });
  // Trim history if exceeding max messages (memory management)
  if (history.length > MAX_HISTORY_MESSAGES) {
    history.splice(0, history.length - MAX_HISTORY_MESSAGES);
  }
  attachRegenerate(el);
  attachPinButton(el);
  persistSession();
}

function handlePortMessage(m, port) {
  if (m.event === "agent_start") {
    showAgentBar("Agent running");
  } else if (m.event === "status") {
    setStatus(m.text);
    if (agentBar && !agentBar.hidden) {
      agentBarLabel.textContent = m.text || "Agent running";
    }
  } else if (m.event === "stream_start") {
    clearStatus();
    if (emptyEl && emptyEl.parentNode) emptyEl.remove();
    streamEl = document.createElement("div");
    streamEl.className = "msg assistant streaming";
    messagesEl.appendChild(streamEl);
    scrollToBottom();
  } else if (m.event === "stream_end") {
    if (streamEl) streamEl.classList.remove("streaming");
  } else if (m.event === "token") {
    streamText += m.text || "";
    if (streamEl) {
      streamEl.textContent = streamText;
      scrollToBottom();
    }
  } else if (m.event === "step") {
    clearStatus();
    if (streamEl) {
      streamEl.remove();
      streamEl = null;
      streamText = "";
    }
    const args =
      m.args && Object.keys(m.args).length ? " " + JSON.stringify(m.args) : "";
    const n = m.step != null ? `${m.step}/${m.total || "?"} ` : "";
    addMessage("assistant", `▸ ${n}${m.action}${args}`, "step");
    if (m.thought) setStatus(m.thought);
    showAgentBar(`Step ${m.step || "?"} · ${m.action}`);
  } else if (m.event === "step_result") {
    if (m.ok === false) {
      addMessage("assistant", `▸ ${m.action} failed`, "step");
    }
  } else if (m.event === "confirm") {
    showConfirm(m.id, m.detail);
    showAgentBar("Waiting for confirmation…");
  } else if (m.event === "assistant") {
    finishAssistant(m.text);
  } else if (m.event === "error") {
    clearStatus();
    hideConfirm();
    addMessage("assistant", `Error: ${m.text}`, "error");
  } else if (m.event === "done") {
    clearStatus();
    hideConfirm();
    setBusy(false);
    port.disconnect();
  }
}

async function sendAsk(text) {
  try {
    setStatus("Loading page context…");
    // Check cache first — if we have recent page text for this tab, use it
    const cachedText = getCachedPageText(targetTabId);
    const prep = await chrome.runtime.sendMessage({
      type: "prepareAsk",
      text,
      history: history.slice(0, -1),
      tabId: targetTabId,
      vision: visionToggle.checked,
      rag: ragToggle.checked,
    });
    if (!prep?.ok) throw new Error(prep?.error || "Could not prepare request");

    const settings =
      prep.settings || (await chrome.storage.local.get("settings")).settings;
    const s = { ...(settings || { provider: "gemini" }) };
    s.provider = providerSelect.value;
    s[s.provider] = {
      ...(s[s.provider] || {}),
      model: modelSelect.value,
    };

    // If we had cached page text, augment the messages with it
    let pageText = cachedText;
    if (!pageText) {
      pageText = prep.pageText || "";
    }
    // ... rest of function
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
    // Cache page text from response for future asks on this tab
    // prep.pageText is set by the background worker when available
    if (prep && prep.pageText) {
      setCachedPageText(targetTabId, prep.pageText);
    }
    setBusy(false);
  }
}

function send(text, opts = {}) {
  if (busy || !text.trim()) return;
  const mode = agentToggle.checked ? "agent" : "ask";
  if (!opts.regenerate) {
    addMessage("user", text);
    history.push({ role: "user", content: text });
    persistSession();
  }
  clearRegenerateButtons();
  setBusy(true);
  setStatus("Connecting…");
  streamEl = null;
  streamText = "";

  if (mode === "ask") {
    sendAsk(text);
    return;
  }

  const port = chrome.runtime.connect({ name: "agent" });
  activeAgentPort = port;
  agentPaused = false;
  showAgentBar("Agent connecting…");
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

function regenerate() {
  if (busy || !history.length) return;
  let lastUserIdx = -1;
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].role === "user") {
      lastUserIdx = i;
      break;
    }
  }
  if (lastUserIdx < 0) return;
  const userText = history[lastUserIdx].content;
  history.splice(lastUserIdx + 1);
  messagesEl.innerHTML = "";
  for (let i = 0; i <= lastUserIdx; i++) {
    addMessage(history[i].role, history[i].content);
  }
  send(userText, { regenerate: true });
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
  let lastAssistantEl = null;
  for (const m of s.messages) {
    history.push({ role: m.role, content: m.content });
    const el = addMessage(m.role, m.content);
    if (m.role === "assistant") lastAssistantEl = el;
  }
  if (lastAssistantEl) attachRegenerate(lastAssistantEl);
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
    const content =
      typeof m.content === "string" ? m.content : String(m.content || "");
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

contextSection.addEventListener("change", () => {
  const section = contextSection.value;
  chrome.storage.local.set({ contextSection });
  // Update char count display
  updateContextCharCount(section);
});

visionToggle.addEventListener("change", () => {
  chrome.storage.local.set({ visionMode: visionToggle.checked });
});

agentPauseBtn?.addEventListener("click", () => {
  if (!activeAgentPort) return;
  if (agentPaused) {
    activeAgentPort.postMessage({ type: "resume" });
    agentPaused = false;
    agentPauseBtn.textContent = "Pause";
    showAgentBar("Resuming…");
  } else {
    activeAgentPort.postMessage({ type: "pause" });
    agentPaused = true;
    agentPauseBtn.textContent = "Resume";
    showAgentBar("Paused");
  }
});

agentCancelBtn?.addEventListener("click", () => {
  if (!activeAgentPort) return;
  activeAgentPort.postMessage({ type: "cancel" });
  showAgentBar("Cancelling…");
});

confirmOk?.addEventListener("click", () => replyConfirm(true));
confirmDeny?.addEventListener("click", () => replyConfirm(false));

function hostMatches(list, host) {
  return (list || []).some((d) => host === d || host.endsWith(`.${d}`));
}

async function applyAgentSitePolicy() {
  agentPolicyNote = "";
  agentToggle.disabled = false;
  const { settings } = await chrome.storage.local.get("settings");
  const allow = settings?.agentSites?.allow || [];
  const deny = settings?.agentSites?.deny || [];
  if (!allow.length && !deny.length) return;

  let host = "";
  try {
    const tab = targetTabId
      ? await chrome.tabs.get(targetTabId)
      : (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0];
    if (tab?.url)
      host = new URL(tab.url).hostname.replace(/^www\./, "").toLowerCase();
  } catch (_) {
    return;
  }
  if (!host) return;

  if (hostMatches(deny, host)) {
    agentToggle.checked = false;
    agentToggle.disabled = true;
    agentPolicyNote = `Agent blocked on ${host}`;
    await chrome.storage.local.set({ agentMode: false });
    return;
  }
  if (hostMatches(allow, host)) {
    agentToggle.checked = true;
    agentToggle.disabled = false;
    agentPolicyNote = `Agent auto-enabled on ${host}`;
    await chrome.storage.local.set({ agentMode: true });
  }
}
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
      PANEL_PROVIDER_LABELS[id] || p.label.replace(/ \(.*\)$/, "");
    if (id === s.provider) opt.selected = true;
    providerSelect.appendChild(opt);
  }

  const models = (
    cfg.models && cfg.models.length ? cfg.models : info?.knownModels || []
  ).slice();
  if (currentModel && !models.includes(currentModel))
    models.unshift(currentModel);
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
    providerLine.textContent = agentPolicyNote
      ? `${line} · ${agentPolicyNote}`
      : line;
    providerLine.classList.remove("warn");
    providerLine.onclick = null;
  }

  const canVision = providerSupportsVision(s.provider);
  visionWrap.classList.toggle("disabled", !canVision);
  if (!canVision) visionToggle.checked = false;
}

async function applyTheme(themePref) {
  const pref = themePref || "system";
  let resolved = pref;
  if (pref === "system") {
    resolved = window.matchMedia("(prefers-color-scheme: light)").matches
      ? "light"
      : "dark";
  }
  document.documentElement.dataset.theme = resolved;
}

async function loadAndApplyTheme() {
  const { settings } = await chrome.storage.local.get("settings");
  await applyTheme(settings?.theme || "system");
}

async function init() {
  await loadAndApplyTheme();
  const {
    agentMode,
    pendingPrompt,
    targetTabId: tid,
    ragMode,
    visionMode,
  } = await chrome.storage.local.get([
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
  await applyAgentSitePolicy();
  await refreshHeader();
  loadPinnedIds();
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

  // Add scroll event listener for message virtualization
  messagesEl.addEventListener("scroll", renderVisibleMessages);
}

chrome.runtime.onMessage.addListener(async (msg) => {
  if (msg && msg.event === "panel-refocus") {
    const { pendingPrompt, targetTabId: tid } = await chrome.storage.local.get([
      "pendingPrompt",
      "targetTabId",
    ]);
    if (tid != null) targetTabId = tid;
    await applyAgentSitePolicy();
    await refreshHeader();
    if (pendingPrompt) {
      await chrome.storage.local.remove("pendingPrompt");
      send(pendingPrompt);
    }
  }
  if (msg && msg.event === "command") {
    if (msg.command === "new_chat") {
      await newChat();
      return;
    }
    if (msg.command === "toggle_agent") {
      const { agentMode } = await chrome.storage.local.get("agentMode");
      agentToggle.checked = !!agentMode;
      return;
    }
    if (msg.command === "toggle_rag") {
      const { ragMode } = await chrome.storage.local.get("ragMode");
      ragToggle.checked = ragMode !== false;
    }
  }
});

chrome.storage.onChanged.addListener((changes) => {
  if (changes.settings) {
    applyAgentSitePolicy().then(() => refreshHeader());
    const theme = changes.settings.newValue?.theme;
    if (theme != null || changes.settings.oldValue?.theme != null) {
      applyTheme(changes.settings.newValue?.theme || "system");
    }
  }
  if (changes.agentMode && !agentToggle.disabled) {
    agentToggle.checked = !!changes.agentMode.newValue;
  }
  if (changes.ragMode) {
    ragToggle.checked = changes.ragMode.newValue !== false;
  }
});

window
  .matchMedia("(prefers-color-scheme: light)")
  .addEventListener("change", async () => {
    const { settings } = await chrome.storage.local.get("settings");
    if ((settings?.theme || "system") === "system") applyTheme("system");
  });

function updateContextCharCount(section) {
  const charCountEl = document.getElementById("contextCharCount");
  if (!charCountEl) return;
  let estimatedChars = 0;
  if (section === "full") {
    estimatedChars = 12000;
  } else if (section === "summary") {
    estimatedChars = 3000;
  } else if (section === "selection") {
    estimatedChars = 500;
  } else if (section === "header") {
    estimatedChars = 2000;
  } else if (section === "rag") {
    // RAG uses excerpts, estimate around 40% of full page
    estimatedChars = 4800;
  }
  const maxChars = 12000;
  charCountEl.textContent = `${estimatedChars} / ${maxChars} chars`;
}

function loadContextSection() {
  const saved = localStorage.getItem("involvex-context-section");
  const validSections = ["full", "rag", "selection", "header", "summary"];
  const savedSection = saved && validSections.includes(saved) ? saved : "full";
  contextSectionEl.value = savedSection;
  updateContextCharCount(savedSection);
}

init();

function getCachedPageText(tabId) {
  try {
    const cached = localStorage.getItem(`involvex-page-cache-${tabId}`);
    if (!cached) return null;
    const { text, timestamp } = JSON.parse(cached);
    const now = Date.now();
    if (now - timestamp > PAGE_CACHE_TTL) {
      localStorage.removeItem(`involvex-page-cache-${tabId}`);
      return null;
    }
    return text;
  } catch (_) {
    return null;
  }
}

function setCachedPageText(tabId, text) {
  try {
    localStorage.setItem(
      `involvex-page-cache-${tabId}`,
      JSON.stringify({ text, timestamp: Date.now() }),
    );
  } catch (_) {
    // localStorage full or blocked — silently persist what we can
  }
}
