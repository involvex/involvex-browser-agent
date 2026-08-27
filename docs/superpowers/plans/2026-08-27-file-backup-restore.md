# Plan: File Backup/Restore with API Keys

## Context

The existing backup system (`backup.js`) uses GitHub Gist and **strips API keys** via `stripSecrets()`. The user wants a separate local file backup that **includes everything** — settings, API keys, bookmarks, prompts, sessions — exportable as a JSON file and restorable from that file.

## Requirements

1. **Export**: Download a JSON file containing all settings (including API keys), bookmarks, prompts, sessions, and extension list
2. **Import**: Upload a JSON file to restore settings (including API keys), bookmarks, prompts, sessions
3. **UI**: Export/Import buttons in the Backup & Sync section of options.html
4. **Schema**: Use a distinct schema identifier (`involvex-full-backup/1`) to differentiate from Gist backups
5. **Security warning**: The exported file contains API keys — user should handle it carefully

## Implementation

### Step 1: Add backup functions to `src/backup.js`

Add two new exported functions:

```javascript
const FULL_BACKUP_SCHEMA = "involvex-full-backup/1";

/// Builds a full backup payload including API keys (for local file export).
export async function buildFullBackup() {
  const bookmarks = await chrome.bookmarks.getTree();
  const store = await chrome.storage.local.get(null);
  const settings = store.settings || {};
  const extensions = await collectExtensions();
  const includeChatHistory = !!(settings.backup && settings.backup.includeChatHistory);
  const includePrompts = !!(settings.backup && settings.backup.includePrompts);
  if (!includePrompts) delete settings.prompts;
  const payload = {
    schema: FULL_BACKUP_SCHEMA,
    createdAt: new Date().toISOString(),
    bookmarks,
    settings,  // includes API keys
    extensions,
  };
  if (includeChatHistory && Array.isArray(store.sessions)) {
    payload.sessions = store.sessions;
  }
  return payload;
}

/// Restores from a full backup file (including API keys).
export async function restoreFullBackup(backup) {
  let bookmarksAdded = 0;
  let sessionsMerged = 0;
  if (backup.bookmarks) {
    const flat = flattenBookmarks(backup.bookmarks);
    const folder = await chrome.bookmarks.create({
      title: `Involvex Restore ${new Date().toISOString().slice(0, 10)}`,
    });
    for (const b of flat) {
      try {
        await chrome.bookmarks.create({ parentId: folder.id, title: b.title, url: b.url });
        bookmarksAdded++;
      } catch (_) {}
    }
  }
  if (backup.settings) {
    await chrome.storage.local.set({ settings: backup.settings });
  }
  if (backup.sessions && backup.sessions.length) {
    const { sessions: current } = await chrome.storage.local.get("sessions");
    const merged = mergeSessions(current, backup.sessions);
    sessionsMerged = merged.length;
    await chrome.storage.local.set({ sessions: merged });
  }
  return {
    bookmarksAdded,
    extensions: backup.extensions ? backup.extensions.length : 0,
    extensionList: extensionInstallLinks(backup.extensions || []),
    sessionsMerged,
  };
}
```

### Step 2: Add UI buttons to `src/options.html`

After the existing Gist backup actions div (line 312), add a new section:

```html
<hr class="sep" />

<h1>File Backup</h1>
<p class="sub">
  Export a complete backup file including API keys and all settings.
  <strong>Store this file securely</strong> — it contains your API keys.
</p>
<div class="actions">
  <button id="exportFullBackup">Export to file</button>
  <button id="importFullBackup">Import from file</button>
  <input type="file" id="importFullBackupFile" accept="application/json,.json" hidden />
  <span id="fullBackupStatus" class="status"></span>
</div>
```

### Step 3: Add event handlers to `src/options.js`

```javascript
function setFullBackupStatus(text, kind) {
  const node = el("fullBackupStatus");
  node.textContent = text;
  node.className = `status ${kind || ""}`;
}

function exportFullBackup() {
  // Similar pattern to exportPromptsJson but async
  setFullBackupStatus("Exporting…", "");
  buildFullBackup().then(payload => {
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `involvex-full-backup-${new Date().toISOString().slice(0,10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    setFullBackupStatus("Exported.", "ok");
  }).catch(err => {
    setFullBackupStatus(`Export failed: ${err.message}`, "err");
  });
}

async function importFullBackup(file) {
  setFullBackupStatus("Importing…", "");
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    const res = await restoreFullBackup(data);
    const extCount = res.extensionList ? res.extensionList.length : 0;
    const sessCount = res.sessionsMerged || 0;
    setFullBackupStatus(
      `Restored ${res.bookmarksAdded} bookmarks + settings` +
        (extCount ? `, ${extCount} extensions listed` : "") +
        (sessCount ? `, ${sessCount} chat sessions merged` : "") + ".",
      "ok"
    );
    renderRestoreExtensions(res.extensionList);
    // Reload settings into UI
    load();
  } catch (err) {
    setFullBackupStatus(`Import failed: ${err.message}`, "err");
  }
}

el("exportFullBackup").addEventListener("click", exportFullBackup);
el("importFullBackup").addEventListener("click", () => el("importFullBackupFile").click());
el("importFullBackupFile").addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  e.target.value = "";
  if (!file) return;
  await importFullBackup(file);
});
```

### Step 4: Commit

```bash
git add src/backup.js src/options.js src/options.html
git commit -m "feat: add file backup/restore with API keys"
```

## Files Modified

| File | Change |
|---|---|
| `src/backup.js` | Add `buildFullBackup()` and `restoreFullBackup()` |
| `src/options.html` | Add File Backup section with Export/Import buttons |
| `src/options.js` | Add `exportFullBackup()`, `importFullBackup()`, event handlers |

## Testing

1. Open options.html in Chrome
2. Scroll to "File Backup" section
3. Click "Export to file" — verify JSON downloads with API keys included
4. Change a setting, click "Import from file" — verify settings + API keys restored
5. Verify Gist backup still strips secrets (regression check)
