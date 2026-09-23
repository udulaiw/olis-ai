// GET /api/health
//   Public:   { ok, busy } only. Nothing about providers, models, config or the knowledge base.
//   Internal: ?detail=1 (+ &probe=1) with header "x-olis-admin: <OLIS_ADMIN_TOKEN>".
//             A missing/wrong token gets the same 404 as a disabled endpoint, so it
//             doesn't reveal that the internal view exists.
import { timingSafeEqual } from "node:crypto";
import { config } from "../server/config.js";
import { json, errorJson } from "../server/http.js";
import { indexStats } from "../server/rag.js";
import { providerHealth, publicEngineSummary } from "../server/ai/status.js";
import { probeAll } from "../server/ai/probe.js";

const VERSION = "0.3.1-beta";

function tokenOk(given: string | null, expected: string) {
  if (!expected || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(request: Request): Promise<Response> {
  const cfg = config();
  const url = new URL(request.url);

  if (url.searchParams.get("detail") === "1") {
    if (!tokenOk(request.headers.get("x-olis-admin"), cfg.adminToken)) return errorJson(404, "not_found", "Not found.");
    const probe = url.searchParams.get("probe") === "1" ? await probeAll() : undefined;
    return json({
      version: VERSION,
      ...providerHealth(),
      probe,
      knowledge: indexStats(),
      tools: { webSearch: cfg.tavilyKey ? cfg.webScope : false, feedback: cfg.feedbackWebhook ? "webhook" : "logs" },
    });
  }

  const engines = publicEngineSummary();
  return json({ ok: engines.engines > 0 || engines.busy, busy: engines.busy });
}
