// GET /api/health: what OLIS Cloud can do right now (never exposes secrets)
import { config } from "../server/config.js";
import { json } from "../server/http.js";
import { indexStats } from "../server/rag.js";

export async function GET(): Promise<Response> {
  const cfg = config();
  return json({
    ok: Boolean(cfg.geminiKey),
    version: "0.2.0-beta",
    model: cfg.geminiKey ? cfg.model : null,
    knowledge: indexStats(),
    tools: {
      knowledgeBase: true,
      wikipedia: true,
      webSearch: cfg.tavilyKey ? cfg.webScope : false,
      readPages: true,
    },
    feedbackStorage: cfg.feedbackWebhook ? "webhook" : "logs",
  });
}
