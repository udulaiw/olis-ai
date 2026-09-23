// ─────────────────────────────────────────────
// OLIS AI self-test: runs the real server code (router, providers, agent, API
// routes) against MOCKED Gemini / NVIDIA responses. No API keys or network
// needed, and it never calls a real (or paid) model.
//
//   npm run test:ai
// ─────────────────────────────────────────────
import { POST as agentPOST } from "../api/agent";
import { POST as generatePOST } from "../api/generate";
import { GET as healthGET } from "../api/health";
import { streamWithFallback, candidates, RouterExhausted, type RouterEvent } from "../server/ai/router";
import { classifyRequest, detectLanguage } from "../server/ai/intent";
import { _resetHealth } from "../server/ai/health";
import { _resetMemoryStore } from "../server/ai/store";
import { _resetProviders } from "../server/ai/providers";
import { policyBlock } from "../server/ai/policy";
import { catalog } from "../server/ai/models.config";

// ── Tiny test harness ──────────────────────────
const results: { name: string; ok: boolean; detail?: string }[] = [];
async function test(name: string, fn: () => Promise<void> | void) {
  reset();
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

// ── Mock providers ─────────────────────────────
type Behaviour =
  | { kind: "text"; text: string }
  | { kind: "status"; status: number; body?: unknown }
  | { kind: "hang" }
  | { kind: "partial_then_error"; text: string }
  | { kind: "tool_then_text"; call: { name: string; args: Record<string, unknown> }; text: string }
  | { kind: "json"; text: string };

let behaviours: Record<string, Behaviour[]> = {}; // model id → queue (last one repeats)
let calls: { model: string; body: Record<string, unknown> }[] = [];
const logs: string[] = [];

const sse = (lines: string[]) =>
  new Response(
    new ReadableStream({
      start(c) {
        const enc = new TextEncoder();
        for (const l of lines) c.enqueue(enc.encode(`data: ${l}\n\n`));
        c.close();
      },
    }),
    { status: 200, headers: { "Content-Type": "text/event-stream" } },
  );
const gText = (t: string) => JSON.stringify({ candidates: [{ content: { parts: [{ text: t }] } }] });
const oaText = (t: string) => JSON.stringify({ choices: [{ delta: { content: t } }] });

function next(model: string): Behaviour {
  const q = behaviours[model] ?? [{ kind: "text", text: `answer from ${model}` }];
  return q.length > 1 ? q.shift()! : q[0];
}

const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input instanceof Request ? input.url : input);
  const signal = init?.signal ?? undefined;
  let model = "";
  let isGemini = false;
  if (url.includes("generativelanguage")) {
    isGemini = true;
    model = decodeURIComponent(url.match(/models\/([^:]+):/)?.[1] ?? "");
    if (url.includes(":embedContent")) return new Response("{}", { status: 400 });
  } else if (url.includes("integrate.api.nvidia.com")) {
    model = String(JSON.parse(String(init?.body ?? "{}")).model);
  } else if (url.includes("wikipedia.org")) {
    return new Response(JSON.stringify({ query: { pages: {} } }), { status: 200 });
  } else return new Response("not mocked", { status: 404 });

  calls.push({ model, body: JSON.parse(String(init?.body ?? "{}")) });
  const b = next(model);
  if (b.kind === "hang")
    return new Promise<Response>((_, reject) => {
      signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
    });
  if (b.kind === "status") return new Response(JSON.stringify(b.body ?? { error: { message: `HTTP ${b.status}` } }), { status: b.status });
  if (b.kind === "partial_then_error")
    return sse(isGemini ? [gText(b.text), JSON.stringify({ error: { code: 503, message: "overloaded" } })] : [oaText(b.text), JSON.stringify({ error: { code: 503, message: "overloaded" } })]);
  if (b.kind === "tool_then_text") {
    // First call → function call with a thought signature; later calls → text
    behaviours[model] = [{ kind: "text", text: b.text }];
    return sse([JSON.stringify({ candidates: [{ content: { parts: [{ functionCall: { name: b.call.name, args: b.call.args }, thoughtSignature: "SIG123" }] } }] })]);
  }
  const text = b.text;
  return sse(isGemini ? [gText(text.slice(0, 5)), gText(text.slice(5))] : [oaText(text.slice(0, 5)), oaText(text.slice(5)), "[DONE]"]);
}) as typeof fetch;

const realLog = console.log;
console.log = (...a: unknown[]) => {
  logs.push(a.map(String).join(" "));
};
const realErr = console.error;
console.error = (...a: unknown[]) => {
  logs.push("ERR " + a.map(String).join(" "));
};

const BASE_ENV = {
  GEMINI_API_KEY: "AIzaTESTKEY_do_not_log_1234567890",
  NVIDIA_API_KEY: "nvapi-TESTKEY-do-not-log",
  OLIS_FREE_BETA: "",
  AI_FIRST_CHUNK_TIMEOUT_MS: "400",
  AI_IDLE_TIMEOUT_MS: "400",
  OLIS_ADMIN_TOKEN: "admin-secret",
  DAILY_REQUEST_LIMIT: "500",
  RATE_LIMIT_PER_10MIN: "500",
};
function reset(env: Record<string, string> = {}) {
  for (const k of ["GEMINI_MODEL", "LOCAL_AI_BASE_URL", "UPSTASH_REDIS_REST_URL", "TAVILY_API_KEY"]) delete process.env[k];
  Object.assign(process.env, BASE_ENV, env);
  behaviours = {};
  calls = [];
  logs.length = 0;
  _resetHealth();
  _resetMemoryStore();
  _resetProviders();
}

async function collect(gen: AsyncGenerator<RouterEvent>) {
  const evs: RouterEvent[] = [];
  let text = "";
  for await (const e of gen) {
    evs.push(e);
    if (e.type === "text") text += e.delta;
    if (e.type === "rewind") text = "";
  }
  return { evs, text };
}

const req = (text: string) => ({ system: "sys", messages: [{ role: "user" as const, text }] });

function apiRequest(path: string, body: unknown, headers: Record<string, string> = { origin: "http://olis.test" }) {
  return new Request(`http://olis.test${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", host: "olis.test", "x-real-ip": "10.0.0.1", ...headers },
    body: JSON.stringify(body),
  });
}
async function readSSE(res: Response) {
  const raw = await res.text();
  const events = raw
    .split("\n\n")
    .map((f) => f.replace(/^data: /, "").trim())
    .filter(Boolean)
    .map((j) => JSON.parse(j) as { type: string; delta?: string; code?: string; message?: string; to?: number; label?: string });
  let text = "";
  for (const e of events) {
    if (e.type === "text") text += e.delta;
    if (e.type === "rewind") text = text.slice(0, e.to);
  }
  return { events, text };
}
const agentBody = (content: string, extra: Record<string, unknown> = {}) => ({
  messages: [{ role: "user", content }],
  mode: "ask",
  context: { subject: "General", level: "Intermediate", style: "Detailed explanation" },
  ...extra,
});

// ── Scenarios ──────────────────────────────────
await test("1. normal question → fast model answers", async () => {
  const c = classifyRequest({ question: "What is momentum?", mode: "ask", subject: "General" });
  assert(c.task === "general", `task=${c.task}`);
  const { text, evs } = await collect(streamWithFallback({ task: c.task, required: c.required, req: req("What is momentum?") }));
  const first = evs.find((e) => e.type === "attempt") as { model: string } | undefined;
  assert(first?.model === "gemini-3.5-flash-lite", `model=${first?.model}`);
  assert(text === "answer from gemini-3.5-flash-lite", `text=${text}`);
});

await test("2. complex Combined Maths problem → reasoning model", async () => {
  const q = "Prove from first principles that d/dx (x^2) = 2x and hence find the gradient of y = x^2 at x = 3";
  const c = classifyRequest({ question: q, mode: "ask", subject: "Combined Mathematics" });
  assert(c.task === "mathematics", `task=${c.task}`);
  const { evs } = await collect(streamWithFallback({ task: c.task, required: c.required, req: req(q) }));
  const first = evs.find((e) => e.type === "attempt") as { model: string };
  assert(first.model === "gemini-3.5-flash", `model=${first.model}`);
});

await test("2b. physics calculation → reasoning route", () => {
  const c = classifyRequest({ question: "A 2 kg trolley moving at 3 m/s hits a 1 kg trolley and they stick. Calculate the common velocity.", mode: "ask", subject: "Physics" });
  assert(c.task === "physics", `task=${c.task}`);
});

await test("3. Sinhala question → sinhala route + Sinhala prompt", async () => {
  const q = "ගුරුත්වාකර්ෂණ බලය කියන්නේ මොකක්ද?";
  assert(detectLanguage(q) === "si", `lang=${detectLanguage(q)}`);
  const res = await agentPOST(apiRequest("/api/agent", agentBody(q)));
  const { text } = await readSSE(res);
  const body = calls.find((c) => c.model.startsWith("gemini"))!.body as { systemInstruction: { parts: { text: string }[] } };
  assert(calls[0].model === "gemini-3.5-flash", `model=${calls[0].model}`);
  assert(body.systemInstruction.parts[0].text.includes("Reply in Sinhala (Sinhala script)"), "system prompt lacks Sinhala rule");
  assert(text.length > 0, "no answer");
});

await test("4. mixed Sinhala + English → sinhala route", () => {
  const c = classifyRequest({ question: "මේ integration question එක explain කරන්න", mode: "ask" });
  assert(c.language === "mixed" && c.task === "sinhala", `${c.language}/${c.task}`);
  const s = classifyRequest({ question: "meka explain karanna puluwanda", mode: "ask" });
  assert(s.language === "singlish" && s.task === "sinhala", `singlish: ${s.language}/${s.task}`);
  const e = classifyRequest({ question: "Explain Newton's second law", mode: "ask" });
  assert(e.language === "en", `english: ${e.language}`);
});

await test("5. provider timeout → falls back to next model", async () => {
  behaviours["gemini-3.5-flash-lite"] = [{ kind: "hang" }];
  const { evs, text } = await collect(streamWithFallback({ task: "general", required: ["text"], req: req("hi") }));
  assert(evs.some((e) => e.type === "switching" && e.reason === "timeout"), "no switching(timeout) event");
  assert(text === "answer from gemini-3.5-flash", `text=${text}`);
});

await test("6. rate limit → switch model + cool down", async () => {
  behaviours["gemini-3.5-flash-lite"] = [{ kind: "status", status: 429, body: { error: { message: "RESOURCE_EXHAUSTED", details: [{ "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: "42s" }] } } }];
  const { text } = await collect(streamWithFallback({ task: "general", required: ["text"], req: req("hi") }));
  assert(text === "answer from gemini-3.5-flash", `text=${text}`);
  assert(calls.filter((c) => c.model === "gemini-3.5-flash-lite").length === 1, "rate-limited model was retried");
  const { skipped } = candidates("general", ["text"]);
  assert(skipped.some((s) => s.key === "gemini-fast" && s.reason.includes("rate_limit")), "model not cooling down");
});

await test("7. server error → retry once, then fall back", async () => {
  behaviours["gemini-3.5-flash-lite"] = [{ kind: "status", status: 500 }, { kind: "status", status: 500 }];
  const { text } = await collect(streamWithFallback({ task: "general", required: ["text"], req: req("hi") }));
  assert(calls.filter((c) => c.model === "gemini-3.5-flash-lite").length === 2, `tries=${calls.filter((c) => c.model === "gemini-3.5-flash-lite").length}`);
  assert(text === "answer from gemini-3.5-flash", `text=${text}`);
});

await test("7b. failure mid-answer → rewind + clean answer from fallback", async () => {
  behaviours["gemini-3.5-flash-lite"] = [{ kind: "partial_then_error", text: "Half an ans" }, { kind: "partial_then_error", text: "Half again" }];
  const res = await agentPOST(apiRequest("/api/agent", agentBody("hello there friend")));
  const { events, text } = await readSSE(res);
  assert(events.some((e) => e.type === "rewind"), "no rewind event");
  assert(events.some((e) => e.type === "notice"), "no switching notice");
  assert(text === "answer from gemini-3.5-flash", `text=${JSON.stringify(text)}`);
});

await test("7c. invalid request (400) → never resent to that provider", async () => {
  for (const m of ["gemini-3.5-flash-lite", "gemini-3.5-flash", "gemini-2.5-flash"]) behaviours[m] = [{ kind: "status", status: 400, body: { error: { message: "Invalid JSON payload" } } }];
  const { text } = await collect(streamWithFallback({ task: "general", required: ["text"], req: req("hi") }));
  assert(calls.filter((c) => c.model.startsWith("gemini")).length === 1, `gemini calls=${calls.filter((c) => c.model.startsWith("gemini")).length}`);
  assert(text === "answer from openai/gpt-oss-20b", `text=${text}`);
});

await test("7d. invalid key (auth) → skip provider, use NVIDIA", async () => {
  behaviours["gemini-3.5-flash-lite"] = [{ kind: "status", status: 400, body: { error: { message: "API key not valid. Please pass a valid API key." } } }];
  const { text } = await collect(streamWithFallback({ task: "general", required: ["text"], req: req("hi") }));
  assert(text === "answer from openai/gpt-oss-20b", `text=${text}`);
  const { skipped } = candidates("general", ["text"]);
  assert(skipped.filter((s) => s.key.startsWith("gemini")).length === 3, "gemini not cooled down after auth error");
});

await test("8. all providers unavailable → friendly error", async () => {
  for (const m of catalog().map((x) => x.model)) behaviours[m] = [{ kind: "status", status: 503 }];
  const res = await agentPOST(apiRequest("/api/agent", agentBody("What is entropy in chemistry?")));
  const { events } = await readSSE(res);
  const err = events.find((e) => e.type === "error");
  assert(err?.code === "unavailable", `code=${err?.code}`);
  assert(err?.message === "OLIS's AI engines are unavailable right now. Please try again shortly.", `msg=${err?.message}`);
  assert(calls.length <= 2 * 6, `too many calls: ${calls.length}`);
});

await test("8b. everything rate limited → 'very busy' message", async () => {
  for (const m of catalog().map((x) => x.model)) behaviours[m] = [{ kind: "status", status: 429 }];
  let err: unknown;
  try {
    await collect(streamWithFallback({ task: "general", required: ["text"], req: req("hi") }));
  } catch (e) {
    err = e;
  }
  assert(err instanceof RouterExhausted && err.allRateLimited, "not reported as rate limited");
});

await test("9. missing API keys → 503 config, health not ok", async () => {
  reset({ GEMINI_API_KEY: "", NVIDIA_API_KEY: "" });
  const res = await agentPOST(apiRequest("/api/agent", agentBody("hi")));
  assert(res.status === 503, `status=${res.status}`);
  const h = (await (await healthGET(new Request("http://olis.test/api/health"))).json()) as { ok: boolean };
  assert(h.ok === false, "health ok with no keys");
  assert(calls.length === 0, "a provider was called without a key");
});

await test("10. unauthorized requests are refused", async () => {
  const noOrigin = await agentPOST(apiRequest("/api/agent", agentBody("hi"), {}));
  assert(noOrigin.status === 403, `no-origin status=${noOrigin.status}`);
  const evil = await agentPOST(apiRequest("/api/agent", agentBody("hi"), { origin: "https://evil.example" }));
  assert(evil.status === 403, `bad-origin status=${evil.status}`);
  const detail = await healthGET(new Request("http://olis.test/api/health?detail=1"));
  assert(detail.status === 401, `health detail without token=${detail.status}`);
  const wrong = await healthGET(new Request("http://olis.test/api/health?detail=1", { headers: { "x-olis-admin": "nope" } }));
  assert(wrong.status === 401, `wrong token=${wrong.status}`);
  const ok = await healthGET(new Request("http://olis.test/api/health?detail=1", { headers: { "x-olis-admin": "admin-secret" } }));
  const body = await ok.text();
  assert(ok.status === 200 && body.includes("gemini-3.5-flash-lite"), "admin health missing");
  assert(!body.includes("AIza") && !body.includes("nvapi-"), "admin health leaks a key");
  const pub = await (await healthGET(new Request("http://olis.test/api/health"))).text();
  assert(!pub.includes("gemini") && !pub.includes("nvidia"), "public health exposes provider names");
  assert(calls.length === 0, "a model was called for a refused request");
});

await test("11. Free Beta blocks paid / unknown models", () => {
  reset({ GEMINI_MODEL: "gemini-3.1-pro-preview" });
  const { skipped } = candidates("general", ["text"]);
  assert(skipped.some((s) => s.key === "gemini-fast" && s.reason.startsWith("free beta")), "paid model not blocked");
  reset({ GEMINI_MODEL: "some-new-model" });
  assert(policyBlock(catalog().find((m) => m.key === "gemini-fast")!) !== null, "unlisted model allowed");
  reset({ GEMINI_MODEL: "some-new-model", OLIS_FREE_BETA_EXTRA_MODELS: "gemini:some-new-model" });
  assert(policyBlock(catalog().find((m) => m.key === "gemini-fast")!) === null, "explicit approval ignored");
  delete process.env.OLIS_FREE_BETA_EXTRA_MODELS;
  reset({ OLIS_FREE_BETA: "flase" }); // typo keeps protection on
  assert(policyBlock({ ...catalog()[0], tier: "paid" }) !== null, "typo disabled Free Beta");
  reset({ OLIS_FREE_BETA: "false" });
  assert(policyBlock({ ...catalog()[0], tier: "paid" }) === null, "OLIS_FREE_BETA=false didn't allow paid tier");
});

await test("12. tool loop keeps Gemini thought signatures", async () => {
  behaviours["gemini-3.5-flash"] = [{ kind: "tool_then_text", call: { name: "search_wikipedia", args: { query: "photosynthesis" } }, text: "Photosynthesis is [1]." }];
  const res = await agentPOST(apiRequest("/api/agent", agentBody("Explain the detailed mechanism of photosynthesis and calculate its efficiency", { mode: "solve" })));
  const { text, events } = await readSSE(res);
  assert(events.some((e) => e.type === "step" && e.label?.includes("Wikipedia")), "tool step missing");
  const second = calls.filter((c) => c.model === "gemini-3.5-flash")[1]?.body as { contents: { role: string; parts: { thoughtSignature?: string; functionResponse?: unknown }[] }[] };
  assert(second, "no second turn");
  assert(second.contents.some((c) => c.role === "model" && c.parts.some((p) => p.thoughtSignature === "SIG123")), "thought signature not returned");
  assert(second.contents.some((c) => c.parts.some((p) => p.functionResponse)), "function response missing");
  assert(text.includes("Photosynthesis"), `text=${text}`);
});

await test("13. photo question → vision route + image sent", async () => {
  const img = { mimeType: "image/jpeg", data: "/9j/4AAQSkZJRgABAQ==" };
  const res = await agentPOST(apiRequest("/api/agent", agentBody("", { messages: [], images: [img] })));
  await readSSE(res);
  const body = calls[0]?.body as { contents: { parts: { inlineData?: unknown }[] }[] };
  assert(calls[0]?.model === "gemini-3.5-flash", `model=${calls[0]?.model}`);
  assert(body.contents.at(-1)!.parts.some((p) => p.inlineData), "image not sent");
  const bad = await agentPOST(apiRequest("/api/agent", agentBody("x", { images: [{ mimeType: "image/svg+xml", data: "PHN2Zz4=" }] })));
  assert(bad.status === 400, `svg accepted: ${bad.status}`);
});

await test("14. daily per-student limit", async () => {
  reset({ DAILY_REQUEST_LIMIT: "2" });
  const r = async () => (await agentPOST(apiRequest("/api/agent", agentBody("hi")))).status;
  const s = [await r(), await r(), await r()];
  assert(s[0] === 200 && s[1] === 200 && s[2] === 429, `statuses=${s}`);
});

await test("15. quiz JSON: unusable output → next model", async () => {
  behaviours["gemini-3.5-flash-lite"] = [{ kind: "json", text: "Sure! Here's a quiz: not json" }];
  behaviours["gemini-3.5-flash"] = [
    { kind: "json", text: JSON.stringify({ title: "Moles", questions: [{ q: "1 mol of C-12 has mass?", options: ["12 g", "6 g", "1 g", "24 g"], answer: 0, explanation: "By definition." }] }) },
  ];
  const res = await generatePOST(apiRequest("/api/generate", { kind: "quiz", topic: "moles", context: {} }));
  const j = (await res.json()) as { data?: { questions: unknown[] } };
  assert(res.status === 200 && j.data?.questions.length === 1, `status=${res.status}`);
});

await test("16. NVIDIA reasoning output hides <think> blocks", async () => {
  for (const m of ["gemini-3.5-flash-lite", "gemini-3.5-flash", "gemini-2.5-flash"]) behaviours[m] = [{ kind: "status", status: 503 }];
  behaviours["openai/gpt-oss-20b"] = [{ kind: "text", text: "<think>secret reasoning</think>Final answer." }];
  const { text } = await collect(streamWithFallback({ task: "general", required: ["text"], req: req("hi") }));
  assert(text === "Final answer.", `text=${JSON.stringify(text)}`);
});

await test("17. logs: no keys, no student text", async () => {
  process.env.OLIS_AI_LOGS = "";
  behaviours["gemini-3.5-flash-lite"] = [{ kind: "status", status: 429 }];
  await readSSE(await agentPOST(apiRequest("/api/agent", agentBody("MY SECRET QUESTION ABOUT MOLES"))));
  const all = logs.join("\n");
  assert(all.includes('"evt":"ai.call"'), "no ai.call logs");
  assert(all.includes('"error":"rate_limit"') && all.includes('"evt":"ai.fallback"'), "fallback not logged");
  assert(!all.includes("AIza") && !all.includes("nvapi-"), "a key was logged");
  assert(!all.includes("MY SECRET QUESTION"), "student text was logged");
});

// ── Report ─────────────────────────────────────
globalThis.fetch = realFetch;
console.log = realLog;
console.error = realErr;
const failed = results.filter((r) => !r.ok);
for (const r of results) console.log(`${r.ok ? "✓" : "✗"} ${r.name}${r.ok ? "" : `\n    → ${r.detail}`}`);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
export const ok = failed.length === 0;
