// POST /api/generate: grounded quiz / flashcard generation (JSON)
import { config } from "../server/config.js";
import { guard, json, errorJson } from "../server/http.js";
import { generate } from "../server/generate.js";
import { RouterExhausted, anyEngineConfigured } from "../server/ai/router.js";
import { ProviderError } from "../server/ai/types.js";
import { parseContext, parseProfile, str } from "../server/sanitize.js";

export async function POST(request: Request): Promise<Response> {
  const cfg = config();
  const g = await guard(request, cfg, "generate", { daily: true });
  if (g instanceof Response) return g;
  const b = (g.body ?? {}) as Record<string, unknown>;
  const kind = b.kind === "flashcards" ? "flashcards" : b.kind === "quiz" ? "quiz" : null;
  if (!kind) return errorJson(400, "bad_request", "kind must be 'quiz' or 'flashcards'.");
  if (!anyEngineConfigured("structured")) return errorJson(503, "config", "OLIS Cloud isn't available right now.");
  try {
    const out = await generate(
      cfg,
      {
        kind,
        topic: str(b.topic, 200),
        subject: str(b.subject, 40) || undefined,
        difficulty: str(b.difficulty, 20) || undefined,
        count: typeof b.count === "number" ? b.count : undefined,
        context: parseContext(b.context),
        profile: parseProfile(b.profile),
      },
      request.signal,
    );
    return json(out);
  } catch (e) {
    if (e instanceof RouterExhausted) return errorJson(e.allRateLimited ? 429 : 503, e.allRateLimited ? "rate_limit" : "unavailable", e.message);
    if (e instanceof ProviderError && e.category === "blocked") return errorJson(400, "blocked", "OLIS can't help with that request. Try rephrasing it.");
    console.error("[olis/generate]", (e as Error)?.name, (e as Error)?.message?.slice(0, 200));
    return errorJson(502, "server", "OLIS couldn't generate that. Please try again.");
  }
}
