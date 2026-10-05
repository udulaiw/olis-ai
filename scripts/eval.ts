// OLIS offline evaluation: measures the retrieval + language pipeline on evals/olis-eval.json
// WITHOUT any API key (keyword retrieval, deterministic). Run before and after any change to
// the glossary, tokenizer, ranking or knowledge base:
//
//   npm run eval
//
// It fails (exit 1) if a metric drops below the floors in evals/olis-eval.json → "floors".
// What it does NOT measure: factual accuracy, Sinhala fluency or hallucination of the LLM itself.
// Those need a model: see scripts/eval-live.mjs.
import { readFileSync, writeFileSync, mkdirSync, existsSync, cpSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { searchKnowledge, groundingOf, relevantHits, indexStats, _resetIndex } from "../server/rag";
import { classifyRequest } from "../server/ai/intent";
import { replyLanguage } from "../server/lang/nlp.mjs";

const ROOT = process.cwd();
const data = JSON.parse(readFileSync(join(ROOT, "evals/olis-eval.json"), "utf8"));
const cfg = { geminiKey: "", embedModel: "" } as never; // keyword mode: deterministic and free
const pct = (n: number, d: number) => (d ? Math.round((n / d) * 1000) / 10 : 0);

async function run(q: string, level?: "OL" | "AL" | null) {
  const c = classifyRequest({ question: q, mode: "ask", subject: "General" });
  const found = await searchKnowledge(cfg, c.retrievalQuery, { k: 4, level: level === undefined ? c.examLevel : level });
  return { c, found, hits: relevantHits(found), grounding: groundingOf(found) };
}

// ── retrieval ───────────────────────────────────────────────
type Row = { q: string; tags: string[]; rank: number | null; got: string[] };
const rows: Row[] = [];
for (const c of data.retrieval as { q: string; expect: string[]; tags: string[] }[]) {
  const { hits } = await run(c.q);
  const paths = hits.map((h) => h.chunk.path);
  const idx = paths.findIndex((p) => c.expect.includes(p));
  rows.push({ q: c.q, tags: c.tags, rank: idx >= 0 ? idx + 1 : null, got: [...new Set(paths)].slice(0, 3) });
}
const group = (tag?: string) => rows.filter((r) => !tag || r.tags.includes(tag));
const metrics = (rs: Row[]) => ({ n: rs.length, hit1: pct(rs.filter((r) => r.rank === 1).length, rs.length), hit3: pct(rs.filter((r) => r.rank !== null && r.rank <= 3).length, rs.length), mrr: Math.round((rs.reduce((a, r) => a + (r.rank ? 1 / r.rank : 0), 0) / Math.max(1, rs.length)) * 100) / 100 });
const byTag = Object.fromEntries(["en", "si", "singlish", "typo", "misleading"].map((t) => [t, metrics(group(t))]));

// ── no-source (anti-hallucination gate) ─────────────────────
const ns: { q: string; grounding: string }[] = [];
for (const c of data.no_source as { q: string }[]) ns.push({ q: c.q, grounding: (await run(c.q)).grounding });
const noSourceOk = pct(ns.filter((r) => r.grounding === "none").length, ns.length);
// and the other direction: a question the KB DOES cover must not be called "none"
const covered: string[] = [];
const coveredFail: string[] = [];
for (const c of (data.retrieval as { q: string; tags: string[] }[]).filter((r) => !r.tags.includes("misleading"))) {
  const g = (await run(c.q)).grounding;
  covered.push(g);
  if (g === "none") coveredFail.push(c.q);
}
const coveredOk = pct(covered.filter((g) => g !== "none").length, covered.length);

// ── language ────────────────────────────────────────────────
const L = data.language as { q: string; pref?: "en" | "si"; history?: { role: string; content: string }[]; detected: string; reply: string }[];
const langRes = L.map((c) => replyLanguage({ question: c.q, pref: c.pref, history: c.history }));
const detAcc = pct(langRes.filter((r, i) => r.detected === L[i].detected).length, L.length);
const replyAcc = pct(langRes.filter((r, i) => r.reply === L[i].reply).length, L.length);

// ── level isolation (fixture index with O/L, A/L and untagged notes) ──
const fixture = join(ROOT, "evals/fixtures/.index.json");
// The fixture notes are indexed together with the real knowledge base (tiny corpora make BM25 scores meaningless)
const kb = join(ROOT, "evals/fixtures/.kb");
rmSync(kb, { recursive: true, force: true });
cpSync(join(ROOT, "knowledge"), kb, { recursive: true });
cpSync(join(ROOT, "evals/fixtures/knowledge"), kb, { recursive: true });
const build = spawnSync(process.execPath, ["scripts/build-index.mjs"], { env: { ...process.env, GEMINI_API_KEY: "", OLIS_KB_DIR: "evals/fixtures/.kb", OLIS_INDEX_OUT: "evals/fixtures/.index.json" }, encoding: "utf8" });
rmSync(kb, { recursive: true, force: true });
if (build.status !== 0 || !existsSync(fixture)) throw new Error("could not build the fixture index: " + build.stderr);
const realIndexPath = process.env.OLIS_INDEX_PATH;
process.env.OLIS_INDEX_PATH = fixture;
_resetIndex();
const lv: { ok: boolean; q: string; level: unknown; got: string[] }[] = [];
for (const c of data.level_isolation as { q: string; level: "OL" | "AL" | null; must_include: string[]; must_exclude: string[] }[]) {
  const hits = relevantHits(await searchKnowledge(cfg, c.q, { k: 6, level: c.level }));
  const files = hits.map((h) => h.chunk.path.split("/").pop()!);
  lv.push({ ok: c.must_include.every((f) => files.includes(f)) && c.must_exclude.every((f) => !files.includes(f)), q: c.q, level: c.level, got: files });
}
if (realIndexPath) process.env.OLIS_INDEX_PATH = realIndexPath;
else delete process.env.OLIS_INDEX_PATH;
_resetIndex();
const levelOk = pct(lv.filter((r) => r.ok).length, lv.length);

// ── report ──────────────────────────────────────────────────
const stats = indexStats();
const report = {
  index: { files: stats.files, chunks: stats.chunks, semantic: stats.semantic },
  language: { n: L.length, detectionAccuracy: detAcc, replyLanguageAccuracy: replyAcc },
  retrieval: { overall: metrics(rows), byTag },
  noSource: { n: ns.length, correctlyUngroundedPct: noSourceOk, coveredQuestionsNotCalledNonePct: coveredOk },
  levelIsolation: { n: lv.length, passPct: levelOk },
};
console.log(JSON.stringify(report, null, 2));
const misses = rows.filter((r) => r.rank === null || r.rank > 1);
if (misses.length) {
  console.log("\nNot ranked first:");
  for (const m of misses) console.log(`  ${m.rank ? `#${m.rank}` : "MISS"}  [${m.tags.join(",")}] ${m.q}\n        got: ${m.got.join(", ") || "(nothing)"}`);
}
for (const r of ns.filter((x) => x.grounding !== "none")) console.log(`\nNO-SOURCE FAIL (grounding=${r.grounding}): ${r.q}`);
for (const q of coveredFail) console.log(`\nCOVERED BUT GROUNDING=none: ${q}`);
for (const r of lv.filter((x) => !x.ok)) console.log(`\nLEVEL FAIL: "${r.q}" level=${r.level} got ${r.got.join(", ")}`);
mkdirSync(join(ROOT, "evals"), { recursive: true });
writeFileSync(join(ROOT, "evals/last-report.json"), JSON.stringify({ at: new Date().toISOString(), ...report }, null, 2));

// ── regression floors ───────────────────────────────────────
const floors = (data.floors ?? {}) as Record<string, number>;
const checks: [string, number, number | undefined][] = [
  ["retrieval hit@3 (all)", report.retrieval.overall.hit3, floors.hit3],
  ["retrieval hit@3 (si)", byTag.si.hit3, floors.hit3_si],
  ["retrieval hit@3 (singlish)", byTag.singlish.hit3, floors.hit3_singlish],
  ["retrieval hit@3 (typo)", byTag.typo.hit3, floors.hit3_typo],
  ["no-source correctly ungrounded", noSourceOk, floors.noSource],
  ["covered questions not 'none'", coveredOk, floors.covered],
  ["level isolation", levelOk, floors.levelIsolation],
  ["language detection", detAcc, floors.detection],
  ["reply language", replyAcc, floors.reply],
];
let bad = 0;
console.log("");
for (const [name, v, floor] of checks) {
  const pass = floor === undefined || v >= floor;
  if (!pass) bad++;
  console.log(`${pass ? "✓" : "✗"} ${name}: ${v}%${floor === undefined ? "  (no floor set)" : `  (floor ${floor}%)`}`);
}
export const ok = bad === 0;
