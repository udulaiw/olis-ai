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

const ROOT = process.cwd();
const KB_DIR = join(ROOT, "knowledge");
const OUT_DIR = join(ROOT, "server", "generated");
const OUT = join(OUT_DIR, "index.json");

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
    if (statSync(p).isDirectory()) return walk(p);
    return [".md", ".txt", ".markdown"].includes(extname(name).toLowerCase()) && name.toLowerCase() !== "readme.md" ? [p] : [];
  });
}

const files = walk(KB_DIR);
const chunks = [];
for (const file of files) {
  const raw = readFileSync(file, "utf8");
  const { meta, body } = parseFrontmatter(raw);
  const rel = relative(ROOT, file).replace(/\\/g, "/");
  const title = meta.title || body.match(/^#\s+(.+)/m)?.[1]?.trim() || basename(file, extname(file)).replace(/[-_]/g, " ");
  const subject = meta.subject || rel.split("/")[1]?.replace(/-/g, " ") || "General";
  for (const c of chunkDocument(body, { title })) {
    chunks.push({
      id: createHash("sha1").update(rel + c.heading + c.text).digest("hex").slice(0, 12),
      title,
      heading: c.heading,
      subject,
      source: meta.source || "OLIS knowledge base",
      url: meta.url || null,
      path: rel,
      text: c.text,
    });
  }
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
  JSON.stringify({ version: 1, builtAt: new Date().toISOString(), embedModel, dims: vectors ? DIMS : 0, files: files.length, chunks, vectors }),
);
console.log(`OLIS index: ${files.length} files → ${chunks.length} chunks → ${relative(ROOT, OUT)}${vectors ? " (with embeddings)" : ""}`);
