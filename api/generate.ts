// POST /api/generate: grounded quiz / flashcard generation (JSON)
import { config } from "../server/config.js";
import { guard, json, errorJson } from "../server/http.js";
import { generate } from "../server/generate.js";
import { UpstreamError } from "../server/gemini.js";

const str = (v: unknown, max: number, d = "") => (typeof v === "string" ? v.slice(0, max) : d);

export async function POST(request: Request): Promise<Response> {
  const cfg = config();
  const g = await guard(request, cfg, "generate");
  if (g instanceof Response) return g;
  const b = (g.body ?? {}) as Record<string, unknown>;
  const kind = b.kind === "flashcards" ? "flashcards" : b.kind === "quiz" ? "quiz" : null;
  if (!kind) return errorJson(400, "bad_request", "kind must be 'quiz' or 'flashcards'.");
  if (!cfg.geminiKey) return errorJson(503, "config", "OLIS Cloud isn't configured yet (GEMINI_API_KEY missing).");
  const ctx = (b.context ?? {}) as Record<string, unknown>;
  try {
    const out = await generate(
      cfg,
      {
        kind,
        topic: str(b.topic, 200),
        subject: str(b.subject, 40) || undefined,
        difficulty: str(b.difficulty, 20) || undefined,
        count: typeof b.count === "number" ? b.count : undefined,
        context: { subject: str(ctx.subject, 40, "General"), level: str(ctx.level, 20, "Intermediate"), style: str(ctx.style, 40, "Detailed explanation") },
      },
      request.signal,
    );
    return json(out);
  } catch (e) {
    if (e instanceof UpstreamError) return errorJson(e.status, e.code, e.message);
    console.error("[olis/generate]", e);
    return errorJson(502, "server", "OLIS couldn't generate that. Please try again.");
  }
}
