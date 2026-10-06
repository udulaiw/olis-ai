// POST /api/olis/classify: what the OLIS subject router makes of a question, without answering it.
//   body: { question, mode?, subject?, profile?, history? }
// Returns labels only (subject, level, language, topic, intent, difficulty, requires_web/rag/memory/history…).
// No AI call is made, so this costs nothing; it shares the agent's origin check and rate limit.
import { config } from "../../server/config.js";
import { guard, json, errorJson } from "../../server/http.js";
import { classifyRequest } from "../../server/ai/intent.js";
import { parseProfile, str } from "../../server/sanitize.js";

export async function POST(request: Request): Promise<Response> {
  const cfg = config();
  const g = await guard(request, cfg, "classify", { maxBytes: 40_000 });
  if (g instanceof Response) return g;
  const b = (g.body ?? {}) as Record<string, unknown>;
  const question = str(b.question, 4000);
  if (!question.trim()) return errorJson(400, "bad_request", "Send a question.");
  const profile = parseProfile(b.profile);
  const history = Array.isArray(b.history)
    ? (b.history as { role?: unknown; content?: unknown }[]).slice(-6).map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: str(m.content, 2000) }))
    : [];
  const c = classifyRequest({
    question,
    mode: typeof b.mode === "string" ? b.mode : "ask",
    subject: str(b.subject, 40) || undefined,
    languagePref: profile?.language,
    history,
    stream: profile?.stream,
    examLevel: profile?.examLevel,
  });
  return json({
    subject: c.subject,
    subject_name: c.subjectName,
    discipline: c.discipline,
    level: c.examLevel,
    language: c.language,
    reply_language: c.reply,
    topic: c.topic?.unit ?? null,
    topic_name: c.topicName,
    intent: c.intent,
    difficulty: c.difficulty,
    requires_calculation: c.requiresCalculation,
    requires_retrieval: c.requiresRetrieval,
    requires_rag: c.requiresRetrieval,
    requires_web: Boolean(c.live),
    live_domain: c.live?.domain ?? null,
    requires_memory: c.requiresMemory,
    requires_history: c.requiresHistory,
    requires_current_info: c.requiresCurrentInfo,
    follow_up: c.followUp?.kind ?? null,
    literature: c.literature
      ? { domain: c.literature.domain, form: c.literature.form, task: c.literature.task, mode: c.literature.mode, command_word: c.literature.command, has_text: c.literature.hasText, text_language: c.literature.textLanguage, pitch: c.literature.pitch }
      : null,
  });
}
