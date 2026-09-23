// POST /api/agent: the OLIS research agent (Server-Sent Events stream)
import { config } from "../server/config.js";
import { guard, sseStream, errorJson } from "../server/http.js";
import { runAgent, type AgentRequest } from "../server/agent.js";
import { RouterExhausted, anyEngineConfigured } from "../server/ai/router.js";
import { ProviderError } from "../server/ai/types.js";
import { parseContext, parseImages, parseProfile, str } from "../server/sanitize.js";

const MODES = new Set(["ask", "explain", "solve", "plan", "summarize", "simplify", "quiz"]);

function parse(body: unknown): AgentRequest | null {
  const b = body as Record<string, unknown>;
  if (!b || !Array.isArray(b.messages)) return null;
  const messages = (b.messages as { role?: unknown; content?: unknown }[])
    .slice(-24)
    .map((m) => ({ role: m.role === "assistant" ? ("assistant" as const) : ("user" as const), content: str(m.content, 12000) }))
    .filter((m) => m.content.trim());
  const images = parseImages(b.images);
  if (!images) return null;
  // The last message must be the student's (it may be empty only when an image is attached)
  if (!messages.length || messages[messages.length - 1].role !== "user") {
    if (!images.length) return null;
    messages.push({ role: "user", content: "Please help me with the attached image." });
  }
  return {
    messages,
    attachment: str(b.attachment, 40000) || undefined,
    images: images.length ? images : undefined,
    mode: MODES.has(String(b.mode)) ? String(b.mode) : "ask",
    context: parseContext(b.context),
    profile: parseProfile(b.profile),
  };
}

export async function POST(request: Request): Promise<Response> {
  const cfg = config();
  const g = await guard(request, cfg, "agent", { maxBytes: 3_200_000, daily: true });
  if (g instanceof Response) return g;
  const req = parse(g.body);
  if (!req) return errorJson(400, "bad_request", "Send at least one user message (images: JPEG/PNG/WebP, max 2).");
  if (!anyEngineConfigured("general")) return errorJson(503, "config", "OLIS Cloud isn't configured yet: no AI provider key is set on the server.");

  return sseStream(async (send, signal) => {
    try {
      for await (const ev of runAgent(cfg, req, signal)) send(ev);
    } catch (e) {
      if (signal.aborted) return;
      if (e instanceof RouterExhausted) {
        send({ type: "error", code: e.allRateLimited ? "rate_limit" : "unavailable", message: e.message });
      } else if (e instanceof ProviderError && e.category === "blocked") {
        send({ type: "error", code: "blocked", message: "OLIS can't help with that request. Try rephrasing it." });
      } else {
        console.error("[olis/agent]", (e as Error)?.name, (e as Error)?.message?.slice(0, 200));
        send({ type: "error", code: "server", message: "Something went wrong on the OLIS server. Please try again." });
      }
    }
  }, request.signal);
}
