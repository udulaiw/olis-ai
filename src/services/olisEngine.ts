// ─────────────────────────────────────────────
// OLIS Engine: the single entry point the UI talks to.
//
// The UI never contains AI logic. It calls:
//   generateResponse()   chat (streams events: steps, sources, text, quiz)
//   generateQuiz()       interactive quiz
//   generateStudyPlan()  day-by-day plan
//   explainConcept()     concept explainer
//   generateFlashcards() flashcard deck
//   summarizeText()      summary
//
// Each routes to the active engine:
//   "cloud" → OLIS Cloud (Vercel backend: multi-provider AI router + RAG + web research).
//             No keys in the browser.
//   "demo"  → offline, $0, pattern-based engine (./demo), also the automatic
//             fallback when the cloud is unreachable.
// ─────────────────────────────────────────────
import type { Difficulty, EngineKind, Flashcard, LearningContext, Mode, Quiz, Source, StudyPlan, StudyProfile, Subject } from "../types";
import { sleep } from "../lib/utils";
import { detectIntent, type Intent } from "./intent";
import { demoFlashcards, demoQuiz, demoRespond, detectSubject, type DemoOutput } from "./demo/demoEngine";
import { searchWikipedia, wikiAnswer, wikiQuery } from "./wikipedia";
import { buildStudyPlan, type PlanInput } from "./demo/planner";
import { summarize, summaryToMarkdown } from "./demo/summarizer";
import { OlisError, cloudAgent, cloudGenerate, type CloudImage } from "./cloud";

export { OlisError };
export { planToMarkdown } from "./demo/planner";
export type { PlanInput } from "./demo/planner";
export type { Intent };

export interface EngineConfig {
  kind: EngineKind;
  /** The student's saved study profile (language, depth, weak topics…), sent to OLIS Cloud. */
  profile?: StudyProfile;
}

export interface Turn {
  role: "user" | "assistant";
  content: string;
}

export type EngineEvent =
  | { type: "text"; delta: string }
  | { type: "quiz"; quiz: Quiz }
  | { type: "step"; id: string; label: string; status: "running" | "done" | "failed" }
  | { type: "sources"; sources: Source[] }
  | { type: "suggestions"; items: string[] }
  /** OLIS Cloud switched engine mid-answer: keep only the first `to` characters. */
  | { type: "rewind"; to: number }
  | { type: "notice"; kind: "switching" };

export interface ResponseRequest {
  input: string;
  /** Extra hidden context (e.g. attached file text). */
  attachment?: string;
  /** Photos / screenshots (OLIS Cloud only). */
  images?: CloudImage[];
  mode: Mode;
  context: LearningContext;
  history: Turn[];
  signal?: AbortSignal;
}

export interface ToolResult<T> {
  data: T;
  source: EngineKind;
  sources?: Source[];
  /** Set when the cloud failed and OLIS answered offline instead. */
  fallbackReason?: string;
}

// ── Demo text streaming ────────────────────────
async function* streamText(text: string, signal?: AbortSignal): AsyncGenerator<EngineEvent> {
  // Initial "thinking" pause, then word-group chunks, so the demo feels live.
  await sleep(380 + Math.random() * 320, signal);
  const tokens = text.split(/(\s+)/);
  const step = text.length > 2500 ? 6 : 3;
  for (let i = 0; i < tokens.length; i += step) {
    yield { type: "text", delta: tokens.slice(i, i + step).join("") };
    await sleep(14 + Math.random() * 16, signal);
  }
}

const stripAttachHeader = (a: string) => a.replace(/^Attached file "[^"]*":\s*/, "");

/** Stream a demo-engine result, running a live Wikipedia lookup when needed. */
async function* playDemo(out: DemoOutput, signal?: AbortSignal): AsyncGenerator<EngineEvent> {
  if (out.kind === "quiz") {
    yield* streamText(out.intro, signal);
    yield { type: "quiz", quiz: out.quiz };
    return;
  }
  if (out.kind === "text") {
    yield* streamText(out.text, signal);
    if (out.suggestions?.length) yield { type: "suggestions", items: out.suggestions };
    return;
  }
  // lookup
  yield { type: "step", id: "w1", label: `Searching Wikipedia: “${out.query}”`, status: "running" };
  let pages: Awaited<ReturnType<typeof searchWikipedia>> = [];
  try {
    pages = await searchWikipedia(out.query, { detailed: out.detailed, signal });
  } catch (e) {
    if (signal?.aborted) throw e;
  }
  if (!pages.length) {
    yield { type: "step", id: "w1", label: "Wikipedia unavailable or no match", status: "failed" };
    yield* streamText(out.fallback, signal);
    return;
  }
  yield { type: "step", id: "w1", label: `Read “${pages[0].title}” on Wikipedia`, status: "done" };
  const { text, sources } = wikiAnswer(pages, { simple: out.simple, detailed: out.detailed });
  yield { type: "sources", sources };
  yield* streamText(text, signal);
  yield {
    type: "suggestions",
    items: out.simple ? [`Tell me more about ${pages[0].title}`] : [`Explain ${pages[0].title} like I'm a beginner`, `Tell me more about ${pages[0].title}`],
  };
}

/** Follow-up chips for cloud answers, built from the student's question. */
function cloudSuggestions(input: string, intent: Intent): string[] {
  if (!["explain", "ask", "simplify"].includes(intent)) return [];
  const topic = wikiQuery(input);
  if (!topic || topic.length > 50 || topic.split(" ").length > 7) return [];
  const t = topic.charAt(0).toUpperCase() + topic.slice(1);
  return intent === "simplify" ? [`Quiz me on ${t}`] : [`Explain ${t} like I'm a beginner`, `Quiz me on ${t}`];
}

// ── Chat ───────────────────────────────────────
export async function* generateResponse(req: ResponseRequest, cfg: EngineConfig): AsyncGenerator<EngineEvent> {
  let intent = detectIntent(req.input, req.mode);
  // An attached document with no specific instruction → summarise it
  if (req.attachment && (intent === "ask" || !req.input.trim())) intent = "summarize";

  if (cfg.kind === "demo" && req.images?.length) {
    yield* streamText(
      "Reading photos and screenshots needs **OLIS Cloud**, and it isn't reachable right now, so I'm running offline.\n\nYou can type the question out and I'll help step by step, or try again when OLIS Cloud is back.",
      req.signal,
    );
    return;
  }

  if (cfg.kind === "demo") {
    const docOnly = req.attachment ? `${req.input}\n\n${stripAttachHeader(req.attachment)}` : req.input;
    const out = demoRespond(
      intent === "summarize" ? docOnly : req.input,
      intent,
      req.context,
      req.history.map((h) => ({ role: h.role, content: h.content })),
    );
    yield* playDemo(out, req.signal);
    return;
  }

  // Cloud: quizzes are generated as structured JSON so they stay interactive
  if (intent === "quiz" && !req.images?.length) {
    const topic = req.input.replace(/^(please\s+)?(can you\s+)?(quiz|test)( me)?(\s+(on|about|in))?/i, "").trim() || req.context.subject;
    yield { type: "step", id: "q1", label: `Checking OLIS study notes for “${topic}”`, status: "running" };
    const { data, fallbackReason, sources } = await generateQuiz(
      { topic, subject: detectSubject(req.input) ?? req.context.subject, difficulty: "Mixed", count: 5, context: req.context, signal: req.signal },
      cfg,
    );
    yield { type: "step", id: "q1", label: fallbackReason ? "Cloud unavailable. Used the offline question bank" : `Wrote ${data.questions.length} questions`, status: fallbackReason ? "failed" : "done" };
    if (sources?.length) yield { type: "sources", sources };
    const note = fallbackReason ? `\n\n*${fallbackReason}*` : "";
    yield { type: "text", delta: `Here's a **${data.questions.length}-question quiz** on **${data.title}**. Pick an answer to see the explanation.${note}` };
    yield { type: "quiz", quiz: data };
    return;
  }

  const messages = [
    ...req.history.slice(-16),
    { role: "user" as const, content: req.input || (req.images?.length ? "Please help me with this." : "Please summarise the attached document.") },
  ];
  for await (const ev of cloudAgent(
    {
      messages,
      attachment: req.attachment ? stripAttachHeader(req.attachment) : undefined,
      images: req.images,
      mode: intent === "greeting" || intent === "thanks" || intent === "about" ? "ask" : (intent as Mode),
      context: req.context,
      profile: cfg.profile,
    },
    req.signal,
  )) {
    yield ev;
  }
  const chips = cloudSuggestions(req.input, intent);
  if (chips.length) yield { type: "suggestions", items: chips };
}

// ── Quiz ───────────────────────────────────────
export interface QuizRequest {
  topic?: string;
  subject?: Subject;
  difficulty?: Difficulty | "Mixed";
  count?: number;
  context: LearningContext;
  signal?: AbortSignal;
}

const isAbort = (e: unknown) => e instanceof DOMException && e.name === "AbortError";

export async function generateQuiz(req: QuizRequest, cfg: EngineConfig): Promise<ToolResult<Quiz>> {
  const demo = () => {
    const q = demoQuiz({ topic: req.topic, subject: req.subject, difficulty: req.difficulty, count: req.count });
    if (!q) throw new OlisError("empty", "No offline questions match that yet. Try a subject like Physics or Chemistry.");
    return q;
  };
  if (cfg.kind === "demo") {
    await sleep(450, req.signal);
    return { data: demo(), source: "demo" };
  }
  try {
    const n = req.count ?? 5;
    const { data, sources } = await cloudGenerate<Quiz>(
      { kind: "quiz", topic: req.topic || req.subject || req.context.subject, subject: req.subject, difficulty: req.difficulty ?? "Mixed", count: n, context: req.context, profile: cfg.profile },
      req.signal,
    );
    return {
      data: { title: data.title, subject: (req.subject ?? req.context.subject) as Subject, difficulty: req.difficulty ?? "Mixed", questions: data.questions.slice(0, n) },
      source: "cloud",
      sources,
    };
  } catch (e) {
    if (isAbort(e)) throw e;
    return { data: demo(), source: "demo", fallbackReason: `OLIS Cloud unavailable (${(e as Error).message}) so this quiz uses the offline question bank.` };
  }
}

// ── Flashcards ─────────────────────────────────
export async function generateFlashcards(
  topic: string,
  ctx: LearningContext,
  cfg: EngineConfig,
  signal?: AbortSignal,
): Promise<ToolResult<{ title: string; cards: Flashcard[] }>> {
  const demo = () => {
    const d = demoFlashcards(topic, ctx.subject);
    if (!d) throw new OlisError("empty", `The offline library has no cards for "${topic}" yet. Try "photosynthesis", "moles" or "differentiation", or use OLIS Cloud.`);
    return d;
  };
  if (cfg.kind === "demo") {
    await sleep(400, signal);
    return { data: demo(), source: "demo" };
  }
  try {
    const { data, sources } = await cloudGenerate<{ title: string; cards: Flashcard[] }>({ kind: "flashcards", topic, subject: ctx.subject, context: ctx, profile: cfg.profile }, signal);
    return { data, source: "cloud", sources };
  } catch (e) {
    if (isAbort(e)) throw e;
    return { data: demo(), source: "demo", fallbackReason: `OLIS Cloud unavailable (${(e as Error).message}) so these cards come from the offline library.` };
  }
}

// ── Study plan ─────────────────────────────────
// The planner is algorithmic in both modes: deterministic, instant, and it
// always respects the exact dates and hours the student entered.
export async function generateStudyPlan(input: PlanInput): Promise<ToolResult<StudyPlan>> {
  await sleep(300);
  return { data: buildStudyPlan(input), source: "demo" };
}

// ── Concept explainer ──────────────────────────
export async function* explainConcept(topic: string, ctx: LearningContext, cfg: EngineConfig, signal?: AbortSignal): AsyncGenerator<EngineEvent> {
  if (cfg.kind === "demo") {
    yield* playDemo(demoRespond(`Explain ${topic}`, "explain", ctx, []), signal);
    return;
  }
  yield* cloudAgent({ messages: [{ role: "user", content: `Explain: ${topic}` }], mode: "explain", context: ctx, profile: cfg.profile }, signal);
}

// ── Summary ────────────────────────────────────
export function summarizeText(text: string, ctx: LearningContext): string | null {
  const s = summarize(text);
  return s ? summaryToMarkdown(s, ctx.style === "Exam focused") : null;
}
