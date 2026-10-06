// ─────────────────────────────────────────────
// Second-stage reranking for OLIS retrieval.
//
// First stage (server/rag.ts, server/docs/retrieve.ts) finds ~12 candidates
// with BM25 + embeddings. This stage reorders them:
//
//   1. Cross-encoder (optional): BAAI/bge-reranker-v2-m3 (Apache-2.0, multilingual,
//      incl. Sinhala/Tamil) served by Hugging Face text-embeddings-inference (TEI)
//      on a separate machine. Set RERANKER_URL to its base URL. Vercel functions
//      can't host a 0.6B model, so OLIS never tries to run it in-process.
//   2. Exact-evidence signals (always, free, deterministic): the things BM25 and
//      embeddings are bad at in exam material:
//        - formulas / chemical formulae / units typed exactly ("H2SO4", "v=fλ", "m/s²")
//        - question numbers and exam years ("Q5", "question 5", "2019")
//        - quoted phrases ("define \"specific heat capacity\"")
//        - adjacent word pairs (phrases) shared with the query
//      plus a near-duplicate penalty so the top-k isn't three copies of one note.
//
// If the cross-encoder is slow or down, OLIS silently uses the signals alone.
// ─────────────────────────────────────────────
import { tokenize } from "./text.mjs";

export interface RerankCandidate {
  /** Anything the caller uses to map results back. */
  id: number;
  text: string;
  /** First-stage score (any scale; only the order matters). */
  score: number;
  /** Optional structured fields that can match a question number / year exactly. */
  question?: string;
  year?: string;
}

export interface RerankResult {
  id: number;
  score: number;
  /** Which signals moved this candidate (for logs / evaluation). */
  why: string[];
}

const env = (k: string) => (process.env[k] || "").trim();

/** Formula-like tokens: letters and digits mixed (H2SO4, CO2, x2), or containing = ^ / λ etc. */
export function formulaTokens(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(/[A-Za-z]{0,3}\d*(?:[A-Z][a-z]?\d+)+[A-Za-z0-9]*|[A-Za-zα-ωΑ-Ω]+\s*=\s*[A-Za-zα-ωΑ-Ω0-9^*/+\-.() ]{1,20}|\b[a-zA-Z]+\/[a-zA-Z]+[²³]?|\b[a-zA-Z]\^\d/g)) {
    const t = squash(m[0]);
    if (t.length >= 2 && /\d|=|\/|\^/.test(t)) out.add(t);
  }
  return [...out];
}

/**
 * Canonical form for exact formula matching: no spaces, lower case, LaTeX / markdown noise removed,
 * Unicode sub/superscripts as plain digits, so "H₂SO₄", "$H_2SO_4$" and "H2SO4" all compare equal.
 */
export const squash = (s: string) =>
  s
    .replace(/[\u2080-\u2089]/g, (c) => String(c.charCodeAt(0) - 0x2080))
    .replace(/[\u2070\u00b9\u00b2\u00b3\u2074-\u2079]/g, (c) => ({ "\u2070": "0", "\u00b9": "1", "\u00b2": "2", "\u00b3": "3" })[c] ?? String(c.charCodeAt(0) - 0x2070))
    .replace(/\\[a-z]+\b|[$_{}*\\]/gi, "")
    .replace(/\s+/g, "")
    .toLowerCase();

function questionRefs(q: string): { nums: string[]; years: string[] } {
  const nums = [...q.matchAll(/(?:\bq(?:uestion)?|ප්‍?රශ්න(?:ය)?|வினா)\s*\.?\s*(\d{1,3})\b/gi)].map((m) => m[1]);
  const years = [...q.matchAll(/\b(19[89]\d|20[0-4]\d)\b/g)].map((m) => m[1]);
  return { nums, years };
}

function bigrams(tokens: string[]): Set<string> {
  const s = new Set<string>();
  for (let i = 0; i + 1 < tokens.length; i++) s.add(`${tokens[i]} ${tokens[i + 1]}`);
  return s;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

/**
 * Deterministic evidence boosts. Returns a bonus in [0, ~1] per candidate; the caller blends it
 * with the first-stage rank so ordinary questions keep their order and exact matches rise.
 */
export function evidenceSignals(query: string, c: RerankCandidate): { bonus: number; why: string[] } {
  const why: string[] = [];
  let bonus = 0;
  const textSq = squash(c.text);
  const f = formulaTokens(query);
  const fHit = f.filter((t) => textSq.includes(t));
  if (fHit.length) {
    bonus += 0.35 * (fHit.length / f.length);
    why.push(`formula:${fHit.slice(0, 2).join(",")}`);
  }
  const quoted = [...query.matchAll(/["“”']([^"“”']{3,60})["“”']/g)].map((m) => squash(m[1]));
  const qHit = quoted.filter((t) => textSq.includes(t));
  if (qHit.length) {
    bonus += 0.3;
    why.push("quoted");
  }
  const { nums, years } = questionRefs(query);
  if (nums.length && (nums.includes(c.question ?? "") || nums.some((n) => new RegExp(`(^|\\n)\\s*(?:\\*\\*)?\\s*(?:q(?:uestion)?\\s*\\.?\\s*)?${n}\\s*[.)]`, "i").test(c.text)))) {
    bonus += 0.3;
    why.push(`question:${nums[0]}`);
  }
  if (years.length && (years.includes(c.year ?? "") || years.some((y) => c.text.includes(y)))) {
    bonus += 0.2;
    why.push(`year:${years[0]}`);
  }
  const qb = bigrams(tokenize(query));
  if (qb.size) {
    const cb = bigrams(tokenize(c.text));
    let shared = 0;
    for (const b of qb) if (cb.has(b)) shared++;
    if (shared) {
      bonus += 0.25 * Math.min(1, shared / qb.size);
      why.push(`phrase:${shared}`);
    }
  }
  return { bonus, why };
}

/** Optional cross-encoder via TEI `/rerank` ({ query, texts } → [{ index, score }]). Null when off or failing. */
async function crossEncoderScores(query: string, texts: string[], signal?: AbortSignal): Promise<number[] | null> {
  const base = env("RERANKER_URL").replace(/\/$/, "");
  if (!base || !texts.length) return null;
  const timeout = Math.max(500, parseInt(env("RERANKER_TIMEOUT_MS")) || 2500);
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (env("RERANKER_API_KEY")) headers.Authorization = `Bearer ${env("RERANKER_API_KEY")}`;
    const res = await fetch(`${base}/rerank`, {
      method: "POST",
      headers,
      body: JSON.stringify({ query: query.slice(0, 1000), texts: texts.map((t) => t.slice(0, 2000)), truncate: true }),
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(timeout)]) : AbortSignal.timeout(timeout),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { index: number; score: number }[];
    if (!Array.isArray(data)) return null;
    const scores = new Array<number>(texts.length).fill(0);
    for (const r of data) if (typeof r?.index === "number" && r.index >= 0 && r.index < texts.length && Number.isFinite(r.score)) scores[r.index] = r.score;
    return scores;
  } catch {
    return null; // timeout / network / bad JSON → evidence signals only
  }
}

export const rerankerConfigured = () => Boolean(env("RERANKER_URL"));

/**
 * Rerank candidates (already sorted best-first by the first stage) and return them best-first.
 * Order is blended: first-stage rank (always), evidence signals (always), cross-encoder (if available).
 * Near-duplicates of a higher result are pushed down.
 */
export async function rerank(query: string, candidates: RerankCandidate[], opts: { signal?: AbortSignal; useCrossEncoder?: boolean } = {}): Promise<{ results: RerankResult[]; crossEncoder: boolean }> {
  if (candidates.length <= 1) return { results: candidates.map((c) => ({ id: c.id, score: c.score, why: [] })), crossEncoder: false };
  const n = candidates.length;
  const cross = opts.useCrossEncoder === false ? null : await crossEncoderScores(query, candidates.map((c) => c.text), opts.signal);
  // Cross-encoder logits → 0..1 by rank within this list (robust to raw vs sigmoid scores)
  const crossRank = cross ? new Map([...cross.keys()].sort((a, b) => cross[b] - cross[a]).map((idx, r) => [idx, 1 - r / Math.max(1, n - 1)])) : null;

  const scored = candidates.map((c, i) => {
    // Rank-damped first-stage score: 1, 0.87, 0.77, 0.69 … so strong exact evidence can lift a hit a few places, not from nowhere
    const firstStage = 1 / (1 + 0.15 * i);
    const ev = evidenceSignals(query, c);
    const score = crossRank ? 0.55 * crossRank.get(i)! + 0.25 * firstStage + 0.2 * Math.min(1, ev.bonus) : 0.6 * firstStage + 0.4 * Math.min(1, ev.bonus);
    return { id: c.id, score, why: [...ev.why, ...(crossRank ? [`ce:${crossRank.get(i)!.toFixed(2)}`] : [])], toks: new Set(tokenize(c.text)) };
  });
  scored.sort((a, b) => b.score - a.score);

  // Diversity: a candidate ≥ 85% the same words as one already ranked above it drops to the end
  const kept: typeof scored = [];
  const dupes: typeof scored = [];
  for (const s of scored) (kept.some((k) => jaccard(k.toks, s.toks) >= 0.85) ? dupes : kept).push(s);
  return { results: [...kept, ...dupes].map(({ id, score, why }) => ({ id, score, why })), crossEncoder: Boolean(cross) };
}
