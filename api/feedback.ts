// POST /api/feedback: 👍/👎 on answers. This is OLIS's beta "training data":
// every rating is logged (visible in Vercel → Logs) and optionally forwarded to
// FEEDBACK_WEBHOOK_URL (e.g. a Google Sheets Apps Script or Discord webhook).
import { config } from "../server/config.js";
import { guard, json, errorJson } from "../server/http.js";

const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");

export async function POST(request: Request): Promise<Response> {
  const cfg = config();
  const g = await guard(request, cfg, "feedback", { limit: 60, maxBytes: 40_000 });
  // Feedback is opt-in (the student pressed 👍/👎). The full Q&A only goes to the
  // webhook, if one is set. Vercel logs get metadata plus short excerpts, so
  // student conversations don't pile up in logs.
  if (g instanceof Response) return g;
  const b = (g.body ?? {}) as Record<string, unknown>;
  const rating = b.rating === "up" || b.rating === "down" ? b.rating : null;
  if (!rating) return errorJson(400, "bad_request", "rating must be 'up' or 'down'.");

  const record = {
    type: "olis_feedback",
    at: new Date().toISOString(),
    rating,
    mode: str(b.mode, 20),
    context: b.context && typeof b.context === "object" ? b.context : undefined,
    question: str(b.question, 2000),
    answer: str(b.answer, 6000),
    comment: str(b.comment, 1000),
    sources: Array.isArray(b.sources) ? (b.sources as unknown[]).slice(0, 12) : [],
    engine: str(b.engine, 20),
  };
  console.log(
    JSON.stringify({
      ...record,
      question: record.question.slice(0, 160),
      answer: cfg.feedbackWebhook ? `[${record.answer.length} chars → webhook]` : record.answer.slice(0, 400),
      comment: record.comment.slice(0, 200),
      sources: record.sources.length,
    }),
  );

  if (cfg.feedbackWebhook) {
    try {
      await fetch(cfg.feedbackWebhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(record),
        signal: AbortSignal.timeout(5000),
      });
    } catch {
      /* logging above is the source of truth */
    }
  }
  return json({ ok: true });
}
