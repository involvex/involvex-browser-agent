# Task 1: Fix JSON extraction to handle outer-quoted responses

## Task Description

**Files:**
- Modify: `src/background.js:360-423`

**Interfaces:**
- Consumes: raw text string from model reply
- Produces: parsed `{ action, args, thought }` object or null

**Context:** Models like Gemini, OpenAI, and smaller open-source models sometimes wrap their tool-call JSON in outer double quotes (`"{"action":..."}`) instead of returning bare JSON or using ``` fenced blocks. The current `extractJsonWithActionKey()` searches for `{` AFTER `"action":`, which finds the wrong brace when the opening `{` precedes `"action"`.

## Steps

### Step 1: Add `extractJsonFromOuterQuotes()` function

Add this new function right after `extractJsonFromFenced()` (after line 364):

```javascript
/// Handles the case where the model wraps JSON in outer double quotes:
/// "{"action":"read_page","args":{}}"  →  {"action":"read_page","args":{}}
function extractJsonFromOuterQuotes(raw) {
  const trimmed = raw.trim();
  if (trimmed.length < 2) return null;
  if (trimmed[0] === '"' && trimmed[trimmed.length - 1] === '"') {
    // Strip outer quotes, then try to parse
    const inner = trimmed.slice(1, -1);
    try {
      const obj = JSON.parse(inner);
      if (obj && typeof obj.action === "string") return JSON.stringify(obj);
    } catch (_) {
      // inner content isn't valid JSON — maybe escaped quotes inside?
      // Try unescaping common patterns
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
```

### Step 2: Fix `extractJsonWithActionKey()` to find the correct opening brace

Replace the current `extractJsonWithActionKey()` function (lines 366-407) with this version that searches for `{` from the **beginning** of the string:

```javascript
function extractJsonWithActionKey(raw) {
  const actionMatch = raw.match(/"action"\s*:/);
  if (!actionMatch) return null;

  // Find the opening '{' that contains the "action" key.
  // Search from the start of the string, not from after "action",
  // because models may wrap JSON in outer quotes: "{"action":...}"
  const start = raw.indexOf("{");
  if (start === -1 || start > actionMatch.index) return null;

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
```

### Step 3: Update `parseAction()` to try outer-quote extraction

Replace the current `parseAction()` function (lines 409-423) with:

```javascript
function parseAction(raw) {
  // 1. Try fenced code block first (```json ... ```)
  let jsonStr = extractJsonFromFenced(raw);
  // 2. Try outer-quoted JSON: " {"action":...} "
  if (!jsonStr) {
    jsonStr = extractJsonFromOuterQuotes(raw);
  }
  // 3. Try finding { "action": ... } anywhere in the text
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
```

### Step 4: Verify the fix handles all known model output patterns

Manually verify these patterns all parse correctly:

| Model output pattern | Extractor used | Result |
|---|---|---|
| ```` ```json\n{"action":"read_page","args":{}}\n``` ```` | `extractJsonFromFenced` | Parsed ✓ |
| `{"action":"read_page","args":{}}` | `extractJsonWithActionKey` | Parsed ✓ |
| `"{"action":"read_page","args":{}}"` | `extractJsonFromOuterQuotes` | Parsed ✓ |
| `Here's what I'll do:\n{"action":"read_page","args":{}}` | `extractJsonWithActionKey` | Parsed ✓ |
| `Sure, let me help.\n\n"{"action":"finish","args":{"answer":"..."}}"` | `extractJsonFromOuterQuotes` | Parsed ✓ |
| Just prose text, no JSON | All return null | null ✓ |

### Step 5: Commit

```bash
git add src/background.js
git commit -m "fix: handle outer-quoted JSON in agent parseAction()"
```
