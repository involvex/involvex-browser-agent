/// Persistent error log — ring buffer in chrome.storage.local.
/// Errors already show inline in chat; this keeps them visible in Settings
/// for later debugging. Secrets are never stored (messages are truncated).

const KEY = "errorLog";
const MAX_ENTRIES = 50;
const MAX_MSG_LEN = 500;

export async function logError(where, err) {
  const message = String((err && err.message) || err || "unknown error").slice(
    0,
    MAX_MSG_LEN,
  );
  try {
    const store = await chrome.storage.local.get(KEY);
    const list = Array.isArray(store[KEY]) ? store[KEY] : [];
    list.push({ t: Date.now(), where: String(where || "general"), message });
    while (list.length > MAX_ENTRIES) list.shift();
    await chrome.storage.local.set({ [KEY]: list });
  } catch (_) {
    // storage unavailable — error display in chat still works
  }
}

export async function getErrorLog() {
  try {
    const store = await chrome.storage.local.get(KEY);
    const list = Array.isArray(store[KEY]) ? store[KEY] : [];
    return list.slice().reverse(); // newest first
  } catch (_) {
    return [];
  }
}

export async function clearErrorLog() {
  try {
    await chrome.storage.local.remove(KEY);
  } catch (_) {
    // ignore
  }
}
