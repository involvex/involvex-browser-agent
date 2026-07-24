const CHUNK_SIZE = 600;
const CHUNK_OVERLAP = 120;
const DEFAULT_TOP_K = 5;

/// Splits page text into overlapping chunks for retrieval.
export function chunkText(text, size = CHUNK_SIZE, overlap = CHUNK_OVERLAP) {
  const clean = (text || "").replace(/\s+/g, " ").trim();
  if (!clean) return [];
  if (clean.length <= size) return [clean];
  const chunks = [];
  let start = 0;
  while (start < clean.length) {
    chunks.push(clean.slice(start, start + size));
    if (start + size >= clean.length) break;
    start += size - overlap;
  }
  return chunks;
}

function tokenize(text) {
  return (text || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2);
}

/// Lightweight TF-IDF cosine similarity — no network, runs in the extension.
function scoreChunksTfidf(query, chunks) {
  const qTokens = tokenize(query);
  if (!qTokens.length || !chunks.length) return chunks.map(() => 0);
  const docFreq = new Map();
  const chunkTokens = chunks.map((c) => {
    const tokens = tokenize(c);
    const seen = new Set(tokens);
    for (const t of seen) docFreq.set(t, (docFreq.get(t) || 0) + 1);
    return tokens;
  });
  const n = chunks.length;
  const qCounts = new Map();
  for (const t of qTokens) qCounts.set(t, (qCounts.get(t) || 0) + 1);

  return chunkTokens.map((tokens) => {
    const tf = new Map();
    for (const t of tokens) tf.set(t, (tf.get(t) || 0) + 1);
    let dot = 0;
    let qNorm = 0;
    let dNorm = 0;
    for (const [term, qf] of qCounts) {
      const idf = Math.log(1 + n / (1 + (docFreq.get(term) || 0)));
      const qW = qf * idf;
      qNorm += qW * qW;
      const df = (tf.get(term) || 0) * idf;
      dot += qW * df;
      dNorm += df * df;
    }
    if (!qNorm || !dNorm) return 0;
    return dot / (Math.sqrt(qNorm) * Math.sqrt(dNorm));
  });
}

async function embedOllama(baseUrl, model, text) {
  const res = await fetch(`${baseUrl.replace(/\/$/, "")}/api/embeddings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, prompt: text }),
  });
  if (!res.ok) throw new Error(`Ollama embed ${res.status}`);
  const data = await res.json();
  return data.embedding || [];
}

function cosine(a, b) {
  if (!a.length || a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (!na || !nb) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

async function scoreChunksEmbeddings(query, chunks, ollamaBase, embedModel) {
  const qVec = await embedOllama(ollamaBase, embedModel, query);
  const scores = [];
  for (const chunk of chunks) {
    const cVec = await embedOllama(ollamaBase, embedModel, chunk);
    scores.push(cosine(qVec, cVec));
  }
  return scores;
}

/// Returns the top-k most relevant text chunks for a query.
export async function retrieveRelevantChunks(
  query,
  pageText,
  { topK = DEFAULT_TOP_K, useEmbeddings = false, ollamaBase = "", embedModel = "nomic-embed-text" } = {},
) {
  const chunks = chunkText(pageText);
  if (!chunks.length) return [];
  if (chunks.length <= topK) return chunks;

  let scores;
  if (useEmbeddings && ollamaBase) {
    try {
      scores = await scoreChunksEmbeddings(query, chunks, ollamaBase, embedModel);
    } catch (_) {
      scores = scoreChunksTfidf(query, chunks);
    }
  } else {
    scores = scoreChunksTfidf(query, chunks);
  }

  return chunks
    .map((text, i) => ({ text, score: scores[i] }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map((x) => x.text);
}

/// Builds page context for the system prompt — full text or RAG excerpts.
export async function buildPageContext(query, page, ragOptions) {
  if (!page?.text) return "(No page content is available for the current tab.)";
  const useRag = ragOptions?.enabled && page.text.length > 3500;
  if (!useRag) {
    return `PAGE TITLE: ${page.title}\nURL: ${page.url}\n\nPAGE CONTENT:\n${page.text}`;
  }
  const excerpts = await retrieveRelevantChunks(query, page.text, ragOptions);
  const body = excerpts.length
    ? excerpts.map((e, i) => `[${i + 1}] ${e}`).join("\n\n")
    : page.text.slice(0, 8000);
  return (
    `PAGE TITLE: ${page.title}\nURL: ${page.url}\n\n` +
    `(RAG: ${excerpts.length} relevant excerpts from a ${page.text.length}-char page)\n\n` +
    `RELEVANT EXCERPTS:\n${body}`
  );
}
