// POST /api/agent: the OLIS research agent (Server-Sent Events stream)
import { config } from "../server/config.js";
import { guard, sseStream, errorJson } from "../server/http.js";
import { runAgent, type AgentRequest } from "../server/agent.js";
import { UpstreamError } from "../server/gemini.js";

const MODES = new Set(["ask", "explain", "solve", "plan", "summarize", "simplify", "quiz"]);
const str = (v: unknown, max: number, d = "") => (typeof v === "string" ? v.slice(0, max) : d);

function parse(body: unknown): AgentRequest | null {
  const b = body as Record<string, unknown>;
  if (!b || !Array.isArray(b.messages) || !b.messages.length) return null;
  const messages = (b.messages as { role?: unknown; content?: unknown }[])
    .slice(-24)
    .map((m) => ({ role: m.role === "assistant" ? ("assistant" as const) : ("user" as const), content: str(m.content, 12000) }))
    .filter((m) => m.content.trim());
  if (!messages.length || messages[messages.length - 1].role !== "user") return null;
  const ctx = (b.context ?? {}) as Record<string, unknown>;
  return {
    messages,
    attachment: str(b.attachment, 40000) || undefined,
    mode: MODES.has(String(b.mode)) ? String(b.mode) : "ask",
    context: { subject: str(ctx.subject, 40, "General"), level: str(ctx.level, 20, "Intermediate"), style: str(ctx.style, 40, "Detailed explanation") },
  };
}

export async function POST(request: Request): Promise<Response> {
  const cfg = config();
  const g = await guard(request, cfg, "agent");
  if (g instanceof Response) return g;
  const req = parse(g.body);
  if (!req) return errorJson(400, "bad_request", "Send at least one user message.");
  if (!cfg.geminiKey) return errorJson(503, "config", "OLIS Cloud isn't configured yet (GEMINI_API_KEY missing).");

  return sseStream(async (send, signal) => {
    try {
      for await (const ev of runAgent(cfg, req, signal)) send(ev);
    } catch (e) {
      if (signal.aborted) return;
      const err = e instanceof UpstreamError ? e : null;
      if (!err) console.error("[olis/agent]", e);
      send({ type: "error", code: err?.code ?? "server", message: err?.message ?? "Something went wrong on the OLIS server. Please try again." });
    }
  }, request.signal);
}
