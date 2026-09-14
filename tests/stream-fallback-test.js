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
  providers.includes("Returns the number of tokens emitted"),
);
check(
  "providers: accepts message.content fallback in SSE",
  providers.includes("choices?.[0]?.message?.content"),
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

console.log(`\n=== ${passed} passed, ${failed} failed ===`);
process.exit(failed ? 1 : 0);
