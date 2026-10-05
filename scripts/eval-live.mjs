#!/usr/bin/env node
// Live evaluation: sends the `live` cases in evals/olis-eval.json to a RUNNING OLIS and scores the answers
// with deterministic checks. It needs real model keys on the server, so it is not part of `npm test`.
//
//   npm run dev                                  (in one terminal, with GEMINI_API_KEY in .env.local)
//   npm run eval:live -- --base http://localhost:5173
//   npm run eval:live -- --base https://your-olis.vercel.app
//
// Checks per case (only the ones the case defines):
//   script      no Devanagari / Tamil / U+FFFD in the answer; a Sinhala reply actually contains Sinhala
//   include     answer contains at least one of must_include_any
//   exclude     answer contains none of must_not_include (invented marks, etc.)
//   unsure      for no-source questions the answer admits it could not confirm the answer
//   citations   every [n] in the answer refers to a source that was actually sent
// Not scored: whether the explanation is *good*. Read the printed answers for that, or have a teacher rate a sample.
import { readFileSync, writeFileSync } from "node:fs";

const args = process.argv.slice(2);
const opt = (n, d = "") => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : d);
const base = opt("base", "http://localhost:5173").replace(/\/$/, "");
const only = opt("only");
const data = JSON.parse(readFileSync(new URL("../evals/olis-eval.json", import.meta.url), "utf8"));

const UNSURE = /couldn't (find|confirm)|could not (find|confirm)|can't confirm|cannot confirm|not (able to )?(find|confirm)|no (source|information)|don't have|do not have|not sure|unable to verify|නිශ්චිත පිළිතුරක් තහවුරු|හමු වුණේ නැහැ|තහවුරු කරගන්න/i;

async function ask(q, extra = {}) {
  const t0 = Date.now();
  const res = await fetch(`${base}/api/agent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: base },
    body: JSON.stringify({ messages: [{ role: "user", content: q }], mode: "ask", context: { subject: "General", level: "Intermediate", style: "Detailed explanation" }, ...extra }),
  });
  if (!res.ok) return { error: `HTTP ${res.status} ${(await res.text()).slice(0, 120)}`, ms: Date.now() - t0 };
  const dec = new TextDecoder();
  let raw = "";
  for await (const chunk of res.body) raw += dec.decode(chunk, { stream: true });
  let text = "";
  let sources = 0;
  let err = null;
  for (const frame of raw.split("\n\n")) {
    const j = frame.replace(/^data: /, "").trim();
    if (!j) continue;
    let e;
    try {
      e = JSON.parse(j);
    } catch {
      continue;
    }
    if (e.type === "text") text += e.delta;
    else if (e.type === "rewind") text = text.slice(0, e.to);
    else if (e.type === "sources") sources = e.sources.length;
    else if (e.type === "error") err = e.message;
  }
  return { text, sources, error: err, ms: Date.now() - t0 };
}

const rows = [];
for (const c of data.live.filter((x) => !only || x.id === only)) {
  const r = await ask(c.q, c.profile ? { profile: c.profile } : {});
  const checks = {};
  if (r.error && !r.text) checks.answered = false;
  else {
    const t = r.text ?? "";
    checks.script = !/[ऀ-ॿ஀-௿�]/.test(t) && (c.reply === "en" || /[඀-෿]/.test(t));
    if (c.must_include_any) checks.include = c.must_include_any.some((s) => t.toLowerCase().includes(s.toLowerCase()));
    if (c.must_not_include) checks.exclude = c.must_not_include.every((s) => !t.toLowerCase().includes(s.toLowerCase()));
    if (c.expect_unsure) checks.unsure = UNSURE.test(t);
    const cited = [...t.matchAll(/\[(\d+)\]/g)].map((m) => +m[1]);
    checks.citations = cited.every((n) => n >= 1 && n <= (r.sources ?? 0));
  }
  const pass = Object.values(checks).every(Boolean);
  rows.push({ id: c.id, tags: c.tags, pass, checks, ms: r.ms, sources: r.sources, error: r.error, answer: (r.text ?? "").slice(0, 600) });
  console.log(`${pass ? "✓" : "✗"} ${c.id}  ${r.ms}ms  ${Object.entries(checks).map(([k, v]) => `${k}:${v ? "ok" : "FAIL"}`).join(" ")}${r.error ? `  error: ${r.error}` : ""}`);
}
const passed = rows.filter((r) => r.pass).length;
console.log(`\n${passed}/${rows.length} passed (deterministic checks only; read the answers in evals/last-live-report.json for quality)`);
writeFileSync(new URL("../evals/last-live-report.json", import.meta.url), JSON.stringify({ at: new Date().toISOString(), base, rows }, null, 2));
process.exit(passed === rows.length ? 0 : 1);
