import {
  chat,
  chatStream,
  supportsStreaming,
  buildUserMessage,
} from "./providers.js";
import { pushBackup, fetchBackup, restoreBackup } from "./backup.js";
import { loadEnv, envGistToken, envGistId } from "./env.js";
import { buildPageContext } from "./rag.js";
import { DEFAULT_ASK_SYSTEM, DEFAULT_AGENT_SYSTEM } from "./prompts.js";

const MAX_PAGE_CHARS = 12000;
const MAX_AGENT_STEPS = 8;
const PANEL_URL = "src/panel.html";

/** @type {WeakMap<object, { cancelled: boolean, paused: boolean, confirmResolvers: Map<string, Function> }>} */
const agentControls = new WeakMap();

function getAgentControl(port) {
  let c = agentControls.get(port);
  if (!c) {
    c = { cancelled: false, paused: false, confirmResolvers: new Map() };
    agentControls.set(port, c);
  }
  return c;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ---- Functions injected into the page (must be self-contained) ----

function pageExtract(maxChars) {
  const clip = (s) => (s || "").replace(/\s+/g, " ").trim();
  const main =
    document.querySelector("main, article, [role=main]") || document.body;
  const text = clip(main.innerText).slice(0, maxChars);
  const interactives = [];
  const nodes = document.querySelectorAll(
    "a[href], button, input, textarea, select, [role=button]",
  );
  let i = 0;
  for (const el of nodes) {
    if (i >= 40) break;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;
    const label = clip(
      el.innerText ||
        el.value ||
        el.getAttribute("aria-label") ||
        el.getAttribute("placeholder") ||
        el.name ||
        "",
    );
    interactives.push({
      i,
      tag: el.tagName.toLowerCase(),
      type: el.type || "",
      label: label.slice(0, 80),
    });
    el.setAttribute("data-involvex-idx", String(i));
    i++;
  }
  return { title: document.title, url: location.href, text, interactives };
}

function pageGetSelection() {
  return { text: String(window.getSelection()) };
}

function pageClick(args) {
  let el = null;
  if (args.index != null)
    el = document.querySelector(`[data-involvex-idx="${args.index}"]`);
  if (!el && args.selector) el = document.querySelector(args.selector);
  if (!el && args.text) {
    const t = String(args.text).toLowerCase();
    const cands = document.querySelectorAll(
      "a,button,[role=button],input[type=submit],input[type=button]",
    );
    for (const c of cands) {
      if ((c.innerText || c.value || "").toLowerCase().includes(t)) {
        el = c;
        break;
      }
    }
  }
  if (!el) return { ok: false, error: "element not found" };
  el.scrollIntoView({ block: "center" });
  el.click();
  return { ok: true };
}

function pageFill(args) {
  let el = null;
  if (args.index != null)
    el = document.querySelector(`[data-involvex-idx="${args.index}"]`);
  if (!el && args.selector) el = document.querySelector(args.selector);
  if (!el) return { ok: false, error: "input not found" };
  el.focus();
  el.value = args.value != null ? args.value : "";
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
  return { ok: true };
}

function pageScroll(args) {
  const amount = args.amount || window.innerHeight * 0.8;
  window.scrollBy({
    top: args.direction === "up" ? -amount : amount,
    behavior: "smooth",
  });
  return { ok: true, scrollY: window.scrollY };
}

function pageWaitForElement(args) {
  const selector = args.selector;
  if (!selector)
    return Promise.resolve({ ok: false, error: "selector required" });
  const timeout = Math.min(Number(args.timeoutMs) || 5000, 15000);
  const start = Date.now();
  return new Promise((resolve) => {
    const tick = () => {
      const el = document.querySelector(selector);
      if (el) {
        resolve({ ok: true, found: true });
        return;
      }
      if (Date.now() - start >= timeout) {
        resolve({ ok: false, error: "timeout waiting for element" });
        return;
      }
      setTimeout(tick, 200);
    };
    tick();
  });
}

function pageScrollToElement(args) {
  let el = null;
  if (args.index != null)
    el = document.querySelector(`[data-involvex-idx="${args.index}"]`);
  if (!el && args.selector) el = document.querySelector(args.selector);
  if (!el && args.text) {
    const t = String(args.text).toLowerCase();
    const cands = document.querySelectorAll(
      "a,button,[role=button],h1,h2,h3,label,p,li,td,th",
    );
    for (const c of cands) {
      if ((c.innerText || "").toLowerCase().includes(t)) {
        el = c;
        break;
      }
    }
  }
  if (!el) return { ok: false, error: "element not found" };
  el.scrollIntoView({ block: "center", behavior: "smooth" });
  return { ok: true };
}

function pageExtractData(args) {
  const clip = (s) => (s || "").replace(/\s+/g, " ").trim();
  const maxRows = Math.min(Number(args.maxRows) || 20, 40);
  const tables = [];
  for (const table of Array.from(document.querySelectorAll("table")).slice(
    0,
    5,
  )) {
    const rows = [];
    for (const tr of Array.from(table.querySelectorAll("tr")).slice(
      0,
      maxRows,
    )) {
      const cells = Array.from(tr.querySelectorAll("th,td")).map((c) =>
        clip(c.innerText).slice(0, 120),
      );
      if (cells.length) rows.push(cells);
    }
    if (rows.length) tables.push({ rows });
  }
  const lists = [];
  for (const list of Array.from(document.querySelectorAll("ul, ol")).slice(
    0,
    8,
  )) {
    const items = Array.from(list.querySelectorAll(":scope > li"))
      .slice(0, maxRows)
      .map((li) => clip(li.innerText).slice(0, 200))
      .filter(Boolean);
    if (items.length) lists.push({ items });
  }
  return { ok: true, tables, lists };
}

function pageClickLabel(args) {
  let el = null;
  if (args.index != null)
    el = document.querySelector(`[data-involvex-idx="${args.index}"]`);
  if (!el && args.selector) el = document.querySelector(args.selector);
  if (!el && args.text) {
    const t = String(args.text).toLowerCase();
    const cands = document.querySelectorAll(
      "a,button,[role=button],input[type=submit],input[type=button]",
    );
    for (const c of cands) {
      if ((c.innerText || c.value || "").toLowerCase().includes(t)) {
        el = c;
        break;
      }
    }
  }
  if (!el) return { ok: false, label: "", error: "element not found" };
  const label = (
    el.innerText ||
    el.value ||
    el.getAttribute("aria-label") ||
    el.getAttribute("type") ||
    ""
  )
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
  return {
    ok: true,
    label,
    type: el.type || "",
    tag: el.tagName.toLowerCase(),
  };
}

/// Viewport crop for the main content region (CSS pixels + viewport size).
function pageArticleCrop() {
  const main =
    document.querySelector("main, article, [role=main]") || document.body;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const r = main.getBoundingClientRect();
  const x = Math.max(0, Math.min(r.left, vw));
  const y = Math.max(0, Math.min(r.top, vh));
  const right = Math.max(x, Math.min(r.right, vw));
  const bottom = Math.max(y, Math.min(r.bottom, vh));
  return {
    x,
    y,
    w: Math.max(0, right - x),
    h: Math.max(0, bottom - y),
    vw,
    vh,
  };
}

// ---- Orchestration ----

async function loadSettings() {
  const { settings } = await chrome.storage.local.get("settings");
  return settings || { provider: "gemini" };
}

async function resolveTargetTab(tabId) {
  if (tabId != null) {
    try {
      return await chrome.tabs.get(tabId);
    } catch (_) {
      // fall through to active tab
    }
  }
  const [tab] = await chrome.tabs.query({
    active: true,
    lastFocusedWindow: true,
  });
  return tab;
}

async function runInPage(tabId, func, args = []) {
  const [res] = await chrome.scripting.executeScript({
    target: { tabId },
    func,
    args,
  });
  return res?.result;
}

async function execTool(tab, action, args) {
  switch (action) {
    case "read_page":
      return await runInPage(tab.id, pageExtract, [MAX_PAGE_CHARS]);
    case "get_selection":
      return await runInPage(tab.id, pageGetSelection, []);
    case "click":
      return await runInPage(tab.id, pageClick, [args]);
    case "fill":
      return await runInPage(tab.id, pageFill, [args]);
    case "scroll":
      return await runInPage(tab.id, pageScroll, [args]);
    case "wait_for_element":
      return await runInPage(tab.id, pageWaitForElement, [args]);
    case "scroll_to_element":
      return await runInPage(tab.id, pageScrollToElement, [args]);
    case "extract_data":
      return await runInPage(tab.id, pageExtractData, [args]);
    case "navigate":
      if (!/^https?:\/\//i.test(args.url || ""))
        return { ok: false, error: "only http(s) urls allowed" };
      await chrome.tabs.update(tab.id, { url: args.url });
      return { ok: true, navigatedTo: args.url };
    default:
      return { ok: false, error: `unknown tool ${action}` };
  }
}

const SENSITIVE_CLICK_RE =
  /\b(submit|delete|remove|logout|log\s*out|sign\s*out|pay|purchase|buy|confirm|unsubscribe|transfer)\b/i;

function actionNeedsConfirm(action, args, clickMeta) {
  if (action === "navigate") return true;
  if (action === "click") {
    const bits = [args.text, args.selector, clickMeta?.label, clickMeta?.type]
      .filter(Boolean)
      .join(" ");
    if (SENSITIVE_CLICK_RE.test(bits)) return true;
    if (clickMeta?.type === "submit") return true;
  }
  return false;
}

function waitForConfirm(port, id, timeoutMs = 90000) {
  const ctrl = getAgentControl(port);
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      ctrl.confirmResolvers.delete(id);
      resolve(false);
    }, timeoutMs);
    ctrl.confirmResolvers.set(id, (ok) => {
      clearTimeout(timer);
      ctrl.confirmResolvers.delete(id);
      resolve(!!ok);
    });
  });
}

async function waitIfPaused(port) {
  const ctrl = getAgentControl(port);
  while (ctrl.paused && !ctrl.cancelled) {
    await sleep(200);
  }
}

async function agentModelReply(settings, convo, port) {
  if (supportsStreaming(settings.provider)) {
    port.postMessage({ event: "stream_start" });
    const raw = await chatStream(settings, convo, (chunk) => {
      port.postMessage({ event: "token", text: chunk });
    });
    return raw;
  }
  return chat(settings, convo);
}

function extractJsonFromFenced(raw) {
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) return fence[1];
  return null;
}

function extractJsonWithActionKey(raw) {
  const actionMatch = raw.match(/"action"\s*:/);
  if (!actionMatch) return null;

  const start = raw.indexOf("{", actionMatch.index);
  if (start === -1) return null;

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

function parseAction(raw) {
  let jsonStr = extractJsonFromFenced(raw);
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

const VISION_MAX_EDGE = 1280;
const VISION_JPEG_QUALITY = 0.72;

/// Crops to the article region when useful, then downscales and re-encodes JPEG.
async function polishScreenshot(dataUrl, crop) {
  try {
    const blob = await (await fetch(dataUrl)).blob();
    const bitmap = await createImageBitmap(blob);
    let sx = 0;
    let sy = 0;
    let sw = bitmap.width;
    let sh = bitmap.height;
    if (
      crop &&
      crop.vw > 0 &&
      crop.vh > 0 &&
      crop.w > 80 &&
      crop.h > 80 &&
      crop.w * crop.h < crop.vw * crop.vh * 0.92
    ) {
      const scaleX = bitmap.width / crop.vw;
      const scaleY = bitmap.height / crop.vh;
      sx = Math.max(0, Math.floor(crop.x * scaleX));
      sy = Math.max(0, Math.floor(crop.y * scaleY));
      sw = Math.min(bitmap.width - sx, Math.floor(crop.w * scaleX));
      sh = Math.min(bitmap.height - sy, Math.floor(crop.h * scaleY));
    }
    const longest = Math.max(sw, sh);
    const scale = longest > VISION_MAX_EDGE ? VISION_MAX_EDGE / longest : 1;
    const dw = Math.max(1, Math.round(sw * scale));
    const dh = Math.max(1, Math.round(sh * scale));
    const canvas = new OffscreenCanvas(dw, dh);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, dw, dh);
    bitmap.close();
    const out = await canvas.convertToBlob({
      type: "image/jpeg",
      quality: VISION_JPEG_QUALITY,
    });
    const buf = await out.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let binary = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    return `data:image/jpeg;base64,${btoa(binary)}`;
  } catch (_) {
    return dataUrl;
  }
}

async function captureTabScreenshot(tab) {
  if (!tab?.windowId) return null;
  try {
    const raw = await chrome.tabs.captureVisibleTab(tab.windowId, {
      format: "jpeg",
      quality: 85,
    });
    let crop = null;
    try {
      crop = await runInPage(tab.id, pageArticleCrop, []);
    } catch (_) {
      // restricted page — full viewport only
    }
    return await polishScreenshot(raw, crop);
  } catch (_) {
    return null;
  }
}

/// Builds OpenAI-style messages for ask mode (page context, optional vision).
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
    (settings.systemPrompts && settings.systemPrompts.ask) ||
    DEFAULT_ASK_SYSTEM;
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
  return {
    messages: [{ role: "system", content: system }, ...history, userMsg],
    settings,
  };
}

async function runAgent(port, userText, history, tabId) {
  const ctrl = getAgentControl(port);
  ctrl.cancelled = false;
  ctrl.paused = false;
  const settings = await loadSettings();
  const tab = await resolveTargetTab(tabId);
  if (!tab) throw new Error("No active tab to act on.");
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
    `Rules: exactly one tool per reply. read_page before acting if you have ` +
    `not seen the page. Prefer element index from read_page. When done or no ` +
    `action is needed, use finish.`;
  const agentBase =
    (settings.systemPrompts && settings.systemPrompts.agent) ||
    DEFAULT_AGENT_SYSTEM;
  const system = `${agentBase} ${toolDoc}`;
  const convo = [
    { role: "system", content: system },
    ...history,
    { role: "user", content: userText },
  ];

  port.postMessage({ event: "agent_start" });

  for (let step = 0; step < MAX_AGENT_STEPS; step++) {
    await waitIfPaused(port);
    if (ctrl.cancelled) {
      port.postMessage({
        event: "assistant",
        text: "Agent cancelled.",
      });
      port.postMessage({ event: "done" });
      return;
    }
    port.postMessage({
      event: "status",
      text: `Planning (step ${step + 1}/${MAX_AGENT_STEPS})…`,
    });
    const raw = await agentModelReply(settings, convo, port);
    if (ctrl.cancelled) {
      port.postMessage({ event: "assistant", text: "Agent cancelled." });
      port.postMessage({ event: "done" });
      return;
    }
    const parsed = parseAction(raw);
    if (!parsed) {
      const truncated = raw.slice(0, 200).replace(/\n/g, " ");
      port.postMessage({
        event: "assistant",
        text: `Could not parse agent JSON output. Raw snip: "${truncated}"`,
      });
      port.postMessage({ event: "done" });
      return;
    }
    convo.push({ role: "assistant", content: raw });
    if (parsed.action === "finish") {
      port.postMessage({
        event: "assistant",
        text: parsed.args?.answer || "Done.",
      });
      port.postMessage({ event: "done" });
      return;
    }

    const args = parsed.args || {};
    let clickMeta = null;
    if (parsed.action === "click") {
      try {
        clickMeta = await runInPage(tab.id, pageClickLabel, [args]);
      } catch (_) {
        clickMeta = null;
      }
    }

    port.postMessage({
      event: "step",
      step: step + 1,
      total: MAX_AGENT_STEPS,
      action: parsed.action,
      args,
      thought: parsed.thought || "",
    });

    if (actionNeedsConfirm(parsed.action, args, clickMeta)) {
      const confirmId = `c-${Date.now()}-${step}`;
      const detail =
        parsed.action === "navigate"
          ? `Navigate to ${args.url || "(missing url)"}?`
          : `Click "${clickMeta?.label || args.text || args.selector || "element"}"?`;
      port.postMessage({
        event: "confirm",
        id: confirmId,
        action: parsed.action,
        detail,
      });
      const ok = await waitForConfirm(port, confirmId);
      if (!ok) {
        convo.push({
          role: "user",
          content: `TOOL RESULT (${parsed.action}):\n${JSON.stringify({
            ok: false,
            error: "user declined confirmation",
          })}`,
        });
        continue;
      }
    }

    await waitIfPaused(port);
    if (ctrl.cancelled) {
      port.postMessage({ event: "assistant", text: "Agent cancelled." });
      port.postMessage({ event: "done" });
      return;
    }

    let result;
    try {
      result = await execTool(tab, parsed.action, args);
    } catch (e) {
      result = { ok: false, error: String((e && e.message) || e) };
    }
    port.postMessage({
      event: "step_result",
      step: step + 1,
      action: parsed.action,
      ok: result?.ok !== false,
    });
    convo.push({
      role: "user",
      content: `TOOL RESULT (${parsed.action}):\n${JSON.stringify(result).slice(0, 8000)}`,
    });
  }
  port.postMessage({
    event: "assistant",
    text: "Stopped after the step limit. Ask me to continue if needed.",
  });
  port.postMessage({ event: "done" });
}

// ---- Panel opening (tab-based, works on Android where sidePanel is absent) ----

async function openPanel(pageTabId) {
  if (pageTabId != null) {
    await chrome.storage.local.set({ targetTabId: pageTabId });
  }
  const panelUrl = chrome.runtime.getURL(PANEL_URL);
  const existing = await chrome.tabs.query({ url: panelUrl });
  if (existing.length) {
    await chrome.tabs.update(existing[0].id, { active: true });
    if (existing[0].windowId != null) {
      chrome.windows
        .update(existing[0].windowId, { focused: true })
        .catch(() => {});
    }
    chrome.runtime.sendMessage({ event: "panel-refocus" }).catch(() => {});
    return;
  }
  await chrome.tabs.create({ url: panelUrl });
}

chrome.action.onClicked.addListener(async (tab) => {
  await openPanel(tab?.id);
});

async function notifyPanel(command) {
  chrome.runtime.sendMessage({ event: "command", command }).catch(() => {});
}

chrome.commands.onCommand.addListener(async (command) => {
  if (command === "new_chat") {
    await openPanel();
    await notifyPanel("new_chat");
    return;
  }
  if (command === "toggle_agent") {
    const { agentMode } = await chrome.storage.local.get("agentMode");
    await chrome.storage.local.set({ agentMode: !agentMode });
    await openPanel();
    await notifyPanel("toggle_agent");
    return;
  }
  if (command === "toggle_rag") {
    const { ragMode } = await chrome.storage.local.get("ragMode");
    const next = ragMode === false;
    await chrome.storage.local.set({ ragMode: next });
    await openPanel();
    await notifyPanel("toggle_rag");
  }
});

chrome.runtime.onInstalled.addListener(async () => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: "involvex-summarize-page",
      title: "Involvex AI: Summarize page",
      contexts: ["page"],
    });
    chrome.contextMenus.create({
      id: "involvex-explain",
      title: "Involvex AI: Explain selection",
      contexts: ["selection"],
    });
    chrome.contextMenus.create({
      id: "involvex-translate",
      title: "Involvex AI: Translate selection",
      contexts: ["selection"],
    });
    chrome.contextMenus.create({
      id: "involvex-rewrite",
      title: "Involvex AI: Rewrite selection",
      contexts: ["selection"],
    });
  });
  const { settings } = await chrome.storage.local.get("settings");
  await syncBackupAlarm(settings || {});
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const sel = info.selectionText || "";
  let prompt = "";
  switch (info.menuItemId) {
    case "involvex-summarize-page":
      prompt = "Summarize the current page as a few concise bullet points.";
      break;
    case "involvex-explain":
      prompt = `Explain this clearly:\n\n"""${sel}"""`;
      break;
    case "involvex-translate":
      prompt = `Translate this. If it is already English, translate to German; otherwise translate to English:\n\n"""${sel}"""`;
      break;
    case "involvex-rewrite":
      prompt = `Rewrite this to be clearer and more concise, keeping the meaning:\n\n"""${sel}"""`;
      break;
    default:
      return;
  }
  await chrome.storage.local.set({ pendingPrompt: prompt });
  await openPanel(tab?.id);
});

// ---- Scheduled backup (chrome.alarms) ----

const BACKUP_ALARM = "involvex-auto-backup";

async function runAutoBackup() {
  const { settings } = await chrome.storage.local.get("settings");
  const backupCfg = (settings && settings.backup) || {};
  const env = await loadEnv();
  const token = backupCfg.gistToken || envGistToken(env);
  const gistId = backupCfg.gistId || envGistId(env);
  if (!token) return { ok: false, error: "no token" };
  const res = await pushBackup(token, gistId);
  const next = {
    ...(settings || {}),
    backup: { ...backupCfg, gistId: res.gistId, lastBackup: res.updatedAt },
  };
  await chrome.storage.local.set({ settings: next });
  return { ok: true, gistId: res.gistId, updatedAt: res.updatedAt };
}

async function syncBackupAlarm(settings) {
  await chrome.alarms.clear(BACKUP_ALARM);
  const schedule = settings?.backup?.autoSchedule || "off";
  if (schedule === "daily") {
    await chrome.alarms.create(BACKUP_ALARM, { periodInMinutes: 24 * 60 });
  } else if (schedule === "weekly") {
    await chrome.alarms.create(BACKUP_ALARM, { periodInMinutes: 7 * 24 * 60 });
  }
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== BACKUP_ALARM) return;
  try {
    await runAutoBackup();
  } catch (e) {
    console.warn("Involvex auto-backup failed:", e);
  }
});

// ---- Backup message handling (one-shot requests from options page) ----

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "prepareAsk") {
    (async () => {
      try {
        const built = await buildAskMessages(
          msg.text,
          msg.history || [],
          msg.tabId,
          { vision: msg.vision, rag: msg.rag },
        );
        sendResponse({ ok: true, ...built });
      } catch (e) {
        sendResponse({ ok: false, error: String((e && e.message) || e) });
      }
    })();
    return true;
  }
  if (!msg || msg.type !== "backup") return false;
  (async () => {
    try {
      const { settings } = await chrome.storage.local.get("settings");
      const backupCfg = (settings && settings.backup) || {};
      const env = await loadEnv();
      const token = backupCfg.gistToken || envGistToken(env);
      const gistId = backupCfg.gistId || envGistId(env);
      if (msg.action === "push") {
        if (!token)
          throw new Error(
            "No GitHub token. Add GITHUB_TOKEN=... to .env or set it in Settings.",
          );
        const res = await pushBackup(token, gistId);
        const next = {
          ...(settings || {}),
          backup: {
            ...backupCfg,
            gistId: res.gistId,
            lastBackup: res.updatedAt,
          },
        };
        await chrome.storage.local.set({ settings: next });
        sendResponse({
          ok: true,
          gistId: res.gistId,
          updatedAt: res.updatedAt,
        });
      } else if (msg.action === "restore") {
        if (!token)
          throw new Error(
            "No GitHub token. Add GITHUB_TOKEN=... to .env or set it in Settings.",
          );
        const backup = await fetchBackup(token, gistId);
        const res = await restoreBackup(backup);
        sendResponse({ ok: true, ...res });
      } else if (msg.action === "syncAlarm") {
        await syncBackupAlarm(settings || {});
        sendResponse({ ok: true });
      } else {
        sendResponse({ ok: false, error: "unknown backup action" });
      }
    } catch (e) {
      sendResponse({ ok: false, error: String((e && e.message) || e) });
    }
  })();
  return true; // keep the message channel open for async sendResponse
});

// ---- Chat port ----

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "agent") return;
  getAgentControl(port);
  port.onMessage.addListener(async (msg) => {
    try {
      if (msg.type === "cancel") {
        const ctrl = getAgentControl(port);
        ctrl.cancelled = true;
        ctrl.paused = false;
        return;
      }
      if (msg.type === "pause") {
        getAgentControl(port).paused = true;
        port.postMessage({ event: "status", text: "Paused…" });
        return;
      }
      if (msg.type === "resume") {
        getAgentControl(port).paused = false;
        port.postMessage({ event: "status", text: "Resuming…" });
        return;
      }
      if (msg.type === "confirm_response") {
        const ctrl = getAgentControl(port);
        const resolve = ctrl.confirmResolvers.get(msg.id);
        if (resolve) resolve(!!msg.ok);
        return;
      }
      if (msg.type === "chat") {
        if (msg.mode !== "agent") {
          port.postMessage({
            event: "error",
            text: "Ask mode runs in the panel. Reload the extension if you see this.",
          });
          return;
        }
        await runAgent(port, msg.text, msg.history || [], msg.tabId);
      }
    } catch (e) {
      port.postMessage({ event: "error", text: String((e && e.message) || e) });
      port.postMessage({ event: "done" });
    }
  });
});
