// GET /api/health
//   Public:   what OLIS Cloud can do right now. No provider or model names, no secrets.
//   Internal: ?detail=1 with header "x-olis-admin: <OLIS_ADMIN_TOKEN>" adds provider/model health.
import { timingSafeEqual } from "node:crypto";
import { config } from "../server/config.js";
import { json, errorJson } from "../server/http.js";
import { indexStats } from "../server/rag.js";
import { providerHealth, publicEngineSummary } from "../server/ai/status.js";

const VERSION = "0.3.0-beta";

function tokenOk(given: string | null, expected: string) {
  if (!expected || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(request: Request): Promise<Response> {
  const cfg = config();
  const url = new URL(request.url);
  const engines = publicEngineSummary();
  const knowledge = indexStats();

  if (url.searchParams.get("detail") === "1") {
    if (!cfg.adminToken) return errorJson(404, "not_found", "Internal health is disabled (set OLIS_ADMIN_TOKEN to enable it).");
    if (!tokenOk(request.headers.get("x-olis-admin"), cfg.adminToken)) return errorJson(401, "unauthorized", "Admin token required.");
    return json({ version: VERSION, ...providerHealth(), knowledge });
  }

  return json({
    ok: engines.engines > 0 || engines.busy,
    version: VERSION,
    engines,
    knowledge,
    tools: {
      knowledgeBase: true,
      pastPapers: knowledge.pastPaperChunks > 0,
      wikipedia: true,
      webSearch: cfg.tavilyKey ? cfg.webScope : false,
      readPages: true,
      images: engines.engines > 0,
    },
    feedbackStorage: cfg.feedbackWebhook ? "webhook" : "logs",
  });
}
