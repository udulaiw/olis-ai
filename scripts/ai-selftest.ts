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
/** Live-data API mocks: host fragment → response (reset per test). Unlisted live hosts get 404 = "source down". */
let liveMocks: Record<string, () => Response> = {};
const liveHits: string[] = [];
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
  } else {
    const hit = Object.keys(liveMocks).find((h) => url.includes(h));
    if (/coingecko|er-api|open-meteo|news\.google|tavily/.test(url)) liveHits.push(url);
    if (hit) return liveMocks[hit]();
    return new Response("not mocked", { status: 404 });
  }

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
  liveMocks = {};
  liveHits.length = 0;
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
  for (const m of ["gemini-3.5-flash-lite", "gemini-3.5-flash", "gemini-3.1-flash-lite"]) behaviours[m] = [{ kind: "status", status: 400, body: { error: { message: "Invalid JSON payload" } } }];
  const { text } = await collect(streamWithFallback({ task: "general", required: ["text"], req: req("hi") }));
  assert(calls.filter((c) => c.model.startsWith("gemini")).length === 1, `gemini calls=${calls.filter((c) => c.model.startsWith("gemini")).length}`);
  assert(text === "answer from nvidia/nemotron-3-super-120b-a12b", `text=${text}`);
});

await test("7d. invalid key (auth) → skip provider, use NVIDIA", async () => {
  behaviours["gemini-3.5-flash-lite"] = [{ kind: "status", status: 400, body: { error: { message: "API key not valid. Please pass a valid API key." } } }];
  const { text } = await collect(streamWithFallback({ task: "general", required: ["text"], req: req("hi") }));
  assert(text === "answer from nvidia/nemotron-3-super-120b-a12b", `text=${text}`);
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
  assert(detail.status === 404, `health detail without token=${detail.status}`);
  const wrong = await healthGET(new Request("http://olis.test/api/health?detail=1", { headers: { "x-olis-admin": "nope" } }));
  assert(wrong.status === 404, `wrong token=${wrong.status}`);
  const ok = await healthGET(new Request("http://olis.test/api/health?detail=1", { headers: { "x-olis-admin": "admin-secret" } }));
  const body = await ok.text();
  assert(ok.status === 200 && body.includes("gemini-3.5-flash-lite"), "admin health missing");
  assert(!body.includes("AIza") && !body.includes("nvapi-"), "admin health leaks a key");
  const pub = await (await healthGET(new Request("http://olis.test/api/health"))).text();
  assert(!pub.includes("gemini") && !pub.includes("nvidia"), "public health exposes provider names");
  assert(JSON.stringify(Object.keys(JSON.parse(pub)).sort()) === '["busy","ok"]', `public health exposes extra fields: ${pub}`);
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
  for (const m of ["gemini-3.5-flash-lite", "gemini-3.5-flash", "gemini-3.1-flash-lite"]) behaviours[m] = [{ kind: "status", status: 503 }];
  behaviours["nvidia/nemotron-3-super-120b-a12b"] = [{ kind: "text", text: "<think>secret reasoning</think>Final answer." }];
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

await test("18. wrong-script answer (Devanagari in Sinhala reply) → rewind + retry, no corrupted text shown", async () => {
  const q = "ගුරුත්වාකර්ෂණ බලය කියන්නේ මොකක්ද?";
  const good = "ගුරුත්වාකර්ෂණ බලය කියන්නේ වස්තු එකිනෙක ආකර්ෂණය කරන බලයයි.";
  behaviours["gemini-3.5-flash"] = [{ kind: "text", text: "यह गुरुत्वाकर्षण बल है" }, { kind: "text", text: good }];
  process.env.OLIS_AI_LOGS = "";
  const { events, text } = await readSSE(await agentPOST(apiRequest("/api/agent", agentBody(q))));
  assert(!/[\u0900-\u097F]/.test(text), `Devanagari reached the student: ${text}`);
  assert(text === good, `text=${text}`);
  assert(events.some((e) => e.type === "rewind") || !events.some((e) => e.type === "text" && /[\u0900-\u097F]/.test(e.delta ?? "")), "bad delta was streamed without rewind");
  const retry = calls.filter((c) => c.model === "gemini-3.5-flash")[1]?.body as { systemInstruction: { parts: { text: string }[] } };
  assert(retry?.systemInstruction.parts[0].text.includes("wrong script"), "retry prompt lacks the script instruction");
  const all = logs.join("\n");
  assert(all.includes('"evt":"ai.script_guard"') && !all.includes("गुरुत्वाकर्षण"), "script guard not logged, or student/model text logged");
});

await test("18b. Malayalam letters mixed into Sinhala ('കൊළඹ පැත്തേ') → repaired in place, no retry", async () => {
  // The exact text a student saw: 7 of 11 characters were Malayalam look-alikes
  const broken = "අපි \u0d15\u0d4a\u0dc5\u0db9 \u0d2a\u0dd0\u0d24\u0d4d\u0d24\u0d47 යමු. ശ്രී ලංකාව ලස්සනයි.";
  behaviours["gemini-3.5-flash"] = [{ kind: "text", text: broken }];
  process.env.OLIS_AI_LOGS = "";
  const { events, text } = await readSSE(await agentPOST(apiRequest("/api/agent", agentBody("කොළඹ ගැන කියන්න"))));
  assert(!/[\u0D00-\u0D7F]/.test(text), `Malayalam reached the student: ${text}`);
  assert(text === "අපි කොළඹ පැත්තේ යමු. ශ්\u200dරී ලංකාව ලස්සනයි.", `text=${JSON.stringify(text)}`);
  assert(!events.some((e) => e.type === "rewind"), "should be repaired in place, not retried");
  assert(calls.filter((c) => c.model.startsWith("gemini")).length === 1, "an extra model call was made");
  assert(logs.join("\n").includes('"error":"lookalike_repaired"'), "repair not logged");
});

await test("18c. Devanagari on the first AND the retry → the retry is repaired, never shown broken", async () => {
  behaviours["gemini-3.5-flash"] = [{ kind: "text", text: "यह बल है" }, { kind: "text", text: "මෙය विद्युत් ධාරාවයි." }];
  const { text } = await readSSE(await agentPOST(apiRequest("/api/agent", agentBody("විද්‍යුත් ධාරාව කියන්නේ මොකක්ද?"))));
  assert(!/[\u0900-\u097F]/.test(text), `Devanagari reached the student: ${text}`);
  assert(text === "මෙය විද්\u200dයුත් ධාරාවයි.", `text=${JSON.stringify(text)}`);
});

await test("18d. Malayalam in an ENGLISH answer → rewind and retry (not transliterated)", async () => {
  behaviours["gemini-3.5-flash-lite"] = [{ kind: "text", text: "Colombo is in കേരളം" }, { kind: "text", text: "Colombo is on the west coast of Sri Lanka." }];
  const { events, text } = await readSSE(await agentPOST(apiRequest("/api/agent", agentBody("Where is Colombo?", { profile: { language: "en" } }))));
  assert(text === "Colombo is on the west coast of Sri Lanka.", `text=${text}`);
  assert(events.some((e) => e.type === "rewind") || calls.filter((c) => c.model.startsWith("gemini")).length >= 2, "no retry");
});

await test("19. Sinhala (ZWJ conjuncts) survives the API round trip byte-for-byte", async () => {
  const q = "ශ්‍රී ලංකාවේ විද්‍යාව ගැන කියන්න";
  const answer = "ශ්‍රී ලංකාව; විද්‍යාව; භෞතික විද්‍යාව; රසායන විද්‍යාව; ගණිතය. Newton's second law එක: $F=ma$";
  behaviours["gemini-3.5-flash"] = [{ kind: "text", text: answer }];
  const { text } = await readSSE(await agentPOST(apiRequest("/api/agent", agentBody(q.normalize("NFD")))));
  assert(text === answer, `text differs: ${text}`);
  const sent = JSON.stringify(calls.find((c) => c.model.startsWith("gemini"))!.body);
  assert(!sent.includes("\\ufffd") && !sent.includes("\ufffd"), "replacement character in request");
  assert(sent.includes("ශ්‍රී"), "student's Sinhala was not sent in NFC");
});

await test("20. follow-up 'මේක තේරෙන්නෙ නෑ' → refers back; retrieval uses the previous topic", async () => {
  const body = agentBody("මේක තේරෙන්නෙ නෑ", { messages: [{ role: "user", content: "Explain Newton's second law" }, { role: "assistant", content: "F = ma ..." }, { role: "user", content: "මේක තේරෙන්නෙ නෑ" }] });
  const { text } = await readSSE(await agentPOST(apiRequest("/api/agent", body)));
  assert(text.length > 0, "no answer");
  const sys = (calls.find((c) => c.model.startsWith("gemini"))!.body as { systemInstruction: { parts: { text: string }[] } }).systemInstruction.parts[0].text;
  assert(sys.includes("This message is a follow-up") && sys.includes("Newton's second law"), "follow-up hint missing");
  const user = JSON.stringify(calls.find((c) => c.model.startsWith("gemini"))!.body);
  assert(user.includes("newtons-laws") || user.includes("Newton"), "no Newton notes retrieved for the follow-up");
});

await test("21. no matching source → model is told not to present syllabus facts as confirmed", async () => {
  await readSSE(await agentPOST(apiRequest("/api/agent", agentBody("What are the marks allocated to question 4 of the 2019 History paper?"))));
  const sys = (calls.find((c) => c.model.startsWith("gemini"))!.body as { systemInstruction: { parts: { text: string }[] } }).systemInstruction.parts[0].text;
  assert(sys.includes("No OLIS source matched"), "grounding=none block missing");
});

await test("22. exam level: O/L profile → O/L depth rule, no A/L-only methods", async () => {
  await readSSE(await agentPOST(apiRequest("/api/agent", agentBody("explain speed", { profile: { examLevel: "OL", language: "en" } }))));
  const sys = (calls.find((c) => c.model.startsWith("gemini"))!.body as { systemInstruction: { parts: { text: string }[] } }).systemInstruction.parts[0].text;
  assert(sys.includes("preparing for G.C.E. O/L") && !sys.includes("Combined Mathematics: Algebra"), "O/L level block missing or A/L taxonomy leaked");
});

await test("23. math_check tool runs deterministically and its result is returned to the model", async () => {
  behaviours["gemini-3.5-flash-lite"] = [{ kind: "tool_then_text", call: { name: "math_check", args: { op: "evaluate", expr: "sqrt(3^2+4^2)" } }, text: "The hypotenuse is 5." }];
  const { events, text } = await readSSE(await agentPOST(apiRequest("/api/agent", agentBody("what is the hypotenuse of a 3-4 right triangle? check it carefully"))));
  const second = calls.filter((c) => c.model === "gemini-3.5-flash-lite")[1]?.body as { contents: { parts: { functionResponse?: { name: string; response: unknown } }[] }[] };
  const fr = second?.contents.flatMap((c) => c.parts).find((p) => p.functionResponse)?.functionResponse;
  assert(fr?.name === "math_check" && JSON.stringify(fr.response).includes('"5"'), `tool result not returned: ${JSON.stringify(fr)}`);
  assert(events.some((e) => e.type === "step" && e.label?.includes("maths")), "no maths step shown");
  assert(text.includes("5"), `text=${text}`);
});

const sysOf = () => (calls.find((c) => c.model.startsWith("gemini"))!.body as { systemInstruction: { parts: { text: string }[] } }).systemInstruction.parts[0].text;

await test("24. router meta event: subject, topic, level and confidence reach the browser", async () => {
  const { events } = await readSSE(await agentPOST(apiRequest("/api/agent", agentBody("Explain Newton's second law of motion", { profile: { examLevel: "AL" } }))));
  const meta = (events.find((e) => e.type === "meta") as { meta?: unknown } | undefined)?.meta as { subject?: string; level?: string; intent?: string; confidence?: string } | undefined;
  assert(meta, "no meta event");
  assert(meta.subject === "physics" && meta.level === "AL" && meta.intent === "concept_explanation", `meta=${JSON.stringify(meta)}`);
  assert(meta.confidence === "confident" || meta.confidence === "likely", `confidence=${meta.confidence} (Newton notes exist)`);
});

await test("25. subject method from the registry is in the prompt (A/L Geography)", async () => {
  await readSSE(await agentPOST(apiRequest("/api/agent", agentBody("Explain monsoon rainfall in Sri Lanka", { profile: { examLevel: "AL" } }))));
  const sys = sysOf();
  assert(sys.includes("You are acting as the Geography tutor") && sys.includes("Geography method"), "geography strategy missing");
  assert(sys.includes("Geography: Climatology"), "focused topic map missing");
  assert(!sys.includes("Combined Mathematics: Algebra"), "unrelated subjects leaked into the topic map");
});

await test("26. marking mode: estimated-marks wording, never an official mark", async () => {
  await readSSE(await agentPOST(apiRequest("/api/agent", agentBody("How many marks would I get for this answer: momentum is mass times velocity"))));
  const sys = sysOf();
  assert(sys.includes("# Marking mode") && sys.includes("Estimated based on the available marking scheme. This is not an official examination mark."), "marking rules missing");
});

await test("27. current information + live source down → no figure from memory", async () => {
  const { events } = await readSSE(await agentPOST(apiRequest("/api/agent", agentBody("What is the current inflation rate in Sri Lanka?"))));
  const sys = sysOf();
  assert(sys.includes("current_data_available = false") && sys.includes("Do NOT state any current price"), "live-failure rule missing");
  assert(events.some((e) => e.type === "step" && e.label === "Couldn't get live data right now"), "failed live step not shown");
});

await test("28. Tamil preference → Tamil reply rules, multilingual route", async () => {
  await readSSE(await agentPOST(apiRequest("/api/agent", agentBody("what is speed", { profile: { language: "ta" } }))));
  const sys = sysOf();
  assert(sys.includes("Reply in Tamil (Tamil script)") && sys.includes("Tamil Unicode"), "Tamil rules missing");
});

// ── Live data, memory, previous chats (spec scenarios 1–8) ──────────────────────
/** The conversation the model received (not the system prompt, which names the blocks when explaining the rules). */
const sent = () => JSON.stringify((calls.find((c) => c.model.startsWith("gemini"))!.body as { contents: unknown }).contents);
const jsonRes = (o: unknown) => () => new Response(JSON.stringify(o), { status: 200, headers: { "content-type": "application/json" } });
const now = Math.floor(Date.now() / 1000);
const BTC = { bitcoin: { usd: 64321.5, lkr: 19234567, usd_24h_change: -1.234, last_updated_at: now - 60 } };
type Ev = { type: string; label?: string; status?: string; meta?: Record<string, unknown>; saved?: { key: string; value?: string }[]; sources?: { url: string | null }[] };
const evs = (e: unknown[]) => e as Ev[];

await test("S1. normal question (Newton's second law) → no web / live call", async () => {
  const { events } = await readSSE(await agentPOST(apiRequest("/api/agent", agentBody("What is Newton's second law?"))));
  assert(liveHits.length === 0, `unexpected live call: ${liveHits[0]}`);
  assert(!sent().includes("<live_data"), "live_data block sent");
  assert(evs(events).some((e) => e.type === "step" && e.label === "Checking OLIS study notes"), "RAG not used");
});

await test("S2. 'What is Bitcoin price right now?' → CoinGecko, figure + timestamps, no RAG", async () => {
  liveMocks["api.coingecko.com"] = jsonRes(BTC);
  const { events } = await readSSE(await agentPOST(apiRequest("/api/agent", agentBody("What is Bitcoin price right now?"))));
  const body = sent();
  assert(liveHits.some((u) => u.includes("coingecko") && u.includes("ids=bitcoin")), "CoinGecko not called");
  assert(body.includes('current_data_available=\\"true\\"') && body.includes("64321.5") && body.includes("retrieved_at"), "live block missing figure/timestamp");
  assert(!evs(events).some((e) => e.type === "step" && e.label === "Checking OLIS study notes"), "RAG ran for a live question");
  const meta = evs(events).find((e) => e.type === "meta")!.meta as { live?: { ok: boolean; source: string; dataTimestamp: string } };
  assert(meta.live?.ok && meta.live.source === "CoinGecko" && meta.live.dataTimestamp, `meta.live=${JSON.stringify(meta.live)}`);
  assert(evs(events).some((e) => e.type === "sources" && e.sources!.some((x) => x.url?.includes("coingecko.com"))), "no CoinGecko source card");
});

await test("S3. 'USD to LKR today?' → exchange-rate source, labelled as a daily rate", async () => {
  liveMocks["open.er-api.com"] = jsonRes({ result: "success", time_last_update_unix: now - 3600 * 5, rates: { LKR: 300.1234, USD: 1 } });
  await readSSE(await agentPOST(apiRequest("/api/agent", agentBody("USD to LKR today?"))));
  const body = sent();
  assert(liveHits.some((u) => u.includes("open.er-api.com/v6/latest/USD")), "FX API not called");
  assert(body.includes("300.1234") && body.includes("daily mid-market reference rate"), "rate or daily caveat missing");
});

await test("S4. 'Explain electrolysis according to the O/L syllabus' → OLIS knowledge base, no live data", async () => {
  const { events } = await readSSE(await agentPOST(apiRequest("/api/agent", agentBody("Explain electrolysis according to the O/L syllabus."))));
  assert(evs(events).some((e) => e.type === "step" && e.label === "Checking OLIS study notes"), "RAG not used");
  assert(liveHits.length === 0, "live call for a syllabus question");
});

await test("S5. memory: 'I prefer Sinhala explanations' is saved; next chat answers in Sinhala", async () => {
  const first = await readSSE(await agentPOST(apiRequest("/api/agent", agentBody("I prefer Sinhala explanations."))));
  const saved = evs(first.events).find((e) => e.type === "memory")?.saved ?? [];
  assert(saved.some((m) => m.key === "language_pref" && m.value === "si"), `not saved: ${JSON.stringify(saved)}`);
  assert(evs(first.events).some((e) => e.type === "step" && e.label?.startsWith("Saved to memory")), "no 'saved to memory' indicator");
  reset();
  // Conversation 2: a NEW chat, the browser sends what it saved
  await readSSE(await agentPOST(apiRequest("/api/agent", agentBody("Explain photosynthesis", { memories: saved }))));
  assert(sysOf().includes("Reply in Sinhala"), "Sinhala preference not applied");
  assert(sent().includes("Prefers explanations in Sinhala"), "memory not given to the model");
});

await test("S5b. 'Today I studied for 2 hours' is NOT saved; memory off saves and uses nothing", async () => {
  const a = await readSSE(await agentPOST(apiRequest("/api/agent", agentBody("Today I studied for 2 hours."))));
  assert(!evs(a.events).some((e) => e.type === "memory"), "transient fact saved");
  reset();
  const b = await readSSE(await agentPOST(apiRequest("/api/agent", agentBody("I prefer Sinhala explanations.", { memoryEnabled: false, memories: [{ key: "exam", memory: "Preparing for the 2027 G.C.E. A/L examination.", category: "education", importance: 5 }] }))));
  assert(!evs(b.events).some((e) => e.type === "memory"), "saved while memory is off");
  assert(!sent().includes("<user_memory>"), "memory used while off");
});

await test("S6. 'Can you continue that plan?' → previous chat retrieved; nothing found → no fake continuity", async () => {
  const recall = [{ chat: "Physics revision plan", date: "2026-10-01", role: "assistant", text: "Week 1: Mechanics (kinematics, Newton's laws). Week 2: Waves and optics. Week 3: Electricity." }];
  const a = await readSSE(await agentPOST(apiRequest("/api/agent", agentBody("Can you continue that plan?", { recall }))));
  assert(sent().includes("<previous_conversations>") && sent().includes("Week 2: Waves and optics"), "previous chat not given to the model");
  assert(evs(a.events).some((e) => e.type === "step" && e.label?.startsWith("Using your previous chats")), "no indicator");
  reset();
  await readSSE(await agentPOST(apiRequest("/api/agent", agentBody("Can you continue that plan?"))));
  assert(sysOf().includes("I don't have that previous detail available right now"), "no anti-fabrication rule when nothing matched");
});

await test("S7. Singlish 'Bitcoin price eka dan kiyada?' → live crypto data", async () => {
  liveMocks["api.coingecko.com"] = jsonRes(BTC);
  await readSSE(await agentPOST(apiRequest("/api/agent", agentBody("Bitcoin price eka dan kiyada?"))));
  assert(liveHits.some((u) => u.includes("coingecko")), "CoinGecko not called for Singlish");
  assert(sent().includes("64321.5"), "price not passed to the model");
});

await test("S8. 'What did I tell you about my favorite subject?' with nothing saved → don't invent", async () => {
  await readSSE(await agentPOST(apiRequest("/api/agent", agentBody("What did I tell you about my favorite subject?"))));
  assert(sysOf().includes("Nothing relevant is saved in OLIS memory") && sysOf().includes("I don't have that previous detail available right now"), "fake-memory rule missing");
  assert(!sent().includes("<user_memory>"), "memory block without memories");
});

await test("S9. live source down → no figure, transparent failure; chat still answers", async () => {
  liveMocks["api.coingecko.com"] = () => new Response("oops", { status: 500 });
  const { events, text } = await readSSE(await agentPOST(apiRequest("/api/agent", agentBody("What is the current BTC price?"))));
  assert(sysOf().includes("current_data_available = false") && sent().includes('current_data_available=\\"false\\"'), "failure not passed on");
  assert(evs(events).some((e) => e.type === "step" && e.status === "failed"), "no failed step");
  const meta = evs(events).find((e) => e.type === "meta")!.meta as { live?: { ok: boolean } };
  assert(meta.live && !meta.live.ok, "meta.live should be ok:false");
  assert(text.length > 0, "chat crashed");
});

await test("S10. news: Google News RSS headlines become cited sources", async () => {
  const rss = `<rss><channel><item><title>NASA launches new Moon probe - Reuters</title><link>https://news.example.com/a</link><pubDate>${new Date(Date.now() - 7200e3).toUTCString()}</pubDate><source url="https://www.reuters.com">Reuters</source></item></channel></rss>`;
  liveMocks["news.google.com"] = () => new Response(rss, { status: 200, headers: { "content-type": "application/rss+xml" } });
  const { events } = await readSSE(await agentPOST(apiRequest("/api/agent", agentBody("Latest NASA news"))));
  assert(sent().includes("NASA launches new Moon probe") && !sent().includes("Moon probe - Reuters"), "headline not parsed");
  assert(evs(events).some((e) => e.type === "sources" && e.sources!.some((x) => x.url === "https://news.example.com/a")), "headline not a source");
});

// ── Report ─────────────────────────────────────
globalThis.fetch = realFetch;
console.log = realLog;
console.error = realErr;
const failed = results.filter((r) => !r.ok);
for (const r of results) console.log(`${r.ok ? "✓" : "✗"} ${r.name}${r.ok ? "" : `\n    → ${r.detail}`}`);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
export const ok = failed.length === 0;
