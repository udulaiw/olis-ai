// Hybrid retrieval over the OLIS knowledge base:
//   BM25 keyword search (always available)
// + Gemini embeddings cosine similarity (when the index has vectors)
// fused with Reciprocal Rank Fusion.
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tokenize } from "./text.mjs";
import { embedQuery } from "./gemini.js";
import type { Config } from "./config.js";
import { embeddingAllowed } from "./ai/policy.js";

export interface Chunk {
  id: string;
  title: string;
  heading: string;
  subject: string;
  source: string;
  url: string | null;
  path: string;
  text: string;
  /** v2 index metadata (optional; see knowledge/README.md) */
  type?: "notes" | "syllabus" | "past_paper" | "marking_scheme" | "resource";
  unit?: string;
  year?: string;
  paper?: string;
  question?: string;
  difficulty?: string;
  language?: string;
  marks?: string;
  question_type?: string;
  verified?: boolean;
}
export type ChunkType = NonNullable<Chunk["type"]>;
interface IndexFile {
  version: number;
  builtAt: string;
  embedModel: string | null;
  dims: number;
  files: number;
  chunks: Chunk[];
  vectors: number[][] | null;
}
interface Loaded extends IndexFile {
  tf: Map<string, number>[];
  len: number[];
  df: Map<string, number>;
  avgdl: number;
}

let cache: Loaded | null = null;

export function loadIndex(): Loaded {
  if (cache) return cache;
  const p = join(process.cwd(), "server", "generated", "index.json");
  const idx: IndexFile = existsSync(p)
    ? JSON.parse(readFileSync(p, "utf8"))
    : { version: 1, builtAt: "", embedModel: null, dims: 0, files: 0, chunks: [], vectors: null };
  const tf: Map<string, number>[] = [];
  const len: number[] = [];
  const df = new Map<string, number>();
  for (const c of idx.chunks) {
    const toks = tokenize(c.text + " " + c.title + " " + c.title); // title weighted
    const m = new Map<string, number>();
    for (const t of toks) m.set(t, (m.get(t) ?? 0) + 1);
    tf.push(m);
    len.push(toks.length);
    for (const t of m.keys()) df.set(t, (df.get(t) ?? 0) + 1);
  }
  const avgdl = len.reduce((a, b) => a + b, 0) / Math.max(1, len.length);
  cache = { ...idx, tf, len, df, avgdl };
  return cache;
}

function bm25(idx: Loaded, query: string): { i: number; score: number }[] {
  const q = Array.from(new Set(tokenize(query)));
  const N = idx.chunks.length;
  const k1 = 1.4;
  const b = 0.75;
  const out: { i: number; score: number }[] = [];
  for (let i = 0; i < N; i++) {
    let s = 0;
    for (const t of q) {
      const f = idx.tf[i].get(t);
      if (!f) continue;
      const n = idx.df.get(t) ?? 0;
      const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5));
      s += idf * ((f * (k1 + 1)) / (f + k1 * (1 - b + (b * idx.len[i]) / idx.avgdl)));
    }
    if (s > 0) out.push({ i, score: s });
  }
  return out.sort((a, b2) => b2.score - a.score);
}

function cosineRank(idx: Loaded, qv: number[]): { i: number; score: number }[] {
  const vs = idx.vectors!;
  return vs
    .map((v, i) => {
      let s = 0;
      for (let k = 0; k < v.length; k++) s += v[k] * qv[k];
      return { i, score: s };
    })
    .sort((a, b) => b.score - a.score);
}

export interface Hit {
  chunk: Chunk;
  score: number;
  via: "semantic+keyword" | "semantic" | "keyword";
}

/** Search the knowledge base. Semantic search is used when available; failures fall back to keywords. */
export async function searchKnowledge(
  cfg: Config,
  query: string,
  opts: { k?: number; subject?: string; signal?: AbortSignal; types?: ChunkType[]; year?: string } = {},
): Promise<Hit[]> {
  const idx = loadIndex();
  if (!idx.chunks.length) return [];
  const k = opts.k ?? 4;
  // Type/year filters (e.g. only past papers). Old v1 chunks have no type → "notes".
  const allowed = (i: number) => {
    const c = idx.chunks[i];
    if (opts.types && !opts.types.includes(c.type ?? "notes")) return false;
    if (opts.year && c.year !== opts.year) return false;
    return true;
  };
  const kw = bm25(idx, query).filter((h) => allowed(h.i)).slice(0, 20);

  let sem: { i: number; score: number }[] = [];
  if (idx.vectors && idx.dims && cfg.geminiKey && embeddingAllowed(cfg.embedModel)) {
    try {
      const qv = await embedQuery(cfg, query, idx.dims, opts.signal);
      sem = cosineRank(idx, qv).filter((h) => allowed(h.i)).slice(0, 20).filter((h) => h.score > 0.5);
    } catch {
      sem = []; // quota / network: keyword search still works
    }
  }

  // Reciprocal Rank Fusion
  const fused = new Map<number, { score: number; kw: boolean; sem: boolean }>();
  kw.forEach((h, r) => fused.set(h.i, { score: 1 / (60 + r), kw: true, sem: false }));
  sem.forEach((h, r) => {
    const cur = fused.get(h.i) ?? { score: 0, kw: false, sem: false };
    fused.set(h.i, { score: cur.score + 1 / (60 + r) + (h.score > 0.7 ? 0.01 : 0), kw: cur.kw, sem: true });
  });

  // Keyword-only: require a meaningful BM25 score so greetings don't pull random notes
  const minKw = kw.length ? Math.max(1.5, kw[0].score * 0.35) : Infinity;
  const kwScore = new Map(kw.map((h) => [h.i, h.score]));
  const semScore = new Map(sem.map((h) => [h.i, h.score]));

  return [...fused.entries()]
    // Keep a hit if keyword search agrees, or if it's a strong semantic match on its own
    .filter(([i, v]) => (kwScore.get(i) ?? 0) >= minKw || (v.sem && (semScore.get(i) ?? 0) >= 0.62))
    .map(([i, v]) => ({
      i,
      ...v,
      // Gentle boost for the student's current subject (never a hard filter)
      score: v.score + (opts.subject && idx.chunks[i].subject.toLowerCase() === opts.subject.toLowerCase() ? 0.002 : 0),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
    .map((h) => ({
      chunk: idx.chunks[h.i],
      score: h.score,
      via: h.sem && h.kw ? "semantic+keyword" : h.sem ? "semantic" : "keyword",
    }));
}

export function indexStats() {
  const idx = loadIndex();
  const pastPaperChunks = idx.chunks.filter((c) => c.type === "past_paper" || c.type === "marking_scheme").length;
  return { files: idx.files, chunks: idx.chunks.length, pastPaperChunks, semantic: Boolean(idx.vectors), builtAt: idx.builtAt || null };
}
