// ─────────────────────────────────────────────
// The OLIS agent loop.
//
//   question ─▶ retrieve from knowledge base (RAG)
//            ─▶ Gemini thinks ─▶ calls tools? ─▶ run tools ─▶ back to Gemini
//            ─▶ … (max N steps) ─▶ streamed answer with [n] citations
//
// Emits events the browser renders live: steps, sources, text.
// ─────────────────────────────────────────────
import type { Config } from "./config.js";
import { streamTurn, type Content, type Part } from "./gemini.js";
import { searchKnowledge } from "./rag.js";
import { SourceRegistry, runTool, toolDeclarations, type Source } from "./tools.js";
import { systemPrompt, type LearningContext } from "./prompts.js";

export type AgentEvent =
  | { type: "step"; id: string; label: string; status: "running" | "done" | "failed" }
  | { type: "sources"; sources: Source[] }
  | { type: "text"; delta: string };

export interface AgentRequest {
  messages: { role: "user" | "assistant"; content: string }[];
  attachment?: string;
  mode: string;
  context: LearningContext;
}

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n) + "…" : s);
const TRIVIAL = /^(hi|hello|hey|thanks|thank you|ok|okay|yo|cool|nice|good (morning|night|evening))\b[\s!.?]*$/i;

export async function* runAgent(cfg: Config, req: AgentRequest, signal?: AbortSignal): AsyncGenerator<AgentEvent> {
  const reg = new SourceRegistry();
  const decls = toolDeclarations(cfg);
  const system = systemPrompt(req.context, req.mode, { tools: true, webSearch: Boolean(cfg.tavilyKey) });
  const history = req.messages.slice(0, -1).slice(-12);
  const question = req.messages[req.messages.length - 1]?.content ?? "";
  let stepN = 0;

  // 1) RAG: always check the curated notes first (cheap, grounded, citeable)
  let kbBlock = "";
  if (req.mode !== "summarize" && !TRIVIAL.test(question.trim()) && question.trim().length > 3) {
    const id = `s${++stepN}`;
    yield { type: "step", id, label: "Checking OLIS study notes", status: "running" };
    const hits = await searchKnowledge(cfg, question, { k: 4, subject: req.context.subject, signal }).catch(() => []);
    const srcs = hits.map((h) =>
      reg.add({ kind: "notes", title: `${h.chunk.title} · ${h.chunk.heading}`, url: h.chunk.url, snippet: clip(h.chunk.text.split("\n\n").slice(1).join(" "), 180) }),
    );
    yield {
      type: "step",
      id,
      label: hits.length ? `Found ${hits.length} relevant note${hits.length > 1 ? "s" : ""}` : "No matching notes. Will research",
      status: "done",
    };
    if (srcs.length) {
      yield { type: "sources", sources: [...reg.list] };
      kbBlock =
        "KNOWLEDGE BASE excerpts (curated OLIS notes; cite by number if you use them):\n\n" +
        hits.map((h, i) => `[${srcs[i].ref}] ${srcs[i].title}\n${clip(h.chunk.text, 1400)}`).join("\n\n---\n\n");
    }
  }

  // 2) Build the conversation
  const userText = [
    kbBlock,
    req.attachment ? `ATTACHED DOCUMENT (provided by the student):\n${clip(req.attachment, 30000)}` : "",
    kbBlock || req.attachment ? `STUDENT'S MESSAGE:\n${question}` : question,
  ]
    .filter(Boolean)
    .join("\n\n");

  const contents: Content[] = [
    ...history.map((m) => ({ role: m.role === "assistant" ? ("model" as const) : ("user" as const), parts: [{ text: clip(m.content, 6000) }] })),
    { role: "user", parts: [{ text: userText }] },
  ];

  // 3) Tool-use loop
  let wroteText = false;
  for (let step = 0; step < cfg.maxSteps; step++) {
    const last = step === cfg.maxSteps - 1;
    const parts: Part[] = [];
    const calls: NonNullable<Part["functionCall"]>[] = [];

    for await (const p of streamTurn(cfg, { system, contents, tools: decls, forceAnswer: last }, signal)) {
      parts.push(p);
      if (p.functionCall) calls.push(p.functionCall);
      else if (p.text && !p.thought) {
        wroteText = true;
        yield { type: "text", delta: p.text };
      }
    }
    // Return the model's parts untouched (keeps Gemini's thought signatures valid)
    contents.push({ role: "model", parts: parts.length ? parts : [{ text: "" }] });

    if (!calls.length) break;
    if (wroteText) yield { type: "text", delta: "\n\n" };

    const responses: Part[] = [];
    for (const call of calls) {
      const id = `s${++stepN}`;
      const args = call.args ?? {};
      const pending =
        call.name === "search_wikipedia"
          ? `Searching Wikipedia: “${args.query}”`
          : call.name === "search_web"
            ? `Searching the web: “${args.query}”`
            : call.name === "read_webpage"
              ? `Reading ${(() => {
                  try {
                    return new URL(String(args.url)).hostname;
                  } catch {
                    return "a page";
                  }
                })()}`
              : `Searching study notes: “${args.query}”`;
      yield { type: "step", id, label: pending, status: "running" };
      let result: Record<string, unknown>;
      try {
        const run = await runTool(cfg, call.name, args, reg, { subject: req.context.subject, signal });
        result = run.result;
        yield { type: "step", id, label: run.label, status: result.error ? "failed" : "done" };
        if (run.sources.length) yield { type: "sources", sources: [...reg.list] };
      } catch (e) {
        if ((e as Error).name === "AbortError" && signal?.aborted) throw e;
        result = { error: "The tool failed or timed out." };
        yield { type: "step", id, label: pending, status: "failed" };
      }
      responses.push({ functionResponse: { name: call.name, response: result, ...(call.id ? { id: call.id } : {}) } });
    }
    contents.push({ role: "user", parts: responses });
  }

  if (!wroteText) yield { type: "text", delta: "I couldn't put together an answer this time. Please try rephrasing your question." };
}
