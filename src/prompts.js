/// Built-in quick prompts shown as chips in the panel when the user hasn't
/// customized their own in Settings.
export const DEFAULT_PROMPTS = [
  {
    label: "Summarize page",
    prompt: "Summarize this page in a few bullet points.",
  },
  {
    label: "What is this?",
    prompt: "What is this page about and what can I do here?",
  },
  {
    label: "Key links",
    prompt: "List the key links and actions on this page.",
  },
  {
    label: "Explain selection",
    prompt: "Explain this selected content clearly, as if to a beginner.",
  },
  {
    label: "Translate this",
    prompt:
      "Translate the page content. If it is already English, translate to German; otherwise translate to English.",
  },
  {
    label: "Rewrite this",
    prompt:
      "Rewrite the page content to be clearer and more concise, keeping the original meaning.",
  },
  {
    label: "Find on page",
    prompt:
      "Find the most important or useful information on this page and present it concisely.",
  },
  {
    label: "Check for errors",
    prompt:
      "Review the page content for errors, inconsistencies, or things that don't make sense, and list them.",
  },
  {
    label: "Extract data",
    prompt:
      "Extract structured data from this page (tables, forms, lists) and present as organized markdown.",
  },
];

/// Default Ask-mode system prompt. Page context is appended by the worker.
export const DEFAULT_ASK_SYSTEM =
  "You are Involvex AI, a helpful assistant embedded in a web browser. " +
  "You can see the content of the user's current page below. Use it when " +
  "relevant, cite specifics, and answer in concise markdown.";

/// Default Agent-mode preamble. Tool documentation is always appended by the worker.
export const DEFAULT_AGENT_SYSTEM =
  "You are Involvex AI Agent, operating inside a web browser on behalf of the user.";

/// Slash commands (core set). Pure data + pure parser — no DOM.
/// `prompt` may be a string or a function receiving the trailing arg text.
/// `mode` forces Ask/Agent for that one send. `local` names a panel action
/// (`new`, `export`, `help`) handled without any model call.
export const SLASH_COMMANDS = [
  { name: "help", hint: "List available commands", local: "help" },
  { name: "new", hint: "Start a new chat", local: "new" },
  { name: "export", hint: "Export this chat as Markdown", local: "export" },
  {
    name: "summarize",
    hint: "Summarize this page",
    prompt: "Summarize this page in a few bullet points.",
  },
  {
    name: "eli5",
    hint: "Explain this page simply",
    prompt:
      "Explain what this page is about in simple terms, as if to a five-year-old.",
  },
  {
    name: "translate",
    hint: "Translate page (optional: language)",
    prompt: (arg) =>
      `Translate the page content to ${arg || "English"}. If it is already in that language, say so briefly.`,
  },
  {
    name: "extract",
    hint: "Extract tables, forms and lists",
    prompt:
      "Extract structured data from this page (tables, forms, lists) and present as organized markdown.",
  },
  {
    name: "agent",
    hint: "Run the rest as an agent task",
    mode: "agent",
  },
  {
    name: "ask",
    hint: "Answer the rest as a plain question",
    mode: "ask",
  },
];

/// Parses `/command [args]` from composer text. Returns:
/// { kind: "local", action } | { kind: "prompt", text, mode } |
/// { kind: "passthrough" } (unknown command or no leading slash —
/// the text must be sent as a normal message, never swallowed).
export function parseSlashCommand(text) {
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

/// Starter agent recipes (#51, subset). Built-ins only — each is a canned
/// first prompt executed by the existing agent loop (8-step cap,
/// confirmations unchanged). Shown as chips in the empty state when Agent
/// mode is on. Custom recipes are a later step (prompt-library JSON).
export const AGENT_RECIPES = [
  {
    id: "summarize-extract",
    label: "Summarize + extract tables",
    hint: "Reads the page, summarizes it, then extracts structured data.",
    prompt:
      "Summarize this page in a few bullet points, then extract any tables, forms, or lists as organized markdown.",
  },
  {
    id: "form-fill",
    label: "Survey form fields",
    hint: "Lists every form field (label, type, value) so you can say what to fill.",
    prompt:
      "Read this page and describe every form field you find (label, type, current value) so I can tell you what to fill in.",
  },
  {
    id: "compare-links",
    label: "Compare key options",
    hint: "Lists key links/actions, then compares the top options.",
    prompt:
      "List the key links and actions on this page, then briefly compare the most important options — what each offers and when to choose it.",
  },
];
