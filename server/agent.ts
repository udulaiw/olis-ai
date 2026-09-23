// ─────────────────────────────────────────────
// The OLIS agent loop.
//
//   question ─▶ classify (task, language, topic) ─▶ retrieve from knowledge base (RAG)
//            ─▶ AI router picks a model ─▶ calls tools? ─▶ run tools ─▶ back to the model
//            ─▶ … (max N steps) ─▶ streamed answer with [n] citations
//
// If an engine fails mid-answer, the router switches to another one; this loop
// tells the browser to discard the partial text ("rewind") and shows a short
// "switching engine" notice.
//
// Emits events the browser renders live: steps, sources, text, notice, rewind.
// ─────────────────────────────────────────────
import type { Config } from "./config.js";
import { searchKnowledge } from "./rag.js";
import { SourceRegistry, runTool, toolDeclarations, type Source } from "./tools.js";
import { systemPrompt, type LearningContext, type StudentProfile } from "./prompts.js";
import { classifyRequest } from "./ai/intent.js";
import { streamWithFallback } from "./ai/router.js";
import { newRequestId } from "./ai/log.js";
import type { ChatMessage, ImageInput, ToolCall } from "./ai/types.js";

export type AgentEvent =
  | { type: "step"; id: string; label: string; status: "running" | "done" | "failed" }
  | { type: "sources"; sources: Source[] }
  | { type: "text"; delta: string }
  /** Drop everything after this many characters of the answer (an engine failed mid-answer). */
  | { type: "rewind"; to: number }
  | { type: "notice"; kind: "switching" };

export interface AgentRequest {
  messages: { role: "user" | "assistant"; content: string }[];
  attachment?: string;
  images?: ImageInput[];
  mode: string;
  context: LearningContext;
  profile?: StudentProfile;
}

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n) + "…" : s);
const TRIVIAL = /^(hi|hello|hey|thanks|thank you|ok|okay|yo|cool|nice|good (morning|night|evening)|ආයුබෝවන්|ස්තූතියි|හායි)\b[\s!.?]*$/i;

function stepLabel(call: ToolCall) {
  const a = call.args;
  switch (call.name) {
    case "search_wikipedia":
      return `Searching Wikipedia: “${a.query}”`;
    case "search_web":
      return `Searching the web: “${a.query}”`;
    case "search_past_papers":
      return `Checking past papers: “${a.query}”`;
    case "read_webpage":
      try {
        return `Reading ${new URL(String(a.url)).hostname}`;
      } catch {
        return "Reading a page";
      }
    default:
      return `Searching study notes: “${a.query}”`;
  }
}

export async function* runAgent(cfg: Config, req: AgentRequest, signal?: AbortSignal): AsyncGenerator<AgentEvent> {
  const requestId = newRequestId();
  const deadline = Date.now() + cfg.agentDeadlineMs;
  const reg = new SourceRegistry();
  const decls = toolDeclarations(cfg);
  const history = req.messages.slice(0, -1).slice(-12);
  const question = req.messages[req.messages.length - 1]?.content ?? "";

  const cls = classifyRequest({
    question,
    mode: req.mode,
    subject: req.context.subject,
    imageCount: req.images?.length ?? 0,
    attachmentChars: req.attachment?.length ?? 0,
    languagePref: req.profile?.language,
  });
  const system = systemPrompt(req.context, req.mode, { tools: true, webSearch: Boolean(cfg.tavilyKey), profile: req.profile, detectedLanguage: cls.language });
  let stepN = 0;

  // 1) RAG: always check the curated notes first (cheap, grounded, citeable)
  let kbBlock = "";
  if (req.mode !== "summarize" && !TRIVIAL.test(question.trim()) && question.trim().length > 3) {
    const id = `s${++stepN}`;
    yield { type: "step", id, label: "Checking OLIS study notes", status: "running" };
    const hits = await searchKnowledge(cfg, question, { k: 4, subject: req.context.subject, signal }).catch(() => []);
    const srcs = hits.map((h) =>
      reg.add({
        kind: h.chunk.type === "past_paper" || h.chunk.type === "marking_scheme" ? "paper" : "notes",
        title: `${h.chunk.title} · ${h.chunk.heading}`,
        url: h.chunk.url,
        snippet: clip(h.chunk.text.split("\n\n").slice(1).join(" "), 180),
      }),
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
        "<knowledge_excerpts>\nCurated OLIS notes. Cite by number if you use them.\n\n" +
        hits
          .map((h, i) => {
            const meta = [h.chunk.type && h.chunk.type !== "notes" ? h.chunk.type : "", h.chunk.year, h.chunk.paper, h.chunk.question ? `Q${h.chunk.question}` : ""].filter(Boolean).join(" · ");
            return `[${srcs[i].ref}] ${srcs[i].title}${meta ? ` (${meta})` : ""}\n${clip(h.chunk.text, 1400)}`;
          })
          .join("\n\n---\n\n") +
        "\n</knowledge_excerpts>";
    }
  }

  // 2) Build the conversation (neutral format; the router adapts it per provider)
  const hasImages = Boolean(req.images?.length);
  const userText = [
    kbBlock,
    req.attachment ? `<student_document>\n${clip(req.attachment, 30000)}\n</student_document>` : "",
    hasImages ? `(The student attached ${req.images!.length} image${req.images!.length > 1 ? "s" : ""}, e.g. a photo of a question or their working. Read it carefully.)` : "",
    kbBlock || req.attachment || hasImages ? `STUDENT'S MESSAGE:\n${question || "Please help me with the attached."}` : question,
  ]
    .filter(Boolean)
    .join("\n\n");

  const messages: ChatMessage[] = [
    ...history.map((m): ChatMessage => (m.role === "assistant" ? { role: "assistant", text: clip(m.content, 6000) } : { role: "user", text: clip(m.content, 6000) })),
    { role: "user", text: userText, images: req.images },
  ];

  // 3) Tool-use loop, one router call per model turn
  let emitted = 0; // characters of answer text sent to the browser
  let wroteText = false;
  let served: string | undefined; // model key that served the last turn (kept for continuity)

  for (let step = 0; step < cfg.maxSteps; step++) {
    const last = step === cfg.maxSteps - 1;
    const turnStart = emitted;
    let text = "";
    let calls: ToolCall[] = [];
    let native: unknown = undefined;
    let nativeProvider: string | undefined;

    for await (const ev of streamWithFallback({
      task: cls.task,
      required: cls.required,
      req: { system, messages, tools: decls, forceAnswer: last },
      prefer: served,
      signal,
      deadline,
      requestId,
      route: "agent",
    })) {
      switch (ev.type) {
        case "attempt":
          served = ev.key;
          nativeProvider = ev.provider;
          break;
        case "text":
          text += ev.delta;
          emitted += ev.delta.length;
          wroteText = true;
          yield { type: "text", delta: ev.delta };
          break;
        case "tool_call":
          calls.push(ev.call);
          break;
        case "native":
          native = ev.data;
          break;
        case "rewind":
          // The engine failed after writing part of this turn: throw that part away
          text = "";
          calls = [];
          native = undefined;
          emitted = turnStart;
          yield { type: "rewind", to: turnStart };
          break;
        case "switching":
          yield { type: "notice", kind: "switching" };
          break;
      }
    }

    messages.push({
      role: "assistant",
      text,
      toolCalls: calls.length ? calls : undefined,
      native: native !== undefined && nativeProvider ? { provider: nativeProvider as "gemini", data: native } : undefined,
    });
    if (!calls.length) break;
    if (text) {
      emitted += 2;
      yield { type: "text", delta: "\n\n" };
    }

    const results: { callId: string; name: string; result: Record<string, unknown> }[] = [];
    for (const call of calls) {
      const id = `s${++stepN}`;
      const pending = stepLabel(call);
      yield { type: "step", id, label: pending, status: "running" };
      let result: Record<string, unknown>;
      try {
        const run = await runTool(cfg, call.name, call.args, reg, { subject: req.context.subject, signal });
        result = run.result;
        yield { type: "step", id, label: run.label, status: result.error ? "failed" : "done" };
        if (run.sources.length) yield { type: "sources", sources: [...reg.list] };
      } catch (e) {
        if ((e as Error).name === "AbortError" && signal?.aborted) throw e;
        result = { error: "The tool failed or timed out." };
        yield { type: "step", id, label: pending, status: "failed" };
      }
      results.push({ callId: call.id, name: call.name, result });
    }
    messages.push({ role: "tool", results });
  }

  if (!wroteText) yield { type: "text", delta: "I couldn't put together an answer this time. Please try rephrasing your question." };
}
