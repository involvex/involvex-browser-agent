const STORE_KEY = "sessions";
const MAX_SESSIONS = 50;

/// Loads all saved sessions, newest first.
export async function listSessions() {
  const { sessions } = await chrome.storage.local.get(STORE_KEY);
  const list = Array.isArray(sessions) ? sessions : [];
  return list.slice().sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

export async function getSession(id) {
  const list = await listSessions();
  return list.find((s) => s.id === id) || null;
}

/// Derives a short title from the first user message.
function deriveTitle(messages) {
  const firstUser = messages.find((m) => m.role === "user");
  const text = (firstUser?.content || "New chat").replace(/\s+/g, " ").trim();
  return text.length > 60 ? `${text.slice(0, 57)}…` : text;
}

/// Sanitizes message content for storage: image parts are replaced with a
/// marker so dataURLs (screenshots, attachments) never blow the storage quota.
export function sanitizeForStorage(messages) {
  return (messages || []).map((m) => {
    if (typeof m.content === "string") return m;
    if (Array.isArray(m.content)) {
      const text = m.content
        .filter((p) => p.type === "text")
        .map((p) => p.text)
        .join("\n");
      const imgs = m.content.filter((p) => p.type === "image_url").length;
      return {
        ...m,
        content: imgs ? `${text}\n[image attached]`.trim() : text,
      };
    }
    return { ...m, content: String(m.content || "") };
  });
}

/// Inserts or updates a session and trims the store to MAX_SESSIONS.
/// Returns the stored session (with its id).
export async function saveSession(session) {
  if (!session.messages || !session.messages.length) return session;
  session = { ...session, messages: sanitizeForStorage(session.messages) };
  const { sessions } = await chrome.storage.local.get(STORE_KEY);
  const list = Array.isArray(sessions) ? sessions : [];
  const now = Date.now();
  const id = session.id || `s-${now}-${Math.random().toString(36).slice(2, 8)}`;
  const record = {
    id,
    title: session.title || deriveTitle(session.messages),
    provider: session.provider || "",
    model: session.model || "",
    mode: session.mode || "ask",
    messages: session.messages,
    createdAt: session.createdAt || now,
    updatedAt: now,
  };
  const idx = list.findIndex((s) => s.id === id);
  if (idx >= 0) list[idx] = record;
  else list.push(record);
  list.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  const trimmed = list.slice(0, MAX_SESSIONS);
  await chrome.storage.local.set({ [STORE_KEY]: trimmed });
  return record;
}

export async function deleteSession(id) {
  const { sessions } = await chrome.storage.local.get(STORE_KEY);
  const list = Array.isArray(sessions) ? sessions : [];
  await chrome.storage.local.set({
    [STORE_KEY]: list.filter((s) => s.id !== id),
  });
}

export async function clearSessions() {
  await chrome.storage.local.set({ [STORE_KEY]: [] });
}

/// Case-insensitive search over titles and message contents.
export async function searchSessions(query) {
  const list = await listSessions();
  const q = (query || "").trim().toLowerCase();
  if (!q) return list;
  return list.filter((s) => {
    if ((s.title || "").toLowerCase().includes(q)) return true;
    return (s.messages || []).some((m) =>
      String(m.content || "")
        .toLowerCase()
        .includes(q),
    );
  });
}
