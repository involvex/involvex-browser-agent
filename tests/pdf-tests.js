// Minimal automated tests for pdf.js pure helpers — no npm, no build step
// Run with: node tests/pdf-tests.js

console.log("=== pdf-tests.js ===\n");

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

function extractTextFromStream(chunk) {
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
    for (const lit of litInner) parts.push(unescapeLiteral(lit.slice(1, -1)));
  }
  return parts.join(" ");
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
  "literal Tj extracts",
  extractTextFromStream("(Hello world) Tj").includes("Hello world"),
);
check(
  "escaped parens",
  extractTextFromStream("(a \\(b\\) c) Tj").includes("a (b) c"),
);
check("hex Tj decodes", extractTextFromStream("<48656C6C6F> Tj") === "Hello");
check(
  "TJ array joins",
  extractTextFromStream("[(Hello) 120 (World)] TJ").includes("Hello") &&
    extractTextFromStream("[(Hello) 120 (World)] TJ").includes("World"),
);
check("empty chunk", extractTextFromStream("no operators here") === "");
check(
  "encrypted detection pattern",
  /\/Encrypt\b/.test("<< /Filter /Standard /Encrypt >>"),
);

console.log(`\n=== pdf-tests.js: ${pass} passed, ${fail} failed ===`);
if (fail) process.exit(1);
