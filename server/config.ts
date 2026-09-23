// Server-side configuration. Everything here comes from Vercel Environment
// Variables and never reaches the browser.

const env = (k: string, d = "") => (process.env[k] || "").trim() || d;

export const DEFAULT_TRUSTED_DOMAINS = [
  "wikipedia.org",
  "britannica.com",
  "khanacademy.org",
  "openstax.org",
  "libretexts.org",
  "bbc.co.uk",
  "physicsclassroom.com",
  "hyperphysics.phy-astr.gsu.edu",
  "chemguide.co.uk",
  "chem.libretexts.org",
  "mathsisfun.com",
  "mathworld.wolfram.com",
  "nasa.gov",
  "nih.gov",
  "nature.com",
  "sciencedirect.com",
  "ncbi.nlm.nih.gov",
  "doenets.lk",
  "nie.lk",
];

export function config() {
  return {
    geminiKey: env("GEMINI_API_KEY"),
    geminiBase: env("GEMINI_BASE_URL", "https://generativelanguage.googleapis.com/v1beta").replace(/\/$/, ""),
    model: env("GEMINI_MODEL", "gemini-3.5-flash-lite"),
    embedModel: env("GEMINI_EMBED_MODEL", "gemini-embedding-001"),
    tavilyKey: env("TAVILY_API_KEY"),
    tavilyBase: env("TAVILY_BASE_URL", "https://api.tavily.com").replace(/\/$/, ""),
    wikipediaBase: env("WIKIPEDIA_BASE_URL", "https://en.wikipedia.org").replace(/\/$/, ""),
    webScope: (env("WEB_SEARCH_SCOPE", "trusted") === "open" ? "open" : "trusted") as "open" | "trusted",
    trustedDomains: env("TRUSTED_DOMAINS") ? env("TRUSTED_DOMAINS").split(",").map((d) => d.trim()).filter(Boolean) : DEFAULT_TRUSTED_DOMAINS,
    allowedOrigins: env("ALLOWED_ORIGINS").split(",").map((d) => d.trim()).filter(Boolean),
    rateLimit: Math.max(1, parseInt(env("RATE_LIMIT_PER_10MIN", "30")) || 30),
    feedbackWebhook: env("FEEDBACK_WEBHOOK_URL"),
    maxSteps: Math.min(6, Math.max(1, parseInt(env("AGENT_MAX_STEPS", "4")) || 4)),
  };
}

export type Config = ReturnType<typeof config>;
