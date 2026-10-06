#!/usr/bin/env node
// ─────────────────────────────────────────────
// OLIS knowledge-base indexer (runs at build time on Vercel).
//
//   knowledge/**/*.md|.txt  →  server/generated/index.json
//
// 1. Chunks every document (heading-aware).
// 2. If GEMINI_API_KEY is set, embeds each chunk with Gemini's free
//    embedding model for semantic search. If it isn't (or the quota is hit),
//    the index still builds and OLIS falls back to keyword (BM25) search.
//
// Usage: node scripts/build-index.mjs
// ─────────────────────────────────────────────
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative, extname, basename } from "node:path";
import { createHash } from "node:crypto";
import { chunkDocument, parseFrontmatter } from "../server/text.mjs";
import { cleanSinhala, repairMojibake, scanText, scriptStats } from "../server/lang/unicode.mjs";

const ROOT = process.cwd();
const KB_DIR = process.env.OLIS_KB_DIR ? join(ROOT, process.env.OLIS_KB_DIR) : join(ROOT, "knowledge");
const OUT = process.env.OLIS_INDEX_OUT ? join(ROOT, process.env.OLIS_INDEX_OUT) : join(ROOT, "server", "generated", "index.json");
const OUT_DIR = join(OUT, "..");

// Load .env.local for local runs (Vercel injects env vars itself)
for (const f of [".env.local", ".env"]) {
  const p = join(ROOT, f);
  if (!existsSync(p)) continue;
  for (const line of readFileSync(p, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const KEY = process.env.GEMINI_API_KEY || "";
const BASE = (process.env.GEMINI_BASE_URL || "https://generativelanguage.googleapis.com/v1beta").replace(/\/$/, "");
const EMBED_MODEL = process.env.GEMINI_EMBED_MODEL || "gemini-embedding-001";
const DIMS = 768;

function walk(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return name.startsWith("_") ? [] : walk(p);
    // README files and anything starting with "_" (templates, drafts) are not indexed
    return [".md", ".txt", ".markdown"].includes(extname(name).toLowerCase()) && name.toLowerCase() !== "readme.md" && !name.startsWith("_") ? [p] : [];
  });
}

const TYPES = new Set(["notes", "syllabus", "past_paper", "marking_scheme", "resource"]);
const pick = (o, keys) => Object.fromEntries(keys.filter((k) => o[k]).map((k) => [k, o[k]]));

const LEVELS = { ol: "OL", "o/l": "OL", "o-l": "OL", ordinary: "OL", al: "AL", "a/l": "AL", "a-l": "AL", advanced: "AL" };
const levelOf = (meta, rel) => LEVELS[(meta.level ?? "").toLowerCase()] ?? (/\/(ol|o-l)\//.test(rel.toLowerCase()) ? "OL" : /\/(al|a-l)\//.test(rel.toLowerCase()) ? "AL" : undefined);
const DEFAULT_TIER = { syllabus: 1, past_paper: 3, marking_scheme: 4, notes: 6, resource: 6 };
const langOf = (text) => {
  const st = scriptStats(text);
  const sin = st.sinhala / Math.max(1, st.sinhala + st.latin);
  return sin > 0.6 ? "si" : sin > 0.05 ? "mixed" : st.tamil > st.latin ? "ta" : "en";
};
// "[p.12]" markers (added by scripts/ingest.mjs) → page range of a chunk
const pagesOf = (text) => {
  const n = [...text.matchAll(/\[p\.(\d+)\]/g)].map((m) => +m[1]);
  return n.length ? (Math.min(...n) === Math.max(...n) ? String(n[0]) : `${Math.min(...n)}-${Math.max(...n)}`) : undefined;
};

const files = walk(KB_DIR);
const chunks = [];
const problems = [];
for (const file of files) {
  let raw = readFileSync(file, "utf8");
  const rel = relative(ROOT, file).replace(/\\/g, "/");
  // Unicode hygiene: reverse UTF-8-read-as-Latin-1, then NFC. Anything we can't fix losslessly is reported, not deleted.
  const fixed = repairMojibake(raw);
  if (fixed.repaired) problems.push(`${rel}: repaired mojibake`);
  raw = cleanSinhala(fixed.text);
  const { meta, body } = parseFrontmatter(raw);
  for (const issue of scanText(body, meta.language === "si" ? "si" : "any")) problems.push(`${rel}: ${issue.code} (${issue.detail})`);
  const title = meta.title || body.match(/^#\s+(.+)/m)?.[1]?.trim() || basename(file, extname(file)).replace(/[-_]/g, " ");
  const relKb = relative(KB_DIR, file).replace(/\\/g, "/"); // path inside the knowledge folder
  const folder = relKb.split("/")[0] ?? "";
  // knowledge/ol/<subject>/… and knowledge/al/<subject>/… are optional level folders; strip them when working out type/subject
  const parts = relKb.split("/");
  if (/^(ol|al|o-l|a-l)$/i.test(parts[0] ?? "")) parts.shift();
  const top = parts[0] ?? folder;
  // Past papers / syllabus live in their own folders; their subject comes from frontmatter
  const type = TYPES.has(meta.type) ? meta.type : top === "past-papers" ? "past_paper" : top === "syllabus" ? "syllabus" : "notes";
  const subject = meta.subject || (["past-papers", "syllabus"].includes(top) ? parts[1]?.replace(/-/g, " ") : top.replace(/-/g, " ")) || "General";
  const level = levelOf(meta, `/${relKb}`);
  const tier = Math.min(7, Math.max(1, parseInt(meta.tier) || DEFAULT_TIER[type] || 6));
  if (type === "past_paper" && !meta.year) console.warn(`  ⚠ ${rel}: past paper without "year:" in its frontmatter`);
  for (const c of chunkDocument(body, { title })) {
    chunks.push({
      id: createHash("sha1").update(rel + c.heading + c.text).digest("hex").slice(0, 12),
      title,
      heading: c.heading,
      subject,
      source: meta.source || "OLIS knowledge base",
      url: meta.url || null,
      path: rel,
      text: c.text.replace(/\[p\.\d+\] ?/g, ""), // page markers are metadata (chunk.pages), not text the model should see or confuse with [n] citations
      // Optional structure (see knowledge/README.md). Absent fields are omitted.
      ...pick(meta, ["unit", "year", "paper", "question", "question_type", "difficulty", "marks", "grade", "form", "author", "work", "chapter", "theme", "device", "syllabus_year", "exam_year"]),
      language: meta.language || langOf(c.text),
      type,
      tier,
      ...(level ? { level } : {}),
      ...(pagesOf(c.text) ? { pages: pagesOf(c.text) } : {}),
      verified: meta.verified === "true",
    });
  }
}
if (problems.length) {
  console.warn(`OLIS index: ⚠ ${problems.length} text problem(s) (nothing was deleted; fix the source files):`);
  for (const p of problems.slice(0, 40)) console.warn(`  - ${p}`);
}

const normalize = (v) => {
  const n = Math.sqrt(v.reduce((a, x) => a + x * x, 0)) || 1;
  return v.map((x) => Math.round((x / n) * 10000) / 10000);
};

async function embedAll(texts) {
  const vectors = [];
  for (let i = 0; i < texts.length; i += 90) {
    const batch = texts.slice(i, i + 90);
    let attempt = 0;
    for (;;) {
      const res = await fetch(`${BASE}/models/${EMBED_MODEL}:batchEmbedContents`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": KEY },
        body: JSON.stringify({
          requests: batch.map((text) => ({
            model: `models/${EMBED_MODEL}`,
            content: { parts: [{ text }] },
            taskType: "RETRIEVAL_DOCUMENT",
            outputDimensionality: DIMS,
          })),
        }),
      });
      if (res.status === 429 && attempt < 4) {
        attempt++;
        const wait = 5000 * attempt;
        console.log(`  embedding quota hit, retrying in ${wait / 1000}s…`);
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }
      if (!res.ok) throw new Error(`embedding failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
      const data = await res.json();
      for (const e of data.embeddings ?? []) vectors.push(normalize(e.values));
      break;
    }
    console.log(`  embedded ${Math.min(i + 90, texts.length)}/${texts.length}`);
  }
  if (vectors.length !== texts.length) throw new Error("embedding count mismatch");
  return vectors;
}

let vectors = null;
let embedModel = null;
if (!KEY) {
  console.log("OLIS index: GEMINI_API_KEY not set, so building keyword-only index (semantic search disabled).");
} else if (chunks.length) {
  try {
    console.log(`OLIS index: embedding ${chunks.length} chunks with ${EMBED_MODEL}…`);
    vectors = await embedAll(chunks.map((c) => c.text));
    embedModel = EMBED_MODEL;
  } catch (e) {
    console.warn(`OLIS index: ⚠ embeddings skipped (${e.message}). Falling back to keyword search.`);
  }
}

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(
  OUT,
  JSON.stringify({ version: 2, builtAt: new Date().toISOString(), embedModel, dims: vectors ? DIMS : 0, files: files.length, chunks, vectors }),
);
console.log(`OLIS index: ${files.length} files → ${chunks.length} chunks → ${relative(ROOT, OUT)}${vectors ? " (with embeddings)" : ""}`);
