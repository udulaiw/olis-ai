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
  /** G.C.E. Ordinary or Advanced Level. Absent = not specified (shown to both levels, ranked lower). */
  level?: "OL" | "AL";
  grade?: string;
  /** Source priority 1 (official syllabus) … 7 (general). See knowledge/README.md. */
  tier?: number;
  /** Page range in the source document, e.g. "12-14" (from [p.N] markers added by scripts/ingest.mjs). */
  pages?: string;
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

// Words that describe the TASK, not the topic ("marks allocated to question 4 of the 2019 paper"). They appear in
// exam-tip notes everywhere, so matching them says nothing about whether the KB covers the topic.
const EXAM_META = new Set(
  "mark marks marking scheme question paper exam examination answer allocated allocate allocation year total number past model test give write state find calculate show use using used example define definition explain describe meaning mean means related following given term step question".split(" "),
);

let cache: Loaded | null = null;

/** Tests only: drop the cached index so OLIS_INDEX_PATH can point somewhere else. */
export function _resetIndex() {
  cache = null;
}

export function loadIndex(): Loaded {
  if (cache) return cache;
  const p = process.env.OLIS_INDEX_PATH || join(process.cwd(), "server", "generated", "index.json");
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

/** Damerau–Levenshtein distance with an early exit (max ≤ 2). */
function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  return d[a.length][b.length];
}

/**
 * Typo tolerance for words the knowledge base has never seen ("difrentiation",
 * "secnd"). Replaces a Latin word with the closest known word only when the match
 * is unambiguous: distance 1 for 5–8 letters, 2 for 9+; shorter words are left alone.
 */
function correctTypos(idx: Loaded, terms: string[]): string[] {
  const vocab = [...idx.df.keys()].filter((t) => /^[a-z]+$/.test(t));
  return terms.map((t) => {
    if ((idx.df.get(t) ?? 0) > 0 || !/^[a-z]{5,}$/.test(t)) return t;
    const max = t.length >= 9 ? 2 : 1;
    let best: string | null = null;
    let bestD = max + 1;
    let bestDf = 0;
    let tie = false;
    for (const v of vocab) {
      const dist = editDistance(t, v, max);
      if (dist > max) continue;
      const df = idx.df.get(v) ?? 0;
      // closest word wins; between equally close words ("secnd" → second / send) the one the KB uses more wins; still equal → leave the word alone
      if (dist < bestD || (dist === bestD && df > bestDf)) ((best = v), (bestD = dist), (bestDf = df), (tie = false));
      else if (dist === bestD && df === bestDf) tie = true;
    }
    return best && !tie ? best : t;
  });
}

function bm25(idx: Loaded, query: string): { i: number; score: number }[] {
  const all = Array.from(new Set(correctTypos(idx, tokenize(query))));
  // Task words ("meaning", "definition", "marks") are in every exam-tip note and only dilute ranking: drop them unless nothing else is left
  const topical = all.filter((t) => !EXAM_META.has(t));
  const q = topical.length ? topical : all;
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
  /** Share (0–1) of the query's KNOWN content words (weighted by rarity) found in this chunk. */
  coverage: number;
  /** How many topical query words (not task words like "marks"/"question") this chunk contains. 0 = only generic words matched. */
  distinctive: number;
  /** Share (0–1) of the query's weight carried by Latin words the knowledge base has never seen. */
  unknownShare: number;
  semScore?: number;
}

export type Grounding = "strong" | "weak" | "none";

/**
 * Tuning knob: if at least this share of the question's weight is vocabulary the KB has never seen,
 * the few words that did match are treated as incidental and grounding = "none".
 * Lower = more cautious (more "I couldn't confirm this"), higher = more willing to use partial matches.
 */
export const GROUND_NONE_UNKNOWN = 0.4;



/** A hit only counts as evidence if it matched a topic-identifying word, or is a strong semantic match. */
export const isRelevant = (h: Hit) => h.distinctive > 0 || (h.semScore ?? 0) >= 0.62;
export const relevantHits = (hits: Hit[]) => hits.filter(isRelevant);

/**
 * How well did the knowledge base answer this? Drives the "say you're unsure"
 * behaviour: strong → answer from the excerpts, weak → answer but flag what is
 * not confirmed, none → don't present syllabus-specific claims as fact.
 *
 * "Marks allocated to question 4 of the 2019 History paper" matches "marks",
 * "question" and "paper" in unrelated Exam-tips notes, but none of the words
 * that identify the topic ("history", "2019") exist in the KB: grounding = none.
 */
export function groundingOf(hits: Hit[]): Grounding {
  const good = relevantHits(hits);
  if (!good.length) return "none";
  const top = good[0];
  if ((top.semScore ?? 0) >= 0.72) return "strong";
  // Most of what the student asked about is vocabulary the KB has never seen ("FIFA", "Kandyan Convention"): the few words that did match are incidental
  if (top.unknownShare >= GROUND_NONE_UNKNOWN) return "none";
  return top.coverage >= 0.6 && top.unknownShare < 0.34 ? "strong" : "weak";
}

/** Search the knowledge base. Semantic search is used when available; failures fall back to keywords. */
export async function searchKnowledge(
  cfg: Config,
  query: string,
  opts: { k?: number; subject?: string; signal?: AbortSignal; types?: ChunkType[]; year?: string; level?: "OL" | "AL" | null } = {},
): Promise<Hit[]> {
  const idx = loadIndex();
  if (!idx.chunks.length) return [];
  const k = opts.k ?? 4;
  // Type/year filters (e.g. only past papers). Old v1 chunks have no type → "notes".
  const allowed = (i: number) => {
    const c = idx.chunks[i];
    if (opts.types && !opts.types.includes(c.type ?? "notes")) return false;
    if (opts.year && c.year !== opts.year) return false;
    // Level is a hard filter ONLY when the chunk declares one: O/L notes never answer an A/L student and vice versa
    if (opts.level && c.level && c.level !== opts.level) return false;
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

  // Per-term evidence: how rare is each query word in this knowledge base?
  const N = idx.chunks.length;
  const idfOf = (t: string) => {
    const n = idx.df.get(t) ?? 0;
    return Math.log(1 + (N - n + 0.5) / (n + 0.5));
  };
  const isSi = (t: string) => /[\u0D80-\u0DFF]/.test(t);
  const qAll = Array.from(new Set(correctTypos(idx, tokenize(query)))).filter((t) => !EXAM_META.has(t) && !/^\d+$/.test(t)); // evidence of TOPIC only; BM25 below still uses every word
  // A script the KB doesn't contain (Sinhala words, while the notes are English) is not evidence of absence: ignore those words
  const qTerms = qAll.filter((t) => (idx.df.get(t) ?? 0) > 0 || !isSi(t));
  const known = qTerms.filter((t) => (idx.df.get(t) ?? 0) > 0);
  const unknownW = qTerms.filter((t) => !(idx.df.get(t) ?? 0)).reduce((a, t) => a + idfOf(t), 0);
  const knownW = known.reduce((a, t) => a + idfOf(t), 0);
  const unknownShare = unknownW + knownW ? unknownW / (unknownW + knownW) : 0;
  const coverageOf = (i: number) => (knownW ? known.filter((t) => idx.tf[i].has(t)).reduce((a, t) => a + idfOf(t), 0) / knownW : 0);
  // "Topical" = a known, non-task word of the question that this chunk actually contains
  const distinctiveOf = (i: number) => known.filter((t) => idx.tf[i].has(t)).length;

  return [...fused.entries()]
    // Keep a hit if keyword search agrees, or if it's a strong semantic match on its own
    .filter(([i, v]) => (kwScore.get(i) ?? 0) >= minKw || (v.sem && (semScore.get(i) ?? 0) >= 0.62))
    .map(([i, v]) => {
      const c = idx.chunks[i];
      const tier = c.tier ?? (c.type === "syllabus" ? 1 : c.type === "marking_scheme" ? 4 : c.type === "past_paper" ? 3 : 6);
      return {
        i,
        ...v,
        // Soft boosts, never filters: the student's subject, an exact level match, and source priority (tier 1 = official)
        score:
          v.score +
          (opts.subject && c.subject.toLowerCase() === opts.subject.toLowerCase() ? 0.002 : 0) +
          (opts.level && c.level === opts.level ? 0.001 : 0) +
          (7 - tier) * 0.0003,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
    .map((h) => ({
      chunk: idx.chunks[h.i],
      score: h.score,
      via: h.sem && h.kw ? ("semantic+keyword" as const) : h.sem ? ("semantic" as const) : ("keyword" as const),
      coverage: coverageOf(h.i),
      distinctive: distinctiveOf(h.i),
      unknownShare,
      semScore: semScore.get(h.i),
    }));
}

export function indexStats() {
  const idx = loadIndex();
  const pastPaperChunks = idx.chunks.filter((c) => c.type === "past_paper" || c.type === "marking_scheme").length;
  return { files: idx.files, chunks: idx.chunks.length, pastPaperChunks, semantic: Boolean(idx.vectors), builtAt: idx.builtAt || null };
}
