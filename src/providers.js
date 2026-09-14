export const PROVIDERS = {
  gemini: {
    label: "Google Gemini",
    defaultModel: "gemini-2.0-flash",
    needsKey: true,
    supportsVision: true,
    knownModels: [
      "gemini-2.0-flash",
      "gemini-2.0-flash-lite",
      "gemini-1.5-flash",
      "gemini-1.5-pro",
    ],
  },
  openai: {
    label: "OpenAI",
    defaultModel: "gpt-4o-mini",
    needsKey: true,
    supportsVision: true,
    knownModels: ["gpt-4o-mini", "gpt-4o", "gpt-4.1-mini", "o4-mini"],
  },
  anthropic: {
    label: "Anthropic Claude",
    defaultModel: "claude-3-5-haiku-latest",
    needsKey: true,
    knownModels: [
      "claude-3-5-haiku-latest",
      "claude-3-5-sonnet-latest",
      "claude-3-7-sonnet-latest",
    ],
  },
  openrouter: {
    label: "OpenRouter",
    defaultModel: "openrouter/auto",
    needsKey: true,
    defaultBaseUrl: "https://openrouter.ai/api/v1",
    knownModels: [
      "openrouter/auto",
      "deepseek/deepseek-chat",
      "google/gemini-2.0-flash-001",
      "anthropic/claude-3.5-haiku",
      "meta-llama/llama-3.3-70b-instruct",
      "qwen/qwen-2.5-72b-instruct",
    ],
  },
  opencode: {
    label: "OpenCode Zen",
    defaultModel: "mimo-v2.5-free",
    needsKey: true,
    defaultBaseUrl: "https://opencode.ai/zen/v1",
    knownModels: [
      "mimo-v2.5-free",
      "deepseek-v4-flash-free",
      "nemotron-3-ultra-free",
      "north-mini-code-free",
      "big-pickle",
      "claude-haiku-4-5",
      "claude-sonnet-5",
      "gemini-3-flash",
      "gpt-5-nano",
      "gpt-5.1-codex-mini",
      "deepseek-v4-flash",
      "glm-5",
      "kimi-k2.5",
      "qwen3.5-plus",
    ],
    hint: "OpenAI-compatible. Free models end with -free (e.g. mimo-v2.5-free).",
  },
  custom: {
    label: "Custom (OpenAI-compatible)",
    defaultModel: "",
    needsKey: false,
    defaultBaseUrl: "http://localhost:8080/v1",
    knownModels: [],
    hint: "For OpenCode, Kilo Code, LM Studio, vLLM, or any OpenAI-compatible server.",
  },
  ollama: {
    label: "Local (Ollama)",
    defaultModel: "qwen2.5:3b",
    needsKey: false,
    defaultBaseUrl: "http://localhost:11434",
    knownModels: [
      "qwen2.5:3b",
      "llama3.2:3b",
      "phi3.5",
      "gemma2:2b",
      "llava:7b",
      "moondream",
    ],
    supportsVision: true,
    visionModels: ["llava:7b", "llava", "moondream", "bakllava"],
  },
  fastvlm: {
    label: "FastVLM (LiteRT local)",
    defaultModel: "fastvlm-0.5b",
    needsKey: false,
    defaultBaseUrl: "http://127.0.0.1:8765/v1",
    knownModels: ["fastvlm-0.5b"],
    supportsVision: true,
    hint: "Run scripts/fastvlm-bridge.py with FastVLM-0.5B.litertlm from huggingface.co/litert-community/FastVLM-0.5B",
  },
};

export function providerSupportsVision(provider) {
  return !!PROVIDERS[provider]?.supportsVision;
}

/// Builds a user message, optionally attaching a page screenshot for vision models.
export function buildUserMessage(text, imageDataUrl) {
  if (!imageDataUrl) return { role: "user", content: text };
  return {
    role: "user",
    content: [
      { type: "text", text },
      { type: "image_url", image_url: { url: imageDataUrl } },
    ],
  };
}

function messageHasImage(messages) {
  return messages.some(
    (m) =>
      Array.isArray(m.content) && m.content.some((p) => p.type === "image_url"),
  );
}

function extractImageDataUrl(content) {
  if (!Array.isArray(content)) return null;
  const img = content.find((p) => p.type === "image_url");
  return img?.image_url?.url || null;
}

function textFromContent(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((p) => p.type === "text")
    .map((p) => p.text)
    .join("\n");
}

const DEFAULT_TIMEOUT_MS = 90000;

async function request(url, { method = "POST", headers = {}, body, signal }) {
  const res = await fetch(url, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
    signal,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`${res.status} ${res.statusText} ${detail}`.trim());
  }
  const text = await res.text().catch(() => "");
  try {
    return JSON.parse(text);
  } catch (_) {
    throw new Error(
      `[non-json 200] ${res.status} ${res.statusText} ${text.slice(0, 500).trim()}`,
    );
  }
}

function baseUrlFor(provider, cfg) {
  return (cfg.baseUrl || PROVIDERS[provider]?.defaultBaseUrl || "").replace(
    /\/$/,
    "",
  );
}

/// Sends a chat completion to the configured provider and returns plain text.
///
/// `messages` is a list of `{ role: "system"|"user"|"assistant", content }`.
export async function chat(settings, messages) {
  const provider = settings.provider;
  const info = PROVIDERS[provider];
  if (!info) {
    throw new Error(
      `Unknown provider: ${provider}. Reload the Involvex AI extension (v0.6.1+) on the phone.`,
    );
  }
  const cfg = settings[provider] || {};
  const model = cfg.model || info.defaultModel;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  try {
    switch (provider) {
      case "gemini":
        return await chatGemini(cfg.apiKey, model, messages, controller.signal);
      case "openai":
        return await chatOpenAiCompatible(
          "https://api.openai.com/v1/chat/completions",
          cfg.apiKey,
          model,
          messages,
          controller.signal,
        );
      case "openrouter":
        return await chatOpenAiCompatible(
          `${baseUrlFor("openrouter", cfg)}/chat/completions`,
          cfg.apiKey,
          model,
          messages,
          controller.signal,
          {
            "HTTP-Referer": "https://involvex.browser",
            "X-Title": "Involvex AI",
          },
        );
      case "opencode":
        return await chatOpenAiCompatible(
          `${baseUrlFor("opencode", cfg)}/chat/completions`,
          cfg.apiKey,
          model,
          messages,
          controller.signal,
        );
      case "custom":
        return await chatOpenAiCompatible(
          `${baseUrlFor("custom", cfg)}/chat/completions`,
          cfg.apiKey,
          model,
          messages,
          controller.signal,
        );
      case "anthropic":
        return await chatAnthropic(
          cfg.apiKey,
          model,
          messages,
          controller.signal,
        );
      case "ollama":
        return await chatOllama(
          baseUrlFor("ollama", cfg),
          model,
          messages,
          controller.signal,
        );
      case "fastvlm":
        return await chatOpenAiCompatible(
          `${baseUrlFor("fastvlm", cfg)}/chat/completions`,
          cfg.apiKey,
          model,
          messages,
          controller.signal,
        );
      default:
        if (info.defaultBaseUrl && provider !== "ollama") {
          return await chatOpenAiCompatible(
            `${baseUrlFor(provider, cfg)}/chat/completions`,
            cfg.apiKey,
            model,
            messages,
            controller.signal,
          );
        }
        throw new Error(
          `Unknown provider: ${provider}. Reload the Involvex AI extension (v0.6.1+) on the phone.`,
        );
    }
  } finally {
    clearTimeout(timer);
  }
}

/// Fetches the list of available model ids from the provider, when supported.
export async function listModels(settings) {
  const provider = settings.provider;
  const cfg = settings[provider] || {};
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    switch (provider) {
      case "gemini": {
        if (!cfg.apiKey) throw new Error("Set the Gemini API key first.");
        const data = await request(
          `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(cfg.apiKey)}`,
          { method: "GET", signal: controller.signal },
        );
        return (data.models || [])
          .filter((m) =>
            (m.supportedGenerationMethods || []).includes("generateContent"),
          )
          .map((m) => m.name.replace(/^models\//, ""));
      }
      case "openai": {
        if (!cfg.apiKey) throw new Error("Set the OpenAI API key first.");
        const data = await request("https://api.openai.com/v1/models", {
          method: "GET",
          headers: { Authorization: `Bearer ${cfg.apiKey}` },
          signal: controller.signal,
        });
        return (data.data || []).map((m) => m.id).sort();
      }
      case "openrouter": {
        const data = await request(`${baseUrlFor("openrouter", cfg)}/models`, {
          method: "GET",
          signal: controller.signal,
        });
        return (data.data || []).map((m) => m.id).sort();
      }
      case "opencode": {
        const headers = cfg.apiKey
          ? { Authorization: `Bearer ${cfg.apiKey}` }
          : {};
        const data = await request(`${baseUrlFor("opencode", cfg)}/models`, {
          method: "GET",
          headers,
          signal: controller.signal,
        });
        return (data.data || []).map((m) => m.id);
      }
      case "custom": {
        const headers = cfg.apiKey
          ? { Authorization: `Bearer ${cfg.apiKey}` }
          : {};
        const data = await request(`${baseUrlFor("custom", cfg)}/models`, {
          method: "GET",
          headers,
          signal: controller.signal,
        });
        return (data.data || []).map((m) => m.id).sort();
      }
      case "ollama": {
        const data = await request(`${baseUrlFor("ollama", cfg)}/api/tags`, {
          method: "GET",
          signal: controller.signal,
        });
        return (data.models || []).map((m) => m.name).sort();
      }
      case "fastvlm": {
        const data = await request(`${baseUrlFor("fastvlm", cfg)}/models`, {
          method: "GET",
          signal: controller.signal,
        });
        return (data.data || []).map((m) => m.id);
      }
      case "anthropic":
      default:
        return PROVIDERS[provider].knownModels.slice();
    }
  } finally {
    clearTimeout(timer);
  }
}

function splitSystem(messages) {
  const system = messages
    .filter((m) => m.role === "system")
    .map((m) => m.content)
    .join("\n\n");
  const rest = messages.filter((m) => m.role !== "system");
  return { system, rest };
}

async function chatGemini(apiKey, model, messages, signal) {
  if (!apiKey) throw new Error("Gemini API key not set (open Options).");
  const { system, rest } = splitSystem(messages);
  const contents = rest.map((m) => {
    const role = m.role === "assistant" ? "model" : "user";
    if (Array.isArray(m.content)) {
      const parts = [];
      for (const p of m.content) {
        if (p.type === "text") parts.push({ text: p.text });
        else if (p.type === "image_url") {
          const url = p.image_url?.url || "";
          const match = url.match(/^data:([^;]+);base64,(.+)$/s);
          if (match) {
            parts.push({
              inline_data: { mime_type: match[1], data: match[2] },
            });
          }
        }
      }
      return { role, parts };
    }
    return { role, parts: [{ text: m.content }] };
  });
  const body = { contents };
  if (system) body.systemInstruction = { parts: [{ text: system }] };
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/` +
    `${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const data = await request(url, { body, signal });
  const parts = data?.candidates?.[0]?.content?.parts || [];
  return parts
    .map((p) => p.text || "")
    .join("")
    .trim();
}

async function chatOpenAiCompatible(
  url,
  apiKey,
  model,
  messages,
  signal,
  extraHeaders = {},
) {
  const headers = { ...extraHeaders };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  const normalized = messages.map((m) => {
    if (typeof m.content === "string" || Array.isArray(m.content)) return m;
    return { ...m, content: String(m.content) };
  });
  const attempt = (withTemp) =>
    request(url, {
      headers,
      body: {
        model,
        messages: normalized,
        ...(withTemp ? { temperature: 0.3 } : {}),
      },
      signal,
    });
  let data;
  try {
    data = await attempt(true);
  } catch (e) {
    if (
      /^400\b/.test(String((e && e.message) || "")) &&
      isTemperatureError(e.message)
    ) {
      console.warn(
        `[involvex] ${url} rejected temperature, retrying without it`,
      );
      data = await attempt(false);
    } else {
      throw e;
    }
  }
  throwIfPayloadError(data);
  const { content, reasoning } = extractChoiceText(data?.choices?.[0]);
  return (content || reasoning || "").trim();
}

async function chatAnthropic(apiKey, model, messages, signal) {
  if (!apiKey) throw new Error("Anthropic API key not set (open Options).");
  const { system, rest } = splitSystem(messages);
  const body = {
    model,
    max_tokens: 2048,
    messages: rest.map((m) => ({ role: m.role, content: m.content })),
  };
  if (system) body.system = system;
  const data = await request("https://api.anthropic.com/v1/messages", {
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body,
    signal,
  });
  const blocks = data?.content || [];
  return blocks
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("")
    .trim();
}

async function chatOllama(base, model, messages, signal) {
  const ollamaMsgs = messages
    .filter((m) => m.role !== "system")
    .map((m) => {
      if (Array.isArray(m.content)) {
        const text = textFromContent(m.content);
        const imgUrl = extractImageDataUrl(m.content);
        const msg = { role: m.role, content: text };
        if (imgUrl) {
          const match = imgUrl.match(/^data:[^;]+;base64,(.+)$/s);
          if (match) msg.images = [match[1]];
        }
        return msg;
      }
      return { role: m.role, content: m.content };
    });
  const system = messages
    .filter((m) => m.role === "system")
    .map((m) => m.content)
    .join("\n\n");
  const body = { model, messages: ollamaMsgs, stream: false };
  if (system) body.system = system;
  const data = await request(`${base}/api/chat`, { body, signal });
  return (data?.message?.content || "").trim();
}

const STREAMING_PROVIDERS = new Set([
  "gemini",
  "openai",
  "openrouter",
  "opencode",
  "custom",
  "fastvlm",
]);

export function supportsStreaming(provider) {
  return STREAMING_PROVIDERS.has(provider);
}

/// Pulls `{ content, reasoning }` out of an OpenAI-style choice object,
/// covering plain, delta, and reasoning-model shapes
/// (`reasoning_content` for Qwen/DeepSeek via Kilo/OpenRouter, `reasoning`
/// for others). Gateways like Kilo's free tier route to reasoning models
/// that stream thinking with an empty `content`.
export function extractChoiceText(choice) {
  const src = choice?.delta || choice?.message || {};
  const str = (v) => (typeof v === "string" ? v : "");
  const content = str(src.content);
  const reasoning =
    str(src.reasoning_content) ||
    str(src.reasoning) ||
    (Array.isArray(src.reasoning_details)
      ? src.reasoning_details.map((d) => str(d.text) || str(d.content)).join("")
      : "");
  return { content, reasoning };
}

/// Raises when a decoded SSE/JSON payload carries a gateway error object
/// (some gateways answer 200 + `{ error: ... }` instead of a status code).
export function throwIfPayloadError(json, status = 200) {
  const err = json?.error;
  if (err) {
    const msg =
      typeof err === "string"
        ? err
        : err.message || JSON.stringify(err).slice(0, 300);
    throw new Error(`${status} gateway error: ${msg}`.trim());
  }
}

/// Parses an SSE byte stream and invokes `onToken` for each text delta.
/// Reasoning deltas accumulate into `sink.reasoning` (not emitted, so they
/// can't corrupt Agent JSON). Throws on gateway error chunks.
/// Returns the number of content tokens emitted.
async function readOpenAiSse(res, onToken, signal, sink = null) {
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let count = 0;
  const emit = (t) => {
    if (t) {
      count++;
      onToken(t);
    }
  };
  const handleData = (data) => {
    if (data === "[DONE]") return "done";
    const json = JSON.parse(data);
    throwIfPayloadError(json);
    const { content, reasoning } = extractChoiceText(json.choices?.[0]);
    if (content) emit(content);
    else if (reasoning && sink) sink.reasoning += reasoning;
    return "ok";
  };
  while (true) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n");
    buffer = parts.pop() || "";
    for (const line of parts) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const data = trimmed.slice(5).trim();
      try {
        if (handleData(data) === "done") return count;
      } catch (e) {
        // Gateway error chunks must surface, malformed ones are skipped.
        if (e && /gateway error/.test(e.message || "")) throw e;
      }
    }
  }
  // Trailing buffered line without a newline terminator.
  const tail = buffer.trim();
  if (tail.startsWith("data:")) {
    const data = tail.slice(5).trim();
    if (data && data !== "[DONE]") {
      try {
        handleData(data);
      } catch (e) {
        if (e && /gateway error/.test(e.message || "")) throw e;
      }
    }
  }
  return count;
}

async function readGeminiSse(res, onToken, signal) {
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let count = 0;
  while (true) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n");
    buffer = parts.pop() || "";
    for (const line of parts) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const data = trimmed.slice(5).trim();
      try {
        const json = JSON.parse(data);
        const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) {
          count++;
          onToken(text);
        }
      } catch (_) {
        // skip malformed SSE chunks
      }
    }
  }
  return count;
}

async function streamOpenAiCompatible(
  url,
  apiKey,
  model,
  messages,
  signal,
  onToken,
  extraHeaders = {},
) {
  const headers = {
    "Content-Type": "application/json",
    ...extraHeaders,
  };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  const post = (withTemp) =>
    fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model,
        messages,
        ...(withTemp ? { temperature: 0.3 } : {}),
        stream: true,
      }),
      signal,
    });
  let res = await post(true);
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    if (res.status === 400 && isTemperatureError(detail)) {
      // Reasoning models (o-series, gpt-5, some Qwen) reject temperature.
      console.warn(
        `[involvex] ${url} rejected temperature, retrying without it`,
      );
      res = await post(false);
      if (!res.ok) {
        const d2 = await res.text().catch(() => "");
        throw new Error(`${res.status} ${res.statusText} ${d2}`.trim());
      }
    } else {
      throw new Error(`${res.status} ${res.statusText} ${detail}`.trim());
    }
  }
  const contentType = (res.headers?.get?.("content-type") || "").toLowerCase();
  if (
    contentType.includes("application/json") &&
    !contentType.includes("event-stream")
  ) {
    // Server ignored stream:true and returned a single JSON payload
    // (e.g. scripts/fastvlm-bridge.py, some LM Studio / Ollama-compat builds).
    const text = await res.text().catch(() => "");
    try {
      const json = JSON.parse(text);
      throwIfPayloadError(json, res.status);
      const { content, reasoning } = extractChoiceText(json.choices?.[0]);
      const body_text = content || json?.content || "";
      if (typeof body_text === "string" && body_text) {
        onToken(body_text);
        return { reasoning: "" };
      }
      // Reasoning-only reply (Kilo free-tier routing) — surface it rather
      // than returning silence.
      if (reasoning) {
        onToken(reasoning);
        return { reasoning: "" };
      }
      return { reasoning: "" };
    } catch (e) {
      if (e && /gateway error/.test(e.message || "")) throw e;
      throw new Error(
        `[non-sse 200] ${res.status} ${res.statusText} ${text.slice(0, 300).trim()}`,
      );
    }
  }
  const sink = { reasoning: "" };
  await readOpenAiSse(res, onToken, signal, sink);
  return sink;
}

/// Reasoning models reject non-default temperatures (400). Detect that case
/// so callers can retry without the parameter.
export function isTemperatureError(detail) {
  return /temperature|unsupported.*(parameter|value)|reasoning/i.test(
    String(detail || ""),
  );
}

async function streamGemini(apiKey, model, messages, signal, onToken) {
  if (!apiKey) throw new Error("Gemini API key not set (open Options).");
  const { system, rest } = splitSystem(messages);
  const contents = rest.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [
      {
        text:
          typeof m.content === "string"
            ? m.content
            : textFromContent(m.content),
      },
    ],
  }));
  const body = { contents };
  if (system) body.systemInstruction = { parts: [{ text: system }] };
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/` +
    `${encodeURIComponent(model)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`${res.status} ${res.statusText} ${detail}`.trim());
  }
  await readGeminiSse(res, onToken, signal);
}

/// Like `chat`, but calls `onToken(chunk)` as text arrives. Returns the full reply.
export async function chatStream(settings, messages, onToken) {
  const provider = settings.provider;
  const cfg = settings[provider] || {};
  const model = cfg.model || PROVIDERS[provider]?.defaultModel;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  let full = "";
  let reasoningFallback = "";
  const emit = (chunk) => {
    full += chunk;
    onToken(chunk);
  };
  // Reasoning-only replies (Kilo free-tier routing etc.) accumulate here;
  // used as a last-resort answer instead of silence.
  const runStream = async (promise) => {
    const sink = await promise;
    if (sink && sink.reasoning) reasoningFallback += sink.reasoning;
  };
  try {
    switch (provider) {
      case "gemini":
        await streamGemini(
          cfg.apiKey,
          model,
          messages,
          controller.signal,
          emit,
        );
        break;
      case "openai":
        await runStream(
          streamOpenAiCompatible(
            "https://api.openai.com/v1/chat/completions",
            cfg.apiKey,
            model,
            messages,
            controller.signal,
            emit,
          ),
        );
        break;
      case "openrouter":
        await runStream(
          streamOpenAiCompatible(
            `${baseUrlFor("openrouter", cfg)}/chat/completions`,
            cfg.apiKey,
            model,
            messages,
            controller.signal,
            emit,
            {
              "HTTP-Referer": "https://involvex.browser",
              "X-Title": "Involvex AI",
            },
          ),
        );
        break;
      case "opencode":
        await runStream(
          streamOpenAiCompatible(
            `${baseUrlFor("opencode", cfg)}/chat/completions`,
            cfg.apiKey,
            model,
            messages,
            controller.signal,
            emit,
          ),
        );
        break;
      case "custom":
        await runStream(
          streamOpenAiCompatible(
            `${baseUrlFor("custom", cfg)}/chat/completions`,
            cfg.apiKey,
            model,
            messages,
            controller.signal,
            emit,
          ),
        );
        break;
      case "fastvlm":
        await runStream(
          streamOpenAiCompatible(
            `${baseUrlFor("fastvlm", cfg)}/chat/completions`,
            cfg.apiKey,
            model,
            messages,
            controller.signal,
            emit,
          ),
        );
        break;
      default:
        full = await chat(settings, messages);
        if (full) onToken(full);
    }
    if (!full && reasoningFallback.trim()) {
      // Reasoning-only reply (Kilo free-tier routing etc.): the model sent
      // thinking with an empty content field. Surface it instead of silence.
      console.warn(
        `[involvex] ${provider}/${model} returned reasoning-only output, using it as the reply`,
      );
      full = reasoningFallback.trim();
      onToken(full);
    }
    if (!full) {
      // Streaming servers that ignore stream:true yield zero SSE tokens
      // (plain JSON 200 or empty body). Fall back to a single-shot request
      // so Agent mode still gets a usable `raw` instead of "" -> parse error.
      console.warn(
        `[involvex] chatStream got 0 tokens for ${provider}, retrying non-stream chat()`,
      );
      full = await chat(settings, messages);
      if (full) onToken(full);
    }
    return full.trim();
  } finally {
    clearTimeout(timer);
  }
}
