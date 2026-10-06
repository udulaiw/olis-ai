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
import { embedSettings, embeddingsConfigured, embedTexts } from "../server/embeddings.mjs";

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

const EMB = embedSettings();

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
      ...pick(meta, ["unit", "topic", "lesson", "exam", "section", "year", "paper", "question", "question_type", "difficulty", "marks", "grade", "form", "author", "work", "chapter", "theme", "device", "syllabus_year", "exam_year"]),
      // A past paper with several questions in one file: the chunker knows which question each chunk holds
      ...(!meta.question && c.question && (type === "past_paper" || type === "marking_scheme") ? { question: c.question } : {}),
      language: meta.language || langOf(c.text),
      type,
      tier,
      ...(level ? { level } : {}),
      ...((c.pages ?? pagesOf(c.text)) ? { pages: c.pages ?? pagesOf(c.text) } : {}),
      verified: meta.verified === "true",
    });
  }
}
if (problems.length) {
  console.warn(`OLIS index: ⚠ ${problems.length} text problem(s) (nothing was deleted; fix the source files):`);
  for (const p of problems.slice(0, 40)) console.warn(`  - ${p}`);
}

let vectors = null;
let embedModel = null;
if (!embeddingsConfigured(EMB)) {
  console.log(`OLIS index: no ${EMB.provider === "tei" ? "EMBED_URL" : "GEMINI_API_KEY"} set, so building a keyword-only index (semantic search disabled).`);
} else if (chunks.length) {
  try {
    console.log(`OLIS index: embedding ${chunks.length} chunks with ${EMB.provider}:${EMB.model}…`);
    vectors = await embedTexts(chunks.map((c) => c.text), { kind: "document", settings: EMB, onProgress: (n) => console.log(`  embedded ${n}/${chunks.length}`) });
    embedModel = EMB.model;
  } catch (e) {
    console.warn(`OLIS index: ⚠ embeddings skipped (${e.message}). Falling back to keyword search.`);
  }
}

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(
  OUT,
  JSON.stringify({ version: 2, builtAt: new Date().toISOString(), embedProvider: vectors ? EMB.provider : null, embedModel, dims: vectors ? EMB.dims : 0, files: files.length, chunks, vectors }),
);
console.log(`OLIS index: ${files.length} files → ${chunks.length} chunks → ${relative(ROOT, OUT)}${vectors ? " (with embeddings)" : ""}`);
