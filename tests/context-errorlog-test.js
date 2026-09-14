// Context persistence + error log regression tests.
// Run with: node tests/context-errorlog-test.js
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const panel = readFileSync(join(root, "src", "panel.js"), "utf8");
const background = readFileSync(join(root, "src", "background.js"), "utf8");
const options = readFileSync(join(root, "src", "options.js"), "utf8");
const optionsHtml = readFileSync(join(root, "src", "options.html"), "utf8");

let passed = 0;
let failed = 0;
function check(name, cond) {
  if (cond) passed++;
  else failed++;
  console.log(`${cond ? "PASS" : "FAIL"}: ${name}`);
}

// --- Context setting ---
check(
  "panel: contextSelect element ref",
  panel.includes('getElementById("contextSection")'),
);
check(
  "panel: no bare contextSection global",
  !/[^a-zA-Z]contextSection\.addEventListener/.test(panel),
);
check("panel: saves string value", panel.includes("contextSection: section"));
check("panel: restores in init", panel.includes("await loadContextSection()"));
check(
  "panel: sends contextSection to prepareAsk",
  panel.includes("contextSection: contextSelect"),
);
check(
  "panel: sends contextSection to agent chat",
  panel.includes('type: "chat"'),
);
check("background: CONTEXT_LIMITS map", background.includes("CONTEXT_LIMITS"));
check("background: summary cap 3000", /summary:\s*3000/.test(background));
check(
  "background: resolveMaxChars used in ask",
  background.includes("resolveMaxChars(opts.contextSection)"),
);
check(
  "background: runAgent takes contextSection",
  /async function runAgent\([\s\S]*?contextSection\s*=\s*"full"/.test(
    background,
  ),
);
check(
  "background: execTool respects maxChars",
  background.includes("pageExtract, [maxChars]"),
);
check(
  "background: continue preserves section",
  background.includes('contextSection = "full"') &&
    background.includes("convo, tabId, settings, contextSection"),
);

// --- Error log ---
check(
  "errorlog module logged from panel",
  panel.includes('logError("agent"') && panel.includes('logError("ask"'),
);
check("options: renders error log", options.includes("renderErrorLog"));
check(
  "options: logs test failures",
  options.includes('logError("settings/test"'),
);
check(
  "options: error log card in HTML",
  optionsHtml.includes('id="errorLogList"') &&
    optionsHtml.includes('id="errorLogClear"'),
);

// --- Behavioral: errorlog ring buffer with mocked chrome.storage ---
let store = {};
globalThis.chrome = {
  storage: {
    local: {
      get: async (k) => ({ [k]: store[k] }),
      set: async (o) => {
        Object.assign(store, o);
      },
      remove: async (k) => {
        delete store[k];
      },
    },
  },
};
const { logError, getErrorLog, clearErrorLog } =
  await import("../src/errorlog.js");
await logError("test", new Error("boom"));
let entries = await getErrorLog();
check(
  "behavioral: logged entry retrievable",
  entries.length === 1 &&
    entries[0].message === "boom" &&
    entries[0].where === "test",
);
for (let i = 0; i < 60; i++) await logError("spam", `e${i}`);
entries = await getErrorLog();
check(
  "behavioral: capped at 50, newest first",
  entries.length === 50 && entries[0].message === "e59",
);
await clearErrorLog();
entries = await getErrorLog();
check("behavioral: clear empties log", entries.length === 0);

console.log(`\n=== ${passed} passed, ${failed} failed ===`);
process.exit(failed ? 1 : 0);
