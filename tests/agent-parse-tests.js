// Agent JSON parser regression tests — mirrors src/background.js logic.
// Run with: node tests/agent-parse-tests.js
// No npm, no build step.

console.log("=== agent-parse-tests.js ===\n");

// ---- Copies of src/background.js parser (keep in sync) ----
function extractJsonFromFenced(raw) {
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) return fence[1];
  const open = raw.match(/```(?:json)?\s*([\s\S]*)$/i);
  if (open && open[1] && open[1].includes('"action"')) return open[1];
  return null;
}

function extractJsonFromOuterQuotes(raw) {
  const trimmed = raw.trim();
  if (trimmed.length < 2) return null;
  if (trimmed[0] === '"' && trimmed[trimmed.length - 1] === '"') {
    const inner = trimmed.slice(1, -1);
    try {
      const obj = JSON.parse(inner);
      if (obj && typeof obj.action === "string") return JSON.stringify(obj);
    } catch (_) {
      try {
        const unescaped = inner.replace(/\\"/g, '"');
        const obj = JSON.parse(unescaped);
        if (obj && typeof obj.action === "string") return JSON.stringify(obj);
      } catch (_) {
        return null;
      }
    }
  }
  return null;
}

function repairJsonString(s) {
  let out = String(s || "");
  out = out.replace(/[“”„‟]/g, '"').replace(/[‘’‚‛]/g, "'");
  out = out.replace(/\/\/[^\n\r]*/g, "");
  out = out.replace(/\/\*[\s\S]*?\*\//g, "");
  out = out.replace(/'([^'\\]*(?:\\.[^'\\]*)*)'/g, '"$1"');
  out = out
    .replace(/\bTrue\b/g, "true")
    .replace(/\bFalse\b/g, "false")
    .replace(/\bNone\b/g, "null");
  out = out.replace(/,\s*([}\]])/g, "$1");
  return out;
}

function tryParseActionJson(jsonStr) {
  const attempts = [jsonStr, repairJsonString(jsonStr)];
  for (const text of attempts) {
    try {
      const obj = JSON.parse(text.trim());
      if (obj && typeof obj.action === "string") return obj;
      if (obj && obj.action != null) return obj;
    } catch (_) {}
  }
  return null;
}

function extractJsonWithActionKey(raw) {
  const actionMatch = raw.match(/"action"\s*:/);
  if (!actionMatch) return null;
  const starts = [];
  for (
    let idx = raw.indexOf("{");
    idx !== -1 && idx <= actionMatch.index;
    idx = raw.indexOf("{", idx + 1)
  ) {
    starts.push(idx);
  }
  if (!starts.length) return null;
  for (let s = starts.length - 1; s >= 0; s--) {
    const start = starts[s];
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
          const obj = tryParseActionJson(candidate);
          if (obj && obj.action) return candidate;
          break;
        }
      }
    }
  }
  return null;
}

function parseFailureReason(raw) {
  if (!raw || !raw.trim()) return "empty";
  if (!/"action"\s*:/.test(raw)) return "prose";
  return "invalid_json";
}

function parseAction(raw) {
  if (!raw || !raw.trim()) return null;
  let jsonStr = extractJsonFromFenced(raw);
  if (jsonStr) {
    const obj = tryParseActionJson(jsonStr);
    if (obj) return obj;
  }
  jsonStr = extractJsonFromOuterQuotes(raw);
  if (jsonStr) {
    const obj = tryParseActionJson(jsonStr);
    if (obj) return obj;
  }
  jsonStr = extractJsonWithActionKey(raw);
  if (jsonStr) {
    const obj = tryParseActionJson(jsonStr);
    if (obj) return obj;
  }
  if (!/"action"\s*:/.test(raw)) {
    const answer = raw.trim().slice(0, 4000);
    if (answer)
      return { action: "finish", args: { answer }, thought: "prose fallback" };
  }
  return null;
}

// ---- Test runner ----
let passed = 0;
let failed = 0;
function check(name, raw, expectAction) {
  const res = parseAction(raw);
  const got = res ? res.action : null;
  const ok = got === expectAction;
  if (ok) passed++;
  else failed++;
  console.log(
    `${ok ? "PASS" : "FAIL"}: ${name} — expected ${expectAction}, got ${got}`,
  );
  if (!ok && res)
    console.log(`   raw was: ${JSON.stringify(raw).slice(0, 160)}`);
}

check(
  "fenced json",
  '```json\n{"thought":"t","action":"read_page","args":{}}\n```',
  "read_page",
);
check("bare json", '{"action":"read_page","args":{}}', "read_page");
check(
  "prose + bare json",
  'Here you go:\n{"thought":"x","action":"click","args":{"index":2}}',
  "click",
);
check(
  "outer-quoted",
  '"{\\"action\\":\\"read_page\\",\\"args\\":{}}"',
  "read_page",
);
check(
  "unclosed fence",
  '```json\n{"thought":"t","action":"finish","args":{"answer":"hi"}}',
  "finish",
);
check("single quotes", "{'action':'finish','args':{'answer':'hi'}}", "finish");
check(
  "trailing comma",
  '{"action":"finish","args":{"answer":"hi",},}',
  "finish",
);
check(
  "comment",
  '{"action":"finish", // done\n"args":{"answer":"hi"}}',
  "finish",
);
check("prose fallback", "The page is about cats and dogs.", "finish");
check("empty -> null", "", null);
check("whitespace -> null", "   \n  ", null);
check("invalid json with action -> null", '{"action":}', null);
check(
  "nested braces in answer",
  '{"thought":"t","action":"finish","args":{"answer":"use {x} here"}}',
  "finish",
);
check("finish reason empty", "", null);

const rEmpty = parseFailureReason("");
const rProse = parseFailureReason("hello world");
const rInvalid = parseFailureReason('{"action":}');
const reasonOk =
  rEmpty === "empty" && rProse === "prose" && rInvalid === "invalid_json";
console.log(
  `${reasonOk ? "PASS" : "FAIL"}: parseFailureReason empty/prose/invalid_json`,
);
if (reasonOk) passed++;
else failed++;

console.log(`\n=== ${passed} passed, ${failed} failed ===`);
process.exit(failed ? 1 : 0);
