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
