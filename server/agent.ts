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
import { extractMemories, selectMemories, languageFromMemory, levelFromMemory, type MemoryItem } from "./memory.js";
import { fetchLive, type LiveResult } from "./live/tools.js";

export type AgentEvent =
  | { type: "step"; id: string; label: string; status: "running" | "done" | "failed" }
  | { type: "sources"; sources: Source[] }
  | { type: "text"; delta: string }
  /** Drop everything after this many characters of the answer (an engine failed mid-answer). */
  | { type: "rewind"; to: number }
  | { type: "notice"; kind: "switching" }
  /** What OLIS understood the question to be (shown under the answer). Labels only. */
  | { type: "meta"; meta: AnswerMeta }
  /** New long-term memories for the browser to save (it stores them; the server keeps nothing). */
  | { type: "memory"; saved: MemoryItem[] };

export interface AnswerMeta {
  subject: string | null;
  subjectName: string | null;
  topic: string | null;
  level: "OL" | "AL" | null;
  intent: Intent;
  reply: string;
  /** From retrieval evidence; null when not applicable (greetings, plans, attached documents, live data). */
  confidence: Confidence | null;
  /** Live data used for this answer: where from and how fresh. */
  live?: { domain: string; ok: boolean; source: string; retrievedAt: string; dataTimestamp: string | null } | null;
  /** How much of the student's own context was used (counts only). */
  context?: { memories: number; previousChats: number };
}

/** A message from one of the student's earlier chats, found in their browser (src/lib/recall.ts). */
export interface RecallItem {
  chat: string;
  date: string;
  role: "user" | "assistant";
  text: string;
}

export interface AgentRequest {
  messages: { role: "user" | "assistant"; content: string }[];
  attachment?: string;
  images?: ImageInput[];
  mode: string;
  context: LearningContext;
  profile?: StudentProfile;
  /** The student's saved long-term memories (from their browser). */
  memories?: MemoryItem[];
  /** False when the student turned memory off: nothing is extracted or used. */
  memoryEnabled?: boolean;
  /** Messages from earlier chats that may answer "continue that plan" questions. */
  recall?: RecallItem[];
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
  const t0 = Date.now();
  const toolsUsed: string[] = [];
  const memoryOn = req.memoryEnabled !== false;
  // New facts in this message count immediately ("I prefer Sinhala. Explain osmosis.")
  const extracted = memoryOn ? extractMemories(question) : [];
  const memories: MemoryItem[] = memoryOn ? [...extracted, ...(req.memories ?? []).filter((m) => !extracted.some((e) => e.key === m.key))] : [];
  // A saved preference applies when the profile says "auto"; the profile always wins when set
  const languagePref = req.profile?.language && req.profile.language !== "auto" ? req.profile.language : (languageFromMemory(memories) ?? req.profile?.language);

  const cls = classifyRequest({
    question,
    mode: req.mode,
    subject: req.context.subject,
    imageCount: req.images?.length ?? 0,
    attachmentChars: req.attachment?.length ?? 0,
    languagePref,
    history,
    stream: req.profile?.stream,
    examLevel: req.profile?.examLevel ?? levelFromMemory(memories),
  });
  let stepN = 0;

  // 0) Long-term memory: save what's new, use only what's relevant to THIS question
  if (extracted.length) {
    yield { type: "memory", saved: extracted };
    yield { type: "step", id: `s${++stepN}`, label: `Saved to memory: ${extracted.map((m) => m.memory.replace(/\.$/, "")).join("; ")}`, status: "done" };
    toolsUsed.push("memory_write");
  }
  const usedMemories = memoryOn ? selectMemories(memories, `${question} ${cls.retrievalQuery}`, { askingAboutSelf: cls.requiresMemory }) : [];
  if (usedMemories.length) toolsUsed.push("memory");
  const memoryBlock = usedMemories.length
    ? `<user_memory>\nFacts the student saved in OLIS memory (from earlier chats). Use them only where they help this answer.\n${usedMemories.map((m) => `- ${m.memory}`).join("\n")}\n</user_memory>`
    : "";

  // 0b) Earlier conversations: only when the question refers to one
  const recall = cls.requiresHistory && memoryOn ? (req.recall ?? []).slice(0, 4) : [];
  if (cls.requiresHistory) {
    yield { type: "step", id: `s${++stepN}`, label: recall.length ? `Using your previous chats (${recall.length} matching message${recall.length > 1 ? "s" : ""})` : "Checked your previous chats: nothing matched", status: "done" };
    toolsUsed.push("history");
  }
  const historyBlock = recall.length
    ? `<previous_conversations>\nMessages from the student's EARLIER chats that match this question (found in their saved history). Refer to them as "in our earlier chat".\n${recall.map((r) => `[${r.date} · "${clip(r.chat, 60)}" · ${r.role === "user" ? "student" : "OLIS"}]\n${clip(r.text, 900)}`).join("\n\n")}\n</previous_conversations>`
    : "";

  // 0c) Live data: prices, rates, weather, news. Fetched BEFORE the model answers, never guessed.
  let live: LiveResult | null = null;
  let liveBlock = "";
  if (cls.live) {
    const id = `s${++stepN}`;
    yield { type: "step", id, label: cls.live.domain === "news" || cls.live.domain === "sports" || cls.live.domain === "web" ? "Searching for the latest information" : "Getting live data", status: "running" };
    live = await fetchLive(cfg, cls.live, signal);
    toolsUsed.push(`live:${cls.live.domain}`);
    if (live.ok) {
      const added = live.items?.length
        ? live.items.map((it) => reg.add({ kind: "web", title: it.title, url: it.url, snippet: `${it.source}${it.published ? ` · ${it.published.slice(0, 16).replace("T", " ")} UTC` : ""}` }))
        : [reg.add({ kind: "web", title: `${live.label} · ${live.source.name}`, url: live.source.url, snippet: `Data time: ${live.dataTimestamp ?? "not given"} · retrieved ${live.retrievedAt}` })];
      yield { type: "step", id, label: `Live data: ${live.label} (${live.source.name})`, status: "done" };
      yield { type: "sources", sources: [...reg.list] };
      liveBlock = [
        `<live_data current_data_available="true" source="${live.source.name}" retrieved_at="${live.retrievedAt}" data_timestamp="${live.dataTimestamp ?? "unknown"}">`,
        live.data ? JSON.stringify(live.data) : "",
        live.items?.length ? live.items.map((it, i) => `[${added[i].ref}] ${it.title} (${it.source}${it.published ? `, ${it.published}` : ", undated"})${"content" in it ? `\n${clip(String((it as { content?: string }).content), 500)}` : ""}`).join("\n") : `Cite as [${added[0].ref}].`,
        live.note ? `Note: ${live.note}` : "",
        `</live_data>`,
      ].filter(Boolean).join("\n");
    } else {
      yield { type: "step", id, label: `Couldn't get live data right now`, status: "failed" };
      liveBlock = `<live_data current_data_available="false" reason="${(live.error ?? "unavailable").replace(/"/g, "'")}"></live_data>`;
    }
  }

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
      live: live ? { domain: live.domain, ok: live.ok, source: live.source.name, retrievedAt: live.retrievedAt, dataTimestamp: live.dataTimestamp } : null,
      context: { memories: usedMemories.length, previousChats: recall.length },
    },
  };
  if (grounding) toolsUsed.push("rag");

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
      live: live ? { ok: live.ok, domain: live.domain } : null,
      memory: { enabled: memoryOn, used: usedMemories.length, askingAboutSelf: cls.requiresMemory },
      history: { asked: cls.requiresHistory, found: recall.length },
    });
  let system = buildSystem();
  // The script the answer must stay in. Off when the student themselves is working in Hindi/Tamil.
  const allowOtherScripts = /hindi|devanagari|tamil|தமிழ்|हिन्दी/i.test(question) || /[\u0900-\u097F\u0B80-\u0BFF]/.test(question);
  const expectScript = allowOtherScripts ? "any" : cls.reply === "ta" ? "ta" : cls.reply === "en" ? "en" : "si";
  let scriptRetried = false;

  // 2) Build the conversation (neutral format; the router adapts it per provider)
  const hasImages = Boolean(req.images?.length);
  const userText = [
    liveBlock,
    memoryBlock,
    historyBlock,
    kbBlock,
    req.attachment ? `<student_document>\n${clip(req.attachment, 30000)}\n</student_document>` : "",
    hasImages ? `(The student attached ${req.images!.length} image${req.images!.length > 1 ? "s" : ""}, e.g. a photo of a question or their working. Read it carefully.)` : "",
    kbBlock || liveBlock || memoryBlock || historyBlock || req.attachment || hasImages ? `STUDENT'S MESSAGE:\n${question || "Please help me with the attached."}` : question,
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
  // One routing line per request: what was used and how long it took. Labels only, never the question or answer.
  aiLog({ evt: "ai.route", requestId, route: "agent", intent: cls.intent, subject: cls.subject ?? "none", tools: toolsUsed.join(",") || "model", ms: Date.now() - t0, ok: wroteText, live: live ? (live.ok ? "ok" : "failed") : undefined });
}
