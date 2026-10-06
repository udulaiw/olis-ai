// ─────────────────────────────────────────────
// OLIS RAG / documents / sources self-test (v0.7). No network, no API keys:
// every external API is mocked with responses shaped like the real ones.
//
//   npm run test:rag
//
// Covers: education-aware chunking, PDF → markdown (pdf.js, real fixture PDFs),
// DOCX → markdown, retrieval inside an attached document (incl. Sinhala and
// cross-language), the reranker (local signals + TEI cross-encoder + failure),
// embedding providers (Gemini / TEI, dimension checks), Wikipedia, Wikidata,
// OpenAlex, arXiv, Crossref, caching, timeouts and the personality layer.
// ─────────────────────────────────────────────
import { readFileSync } from "node:fs";
import { chunkDocument, tokenize } from "../server/text.mjs";
import { linesFromItems, dropRunningLines, pagesToMarkdown, cleanLine, looksScanned } from "../server/docs/pdflayout.mjs";
import { docxToMarkdown, ommlToText } from "../server/docs/docx.mjs";
import { selectDocPassages, wantsOverview, pageLabel } from "../server/docs/retrieve";
import { rerank, evidenceSignals } from "../server/rerank";
import { embedTexts, embedSettings } from "../server/embeddings.mjs";
import { searchWikipedia } from "../server/sources/wikipedia";
import { lookupWikidata } from "../server/sources/wikidata";
import { searchOpenAlex, searchArxiv, lookupDoi, abstractFromInvertedIndex, RESEARCH_CUE } from "../server/sources/research";
import { _clearSourceCache } from "../server/sources/cache";
import { runTool, SourceRegistry, toolDeclarations } from "../server/tools";
import { config } from "../server/config";
import { personalityBlock, PERSONALITY_IDS } from "../server/personality";
import { parseProfile } from "../server/sanitize";

// ── harness ──────────────────────────────────
const results: { name: string; ok: boolean; detail?: string }[] = [];
async function test(name: string, fn: () => Promise<void> | void) {
  mocks = {};
  fetched.length = 0;
  _clearSourceCache();
  for (const k of ["RERANKER_URL", "EMBED_PROVIDER", "EMBED_URL", "EMBED_DIMS", "UPSTASH_REDIS_REST_URL", "OPENALEX_API_KEY"]) delete process.env[k];
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

// ── fetch mock: URL fragment → handler ───────
type Handler = (url: string, init?: RequestInit) => Response | Promise<Response>;
let mocks: Record<string, Handler> = {};
const fetched: string[] = [];
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input instanceof Request ? input.url : input);
  fetched.push(url);
  const key = Object.keys(mocks).find((k) => url.includes(k));
  if (!key) return new Response("not mocked", { status: 404 });
  return mocks[key](url, init);
}) as typeof fetch;
const json = (o: unknown, status = 200) => () => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json" } });
const hang: Handler = (_u, init) => new Promise((_, rej) => init?.signal?.addEventListener("abort", () => rej(new DOMException("aborted", "AbortError")), { once: true }));

// ── PDF helper (Node build of pdf.js, same as scripts/ingest.mjs) ──
const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
async function pdfToMarkdown(path: string) {
  const task = pdfjs.getDocument({ data: new Uint8Array(readFileSync(path)), verbosity: 0 });
  const doc = await task.promise;
  const pages = [];
  for (let i = 1; i <= doc.numPages; i++) pages.push(linesFromItems((await (await doc.getPage(i)).getTextContent()).items as never));
  await task.destroy();
  return { pages, md: pagesToMarkdown(dropRunningLines(pages).map((ls) => ls.map((l) => ({ text: cleanLine(l.text).text, size: l.size })))) };
}
const FX = "evals/fixtures/docs";

// ═════════════ Chunking ═════════════
await test("chunk: a question stays with its answer; equations and tables are never split", () => {
  const doc = [
    "## Section A",
    "[p.3] Intro.",
    "1. A wire carries 2 A for 5 s. Find the charge.",
    "(a) state the formula",
    "**Answer:** $Q = It = 10$ C",
    "2. State Ohm's law.",
    "Answer: V = IR at constant temperature",
    "[p.4] more text",
    "$$\nV = IR\n\\quad R = \\frac{\\rho L}{A}\n$$",
    "| a | b |\n|---|---|\n| 1 | 2 |",
  ].join("\n\n");
  const c = chunkDocument(doc, { title: "T", maxChars: 140 });
  const q1 = c.find((x) => x.question === "1")!;
  assert(q1 && q1.text.includes("Answer:** $Q = It"), "Q1 separated from its answer");
  assert(c.every((x) => (x.text.match(/\$\$/g) ?? []).length % 2 === 0), "display maths split across chunks");
  assert(c.some((x) => x.text.includes("| a | b |\n|---|---|\n| 1 | 2 |")), "table split");
  assert(c.find((x) => x.text.includes("V = IR at constant"))!.pages === "3-4", `pages=${c.map((x) => x.pages).join(",")}`);
});

await test("chunk: page marker on a heading applies to its section; Sinhala question numbers detected", () => {
  const c = chunkDocument("## [p.7] ඒකකය 7\n\nප්‍රශ්නය 6. ප්‍රකාශ සංශ්ලේෂණයට අවශ්‍ය වායුව කුමක්ද?\n\nපිළිතුර: CO2", { title: "T" });
  assert(c[0].pages === "7" && c[0].question === "6", JSON.stringify(c[0]));
  assert(c[0].text.includes("පිළිතුර"), "Sinhala answer separated");
});

await test("chunk: separate sections with questions are not merged; tiny plain sections are", () => {
  const c = chunkDocument("## A\n\n1. Q one?\n\nAnswer: x\n\n## B\n\n2. Q two?\n\nAnswer: y\n\n## C\n\nTiny.\n\n## D\n\nAlso tiny.", { title: "T" });
  assert(c.length === 3 && c[2].heading === "C · D", c.map((x) => x.heading).join(" | "));
});

await test("tokenize: ZWJ-insensitive Sinhala matching (ප්‍ර = ප්ර)", () => {
  assert(tokenize("ප්‍රකාශ").join() === tokenize("ප්රකාශ").join(), "ZWJ changes tokens");
});

// ═════════════ PDF ═════════════
await test("pdf: headings, questions, page markers; running header and page numbers dropped", async () => {
  const { md } = await pdfToMarkdown(`${FX}/physics-paper.pdf`);
  assert(md.includes("## [p.1] Unit 4: Electricity") && md.includes("## [p.3] Unit 6: Waves"), "headings/page markers missing");
  assert(!md.includes("Model Paper - OLIS test fixture"), "running header kept");
  assert(/\n\nAnswer: Q = I x t/.test(md), "answer not its own paragraph");
  assert(!/\n\n\d\n/.test(md), "bare page number kept");
});

await test("pdf: Sinhala survives (NFC, rakaransaya/yansaya ZWJ restored after pdf.js drops it)", async () => {
  const { md, pages } = await pdfToMarkdown(`${FX}/physics-paper.pdf`);
  const raw = pages[3].map((l) => l.text).join(" ");
  assert(raw.includes("ප්රකාශ") && !raw.includes("‍"), "fixture no longer exercises the pdf.js ZWJ drop");
  assert(md.includes("ප්‍රකාශ සංශ්ලේෂණය") && md.includes("අවශ්‍ය"), "ZWJ not restored");
  assert(md.includes("## [p.4] ඒකකය 7"), "Sinhala heading missing");
  assert(cleanLine("ශ්රී").text === "ශ්‍රී", "ශ්රී not repaired");
});

await test("pdf: broken / fake PDFs fail cleanly; scanned detection", async () => {
  for (const f of ["broken.pdf", "fake.pdf"]) {
    let threw = false;
    try {
      await pdfToMarkdown(`${FX}/${f}`);
    } catch {
      threw = true;
    }
    assert(threw, `${f} did not fail`);
  }
  assert(looksScanned([[{ text: "1", size: 9 }], []]), "scanned not detected");
  assert(!looksScanned([[{ text: "x".repeat(200), size: 9 }]]), "text PDF flagged as scanned");
});

// ═════════════ DOCX ═════════════
await test("docx: headings, list, table, Word equations (superscripts, fractions) and Sinhala", () => {
  const md = docxToMarkdown(new Uint8Array(readFileSync(`${FX}/chemistry-notes.docx`)));
  assert(md.includes("### Mole concept"), "heading");
  assert(md.includes("$6.022×10^{23}$"), `equation: ${md.match(/\$[^$]*\$/)?.[0]}`);
  assert(md.includes("- Moles from mass: $n=m/M$\n- Concentration"), "list");
  assert(md.includes("| Water | H2O | 18 |"), "table");
  assert(md.includes("ප්‍රබල අම්ලයක්"), "Sinhala");
  assert(ommlToText("<m:oMath><m:f><m:num><m:r><m:t>1</m:t></m:r></m:num><m:den><m:r><m:t>2</m:t></m:r></m:den></m:f><m:sSub><m:e><m:r><m:t>H</m:t></m:r></m:e><m:sub><m:r><m:t>2</m:t></m:r></m:sub></m:sSub></m:oMath>") === "\\frac{1}{2}H_{2}", "omml");
});

await test("docx: non-Word files are rejected", () => {
  let msg = "";
  try {
    docxToMarkdown(new Uint8Array(readFileSync(`${FX}/fake.pdf`)));
  } catch (e) {
    msg = (e as Error).message;
  }
  assert(msg === "not_docx", msg);
});

// ═════════════ Retrieval inside a document ═════════════
const { md: paperMd } = await pdfToMarkdown(`${FX}/physics-paper.pdf`);
let BIG = paperMd;
for (let i = 0; i < 30; i++) BIG += `\n\n## [p.${10 + i}] Filler unit ${i}\n\n[p.${10 + i}] ${"General revision text about unrelated things. ".repeat(25)}`;

await test("doc: small document → used whole; empty doc → nothing", async () => {
  const r = await selectDocPassages(paperMd, "What is Ohm's law?", { name: "p.pdf" });
  assert(r.strategy === "whole" && r.hasPages && r.passages.length >= 4, `${r.strategy} ${r.passages.length}`);
  assert((await selectDocPassages("", "x", { name: "e" })).passages.length === 0, "empty doc");
});

await test("doc: question → the right passage with its real page + question number", async () => {
  const r = await selectDocPassages(BIG, "Explain question 5 about the sound wave speed", { name: "p.pdf" });
  assert(r.strategy === "search" && r.passages[0].pages === "3" && r.passages.some((p) => p.question === "5"), JSON.stringify(r.passages.map((p) => [p.pages, p.question])));
  assert(!r.passages.some((p) => p.heading.startsWith("Filler")), "filler selected");
});

await test("doc: Sinhala question → Sinhala passage; English question → Sinhala passage (glossary)", async () => {
  const si = await selectDocPassages(BIG, "ප්‍රකාශ සංශ්ලේෂණයට අවශ්‍ය වායුව කුමක්ද?", { name: "p.pdf" });
  assert(si.passages[0]?.pages === "4", `si → ${si.passages.map((p) => p.pages)}`);
  const doc = BIG + "\n\n## [p.50] අම්ල\n\n[p.50] අම්ලය නිල් ලිට්මස් රතු කරයි. ප්‍රබල අම්ලයක් සම්පූර්ණයෙන් අයනීකරණය වේ.";
  const en = await selectDocPassages(doc, "What does an acid do to blue litmus?", { name: "p.pdf" });
  assert(en.passages.some((p) => p.pages === "50"), `en → ${en.passages.map((p) => p.pages)}`);
});

await test("doc: summary → spread over every section; unrelated question → overview flagged unmatched", async () => {
  const s = await selectDocPassages(BIG, "summarise this", { name: "p.pdf" });
  assert(s.strategy === "overview" && s.passages.length > 3, s.strategy);
  assert(wantsOverview("සාරාංශයක් දෙන්න") && wantsOverview("", "ask") && !wantsOverview("what is pH"), "overview detection");
  const u = await selectDocPassages(BIG, "zxqv quantum chromodynamics", { name: "p.pdf" });
  assert(u.strategy === "fallback" && !u.matched, u.strategy);
});

await test("doc: DOCX passages have no page numbers (never invented)", async () => {
  const md = docxToMarkdown(new Uint8Array(readFileSync(`${FX}/chemistry-notes.docx`)));
  const r = await selectDocPassages(md, "moles in water", { name: "c.docx" });
  assert(!r.hasPages && r.passages.every((p) => !p.pages), "page on a docx passage");
  assert(pageLabel("12-13") === "pp.12–13" && pageLabel("3") === "p.3" && pageLabel() === "", "labels");
});

// ═════════════ Reranker ═════════════
await test("rerank: exact formula / question number / year move the right passage up", async () => {
  const cands = [
    { id: 0, text: "General notes about acids and their everyday uses in the home.", score: 3 },
    { id: 1, text: "Acids and bases overview. pH scale.", score: 2 },
    { id: 2, text: "2019 Paper II\n5. Calculate moles of H2SO4 needed to neutralise NaOH.", score: 1, question: "5", year: "2019" },
  ];
  const { results } = await rerank("2019 question 5 H2SO4 neutralise", cands);
  assert(results[0].id === 2, results.map((r) => `${r.id}:${r.why}`).join(" | "));
  assert(evidenceSignals("v = f λ", { id: 0, text: "the wave equation v=fλ", score: 1 }).why.some((w) => w.startsWith("formula")), "formula signal");
});

await test("rerank: near-duplicates pushed down", async () => {
  const t = "Newton's second law states that force equals mass times acceleration F = ma for a body.";
  const { results } = await rerank("Newton second law", [
    { id: 0, text: t, score: 3 },
    { id: 1, text: t + " ", score: 2 },
    { id: 2, text: "Momentum is mass times velocity and Newton's laws relate force to change of momentum.", score: 1 },
  ]);
  assert(results[1].id === 2 && results[2].id === 1, results.map((r) => r.id).join(","));
});

await test("rerank: TEI cross-encoder used when configured; timeout/failure → local signals", async () => {
  process.env.RERANKER_URL = "http://tei.test";
  let body: { query?: string; texts?: string[] } = {};
  mocks["tei.test/rerank"] = (_u, init) => {
    body = JSON.parse(String(init?.body));
    return json([
      { index: 2, score: 0.99 },
      { index: 0, score: 0.1 },
      { index: 1, score: 0.05 },
    ])();
  };
  const cands = ["a b c", "d e f", "g h i"].map((text, id) => ({ id, text, score: 3 - id }));
  const r = await rerank("q", cands);
  assert(r.crossEncoder && r.results[0].id === 2 && body.texts?.length === 3, JSON.stringify(r));
  process.env.RERANKER_TIMEOUT_MS = "500";
  mocks["tei.test/rerank"] = hang;
  const t0 = Date.now();
  const r2 = await rerank("q", cands);
  assert(!r2.crossEncoder && r2.results[0].id === 0 && Date.now() - t0 < 2000, "fallback failed");
  delete process.env.RERANKER_TIMEOUT_MS;
});

// ═════════════ Embeddings ═════════════
await test("embeddings: Gemini default (task types, 768 dims, normalised)", async () => {
  process.env.GEMINI_API_KEY = "k";
  let req: { requests: { taskType: string; outputDimensionality: number }[] } | null = null;
  mocks[":batchEmbedContents"] = (_u, init) => {
    req = JSON.parse(String(init?.body));
    return json({ embeddings: req!.requests.map(() => ({ values: Array(768).fill(2) })) })();
  };
  const [v] = await embedTexts(["photosynthesis"], { kind: "query" });
  assert(req!.requests[0].taskType === "RETRIEVAL_QUERY" && req!.requests[0].outputDimensionality === 768, "request");
  assert(Math.abs(Math.hypot(...v) - 1) < 1e-6, "not normalised");
  delete process.env.GEMINI_API_KEY;
});

await test("embeddings: TEI (bge-m3) provider; wrong dimension rejected", async () => {
  process.env.EMBED_PROVIDER = "tei";
  process.env.EMBED_URL = "http://tei.test";
  assert(embedSettings().model === "BAAI/bge-m3" && embedSettings().dims === 1024, "defaults");
  mocks["tei.test/embed"] = (_u, init) => json((JSON.parse(String(init?.body)).inputs as string[]).map(() => Array(1024).fill(1)))();
  const out = await embedTexts(["a", "b"], { kind: "document" });
  assert(out.length === 2 && out[0].length === 1024, "tei vectors");
  mocks["tei.test/embed"] = json([[1, 2, 3]]);
  let msg = "";
  try {
    await embedTexts(["a"], { kind: "query" });
  } catch (e) {
    msg = (e as Error).message;
  }
  assert(msg.includes("dims"), msg);
});

// ═════════════ External sources ═════════════
await test("wikipedia: summaries + free Commons image; Sinhala edition; cached", async () => {
  mocks["si.wikipedia.org"] = json({ query: { pages: [{ title: "කළු කුහරය", index: 1, extract: "කළු කුහරයක් යනු…", fullurl: "https://si.wikipedia.org/wiki/x", pageimage: "BH.jpg", thumbnail: { source: "https://upload.wikimedia.org/BH.jpg" } }] } });
  const r = await searchWikipedia("කළු කුහරය", { lang: "si" });
  assert(r.pages[0].lang === "si" && r.pages[0].image?.commons.includes("commons.wikimedia.org/wiki/File:BH.jpg"), JSON.stringify(r));
  assert(fetched[0].includes("pilicense=free"), "free-licence filter missing");
  const again = await searchWikipedia("කළු කුහරය", { lang: "si" });
  assert(again.cached && fetched.length === 1, "not cached");
  mocks["en.wikipedia.org"] = json({ query: { pages: { "1": { title: "Black hole", index: 1, extract: "A black hole…", fullurl: "https://en.wikipedia.org/wiki/Black_hole" } } } });
  assert((await searchWikipedia("black hole")).pages[0].title === "Black hole", "formatversion 1 shape");
});

await test("wikidata: facts with resolved labels, dates and units (Neptune)", async () => {
  mocks["wbsearchentities"] = json({ search: [{ id: "Q332" }] });
  mocks["ids=Q332&"] = json({
    entities: {
      Q332: {
        id: "Q332",
        labels: { en: { value: "Neptune" } },
        descriptions: { en: { value: "eighth planet from the Sun" } },
        sitelinks: { enwiki: { title: "Neptune" } },
        claims: {
          P61: [{ mainsnak: { datavalue: { type: "wikibase-entityid", value: { id: "Q123" } } } }],
          P575: [{ mainsnak: { datavalue: { type: "time", value: { time: "+1846-09-23T00:00:00Z", precision: 11 } } } }],
          P2067: [{ mainsnak: { datavalue: { type: "quantity", value: { amount: "+102.43", unit: "http://www.wikidata.org/entity/Q1234" } } } }],
          P31: [{ rank: "deprecated", mainsnak: { datavalue: { type: "wikibase-entityid", value: { id: "Q999" } } } }],
        },
      },
    },
  });
  mocks["props=labels&"] = json({ entities: { Q123: { id: "Q123", labels: { en: { value: "Johann Gottfried Galle" } } }, Q1234: { id: "Q1234", labels: { en: { value: "yottagram" } } } } });
  const { facts } = await lookupWikidata("Neptune");
  const f = Object.fromEntries(facts!.facts.map((x) => [x.property, x.values.join("; ")]));
  assert(f["discoverer or inventor"] === "Johann Gottfried Galle", JSON.stringify(f));
  assert(f["time of discovery or invention"] === "1846-09-23" && f.mass === "102.43 yottagram", JSON.stringify(f));
  assert(!f["instance of"], "deprecated claim used");
  assert(facts!.wikipedia === "https://en.wikipedia.org/wiki/Neptune", "sitelink");
});

await test("openalex: inverted-index abstract rebuilt; key + filter passed; arXiv Atom parsed; Crossref DOI", async () => {
  assert(abstractFromInvertedIndex({ Hot: [0], Jupiters: [1], have: [2], clouds: [3] }) === "Hot Jupiters have clouds", "abstract");
  process.env.OPENALEX_API_KEY = "oa-key";
  mocks["api.openalex.org"] = json({ results: [{ id: "https://openalex.org/W1", doi: "https://doi.org/10.1/abc", display_name: "Exoplanet atmospheres", publication_year: 2023, authorships: [{ author: { display_name: "A. Author" } }], primary_location: { source: { display_name: "Nature" } }, cited_by_count: 12, abstract_inverted_index: { We: [0], study: [1] }, open_access: { oa_url: null } }] });
  const oa = await searchOpenAlex("exoplanet atmospheres", { fromYear: 2020 });
  assert(oa.papers[0].doi === "10.1/abc" && oa.papers[0].abstract === "We study" && oa.papers[0].venue === "Nature", JSON.stringify(oa.papers[0]));
  assert(fetched[0].includes("api_key=oa-key") && fetched[0].includes("from_publication_date%3A2020-01-01"), fetched[0]);
  mocks["export.arxiv.org"] = () =>
    new Response(`<feed><entry><id>http://arxiv.org/abs/2401.00001v1</id><published>2024-01-01T00:00:00Z</published><title>JWST spectra of &amp; hot  Jupiters</title><summary>We observe.</summary><author><name>B. Writer</name></author><arxiv:doi>10.2/xyz</arxiv:doi></entry></feed>`, { status: 200 });
  const ax = await searchArxiv("JWST hot jupiters");
  assert(ax.papers[0].title === "JWST spectra of & hot Jupiters" && ax.papers[0].url === "https://arxiv.org/abs/2401.00001v1" && ax.papers[0].doi === "10.2/xyz", JSON.stringify(ax.papers[0]));
  mocks["api.crossref.org/works/10.1234"] = json({ message: { title: ["A paper"], issued: { "date-parts": [[2020, 1]] }, author: [{ given: "C", family: "D" }], "container-title": ["J"], URL: "https://doi.org/10.1234/q", DOI: "10.1234/q" } });
  const cr = await lookupDoi("https://doi.org/10.1234/q");
  assert(cr.paper?.title === "A paper" && cr.paper.year === 2020, JSON.stringify(cr));
  assert((await lookupDoi("not a doi")).paper === null, "invalid DOI accepted");
});

await test("research routing cue: research yes, past papers / normal questions no", () => {
  for (const q of ["Find research about exoplanet atmospheres", "Any scientific papers on microplastics?", "studies on sleep and memory", "arxiv preprints on transformers", "පර්යේෂණ ලිපි"]) assert(RESEARCH_CUE.test(q), `missed: ${q}`);
  for (const q of ["Explain this 2019 Physics past paper question", "What is Newton's second law?", "Who discovered Neptune?", "model paper answers", "research method in history"]) assert(!RESEARCH_CUE.test(q), `false positive: ${q}`);
  const names = (r: boolean) => toolDeclarations(config(), { research: r }).map((d) => d.name);
  assert(names(true).includes("search_research") && !names(false).includes("search_research") && names(false).includes("lookup_facts"), "declarations");
});

await test("tools: Wikipedia timeout / OpenAlex down → useful error or arXiv fallback, never a crash", async () => {
  mocks["en.wikipedia.org"] = hang;
  const reg = new SourceRegistry();
  const t0 = Date.now();
  const w = await runTool(config(), "search_wikipedia", { query: "slow" }, reg, {});
  assert(String(w.result.error).includes("unavailable") && Date.now() - t0 < 10_000, JSON.stringify(w.result));
  mocks["api.openalex.org"] = json({ error: "x" }, 500);
  mocks["export.arxiv.org"] = () => new Response(`<feed><entry><id>http://arxiv.org/abs/1</id><published>2022-01-01</published><title>Fallback paper</title><summary>S</summary></entry></feed>`, { status: 200 });
  const r = await runTool(config(), "search_research", { query: "exoplanets" }, reg, {});
  assert((r.result as { via?: string }).via === "arXiv" && r.sources[0].kind === "research", JSON.stringify(r.result));
  mocks["wbsearchentities"] = json({ search: [] });
  const none = await runTool(config(), "lookup_facts", { entity: "zzqx" }, reg, {});
  assert(String((none.result as { note?: string }).note).includes("no matching item"), JSON.stringify(none.result));
  const empty = await runTool(config(), "lookup_facts", { entity: "" }, reg, {});
  assert(empty.result.error, "empty entity accepted");
});

// ═════════════ Personality ═════════════
await test("personality: every mode has a style-only block; normal adds nothing; client input validated", () => {
  for (const id of PERSONALITY_IDS) {
    const b = personalityBlock(id);
    if (id === "normal") assert(b === "", "normal not empty");
    else assert(b.includes("never WHAT is true") && b.includes("accuracy wins"), `${id} block missing guardrails`);
  }
  assert(personalityBlock("hacker") === "", "unknown id accepted");
  assert(parseProfile({ personality: "exam_coach" })?.personality === "exam_coach", "valid dropped");
  assert(parseProfile({ personality: "<script>" }) === undefined, "invalid kept");
});

// ── report ───────────────────────────────────
globalThis.fetch = realFetch;
const failed = results.filter((r) => !r.ok);
for (const r of results) console.log(`${r.ok ? "✓" : "✗"} ${r.name}${r.ok ? "" : `\n    → ${r.detail}`}`);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
export const ok = failed.length === 0;
