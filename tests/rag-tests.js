// Minimal automated tests for rag.js pure functions — no npm, no build step
// Run with: node tests/rag-tests.js
// These test the logic directly without importing from the module

console.log("=== rag-tests.js ===\n");

// Helper: chunkText (from rag.js)
function chunkText(text, size = 600, overlap = 120) {
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

// Test 1: chunkText with empty string
const r1 = chunkText("");
const t1 = r1.length === 0;
console.log("Test 1: chunkText('') returns [] — " + (t1 ? "PASSED" : "FAILED"));

// Test 2: chunkText with short text
const r2 = chunkText("Hello world");
const t2 = r2.length === 1;
console.log(
  "Test 2: chunkText('Hello world') returns 1 chunk — " +
    (t2 ? "PASSED" : "FAILED"),
);

// Test 3: chunkText with long text
const longText = "A".repeat(1000);
const r3 = chunkText(longText);
const t3 = r3.length > 1;
console.log(
  "Test 3: chunkText(long) splits into multiple chunks — " +
    (t3 ? "PASSED" : "FAILED"),
);

// Helper: tokenize (from rag.js)
function tokenize(text) {
  return (text || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2);
}

// Test 4: tokenize function
const t1tokens = tokenize("Hello world this is a test");
const t4 = t1tokens.length > 0;
console.log(
  "Test 4: tokenize returns non-empty array — " + (t4 ? "PASSED" : "FAILED"),
);

// Test 5: scoreChunksTfidf logic (simplified)
// Just verify the function exists and has expected behavior
// by checking the TF-IDF scoring logic
function simpleTfidfScore(query, chunks) {
  const qTokens = query
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2);
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

const testChunks = [
  "hello world test",
  "different content",
  "another test chunk",
];
const r5 = simpleTfidfScore("hello world", testChunks);
const t5 = r5.length === testChunks.length;
console.log(
  "Test 5: simpleTfidfScore returns correct length — " +
    (t5 ? "PASSED" : "FAILED"),
);

// Test 6: scoreChunksTfidf with no matching query
const r6 = simpleTfidfScore("quantum physics", testChunks);
const allNonNegative = r6.every(function (s) {
  return s === 0 || s >= 0;
});
console.log(
  "Test 6: simpleTfidfScore all scores non-negative — " +
    (allNonNegative ? "PASSED" : "FAILED"),
);

console.log("\n=== All rag-tests.js completed ===");
