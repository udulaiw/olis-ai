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
import { searchKnowledge, groundingOf, relevantHits, type Grounding } from "./rag.js";
import { SourceRegistry, runTool, toolDeclarations, type Source } from "./tools.js";
import { systemPrompt, type LearningContext, type StudentProfile } from "./prompts.js";
import { classifyRequest, confidenceOf, type Confidence, type Intent } from "./ai/intent.js";
import { streamWithFallback } from "./ai/router.js";
import { newRequestId, aiLog } from "./ai/log.js";
import { createScriptGuard } from "./lang/unicode.mjs";
import type { ChatMessage, ImageInput, ToolCall } from "./ai/types.js";

export type AgentEvent =
  | { type: "step"; id: string; label: string; status: "running" | "done" | "failed" }
  | { type: "sources"; sources: Source[] }
  | { type: "text"; delta: string }
  /** Drop everything after this many characters of the answer (an engine failed mid-answer). */
  | { type: "rewind"; to: number }
  | { type: "notice"; kind: "switching" }
  /** What OLIS understood the question to be (shown under the answer). Labels only. */
  | { type: "meta"; meta: AnswerMeta };

export interface AnswerMeta {
  subject: string | null;
  subjectName: string | null;
  topic: string | null;
  level: "OL" | "AL" | null;
  intent: Intent;
  reply: string;
  /** From retrieval evidence; null when not applicable (greetings, plans, attached documents). */
  confidence: Confidence | null;
}

export interface AgentRequest {
  messages: { role: "user" | "assistant"; content: string }[];
  attachment?: string;
  images?: ImageInput[];
  mode: string;
  context: LearningContext;
  profile?: StudentProfile;
}

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n) + "…" : s);

function stepLabel(call: ToolCall) {
  const a = call.args;
  switch (call.name) {
    case "search_wikipedia":
      return `Searching Wikipedia: “${a.query}”`;
    case "search_web":
      return `Searching the web: “${a.query}”`;
    case "search_past_papers":
      return `Checking past papers: “${a.query}”`;
    case "math_check":
      return "Checking the maths";
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
    history,
    stream: req.profile?.stream,
    examLevel: req.profile?.examLevel,
  });
  let stepN = 0;

  // 1) RAG: always check the curated notes first (cheap, grounded, citeable).
  //    Search with the normalised/expanded query (Sinhala + Singlish → English terms) and,
  //    for follow-ups like "මේක තේරෙන්නෙ නෑ", with the topic of the previous question.
  let kbBlock = "";
  let grounding: Grounding | undefined;
  if (req.mode !== "summarize" && cls.requiresRetrieval) {
    const id = `s${++stepN}`;
    yield { type: "step", id, label: "Checking OLIS study notes", status: "running" };
    const found = await searchKnowledge(cfg, cls.retrievalQuery, { k: 4, subject: req.context.subject, signal, level: cls.examLevel }).catch(() => []);
    // Hits that only matched generic words ("marks", "question") are not evidence: don't show them or let the model cite them
    if (!req.attachment) grounding = groundingOf(found);
    // ...and when the verdict is "none", the incidental matches are not shown either (the model can still call search_knowledge_base itself)
    const hits = grounding === "none" ? [] : relevantHits(found);
    aiLog({ evt: "ai.retrieval", requestId, route: "agent", grounding: grounding ?? "n/a", hits: hits.length, level: cls.examLevel ?? "unknown", specialist: cls.specialist, reply: cls.reply, subject: cls.subject ?? "none", intent: cls.intent, difficulty: cls.difficulty });
    const srcs = hits.map((h) =>
      reg.add({
        kind: h.chunk.type === "past_paper" || h.chunk.type === "marking_scheme" ? "paper" : "notes",
        title: `${h.chunk.title} · ${h.chunk.heading}${h.chunk.pages ? ` (p.${h.chunk.pages})` : ""}`,
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
        "<knowledge_excerpts>\nCurated OLIS notes. Cite by number if you use them. Lower tier = more authoritative (1 official syllabus … 6 notes).\n\n" +
        hits
          .map((h, i) => {
            const meta = [h.chunk.type && h.chunk.type !== "notes" ? h.chunk.type : "", h.chunk.level === "OL" ? "O/L" : h.chunk.level === "AL" ? "A/L" : "", h.chunk.year, h.chunk.paper, h.chunk.question ? `Q${h.chunk.question}` : "", h.chunk.tier ? `tier ${h.chunk.tier}` : ""].filter(Boolean).join(" · ");
            return `[${srcs[i].ref}] ${srcs[i].title}${meta ? ` (${meta})` : ""}\n${clip(h.chunk.text, 1400)}`;
          })
          .join("\n\n---\n\n") +
        "\n</knowledge_excerpts>";
    }
  }

  yield {
    type: "meta",
    meta: {
      subject: cls.subject,
      subjectName: cls.subjectName,
      topic: cls.topicName,
      level: cls.examLevel,
      intent: cls.intent,
      reply: cls.reply,
      confidence: req.attachment ? null : confidenceOf(grounding, cls.intent),
    },
  };

  const buildSystem = (scriptRetry = false) =>
    systemPrompt(req.context, req.mode, {
      tools: true,
      webSearch: Boolean(cfg.tavilyKey),
      profile: req.profile,
      reply: cls.reply,
      examLevel: cls.examLevel,
      specialist: cls.specialist,
      grounding,
      terms: cls.terms,
      followUpHint: cls.followUp?.hint,
      scriptRetry,
      subjectId: cls.subject,
      discipline: cls.discipline,
      intent: cls.intent,
      difficulty: cls.difficulty,
      requiresCurrentInfo: cls.requiresCurrentInfo,
      today: new Date().toISOString().slice(0, 10),
    });
  let system = buildSystem();
  // The script the answer must stay in. Off when the student themselves is working in Hindi/Tamil.
  const allowOtherScripts = /hindi|devanagari|tamil|தமிழ்|हिन्दी/i.test(question) || /[\u0900-\u097F\u0B80-\u0BFF]/.test(question);
  const expectScript = allowOtherScripts ? "any" : cls.reply === "ta" ? "ta" : cls.reply === "en" ? "en" : "si";
  let scriptRetried = false;

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

    for (;;) {
      const guard = createScriptGuard(expectScript);
      let bad: { code: string; detail: string } | null = null;
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
          case "text": {
            // Wrong-script output (Devanagari/Tamil/U+FFFD in a Sinhala or English answer): stop, discard, retry once
            const b = scriptRetried ? null : guard(ev.delta);
            if (b) {
              bad = b;
              break;
            }
            text += ev.delta;
            emitted += ev.delta.length;
            wroteText = true;
            yield { type: "text", delta: ev.delta };
            break;
          }
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
        if (bad) break;
      }
      if (!bad) break;
      scriptRetried = true;
      aiLog({ evt: "ai.script_guard", requestId, route: "agent", error: bad.code, detail: bad.detail, model: served, reply: cls.reply });
      if (emitted > turnStart) yield { type: "rewind", to: turnStart };
      text = "";
      calls = [];
      native = undefined;
      emitted = turnStart;
      system = buildSystem(true);
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
        const run = await runTool(cfg, call.name, call.args, reg, { subject: req.context.subject, signal, level: cls.examLevel });
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
