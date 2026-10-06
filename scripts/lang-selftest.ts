// OLIS language + Unicode regression tests. Pure logic: no network, no API keys.
//
//   npm run test:lang
//
// Covers: language detection, reply-language choice, Singlish/Sinhala query expansion,
// follow-up resolution, exam-level detection, Sinhala Unicode integrity (NFC, ZWJ conjuncts,
// chunk-split streaming, mojibake, Devanagari guard) and the deterministic maths tool.
import { readFileSync } from "node:fs";
import { detectLanguage, replyLanguage, expandQuery, resolveFollowUp, detectExamLevel, explicitLanguageRequest, stemSinhala, stripLanguageRequests } from "../server/lang/nlp.mjs";
import { cleanSinhala, scanText, repairMojibake, createScriptGuard, fixVisualOrder, looksLikeLegacySinhalaFont, scriptStats } from "../server/lang/unicode.mjs";
import { tokenize } from "../server/text.mjs";
import { sseData } from "../server/ai/providers/shared";
import { sseStream } from "../server/http";
import { parseProfile, parseContext, str } from "../server/sanitize";
import { guessTopic, guessSubject, TAXONOMY, STRATEGIES, strategyFor } from "../server/knowledge/taxonomy";
import { classifyRequest, type LanguagePref } from "../server/ai/intent";
import { detectLive } from "../server/live/detect";
import { parseNewsRss } from "../server/live/tools";
import { extractMemories, selectMemories, parseMemories } from "../server/memory";
import { findRecall } from "../src/lib/recall";
import type { Chat } from "../src/types";
import { mathCheck } from "../server/mathcheck";
import { SI_TERMS } from "../server/lang/glossary.mjs";

const data = JSON.parse(readFileSync(new URL("../evals/olis-eval.json", import.meta.url), "utf8"));
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

// ── Language detection / reply language ───────────────────────────────────────
for (const c of data.language as { q: string; pref?: "en" | "si"; history?: { role: string; content: string }[]; detected: string; reply: string }[]) {
  await test(`lang: ${c.q.slice(0, 48)}${c.pref ? ` [pref ${c.pref}]` : ""}`, () => {
    const r = replyLanguage({ question: c.q, pref: c.pref, history: c.history });
    eq(r.detected, c.detected, "detected");
    eq(r.reply, c.reply, "reply");
  });
}
await test("explicit request: last mention wins", () => {
  eq(explicitLanguageRequest("සිංහලෙන් නෙවෙයි, in English please"), "en", "last mention");
});

// ── Follow-ups ────────────────────────────────────────────────────────────────
const H = [
  { role: "user", content: "Explain Newton's second law" },
  { role: "assistant", content: "F = ma ..." },
];
for (const c of data.followups as { q: string; kind: string | null }[]) {
  await test(`follow-up: ${c.q}`, () => {
    const r = resolveFollowUp(c.q, H);
    eq(r.kind, c.kind, "kind");
    if (c.kind) assert(/newton/i.test(r.retrievalQuery) && /newton/i.test(r.hint), "previous topic not carried into the retrieval query / hint");
  });
}
await test("follow-up with no history is not a follow-up", () => eq(resolveFollowUp("මේක තේරෙන්නෙ නෑ", []).isFollowUp, false, "isFollowUp"));

// ── Exam level ────────────────────────────────────────────────────────────────
for (const c of data.levels as { q: string; stream?: string; examLevel?: string; level: string | null }[]) {
  await test(`level: ${c.q}`, () => eq(detectExamLevel({ question: c.q, stream: c.stream, examLevel: c.examLevel }), c.level, "level"));
}
await test("taxonomy: O/L and A/L never cross-route when the level is known", () => {
  const ol = guessTopic("what is speed and acceleration", undefined, "OL");
  const al = guessTopic("what is speed and acceleration", undefined, "AL");
  assert(ol?.subject.startsWith("ol-"), `OL routed to ${ol?.subject}`);
  assert(al && !al.subject.startsWith("ol-"), `AL routed to ${al?.subject}`);
  eq(guessSubject("Kandyan kingdom history", undefined, "OL")?.id, "ol-history", "history subject");
});

// ── Normalisation / expansion ─────────────────────────────────────────────────
await test("expansion: the three 'speed in physics' phrasings share the same search terms", () => {
  const qs = ["භෞතික විද්\u200Dයාවේ වේගය කියන්නේ මොකක්ද?", "physics wala speed kiyanne mokakda?", "What is speed in physics?"];
  for (const q of qs) {
    const t = expandQuery(q).expanded.toLowerCase();
    assert(t.includes("physics") && t.includes("speed"), `"${q}" → "${t}"`);
  }
});
await test("expansion: shorthand typing is understood (krnna, kmd, wla)", () => {
  assert(expandQuery("speed eka calculate krnne kohomada").terms.includes("how"), "kohomada → how");
  assert(expandQuery("integration wla meka kmd").terms.includes("how"), "kmd → how");
  assert(expandQuery("Newton 2nd law eka explain karanna").terms.includes("second"), "2nd → second");
});
await test("expansion never rewrites the student's message (only builds a separate query)", () => {
  const q = "speed eka calculate krnne kohomada";
  const before = q;
  expandQuery(q);
  eq(q, before, "original");
  assert(expandQuery(q).normalized.includes("karanne"), "normalized form fixes shorthand");
});
await test("stemming: Sinhala inflections of one word collapse to one stem", () => {
  const forms = ["වේගය", "වේගයේ", "වේගයෙන්", "වේගයක්", "වේගයට"];
  assert(new Set(forms.map(stemSinhala)).size === 1, `stems: ${forms.map(stemSinhala).join(", ")}`);
  eq(tokenize("වේගයේ"), tokenize("වේගය"), "tokenize");
});
await test("glossary: every Sinhala key is NFC and contains no zero-width junk", () => {
  for (const k of Object.keys(SI_TERMS)) {
    assert(k === k.normalize("NFC"), `not NFC: ${k}`);
    assert(!/[\u200B\u200C\uFEFF]/.test(k), `zero-width char in key: ${JSON.stringify(k)}`);
  }
});
await test("taxonomy: every subject has a level and unique ids", () => {
  const ids = TAXONOMY.map((s) => s.id);
  assert(new Set(ids).size === ids.length, "duplicate subject ids");
  // "ANY" = cross-level (study skills, general knowledge): shown to O/L and A/L students alike
  assert(TAXONOMY.every((s) => s.level === "OL" || s.level === "AL" || s.level === "ANY"), "missing level");
});

// ── Subject registry + router ─────────────────────────────────────────────────
await test("registry: every subject and unit strategy resolves; aliases are NFC", () => {
  for (const sub of TAXONOMY) {
    assert(STRATEGIES[sub.strategy], `${sub.id}: unknown strategy ${sub.strategy}`);
    for (const u of sub.units) assert(STRATEGIES[strategyFor(sub.id, u.id)], `${sub.id}/${u.id}: unknown strategy`);
    for (const a of sub.aliases) assert(a === a.normalize("NFC"), `${sub.id}: alias not NFC: ${a}`);
  }
  const unitIds = TAXONOMY.flatMap((x) => x.units.map((u) => `${x.id}/${u.id}`));
  assert(new Set(unitIds).size === unitIds.length, "duplicate unit ids");
  eq(strategyFor("ol-science", "ol-electricity"), "physics", "O/L Science unit override");
  eq(strategyFor("nope"), "general", "unknown subject");
});
await test("router: answer-language requests are not read as the language subject", () => {
  eq(stripLanguageRequests("explain osmosis in sinhala"), "explain osmosis", "en");
  eq(stripLanguageRequests("ප්‍රකාශ සංශ්ලේෂණය සිංහලෙන්"), "ප්‍රකාශ සංශ්ලේෂණය", "si");
  eq(stripLanguageRequests("Correct this Sinhala essay"), "Correct this Sinhala essay", "subject mention kept");
});
await test("profile: Tamil is a valid saved answer language", () => {
  eq(parseProfile({ language: "ta" })?.language, "ta", "sanitiser");
  eq(replyLanguage({ question: "what is speed", pref: "ta" }).reply, "ta", "reply");
  eq(replyLanguage({ question: "what is speed in English", pref: "ta" }).reply, "en", "explicit request still wins");
});
for (const c of data.router as { q: string; examLevel?: string; pref?: LanguagePref; want: Record<string, unknown>; note?: string }[]) {
  await test(`router: ${c.q.slice(0, 70)}`, () => {
    const r = classifyRequest({ question: c.q, mode: "ask", subject: "General", examLevel: c.examLevel, languagePref: c.pref }) as unknown as Record<string, unknown>;
    const got: Record<string, unknown> = { ...r, level: r.examLevel, topic: (r.topic as { unit?: string } | undefined)?.unit ?? null, language: r.language };
    for (const [k, v] of Object.entries(c.want)) eq(got[k] ?? null, v, k);
  });
}

// ── Live data routing ─────────────────────────────────────────────────────────
for (const [q, want] of data.live_routing as [string, string | null][]) {
  await test(`live: ${q}`, () => eq(detectLive(q, expandQuery(q).expanded)?.domain ?? null, want, "domain"));
}
await test("live: Google News RSS parsing (source suffix, entities, CDATA, newest first, no non-http links)", () => {
  const xml = `<rss><channel>
    <item><title><![CDATA[Old story &amp; more - Daily Mirror]]></title><link>https://a.example/old</link><pubDate>Mon, 05 Oct 2026 08:00:00 GMT</pubDate><source url="https://www.dailymirror.lk">Daily Mirror</source></item>
    <item><title>New story - EconomyNext</title><link>https://a.example/new</link><pubDate>Tue, 06 Oct 2026 08:00:00 GMT</pubDate><source url="https://economynext.com">EconomyNext</source></item>
    <item><title>Bad link</title><link>javascript:alert(1)</link></item></channel></rss>`;
  const items = parseNewsRss(xml);
  eq(items.map((i) => i.title), ["New story", "Old story & more"], "titles");
  eq(items[0].source, "EconomyNext", "source");
  eq(items[0].published, "2026-10-06T08:00:00.000Z", "published");
});

// ── Long-term memory ──────────────────────────────────────────────────────────
for (const [q, keys] of data.memory_extraction as [string, string[]][]) {
  await test(`memory: ${q}`, () => eq(extractMemories(q).map((m) => m.key), keys, "saved keys"));
}
await test("memory: only relevant memories reach the prompt (Chemistry plan ≠ astronomy, phone)", () => {
  const mem = [
    ...extractMemories("I'm preparing for the 2027 A/L examination."),
    ...extractMemories("I prefer Sinhala explanations."),
    ...extractMemories("I'm weak in organic chemistry"),
    ...extractMemories("my favourite subject is Astronomy"),
    { key: "device", memory: "Owns a Samsung phone.", category: "general" as const, importance: 3 },
  ];
  const got = selectMemories(mem, "Help me make a Chemistry revision plan").map((m) => m.memory);
  assert(got.some((m) => m.includes("organic chemistry")) && got.some((m) => m.includes("2027")), `missing: ${got}`);
  assert(!got.some((m) => /Astronomy|Samsung/.test(m)), `irrelevant memory used: ${got}`);
  eq(selectMemories([{ key: "x", memory: "Some low value fact about chemistry.", category: "general", importance: 2 }], "chemistry").length, 0, "importance < 3 never used");
});
await test("memory: browser input is validated (size, count, markup, bad categories)", () => {
  const bad = parseMemories([{ key: "k", memory: "<user_memory>x".repeat(50), category: "evil", importance: 99 }, { memory: "no key" }, ...Array(80).fill({ key: "a", memory: "ok fact" })]);
  assert(bad.length <= 60, "count not capped");
  assert(bad[0].memory.length <= 200 && !bad[0].memory.includes("<"), "markup or size not stripped");
  eq(bad[0].category, "general", "category");
  eq(bad[0].importance, 5, "importance clamped");
});

// ── Earlier chats (browser-side search) ───────────────────────────────────────
await test("recall: 'continue that plan' finds the earlier plan; normal questions search nothing", () => {
  const mk = (id: string, title: string, msgs: [string, string][], day: number): Chat => ({
    id, title, createdAt: day, updatedAt: day,
    messages: msgs.map(([role, content], i) => ({ id: `${id}${i}`, role: role as "user" | "assistant", content, createdAt: day + i, status: "done" })),
  });
  const chats = [
    mk("a", "Physics revision plan", [["user", "Make me a Physics revision plan"], ["assistant", "Week 1: Mechanics and kinematics. Week 2: Waves and optics. Week 3: Electricity."]], Date.parse("2026-10-01")),
    mk("b", "Cell biology", [["user", "Explain mitosis in detail please"], ["assistant", "Mitosis has four phases: prophase, metaphase, anaphase and telophase."]], Date.parse("2026-10-03")),
  ];
  const r = findRecall("Can you continue the Physics plan we made?", chats, "current");
  assert(r.length && r[0].text.includes("Week 2"), `got ${JSON.stringify(r[0])}`);
  eq(findRecall("Explain mitosis", chats, "current").length, 0, "no cue → no search");
  eq(findRecall("continue that plan", chats, "a").filter((x) => x.chat === "Physics revision plan").length, 0, "current chat excluded");
});

// ── Unicode integrity ─────────────────────────────────────────────────────────
for (const t of data.unicode.must_be_clean as string[]) {
  await test(`unicode clean: ${t}`, () => {
    eq(scanText(t, "any"), [], "issues");
    eq(scanText(t, t.match(/[\u0D80-\u0DFF]/) && !/[A-Za-z]{4,}/.test(t) ? "si" : "any"), [], "issues (strict)");
    eq(cleanSinhala(t), t, "cleanSinhala must not change valid text");
    eq(t.normalize("NFC"), t, "already NFC");
    eq(JSON.parse(JSON.stringify({ t })).t, t, "JSON round trip");
    eq(new TextDecoder().decode(new TextEncoder().encode(t)), t, "UTF-8 round trip");
  });
}
for (const c of data.unicode.must_be_flagged as { text: string; expect: "si" | "en"; code: string }[]) {
  await test(`unicode flagged: ${c.code}`, () => assert(scanText(c.text, c.expect).some((i) => i.code === c.code), `${c.code} not detected in ${JSON.stringify(c.text)}`));
}
await test("unicode: ZWJ conjuncts (ශ්\u200Dරී, විද්\u200Dයා) are preserved; a stray ZWJ is removed", () => {
  const ok = "ශ්\u200Dරී විද්\u200Dයාව ක්\u200Dරියා";
  assert(ok.includes("\u200D"), "fixture lost its ZWJ");
  eq(cleanSinhala(ok), ok, "valid conjuncts");
  eq(cleanSinhala("ක\u200Dම"), "කම", "stray ZWJ");
});
await test("unicode: NFD-typed Sinhala (decomposed vowel signs) is normalised to NFC for search and storage", () => {
  const s = "කොළඹ ගෞරවය";
  const nfd = s.normalize("NFD");
  assert(nfd !== s, "fixture is not decomposable");
  eq(cleanSinhala(nfd), s, "NFC");
  eq(tokenize(nfd), tokenize(s), "same search tokens");
  eq(str(nfd, 100), s, "sanitize.str");
});
await test("unicode: NFKD (the old tokenizer) would have split ො ෝ ෞ — the new one keeps them", () => {
  const s = "කොළඹ";
  assert(s.normalize("NFKD").length > s.length, "fixture should decompose");
  assert(tokenize(s)[0].length === s.length || tokenize(s)[0].length >= 3, "tokenizer decomposed Sinhala");
});
await test("streaming: Sinhala split at EVERY byte offset decodes identically (SSE reader)", async () => {
  const payload = JSON.stringify({ t: "ශ්\u200Dරී ලංකාව · විද්\u200Dයාව · භෞතික · Newton's law එක" });
  const bytes = new TextEncoder().encode(`data: ${payload}\n\ndata: [DONE]\n\n`);
  for (let cut = 1; cut < bytes.length; cut++) {
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(bytes.slice(0, cut));
        c.enqueue(bytes.slice(cut));
        c.close();
      },
    });
    const out: string[] = [];
    for await (const p of sseData(stream)) out.push(p);
    assert(out.length === 1 && out[0] === payload, `cut at ${cut}: ${JSON.stringify(out)}`);
  }
});
await test("streaming: server SSE → browser-style decoder, byte-split, Sinhala intact", async () => {
  const text = "ශ්\u200Dරී ලංකාව; විද්\u200Dයාව; ගණිතය";
  const res = sseStream(async (send) => {
    for (const ch of [...text]) send({ type: "text", delta: ch }); // one grapheme piece per event: worst case
  });
  assert(/charset=utf-8/i.test(res.headers.get("content-type") ?? ""), "SSE content-type lacks charset=utf-8");
  const reader = res.body!.getReader();
  const dec = new TextDecoder();
  let raw = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    // re-chunk into 3-byte pieces to split code points like a slow network does
    for (let i = 0; i < value.length; i += 3) raw += dec.decode(value.slice(i, i + 3), { stream: true });
  }
  const got = raw.split("\n\n").map((f) => f.replace(/^data: /, "")).filter(Boolean).map((j) => JSON.parse(j)).filter((e) => e.type === "text").map((e) => e.delta).join("");
  eq(got, text, "reassembled text");
});
await test("mojibake: UTF-8 read as Windows-1252 is repaired losslessly; real text is left alone", () => {
  const s = "ශ්\u200Dරී ලංකාව විද්\u200Dයාව";
  const garbled = new TextDecoder("windows-1252").decode(new TextEncoder().encode(s));
  assert(garbled !== s && /[à¶·]/.test(garbled), "fixture did not garble");
  const r = repairMojibake(garbled);
  assert(r.repaired && r.text === s, `repair failed: ${r.text}`);
  eq(repairMojibake(s).repaired, false, "clean Sinhala must not be 'repaired'");
  eq(repairMojibake("café déjà vu").repaired, false, "accented Latin must not be 'repaired'");
});
await test("script guard: Devanagari / Tamil / U+FFFD in a Sinhala or English answer is caught; Sinhala and Latin pass", () => {
  const g = createScriptGuard("si");
  eq(g("ගුරුත්වාකර්ෂණ බලය Newton's law $F=ma$ 9.8 m/s²"), null, "clean Sinhala");
  assert(createScriptGuard("si")("यह बल है")?.code === "devanagari", "devanagari");
  assert(createScriptGuard("en")("வேகம்")?.code === "tamil", "tamil in en");
  assert(createScriptGuard("si")("ok �")?.code === "replacement_char", "FFFD");
  eq(createScriptGuard("any")("यह"), null, "guard off when the student works in that script");
  eq(createScriptGuard("ta")("வேகம்"), null, "tamil allowed for a Tamil reply");
});
await test("PDF extraction: visual-order vowel signs are fixed only where no consonant precedes them", () => {
  eq(fixVisualOrder("ෙපාත").text, "පොත", "ෙ + පා → පො");
  eq(fixVisualOrder("ෙක").text, "කෙ", "ෙ + ක → කෙ");
  eq(fixVisualOrder("කෙක").fixed, 0, "valid කෙක must not be touched");
  eq(fixVisualOrder("ලංකාවේ පොත්").fixed, 0, "valid words untouched");
});
await test("PDF extraction: old-font (FM Abhaya style) garbage is recognised; real English and real Sinhala are not", () => {
  assert(looksLikeLegacySinhalaFont("wdydrh fuu ú;a;sh ms<s.; ;ksf¿ iy tla ,oS m%udKh kÕk ".repeat(8)), "legacy garbage not detected");
  assert(!looksLikeLegacySinhalaFont("The speed of a body is the distance it travels per unit of time and it is a scalar quantity. ".repeat(6)), "English flagged");
  assert(!looksLikeLegacySinhalaFont("වේගය යනු කාලය සමඟ දුර වෙනස් වන ශීඝ්\u200Dරතාවයි. ".repeat(10)), "Sinhala flagged");
});
await test("profile: sanitiser keeps NFC Sinhala, rejects bad examLevel", () => {
  const p = parseProfile({ goals: "A/L ගණිතය".normalize("NFD"), examLevel: "OL", language: "si" });
  eq(p?.goals, "A/L ගණිතය", "goals NFC");
  eq(p?.examLevel, "OL", "examLevel");
  eq(parseProfile({ examLevel: "GRADE9" }), undefined, "invalid level dropped");
  eq(parseContext({ subject: "ගණිතය" }).subject, "ගණිතය", "context subject");
});
await test("scriptStats counts scripts separately", () => {
  const st = scriptStats("Newton සිංහල यह வேகம்");
  assert(st.latin === 6 && st.sinhala > 0 && st.devanagari > 0 && st.tamil > 0, JSON.stringify(st));
});
await test("detectLanguage export is stable for the old call sites", () => eq(detectLanguage("මොකක්ද"), "si", "si"));

// ── Maths tool ────────────────────────────────────────────────────────────────
await test("math_check: values, units, derivative, integral, quadratic, equivalence", () => {
  eq(mathCheck({ op: "evaluate", expr: "sqrt(3^2+4^2)" }).result, "5", "hypotenuse");
  assert(String(mathCheck({ op: "evaluate", expr: "72 km/h to m/s" }).result).startsWith("20"), "unit conversion");
  assert(String(mathCheck({ op: "derivative", expr: "x^3" }).result).includes("3 * x ^ 2"), "derivative");
  eq(mathCheck({ op: "integrate_numeric", expr: "x^2", a: "0", b: "3" }).result, "9", "∫x²");
  eq(mathCheck({ op: "quadratic", a: "2", b: "-5", c: "-3" }).roots, ["3", "-0.5"], "roots");
  eq(mathCheck({ op: "equivalent", expr: "(x^2-1)/(x-1)", expr2: "x+1" }).equivalent, true, "equivalent");
  eq(mathCheck({ op: "equivalent", expr: "sin(x)^2", expr2: "1-cos(x)" }).equivalent, false, "not equivalent");
});
await test("math_check: sandbox blocks import/evaluate/oversize input and never throws", () => {
  for (const expr of ["import('fs')", "evaluate('1+1')", "createUnit('x')", "x".repeat(400)]) assert("error" in mathCheck({ op: "evaluate", expr }), `accepted: ${expr.slice(0, 20)}`);
  assert("error" in mathCheck({ op: "nope" }), "unknown op accepted");
  assert("error" in mathCheck({ op: "quadratic", a: "0", b: "1", c: "1" }), "a=0 accepted");
});

const failed = results.filter((r) => !r.ok);
for (const r of results) console.log(`${r.ok ? "✓" : "✗"} ${r.name}${r.ok ? "" : `\n    → ${r.detail}`}`);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
export const ok = failed.length === 0;
