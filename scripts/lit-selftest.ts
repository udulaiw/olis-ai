// OLIS Literature & Language Intelligence tests. Pure logic: no network, no API keys.
//
//   npm run test:lit
//
// Covers: literature detection (domain · form · task · answer mode · command word · text availability),
// regression guards (other subjects must NOT become literature), prompt assembly (only the parts a
// request needs), model routing, and literature metadata in RAG (work recognition + work filter).
import { readFileSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { classifyRequest } from "../server/ai/intent";
import { systemPrompt } from "../server/prompts";
import { literaturePromptBlock } from "../server/literature/prompts";
import { detectLiterature, findText } from "../server/literature/detect";
import { searchKnowledge, workMentioned, _resetIndex } from "../server/rag";
import { TAXONOMY, STRATEGIES } from "../server/knowledge/taxonomy";

const ROOT = process.cwd();
const data = JSON.parse(readFileSync(join(ROOT, "evals/olis-eval.json"), "utf8"));
const results: { name: string; ok: boolean; detail?: string }[] = [];
async function test(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    results.push({ name, ok: true });
  } catch (e) {
    results.push({ name, ok: false, detail: (e as Error).message });
  }
}
function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}
const eq = (a: unknown, b: unknown, what: string) => assert(JSON.stringify(a) === JSON.stringify(b), `${what}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);
const has = (s: string, part: string) => assert(s.includes(part), `expected the prompt to contain "${part.slice(0, 60)}"`);
const hasNot = (s: string, part: string) => assert(!s.includes(part), `expected the prompt NOT to contain "${part.slice(0, 60)}"`);

type Hist = { role: string; content: string }[];
const classify = (q: string, history: Hist = [], extra: Record<string, unknown> = {}) => classifyRequest({ question: q, mode: "ask", subject: "General", history, ...extra });
const promptFor = (q: string, history: Hist = [], extra: Record<string, unknown> = {}) => {
  const c = classify(q, history, extra);
  return {
    c,
    p: systemPrompt({ subject: "General", level: "A/L", style: "Balanced" }, "ask", {
      tools: true,
      webSearch: false,
      reply: c.reply,
      examLevel: c.examLevel,
      subjectId: c.subject,
      discipline: c.discipline,
      intent: c.intent,
      difficulty: c.difficulty,
      grounding: "none",
      literature: c.literature,
    }),
  };
};

// ── Detection cases (evals/olis-eval.json → literature) ──────────────────────
for (const c of data.literature as { q: string; history?: Hist; want: Record<string, unknown> | null; note?: string }[]) {
  await test(`detect: ${c.q.split("\n")[0].slice(0, 64)}${c.want === null ? " → not literature" : ""}`, () => {
    const lit = classify(c.q, c.history ?? []).literature as unknown as Record<string, unknown> | null;
    if (c.want === null) return eq(lit, null, "literature");
    assert(lit, "expected a literature profile, got null");
    for (const [k, v] of Object.entries(c.want)) eq(lit[k], v, k);
  });
}

await test("detect: an attached document counts as the text", () => {
  const lit = classify("What is the main theme of this poem?", [], { attachmentChars: 2000 }).literature;
  eq(lit?.hasText, true, "hasText");
  eq(lit?.textWhere, "attachment", "textWhere");
});
await test("detect: a pasted physics passage is NOT literature just because it is long text", () => {
  const passage = "Calculate the final velocity:\nA car starts from rest\nIt accelerates at 2 m/s2\nfor 10 seconds on a straight road\nwhat is its velocity and displacement";
  eq(classify(passage).literature, null, "literature");
});
await test("findText: pasted poem yes, one-line question no", () => {
  eq(findText("The sea is calm tonight.\nThe tide is full, the moon lies fair\nUpon the straits; on the French coast the light\nGleams and is gone"), true, "poem");
  eq(findText("What is the theme of the poem?"), false, "question");
});

// ── Routing ───────────────────────────────────────────────────────────────────
await test("route: close reading of a pasted poem uses the reasoning models", () => {
  eq(classify("Analyse this poem:\nThe old house stands alone\nIts windows dark as stone\nThe wind forgets its name\nAnd nothing stays the same").task, "reasoning", "task");
});
await test("route: a quick device definition stays on the fast general models", () => {
  eq(classify("Quickly, what is a simile?").task, "general", "task");
});
await test("route: a Sinhala literature question still goes to the multilingual (sinhala) route", () => {
  eq(classify("මේ කවියේ තේමාව මොකක්ද").task, "sinhala", "task");
});
await test("route: maths and physics routing unchanged", () => {
  eq(classify("Solve 2x^2 - 5x - 3 = 0").task, "mathematics", "task");
  eq(classify("A car accelerates from 10 m/s to 30 m/s in 5 s. Calculate the acceleration.").task, "physics", "task");
});

// ── Prompt assembly ───────────────────────────────────────────────────────────
await test("prompt: non-literature questions get no literature section (no extra tokens)", () => {
  for (const q of ["What is momentum?", "Explain monsoon rainfall in Sri Lanka", "Solve 3x + 4 = 10"]) hasNot(promptFor(q).p, "# Literature & Language");
});
await test("prompt: pasted poem → poetry method + device method + 'text provided', no grammar rules", () => {
  const { p } = promptFor("Analyse this poem:\nThe old house stands alone\nIts windows dark as stone\nThe wind forgets its name\nAnd nothing stays the same");
  has(p, "# Literature & Language");
  has(p, "Poetry method");
  has(p, "Device → Evidence");
  has(p, "HAS provided the text");
  has(p, "**Fact**");
  has(p, "Mode: DEEP ANALYSIS");
  has(p, '"Analyse"');
  hasNot(p, "Grammar / language method");
  hasNot(p, "Essay method");
});
await test("prompt: no text → ask for it, allow labelled general knowledge, never quote", () => {
  const { p } = promptFor("Explain the imagery in the poem 'The Lantern Keeper'");
  has(p, "has NOT provided the text");
  has(p, "Please paste the poem / passage");
  has(p, "Never invent quotations");
});
await test("prompt: grammar correction → Original → Problem → Why → Better, no literary-interpretation block", () => {
  const { p } = promptFor("Is this sentence grammatically correct: He don't like apples");
  has(p, "**Original → Problem → Why it's wrong**");
  hasNot(p, "Poetry method");
  hasNot(p, "**Strong interpretation**");
});
await test("prompt: student answer → feedback headings and no invented exact mark", () => {
  const { p } = promptFor("Check my answer: The poet uses a simile to show the boy is sad. This shows he is sad.");
  has(p, "**What you did well**");
  has(p, "**A stronger version**");
  has(p, "Don't give an exact mark unless a marking scheme");
});
await test("prompt: Socratic mode withholds the answer", () => {
  has(promptFor("Don't give me the answer, guide me to find the imagery in the first stanza").p, "Do NOT give the answer");
});
await test("prompt: 'to what extent' → balanced argument and justified conclusion", () => {
  has(promptFor("To what extent is the protagonist responsible for his own downfall?").p, "a balanced argument");
});
await test("prompt: drama → staging, essay → PETAL structure, creative → keep the student's voice", () => {
  has(promptFor("Explain the soliloquy in Act 2 of the play").p, "**on stage**");
  has(promptFor("Help me build an essay on the theme of loyalty in the novel").p, "**Point → Evidence → Technique → Analysis → Link**");
  has(promptFor("Write a short story about a rainy day in Kandy").p, "Don't replace their writing");
});
await test("prompt: Sinhala literature answer → Sinhala terms, Sinhala ask-for-text line, no Hindi/Malayalam allowed", () => {
  const { p } = promptFor("මේ කවියේ උපමා මොනවාද?");
  has(p, "උපමා (simile)");
  has(p, "කවියේ / ඡේදයේ පාඨය එවන්න");
  has(p, "Never output Malayalam");
});
await test("prompt: English answer about a Sinhala text quotes it in Sinhala script", () => {
  const lit = detectLiterature({ question: "Explain this poem in English:\nඅම්මා මට ආදරෙයි\nඅම්මා මට කතා කරයි\nඅම්මා මා රකියි\nඅම්මා මගේ ලෝකයයි", subject: null, group: null, discipline: "general", intent: "concept_explanation", difficulty: "intermediate" });
  eq(lit?.textLanguage, "si", "textLanguage");
  has(literaturePromptBlock(lit, "en"), "quote it in Sinhala script");
});
await test("prompt: syllabus guard: never name prescribed texts without an excerpt", () => {
  has(promptFor("Which poems are in the O/L English literature syllabus?").p, "OLIS doesn't have that syllabus document yet");
});

// ── Registry ──────────────────────────────────────────────────────────────────
await test("registry: every literature unit routes to the literature strategy, and the strategy exists", () => {
  const units = TAXONOMY.flatMap((s) => s.units.filter((u) => /literature/.test(u.id)).map((u) => ({ s: s.id, u })));
  assert(units.length >= 5, `found only ${units.length} literature units`);
  for (const { s, u } of units) eq(u.strategy, "literature", `${s}/${u.id}`);
  assert(STRATEGIES.literature && STRATEGIES.comprehension, "literature / comprehension strategies missing");
});

// ── RAG: literature metadata (work recognition + work filter) ────────────────
const out = join(ROOT, "evals/fixtures/.lit-index.json");
const build = spawnSync(process.execPath, ["scripts/build-index.mjs"], {
  env: { ...process.env, GEMINI_API_KEY: "", OLIS_KB_DIR: "evals/fixtures/literature", OLIS_INDEX_OUT: "evals/fixtures/.lit-index.json" },
  encoding: "utf8",
});
const realIndex = process.env.OLIS_INDEX_PATH;
process.env.OLIS_INDEX_PATH = out;
_resetIndex();
const cfg = { geminiKey: "", embedModel: "" } as never;
await test("rag: index builds with literature metadata (form, author, work, theme, device)", () => {
  assert(build.status === 0, `build-index failed: ${build.stderr}`);
  const idx = JSON.parse(readFileSync(out, "utf8"));
  const c = idx.chunks.find((x: { work?: string }) => x.work === "The Lantern Keeper");
  assert(c, "no chunk with work 'The Lantern Keeper'");
  eq([c.form, c.author, c.theme, c.device], ["poetry", "OLIS test fixture", "loneliness; duty", "imagery; personification"], "metadata");
});
await test("rag: a question naming an indexed work is recognised as literature with no literary words", () => {
  eq(workMentioned("Is the lantern keeper in The Lantern Keeper lonely?"), "The Lantern Keeper", "work");
  const c = classify("Why is the keeper alone in The Lantern Keeper?");
  eq(c.literature?.domain, "literature", "domain");
  eq(c.work, "The Lantern Keeper", "work");
});
await test("rag: the work filter is applied before ranking (other works excluded, unfiltered search sees both)", async () => {
  const all = await searchKnowledge(cfg, "keeper lantern ferry river", { k: 6 });
  const paths = new Set(all.map((h) => h.chunk.path));
  assert(paths.size >= 2, `unfiltered search should match both fixture poems, got ${[...paths].join(", ")}`);
  const only = await searchKnowledge(cfg, "keeper lantern ferry river", { k: 6, work: "The River Song" });
  assert(only.length > 0, "filtered search found nothing");
  for (const h of only) eq(h.chunk.work, "The River Song", "filtered work");
});
await test("rag: an unknown work name matches nothing (no invented work)", () => {
  eq(workMentioned("Explain the ending of The Silent Mountain"), null, "work");
});
if (realIndex) process.env.OLIS_INDEX_PATH = realIndex;
else delete process.env.OLIS_INDEX_PATH;
_resetIndex();
rmSync(out, { force: true });

// ── Report ────────────────────────────────────────────────────────────────────
for (const r of results) console.log(`${r.ok ? "✓" : "✗"} ${r.name}${r.ok ? "" : `\n    ${r.detail}`}`);
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
export const ok = failed === 0;
