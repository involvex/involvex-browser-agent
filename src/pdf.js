/// Minimal PDF text extractor — vanilla JS, no dependencies (#48).
/// Handles text-based PDFs (literal + hex Tj/TJ operators, FlateDecode streams).
/// Scanned/encrypted PDFs return { text: "", encrypted } so callers can
/// show an honest fallback instead of hallucinating.
export const PDF_MAX_RAW_CHARS = 50000;

function unescapeLiteral(s) {
  return s
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\\(/g, "(")
    .replace(/\\\)/g, ")")
    .replace(/\\\\/g, "\\");
}

function decodeHex(hex) {
  const clean = hex.replace(/\s+/g, "");
  let out = "";
  for (let i = 0; i + 1 < clean.length; i += 2) {
    const code = parseInt(clean.slice(i, i + 2), 16);
    if (!Number.isNaN(code) && code >= 32) out += String.fromCharCode(code);
    else if (!Number.isNaN(code) && (code === 10 || code === 13)) out += "\n";
  }
  return out;
}

/// Pulls Tj/TJ text from one decoded stream chunk.
export function extractTextFromStream(chunk) {
  const parts = [];
  for (const m of chunk.matchAll(/\((?:\\.|[^\\()])*\)\s*Tj/g)) {
    parts.push(unescapeLiteral(m[0].slice(1, m[0].lastIndexOf(")"))));
  }
  for (const m of chunk.matchAll(/<([0-9a-fA-F\s]+)>\s*Tj/g)) {
    parts.push(decodeHex(m[1]));
  }
  for (const m of chunk.matchAll(/\[(.*?)\]\s*TJ/gs)) {
    const inner = m[1];
    const litInner = inner.match(/\((?:\\.|[^\\()])*\)/g) || [];
    for (const lit of litInner) {
      parts.push(unescapeLiteral(lit.slice(1, -1)));
    }
    const hexInner = inner.match(/<([0-9a-fA-F\s]+)>/g) || [];
    for (const h of hexInner) parts.push(decodeHex(h.slice(1, -1)));
  }
  return parts.join(" ");
}

async function inflateIfNeeded(raw, wasFlate) {
  if (!wasFlate) return raw;
  try {
    if (typeof DecompressionStream === "undefined") return "";
    const ds = new DecompressionStream("deflate");
    const stream = new Blob([raw]).stream().pipeThrough(ds);
    const buf = await new Response(stream).arrayBuffer();
    return new TextDecoder("latin1").decode(buf);
  } catch (_) {
    return "";
  }
}

/// Extracts text from a PDF ArrayBuffer. Returns
/// { text, pages, truncated, encrypted }.
export async function extractPdfText(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const raw = new TextDecoder("latin1").decode(bytes);
  if (!raw.startsWith("%PDF") && !raw.includes("%PDF-")) {
    throw new Error("Not a PDF file.");
  }
  if (/\/Encrypt\b/.test(raw)) {
    return { text: "", pages: 0, truncated: false, encrypted: true };
  }
  const pageMatch = raw.match(/\/Type\s*\/Page[^s]/g);
  const pages = pageMatch ? pageMatch.length : 0;
  const chunks = [];
  for (const m of raw.matchAll(/stream\r?\n([\s\S]*?)endstream/g)) {
    const start = m.index || 0;
    const dictStart = Math.max(0, start - 400);
    const dict = raw.slice(dictStart, start);
    const wasFlate = /\/FlateDecode\b/.test(dict);
    // latin1 decodes 1 char per byte, so char offsets == byte offsets.
    // Trim the trailing CR/LF before "endstream" — it is a delimiter,
    // not content, and breaks Flate inflation.
    const contentStart = start + m[0].indexOf(m[1]);
    let contentEnd = contentStart + m[1].length;
    while (
      contentEnd > contentStart &&
      (bytes[contentEnd - 1] === 0x0a || bytes[contentEnd - 1] === 0x0d)
    ) {
      contentEnd--;
    }
    const chunk = wasFlate
      ? await inflateIfNeeded(bytes.subarray(contentStart, contentEnd), true)
      : m[1];
    if (chunk) {
      const text = extractTextFromStream(chunk);
      if (text) chunks.push(text);
    }
  }
  // Fallback: some producers emit Tj outside stream wrappers — scan raw once.
  if (!chunks.length) {
    const fallback = extractTextFromStream(raw.slice(0, 200000));
    if (fallback) chunks.push(fallback);
  }
  let text = chunks
    .join("\n")
    .replace(/[^\S\n]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  let truncated = false;
  if (text.length > PDF_MAX_RAW_CHARS) {
    text = text.slice(0, PDF_MAX_RAW_CHARS);
    truncated = true;
  }
  return { text, pages, truncated, encrypted: false };
}
