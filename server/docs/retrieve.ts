// ─────────────────────────────────────────────
// Retrieval inside a document the student attached (PDF / DOCX / text).
//
// The browser sends the whole extracted document (with [p.N] page markers for
// PDFs) with each question in the chat. Instead of pasting the first 30k
// characters into the prompt, OLIS:
//   1. chunks it with the same education-aware chunker as the knowledge base
//      (headings, questions + answers, equations and tables kept whole),
//   2. small document → uses all of it, in order;
//      "summarise this" → a spread across the whole document (every section);
//      a question → BM25 over the chunks (Sinhala/Singlish expanded to English
//      terms too) + the reranker's exact-evidence signals,
//   3. returns the passages in document order with their real page numbers,
//      so the answer can cite "[2] (p.14)". Pages are never guessed: DOCX and
//      text files have none, so they're cited by section heading.
// Nothing is stored; this runs per request, in memory.
// ─────────────────────────────────────────────
import { chunkDocument, tokenize } from "../text.mjs";
import { expandQuery, sinhalaTermsFor } from "../lang/nlp.mjs";
import { rerank } from "../rerank.js";

export interface DocPassage {
  heading: string;
  /** Passage text, without the "title › heading" prefix or page markers. */
  text: string;
  /** Real PDF page(s), e.g. "12" or "12-13". Undefined when the format has no pages. */
  pages?: string;
  /** Question number, when the passage is one question of a paper. */
  question?: string;
}

export interface DocSelection {
  passages: DocPassage[];
  /** How the passages were picked. */
  strategy: "whole" | "overview" | "search" | "fallback";
  /** Total chunks in the document. */
  chunks: number;
  /** False when a question matched nothing in the document (passages are then an overview). */
  matched: boolean;
  hasPages: boolean;
}

const SUMMARY_RE = /\b(summar(y|ise|ize)|overview|outline|main (points|ideas)|key points|what is (this|it) about|tl;?dr|notes? (on|from) (this|it))\b|සාරාංශ|සංක්ෂිප්ත|සාරාංශය|சுருக்க/i;

/** True when the student wants the whole document covered rather than one part of it. */
export const wantsOverview = (question: string, mode?: string) => mode === "summarize" || !question.trim() || SUMMARY_RE.test(question);

function stripPrefix(text: string): string {
  const i = text.indexOf("\n\n");
  return (i >= 0 ? text.slice(i + 2) : text).replace(/\[p\.\d+\] ?/g, "").trim();
}

function bm25Scores(chunkTokens: string[][], query: string[]): number[] {
  const N = chunkTokens.length;
  const df = new Map<string, number>();
  const tfs = chunkTokens.map((toks) => {
    const m = new Map<string, number>();
    for (const t of toks) m.set(t, (m.get(t) ?? 0) + 1);
    for (const t of m.keys()) df.set(t, (df.get(t) ?? 0) + 1);
    return m;
  });
  const avg = chunkTokens.reduce((a, t) => a + t.length, 0) / Math.max(1, N);
  const q = [...new Set(query)];
  return tfs.map((tf, i) => {
    let s = 0;
    for (const t of q) {
      const f = tf.get(t);
      if (!f) continue;
      const n = df.get(t) ?? 0;
      // terms in most of the document ("electricity" in an electricity chapter) carry little signal
      // bare numbers ("36 g", "page 12") match headings and page furniture by accident: count them a little
      const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5)) * (/^\d+$/.test(t) ? 0.3 : 1);
      s += idf * ((f * 2.4) / (f + 1.4 * (0.25 + (0.75 * chunkTokens[i].length) / Math.max(1, avg))));
    }
    return s;
  });
}

/** Pick passages from a document for one question, within a character budget. */
export async function selectDocPassages(
  doc: string,
  question: string,
  opts: { name: string; mode?: string; budget?: number; maxPassages?: number; signal?: AbortSignal; history?: string },
): Promise<DocSelection> {
  const budget = opts.budget ?? 14_000;
  const maxPassages = opts.maxPassages ?? 8;
  const hasPages = /\[p\.\d+\]/.test(doc);
  const chunks = chunkDocument(doc, { title: opts.name, maxChars: 1400 }).map((c) => ({ ...c, body: stripPrefix(c.text) }));
  const passage = (c: (typeof chunks)[number]): DocPassage => ({ heading: c.heading, text: c.body, ...(hasPages && c.pages ? { pages: c.pages } : {}), ...(c.question ? { question: c.question } : {}) });
  const fits = (list: typeof chunks) => list.reduce((a, c) => a + c.body.length + 80, 0) <= budget;

  if (!chunks.length) return { passages: [], strategy: "whole", chunks: 0, matched: false, hasPages };
  if (fits(chunks)) return { passages: chunks.map(passage), strategy: "whole", chunks: chunks.length, matched: true, hasPages };

  // Spread across the document: the first chunk of each section, then evenly spaced chunks, in order
  const overview = () => {
    const picked = new Set<number>();
    let used = 0;
    const take = (i: number) => {
      if (picked.has(i) || used + chunks[i].body.length + 80 > budget) return;
      picked.add(i);
      used += chunks[i].body.length + 80;
    };
    chunks.forEach((c, i) => (i === 0 || c.heading !== chunks[i - 1].heading ? take(i) : undefined));
    const step = Math.max(1, Math.floor(chunks.length / Math.max(1, maxPassages)));
    for (let i = 0; i < chunks.length; i += step) take(i);
    return [...picked].sort((a, b) => a - b).map((i) => passage(chunks[i]));
  };

  if (wantsOverview(question, opts.mode)) return { passages: overview(), strategy: "overview", chunks: chunks.length, matched: true, hasPages };

  // Search: the question plus its English expansion (Sinhala / Singlish), and a little of the previous turn for follow-ups
  // English question about a Sinhala document: add the glossary's Sinhala terms (cross-language without embeddings)
  const expanded = `${expandQuery(question).expanded as string} ${sinhalaTermsFor(question)}`;
  const qTokens = tokenize(`${question} ${expanded} ${opts.history ?? ""}`);
  const chunkTokens = chunks.map((c) => tokenize(`${c.heading} ${c.body}`));
  const scores = bm25Scores(chunkTokens, qTokens);
  const ranked = scores
    .map((score, i) => ({ i, score }))
    .filter((h) => h.score > 0)
    .sort((a, b) => b.score - a.score);
  // weak tail (a quarter of the best match or less) is noise, not evidence
  const strongEnough = ranked.filter((h) => h.score >= ranked[0]?.score * 0.25).slice(0, 16);
  if (!strongEnough.length) return { passages: overview(), strategy: "fallback", chunks: chunks.length, matched: false, hasPages };

  const { results } = await rerank(
    `${question} ${expanded}`,
    strongEnough.map((h) => ({ id: h.i, text: `${chunks[h.i].heading}\n${chunks[h.i].body}`, score: h.score, question: chunks[h.i].question })),
    { signal: opts.signal },
  );
  const picked: number[] = [];
  let used = 0;
  for (const r of results) {
    if (picked.length >= maxPassages) break;
    const len = chunks[r.id].body.length + 80;
    if (used + len > budget) continue;
    picked.push(r.id);
    used += len;
  }
  return { passages: picked.sort((a, b) => a - b).map((i) => passage(chunks[i])), strategy: "search", chunks: chunks.length, matched: true, hasPages };
}

/** "p.12" / "pp.12–13" for labels; empty when the passage has no page. */
export const pageLabel = (p?: string) => (!p ? "" : p.includes("-") ? `pp.${p.replace("-", "–")}` : `p.${p}`);
