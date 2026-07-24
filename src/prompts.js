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
];

/// Default Ask-mode system prompt. Page context is appended by the worker.
export const DEFAULT_ASK_SYSTEM =
  "You are Involvex AI, a helpful assistant embedded in a web browser. " +
  "You can see the content of the user's current page below. Use it when " +
  "relevant, cite specifics, and answer in concise markdown.";

/// Default Agent-mode preamble. Tool documentation is always appended by the worker.
export const DEFAULT_AGENT_SYSTEM =
  "You are Involvex AI Agent, operating inside a web browser on behalf of the user.";
