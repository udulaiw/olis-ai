// Free Beta cost safety. With OLIS_FREE_BETA=true (the DEFAULT when unset),
// only explicitly approved free-tier models can be called. Anything else fails
// safely (skipped by the router) instead of silently generating paid usage.
import { FREE_BETA_ALLOWLIST, PAID_MODEL_PATTERNS, type ModelSpec } from "./models.config.js";
import type { ProviderId } from "./types.js";

const KNOWN_PROVIDERS: ProviderId[] = ["gemini", "nvidia", "local"];

/** Free Beta is ON unless explicitly set to "false". A typo keeps it on. */
export function freeBetaEnabled(): boolean {
  return (process.env.OLIS_FREE_BETA ?? "").trim().toLowerCase() !== "false";
}

function extraApproved(): Set<string> {
  // OLIS_FREE_BETA_EXTRA_MODELS="gemini:gemini-3.6-flash,nvidia:z-ai/glm-5.3-flash"
  return new Set(
    (process.env.OLIS_FREE_BETA_EXTRA_MODELS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

/** Returns null when allowed, or the reason it's blocked. */
export function policyBlock(spec: ModelSpec): string | null {
  if (!KNOWN_PROVIDERS.includes(spec.provider)) return `unknown provider "${spec.provider}"`;
  if (!freeBetaEnabled()) return null;
  if (spec.tier !== "free") return `tier "${spec.tier}" is not allowed in Free Beta`;
  if (spec.provider === "local") return null;
  if (PAID_MODEL_PATTERNS.some((p) => p.test(spec.model))) return `"${spec.model}" matches a paid-model pattern`;
  const allowed = FREE_BETA_ALLOWLIST[spec.provider] ?? [];
  if (allowed.includes("*") || allowed.includes(spec.model) || extraApproved().has(`${spec.provider}:${spec.model}`)) return null;
  return `"${spec.model}" is not on the Free Beta allowlist`;
}

/** Embedding models used for knowledge-base search (Gemini free tier). */
const FREE_EMBEDDING_MODELS = ["gemini-embedding-001", "text-embedding-004"];
export function embeddingAllowed(model: string): boolean {
  return !freeBetaEnabled() || FREE_EMBEDDING_MODELS.includes(model);
}
