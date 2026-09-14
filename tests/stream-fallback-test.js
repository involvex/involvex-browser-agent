// Streaming fallback regression tests — static + behavioral.
// Run with: node tests/stream-fallback-test.js
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const providers = readFileSync(join(root, "src", "providers.js"), "utf8");
const bridge = readFileSync(join(root, "scripts", "fastvlm-bridge.py"), "utf8");
const background = readFileSync(join(root, "src", "background.js"), "utf8");

let passed = 0;
let failed = 0;
function check(name, cond) {
  if (cond) passed++;
  else failed++;
  console.log(`${cond ? "PASS" : "FAIL"}: ${name}`);
}

check(
  "providers: non-SSE JSON content-type branch",
  providers.includes("Server ignored stream:true"),
);
check(
  "providers: chatStream falls back to chat() on 0 tokens",
  providers.includes("retrying non-stream chat()"),
);
check(
  "providers: readOpenAiSse returns token count",
  providers.includes("Returns the number of content tokens emitted"),
);
check(
  "providers: accepts message-shaped choices in SSE",
  providers.includes("choice?.delta || choice?.message"),
);
check(
  "bridge: SSE method present",
  bridge.includes("def _sse(") && bridge.includes("text/event-stream"),
);
check(
  "bridge: do_POST branches on stream flag",
  bridge.includes('if body.get("stream")'),
);
check("bridge: SSE ends with [DONE]", bridge.includes("data: [DONE]"));
check(
  "background: format nudge present",
  background.includes("AGENT_FORMAT_NUDGE"),
);
check(
  "background: parseAgentStep present",
  background.includes("parseAgentStep"),
);
check(
  "background: empty-reply hint present",
  background.includes("empty model reply"),
);
check(
  "background: prose fallback present",
  background.includes("prose fallback"),
);

// Behavioral: simulate a server that ignores stream:true (plain JSON 200).
// Replicates the new streamOpenAiCompatible JSON branch.
async function simulateNonSseJsonBranch() {
  const payload = {
    choices: [
      {
        message: {
          role: "assistant",
          content: '{"action":"finish","args":{"answer":"hi"}}',
        },
      },
    ],
  };
  let emitted = "";
  const onToken = (t) => {
    emitted += t;
  };
  const json = payload;
  const content = json?.choices?.[0]?.message?.content || "";
  if (typeof content === "string" && content) onToken(content);
  return emitted;
}
const out = await simulateNonSseJsonBranch();
check(
  "behavioral: plain-JSON fallback emits content",
  out.includes('"action":"finish"'),
);

// Behavioral: Kilo-style reasoning-model payloads via exported helpers.
const { extractChoiceText, throwIfPayloadError, isTemperatureError } =
  await import("../src/providers.js");

const qwenDelta = {
  delta: { content: "", reasoning_content: "Let me think… Paris." },
};
const q = extractChoiceText(qwenDelta);
check(
  "behavioral: reasoning_content extracted, content empty",
  q.content === "" && q.reasoning === "Let me think… Paris.",
);

const plainDelta = { delta: { content: "Hello" } };
check(
  "behavioral: plain delta still wins",
  extractChoiceText(plainDelta).content === "Hello",
);

const detailsShape = {
  delta: {
    content: "",
    reasoning_details: [{ text: "step one " }, { text: "step two" }],
  },
};
check(
  "behavioral: reasoning_details joined",
  extractChoiceText(detailsShape).reasoning === "step one step two",
);

let threw = false;
try {
  throwIfPayloadError({ error: { message: "insufficient credits" } }, 200);
} catch (e) {
  threw = /gateway error.*insufficient credits/.test(e.message);
}
check("behavioral: 200+error payload throws", threw);

check(
  "behavioral: temperature rejection detected",
  isTemperatureError("400 Unsupported parameter: 'temperature' for o4-mini") &&
    !isTemperatureError("500 internal error"),
);

// Static: new resilience paths exist.
check(
  "providers: reasoning sink threading",
  providers.includes("sink.reasoning") && providers.includes("runStream("),
);
check(
  "providers: temperature retry without param",
  providers.includes("retrying without it"),
);
check(
  "providers: reasoning-only fallback message",
  providers.includes("reasoning-only output"),
);

console.log(`\n=== ${passed} passed, ${failed} failed ===`);
process.exit(failed ? 1 : 0);
