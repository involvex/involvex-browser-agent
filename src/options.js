import { PROVIDERS, chat, listModels } from "./providers.js";
import { loadEnv, envGistToken, envGistId } from "./env.js";
import { DEFAULT_PROMPTS } from "./prompts.js";

const providerSel = document.getElementById("provider");
const statusEl = document.getElementById("status");
const backupStatusEl = document.getElementById("backupStatus");
const lastBackupEl = document.getElementById("lastBackup");

const KEY_FIELDS = {
  gemini: ["apiKey"],
  openai: ["apiKey"],
  anthropic: ["apiKey"],
  openrouter: ["apiKey", "baseUrl"],
  opencode: ["apiKey", "baseUrl"],
  custom: ["baseUrl", "apiKey"],
  ollama: ["baseUrl"],
  fastvlm: ["baseUrl"],
};

const CUSTOM = "__custom__";

function el(id) {
  return document.getElementById(id);
}

function showActiveCard() {
  const active = providerSel.value;
  document.querySelectorAll(".card").forEach((c) => {
    c.classList.toggle("active", c.dataset.provider === active);
  });
}

// Build the model picker (select + custom input + load button) for each card.
function buildModelRows() {
  document.querySelectorAll(".model-row").forEach((row) => {
    const provider = row.dataset.modelFor;
    row.innerHTML = `
      <label class="field">
        <span>Model</span>
        <select id="${provider}-model-select"></select>
      </label>
      <label class="field" id="${provider}-model-custom-wrap" style="display:none">
        <span>Custom model id</span>
        <input type="text" id="${provider}-model" placeholder="model id" />
      </label>
      <button type="button" id="${provider}-load">Load models</button>
    `;
    const sel = el(`${provider}-model-select`);
    sel.addEventListener("change", () => {
      el(`${provider}-model-custom-wrap`).style.display =
        sel.value === CUSTOM ? "flex" : "none";
    });
    el(`${provider}-load`).addEventListener("click", () =>
      loadModels(provider),
    );
  });
}

function populateModelSelect(provider, models, current) {
  const sel = el(`${provider}-model-select`);
  const list = (models && models.length ? models : PROVIDERS[provider].knownModels || []).slice();
  sel.innerHTML = "";
  for (const m of list) {
    const o = document.createElement("option");
    o.value = m;
    o.textContent = m;
    sel.appendChild(o);
  }
  const customOpt = document.createElement("option");
  customOpt.value = CUSTOM;
  customOpt.textContent = "Custom…";
  sel.appendChild(customOpt);

  const customWrap = el(`${provider}-model-custom-wrap`);
  if (current && list.includes(current)) {
    sel.value = current;
    customWrap.style.display = "none";
  } else if (current) {
    sel.value = CUSTOM;
    el(`${provider}-model`).value = current;
    customWrap.style.display = "flex";
  } else {
    sel.value = list[0] || CUSTOM;
    customWrap.style.display = sel.value === CUSTOM ? "flex" : "none";
  }
}

function selectedModel(provider) {
  const sel = el(`${provider}-model-select`);
  if (!sel) return "";
  if (sel.value === CUSTOM) return el(`${provider}-model`).value.trim();
  return sel.value;
}

async function loadModels(provider) {
  setStatus(`Loading ${PROVIDERS[provider].label} models…`, "");
  try {
    const settings = collectSettings();
    settings.provider = provider;
    const models = await listModels(settings);
    const store = await chrome.storage.local.get("settings");
    const s = store.settings || {};
    s[provider] = { ...(s[provider] || {}), models };
    await chrome.storage.local.set({ settings: s });
    populateModelSelect(provider, models, selectedModel(provider));
    setStatus(`Loaded ${models.length} models.`, "ok");
  } catch (e) {
    setStatus(`Model list failed: ${String((e && e.message) || e)}`, "err");
  }
}

function collectSettings() {
  const settings = { provider: providerSel.value };
  for (const [provider, fields] of Object.entries(KEY_FIELDS)) {
    const cfg = {};
    for (const f of fields) {
      const node = el(`${provider}-${f}`);
      const v = node ? node.value.trim() : "";
      if (v) cfg[f] = v;
    }
    const model = selectedModel(provider);
    if (model) cfg.model = model;
    const sel = el(`${provider}-model-select`);
    const opts = sel
      ? Array.from(sel.options)
          .map((o) => o.value)
          .filter((v) => v && v !== CUSTOM)
      : [];
    if (opts.length) cfg.models = opts;
    settings[provider] = cfg;
  }
  return settings;
}

function setStatus(text, kind) {
  statusEl.textContent = text;
  statusEl.className = `status ${kind || ""}`;
}

function setPromptStatus(text, kind) {
  const node = el("promptStatus");
  node.textContent = text;
  node.className = `status ${kind || ""}`;
}

function addPromptRow(label = "", prompt = "") {
  const row = document.createElement("div");
  row.className = "prompt-row";
  const labelInput = document.createElement("input");
  labelInput.type = "text";
  labelInput.className = "prompt-label";
  labelInput.placeholder = "Chip label";
  labelInput.value = label;
  const promptInput = document.createElement("input");
  promptInput.type = "text";
  promptInput.className = "prompt-text";
  promptInput.placeholder = "Prompt sent to the AI";
  promptInput.value = prompt;
  const del = document.createElement("button");
  del.type = "button";
  del.className = "prompt-del";
  del.textContent = "✕";
  del.title = "Remove";
  del.addEventListener("click", () => row.remove());
  row.appendChild(labelInput);
  row.appendChild(promptInput);
  row.appendChild(del);
  el("promptList").appendChild(row);
}

function renderPrompts(prompts) {
  el("promptList").innerHTML = "";
  const list = prompts && prompts.length ? prompts : DEFAULT_PROMPTS;
  for (const p of list) addPromptRow(p.label || "", p.prompt || "");
}

function collectPrompts() {
  const rows = Array.from(document.querySelectorAll(".prompt-row"));
  const prompts = [];
  for (const row of rows) {
    const label = row.querySelector(".prompt-label").value.trim();
    const prompt = row.querySelector(".prompt-text").value.trim();
    if (!prompt) continue;
    prompts.push({ label: label || prompt, prompt });
  }
  return prompts;
}

async function savePrompts() {
  const prompts = collectPrompts();
  const { settings } = await chrome.storage.local.get("settings");
  const s = settings || { provider: "gemini" };
  s.prompts = prompts;
  await chrome.storage.local.set({ settings: s });
  setPromptStatus(`Saved ${prompts.length} prompts.`, "ok");
}

function exportPromptsJson() {
  const prompts = collectPrompts();
  const blob = new Blob(
    [JSON.stringify({ schema: "involvex-prompts/1", prompts }, null, 2)],
    { type: "application/json" },
  );
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "involvex-prompts.json";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  setPromptStatus(`Exported ${prompts.length} prompts.`, "ok");
}

async function importPromptsJson(file) {
  const text = await file.text();
  const data = JSON.parse(text);
  const prompts = Array.isArray(data) ? data : data.prompts;
  if (!Array.isArray(prompts)) throw new Error("Invalid prompts JSON");
  renderPrompts(prompts);
  await savePrompts();
  setPromptStatus(`Imported ${prompts.length} prompts.`, "ok");
}

async function saveRagSettings() {
  const { settings } = await chrome.storage.local.get("settings");
  const s = settings || { provider: "gemini" };
  s.rag = {
    useEmbeddings: el("rag-useEmbeddings").checked,
    embedModel: el("rag-embedModel").value.trim() || "nomic-embed-text",
  };
  await chrome.storage.local.set({ settings: s });
  setStatus("RAG settings saved.", "ok");
}

function setBackupStatus(text, kind) {
  backupStatusEl.textContent = text;
  backupStatusEl.className = `status ${kind || ""}`;
}

async function load() {
  buildModelRows();
  const { settings } = await chrome.storage.local.get("settings");
  const s = settings || { provider: "gemini" };
  providerSel.value = s.provider || "gemini";
  for (const [provider, fields] of Object.entries(KEY_FIELDS)) {
    const cfg = s[provider] || {};
    for (const f of fields) {
      const node = el(`${provider}-${f}`);
      if (node) node.value = cfg[f] || "";
    }
    populateModelSelect(provider, cfg.models, cfg.model);
    const baseInput = el(`${provider}-baseUrl`);
    if (baseInput && !cfg.baseUrl && PROVIDERS[provider].defaultBaseUrl) {
      baseInput.placeholder = PROVIDERS[provider].defaultBaseUrl;
    }
  }

  const backup = s.backup || {};
  const env = await loadEnv();
  const envToken = envGistToken(env);
  const envId = envGistId(env);
  el("backup-gistToken").value = backup.gistToken || envToken || "";
  el("backup-gistId").value = backup.gistId || envId || "";
  el("backup-includeExtensions").checked = !!backup.includeExtensions;
  el("backup-includeChatHistory").checked = !!backup.includeChatHistory;
  el("backup-autoSchedule").value = backup.autoSchedule || "off";
  const rag = s.rag || {};
  el("rag-useEmbeddings").checked = !!rag.useEmbeddings;
  el("rag-embedModel").value = rag.embedModel || "nomic-embed-text";
  if (backup.lastBackup) {
    lastBackupEl.textContent = `Last backup: ${new Date(backup.lastBackup).toLocaleString()}`;
  } else if (envToken) {
    lastBackupEl.textContent = "GitHub token loaded from .env.";
  }

  renderPrompts(s.prompts);
  showActiveCard();
}

async function save() {
  const settings = collectSettings();
  const { settings: prev } = await chrome.storage.local.get("settings");
  if (prev && prev.backup) settings.backup = prev.backup;
  await chrome.storage.local.set({ settings });
  setStatus("Saved.", "ok");
}

async function test() {
  setStatus("Testing…", "");
  try {
    const settings = collectSettings();
    const reply = await chat(settings, [
      { role: "user", content: "Reply with exactly: OK" },
    ]);
    if (reply) setStatus(`Connected. Model said: ${reply.slice(0, 40)}`, "ok");
    else setStatus("Connected but got an empty reply.", "err");
  } catch (e) {
    setStatus(`Failed: ${String((e && e.message) || e)}`, "err");
  }
}

async function saveBackupSettings() {
  const includeExtensions = el("backup-includeExtensions").checked;
  if (includeExtensions && chrome.permissions?.request) {
    try {
      const granted = await chrome.permissions.request({
        permissions: ["management"],
      });
      if (!granted) {
        el("backup-includeExtensions").checked = false;
        setBackupStatus("Management permission denied; extension list off.", "err");
      }
    } catch (_) {
      // permission API unavailable (e.g. Android) — proceed without it
    }
  }
  const { settings } = await chrome.storage.local.get("settings");
  const s = settings || { provider: "gemini" };
  s.backup = {
    ...(s.backup || {}),
    gistToken: el("backup-gistToken").value.trim(),
    gistId: el("backup-gistId").value.trim(),
    includeExtensions: el("backup-includeExtensions").checked,
    includeChatHistory: el("backup-includeChatHistory").checked,
    autoSchedule: el("backup-autoSchedule").value || "off",
  };
  await chrome.storage.local.set({ settings: s });
  chrome.runtime.sendMessage({ type: "backup", action: "syncAlarm" });
  setBackupStatus("Backup settings saved.", "ok");
}

function sendBackup(action) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: "backup", action }, (res) =>
      resolve(res || { ok: false, error: "no response" }),
    );
  });
}

async function backupNow() {
  await saveBackupSettings();
  setBackupStatus("Backing up…", "");
  const res = await sendBackup("push");
  if (res.ok) {
    el("backup-gistId").value = res.gistId;
    lastBackupEl.textContent = `Last backup: ${new Date(res.updatedAt).toLocaleString()} (gist ${res.gistId.slice(0, 8)}…)`;
    setBackupStatus("Backed up to private Gist.", "ok");
  } else {
    setBackupStatus(`Backup failed: ${res.error}`, "err");
  }
}

function renderRestoreExtensions(list) {
  const wrap = el("restoreExtensions");
  const ul = el("restoreExtensionsList");
  ul.innerHTML = "";
  if (!list || !list.length) {
    wrap.hidden = true;
    return;
  }
  for (const ext of list) {
    const li = document.createElement("li");
    const name = document.createElement("span");
    name.className = "ext-name";
    name.textContent = ext.version ? `${ext.name} (${ext.version})` : ext.name;
    li.appendChild(name);
    if (ext.url) {
      const a = document.createElement("a");
      a.href = ext.url;
      a.target = "_blank";
      a.rel = "noopener";
      a.className = "ext-link";
      a.textContent = "Install page";
      li.appendChild(a);
    } else {
      const span = document.createElement("span");
      span.className = "ext-nolink";
      span.textContent = "no link";
      li.appendChild(span);
    }
    ul.appendChild(li);
  }
  wrap.hidden = false;
}

async function restoreNow() {
  await saveBackupSettings();
  setBackupStatus("Restoring…", "");
  const res = await sendBackup("restore");
  if (res.ok) {
    const extCount = res.extensionList ? res.extensionList.length : 0;
    const sessCount = res.sessionsMerged || 0;
    setBackupStatus(
      `Restored ${res.bookmarksAdded} bookmarks + settings` +
        (extCount ? `, ${extCount} extensions listed` : "") +
        (sessCount ? `, ${sessCount} chat sessions merged` : "") +
        ".",
      "ok",
    );
    renderRestoreExtensions(res.extensionList);
  } else {
    setBackupStatus(`Restore failed: ${res.error}`, "err");
  }
}

providerSel.addEventListener("change", showActiveCard);
el("save").addEventListener("click", save);
el("test").addEventListener("click", async () => {
  await save();
  await test();
});
el("backupSave").addEventListener("click", saveBackupSettings);
el("backupNow").addEventListener("click", backupNow);
el("restoreNow").addEventListener("click", restoreNow);
el("promptAdd").addEventListener("click", () => addPromptRow());
el("promptReset").addEventListener("click", () => {
  renderPrompts(DEFAULT_PROMPTS);
  setPromptStatus("Reset to defaults (not saved yet).", "");
});
el("promptSave").addEventListener("click", savePrompts);
el("promptExport").addEventListener("click", exportPromptsJson);
el("promptImport").addEventListener("click", () => el("promptImportFile").click());
el("promptImportFile").addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  e.target.value = "";
  if (!file) return;
  try {
    await importPromptsJson(file);
  } catch (err) {
    setPromptStatus(`Import failed: ${String(err.message || err)}`, "err");
  }
});
el("ragSave").addEventListener("click", saveRagSettings);

load();
