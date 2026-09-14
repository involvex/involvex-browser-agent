// Reasoning display + token/cost meter regression tests.
// Run with: node tests/usage-meter-test.js
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const providersSrc = readFileSync(join(root, "src", "providers.js"), "utf8");
const panelSrc = readFileSync(join(root, "src", "panel.js"), "utf8");
const backgroundSrc = readFileSync(join(root, "src", "background.js"), "utf8");
const panelHtml = readFileSync(join(root, "src", "panel.html"), "utf8");

let passed = 0;
let failed = 0;
function check(name, cond) {
  if (cond) passed++;
  else failed++;
  console.log(`${cond ? "PASS" : "FAIL"}: ${name}`);
}

// --- Static wiring ---
check(
  "providers: normalizeUsage exported",
  providersSrc.includes("export function normalizeUsage"),
);
check(
  "providers: stream_options include_usage",
  providersSrc.includes("include_usage"),
);
check(
  "providers: getModelPricing exported",
  providersSrc.includes("export async function getModelPricing"),
);
check(
  "providers: chatStream accepts out",
  /export async function chatStream\(settings, messages, onToken, out/.test(
    providersSrc,
  ),
);
check(
  "providers: chat accepts out",
  /export async function chat\(settings, messages, out/.test(providersSrc),
);
check(
  "panel: thinking block renderer",
  panelSrc.includes("renderThinkingBlock"),
);
check(
  "panel: usage meter + trackUsage",
  panelSrc.includes("updateUsageMeter") && panelSrc.includes("trackUsage"),
);
check(
  "panel: usageMeter element in HTML",
  panelHtml.includes('id="usageMeter"'),
);
check("panel: handles usage events", panelSrc.includes('m.event === "usage"'));
check(
  "panel: assistant passes reasoning",
  panelSrc.includes("finishAssistant(m.text, m.raw, m.reasoning)"),
);
check(
  "background: usage events posted",
  backgroundSrc.includes('event: "usage"'),
);
check(
  "background: finish carries reasoning",
  backgroundSrc.includes("reasoning: stepRes.reasoning"),
);

// --- Behavioral with mocked fetch ---
const realFetch = globalThis.fetch;
function sseResponse(lines) {
  return new Response(lines.join("\n"), {
    status: 200,
    headers: { "content-type": "text/event-stream" },
  });
}
function jsonResponse(obj) {
  return new Response(JSON.stringify(obj), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

const { chatStream, chat, normalizeUsage, getModelPricing } =
  await import("../src/providers.js");

check(
  "normalizeUsage: openai shape",
  JSON.stringify(
    normalizeUsage({
      prompt_tokens: 10,
      completion_tokens: 5,
      total_tokens: 15,
    }),
  ) === JSON.stringify({ prompt: 10, completion: 5, total: 15 }),
);
check(
  "normalizeUsage: anthropic shape",
  JSON.stringify(normalizeUsage({ input_tokens: 7, output_tokens: 3 })) ===
    JSON.stringify({ prompt: 7, completion: 3, total: 10 }),
);
check(
  "normalizeUsage: gemini shape",
  JSON.stringify(
    normalizeUsage({
      promptTokenCount: 4,
      candidatesTokenCount: 6,
      totalTokenCount: 10,
    }),
  ) === JSON.stringify({ prompt: 4, completion: 6, total: 10 }),
);
check(
  "normalizeUsage: ollama shape",
  JSON.stringify(normalizeUsage({ prompt_eval_count: 20, eval_count: 8 })) ===
    JSON.stringify({ prompt: 20, completion: 8, total: 28 }),
);
check(
  "normalizeUsage: null on empty",
  normalizeUsage({}) === null && normalizeUsage(null) === null,
);

// Streamed content + terminal usage chunk (Kilo-style).
globalThis.fetch = async () =>
  sseResponse([
    'data: {"choices":[{"delta":{"content":"Hi"}}]}',
    'data: {"choices":[{"delta":{"content":" there"}}]}',
    'data: {"choices":[{"delta":{}}],"usage":{"prompt_tokens":100,"completion_tokens":20,"total_tokens":120}}',
    "data: [DONE]",
  ]);
{
  const out = {};
  const seen = [];
  const settings = {
    provider: "custom",
    custom: { model: "kilo-auto/free", baseUrl: "http://kilo.test" },
  };
  const answer = await chatStream(
    settings,
    [{ role: "user", content: "hi" }],
    (t) => seen.push(t),
    out,
  );
  check("stream: answer assembled", answer === "Hi there");
  check(
    "stream: usage captured",
    out.usage && out.usage.prompt === 100 && out.usage.completion === 20,
  );
  check("stream: no reasoning recorded", !out.reasoning);
}

// Reasoning-only stream (free-tier routing to thinking model).
globalThis.fetch = async () =>
  sseResponse([
    'data: {"choices":[{"delta":{"reasoning_content":"Thinking: Paris."}}]}',
    'data: {"choices":[{"delta":{}}]}',
    "data: [DONE]",
  ]);
{
  const out = {};
  const settings = {
    provider: "custom",
    custom: { model: "kilo-auto/free", baseUrl: "http://kilo.test" },
  };
  const answer = await chatStream(
    settings,
    [{ role: "user", content: "capital?" }],
    () => {},
    out,
  );
  check("stream: reasoning fallback answer", answer === "Thinking: Paris.");
  check("stream: fallback flag set", out.fallbackToReasoning === true);
  check(
    "stream: reasoning kept separate",
    out.reasoning === "Thinking: Paris.",
  );
}

// Non-stream chat with usage + pricing lookup.
globalThis.fetch = async (url, opts) => {
  if (String(url).endsWith("/models")) {
    return jsonResponse({
      data: [
        {
          id: "kilo-auto/free",
          pricing: { prompt: "0.000001", completion: "0.000002" },
        },
      ],
    });
  }
  return jsonResponse({
    choices: [{ message: { role: "assistant", content: "Done." } }],
    usage: { prompt_tokens: 50, completion_tokens: 10, total_tokens: 60 },
  });
};
{
  const out = {};
  const settings = {
    provider: "custom",
    custom: { model: "kilo-auto/free", baseUrl: "http://kilo.test/v1" },
  };
  const answer = await chat(settings, [{ role: "user", content: "hi" }], out);
  check(
    "chat: answer + usage",
    answer === "Done." && out.usage && out.usage.total === 60,
  );
  const pricing = await getModelPricing(settings);
  check(
    "pricing: parsed per-token prices",
    pricing && pricing.prompt === 0.000001 && pricing.completion === 0.000002,
  );
  const cost =
    out.usage.prompt * pricing.prompt +
    out.usage.completion * pricing.completion;
  check("pricing: cost math sane", Math.abs(cost - 0.00007) < 1e-9);
}

globalThis.fetch = realFetch;

console.log(`\n=== ${passed} passed, ${failed} failed ===`);
process.exit(failed ? 1 : 0);
