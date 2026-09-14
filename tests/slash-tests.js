// Minimal automated tests for slash parser — no npm, no build step
// Run with: node tests/slash-tests.js

console.log("=== slash-tests.js ===\n");

const SLASH_COMMANDS = [
  { name: "help", local: "help" },
  { name: "new", local: "new" },
  { name: "export", local: "export" },
  { name: "summarize", prompt: "Summarize this page in a few bullet points." },
  { name: "eli5", prompt: "Explain simply." },
  {
    name: "translate",
    prompt: (arg) => `Translate the page content to ${arg || "English"}.`,
  },
  { name: "extract", prompt: "Extract structured data." },
  { name: "agent", mode: "agent" },
  { name: "ask", mode: "ask" },
];

function parseSlashCommand(text) {
  const match = String(text || "").match(/^\/([a-zA-Z]+)\s*([\s\S]*)$/);
  if (!match) return { kind: "passthrough" };
  const cmd = SLASH_COMMANDS.find((c) => c.name === match[1].toLowerCase());
  if (!cmd) return { kind: "passthrough" };
  const arg = (match[2] || "").trim();
  if (cmd.local) return { kind: "local", action: cmd.local };
  if (cmd.mode) {
    if (!arg) return { kind: "local", action: "help" };
    return { kind: "prompt", text: arg, mode: cmd.mode };
  }
  const prompt =
    typeof cmd.prompt === "function" ? cmd.prompt(arg) : cmd.prompt;
  return { kind: "prompt", text: prompt };
}

let pass = 0;
let fail = 0;
function check(name, cond) {
  if (cond) {
    pass++;
    console.log(`Test: ${name} — PASSED`);
  } else {
    fail++;
    console.log(`Test: ${name} — FAILED`);
  }
}

check(
  "plain text passes through",
  parseSlashCommand("hello").kind === "passthrough",
);
check(
  "math passes through",
  parseSlashCommand("/ 2 = 0.5").kind === "passthrough",
);
check(
  "unknown command passes through",
  parseSlashCommand("/frobnicate x").kind === "passthrough",
);
check("empty passes through", parseSlashCommand("").kind === "passthrough");
check("/new is local", parseSlashCommand("/new").action === "new");
check("/export is local", parseSlashCommand("/export").action === "export");
check("/help is local", parseSlashCommand("/help me").action === "help");
check(
  "/summarize expands prompt",
  parseSlashCommand("/summarize").text.includes("Summarize"),
);
check(
  "/translate default language",
  parseSlashCommand("/translate").text.includes("English"),
);
check(
  "/translate with arg",
  parseSlashCommand("/translate german").text.toLowerCase().includes("german"),
);
check(
  "/agent forces agent mode",
  (() => {
    const r = parseSlashCommand("/agent fill the form");
    return (
      r.kind === "prompt" && r.mode === "agent" && r.text === "fill the form"
    );
  })(),
);
check(
  "/ask forces ask mode",
  (() => {
    const r = parseSlashCommand("/ask what is this?");
    return r.kind === "prompt" && r.mode === "ask";
  })(),
);
check("bare /agent shows help", parseSlashCommand("/agent").action === "help");
check("case-insensitive", parseSlashCommand("/NEW").action === "new");

console.log(`\n=== slash-tests.js: ${pass} passed, ${fail} failed ===`);
if (fail) process.exit(1);
