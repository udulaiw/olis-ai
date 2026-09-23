// ─────────────────────────────────────────────
// OLIS model configuration: THE one file to edit to change which models
// OLIS uses. No application code needs to change.
//
//   CATALOG      every model OLIS may call, what it can do, and its tier
//   ROUTES       for each kind of request, the models to try, in order
//   FREE_BETA_*  what OLIS_FREE_BETA=true allows
//
// Model IDs were checked against the providers' public lists in Sep 2026:
//   Gemini:  https://ai.google.dev/gemini-api/docs/pricing  ("Free of charge")
//   NVIDIA:  https://integrate.api.nvidia.com/v1/models
// Providers rename and retire models. Re-check before relying on one.
// ─────────────────────────────────────────────
import type { Capability, ProviderId, Task } from "./types.js";

export type Tier = "free" | "paid" | "unknown";

export interface ModelSpec {
  /** Stable key used in ROUTES (not sent to the provider). */
  key: string;
  provider: ProviderId;
  /** The provider's model ID. */
  model: string;
  /** "free" = usable at $0 on the provider's free tier. Anything else is blocked in Free Beta. */
  tier: Tier;
  capabilities: Capability[];
  /** Conservative context size, used to route long study material. */
  contextTokens: number;
  /**
   * OLIS's own soft daily cap for this model (requests/day, per server instance).
   * Keeps OLIS well under the provider's free quota so it fails over gracefully
   * instead of hitting a hard wall. 0 = no OLIS-side cap.
   */
  dailyBudget: number;
  notes?: string;
}

const env = (k: string) => (process.env[k] || "").trim();

// ── Catalog ────────────────────────────────────
export function catalog(): ModelSpec[] {
  return [
    // Google Gemini (primary). Free tier: key from a Google AI Studio project WITHOUT billing.
    {
      key: "gemini-fast",
      provider: "gemini",
      model: env("GEMINI_MODEL") || "gemini-3.5-flash-lite",
      tier: "free",
      capabilities: ["text", "tools", "vision", "json", "long_context", "multilingual"],
      contextTokens: 1_000_000,
      dailyBudget: 900,
      notes: "Fastest, most generous free quota. Default for everyday questions.",
    },
    {
      key: "gemini-reasoning",
      provider: "gemini",
      model: env("GEMINI_REASONING_MODEL") || "gemini-3.5-flash",
      tier: "free",
      capabilities: ["text", "tools", "vision", "json", "long_context", "reasoning", "multilingual"],
      contextTokens: 1_000_000,
      dailyBudget: 400,
      notes: "Stronger reasoning for Combined Maths / Physics problems, Sinhala and images.",
    },
    {
      key: "gemini-backup",
      provider: "gemini",
      model: env("GEMINI_BACKUP_MODEL") || "gemini-3.1-flash-lite",
      tier: "free",
      capabilities: ["text", "tools", "vision", "json", "long_context", "reasoning", "multilingual"],
      contextTokens: 1_000_000,
      dailyBudget: 200,
      notes: "Separate free quota. Used when the others are busy or rate-limited.",
    },

    // NVIDIA API catalog (optional). OpenAI-compatible. Free endpoints are for
    // development / testing / evaluation under NVIDIA's terms, not production.
    // Tool calling is not assumed: OLIS pre-fetches knowledge-base notes, so answers stay grounded.
    {
      key: "nvidia-reasoning",
      provider: "nvidia",
      model: env("NVIDIA_REASONING_MODEL") || "deepseek-ai/deepseek-v4.1-flash",
      tier: "free",
      capabilities: ["text", "json", "reasoning", "multilingual"],
      contextTokens: 128_000,
      dailyBudget: 300,
    },
    {
      key: "nvidia-fast",
      provider: "nvidia",
      model: env("NVIDIA_FAST_MODEL") || "openai/gpt-oss-20b",
      tier: "free",
      capabilities: ["text", "json", "reasoning"],
      contextTokens: 128_000,
      dailyBudget: 300,
    },
    {
      key: "nvidia-nemotron",
      provider: "nvidia",
      model: env("NVIDIA_NEMOTRON_MODEL") || "nvidia/nemotron-3-super-120b-a12b",
      tier: "free",
      capabilities: ["text", "json", "reasoning", "multilingual"],
      contextTokens: 128_000,
      dailyBudget: 200,
    },
    {
      key: "nvidia-vision",
      provider: "nvidia",
      model: env("NVIDIA_VISION_MODEL") || "meta/llama-3.2-90b-vision-instruct",
      tier: "free",
      capabilities: ["text", "vision"],
      contextTokens: 128_000,
      dailyBudget: 100,
    },

    // Local model (optional, e.g. Ollama / LM Studio). Only useful in `npm run dev`:
    // a Vercel function can't reach your laptop.
    {
      key: "local",
      provider: "local",
      model: env("LOCAL_AI_MODEL") || "llama3.2",
      tier: "free",
      capabilities: ["text", "json"],
      contextTokens: 8_000,
      dailyBudget: 0,
    },
  ];
}

// ── Routes ─────────────────────────────────────
// For each task, models are tried in this order. Models whose provider isn't
// configured, that lack a required capability, are cooling down after a
// rate limit, or are blocked by Free Beta are skipped automatically.
export const ROUTES: Record<Task, string[]> = {
  general: ["gemini-fast", "gemini-reasoning", "gemini-backup", "nvidia-fast", "nvidia-reasoning", "nvidia-nemotron", "local"],
  reasoning: ["gemini-reasoning", "gemini-backup", "nvidia-reasoning", "nvidia-nemotron", "gemini-fast", "local"],
  mathematics: ["gemini-reasoning", "gemini-backup", "nvidia-reasoning", "nvidia-nemotron", "gemini-fast", "local"],
  physics: ["gemini-reasoning", "gemini-backup", "nvidia-reasoning", "nvidia-nemotron", "gemini-fast", "local"],
  chemistry: ["gemini-reasoning", "gemini-fast", "gemini-backup", "nvidia-reasoning", "nvidia-nemotron", "local"],
  vision: ["gemini-reasoning", "gemini-fast", "gemini-backup", "nvidia-vision"],
  sinhala: ["gemini-reasoning", "gemini-fast", "gemini-backup", "nvidia-reasoning", "nvidia-nemotron"],
  long_context: ["gemini-fast", "gemini-reasoning", "gemini-backup", "nvidia-reasoning", "nvidia-nemotron"],
  structured: ["gemini-fast", "gemini-reasoning", "gemini-backup", "nvidia-fast", "nvidia-reasoning", "local"],
};

// ── Free Beta ──────────────────────────────────
/**
 * With OLIS_FREE_BETA=true (the default), a model may only be called if:
 *   1. its catalog tier is "free", AND
 *   2. its exact model ID is on this allowlist (or on OLIS_FREE_BETA_EXTRA_MODELS).
 * So an env var accidentally pointing GEMINI_MODEL at a paid model is blocked,
 * not billed. Unknown providers are always blocked.
 *
 * IMPORTANT: for Gemini, "free" also depends on your key. A key from a Google
 * Cloud project WITH billing enabled is billed even for these models. Use a
 * key from an AI Studio project with billing OFF.
 */
export const FREE_BETA_ALLOWLIST: Record<ProviderId, string[]> = {
  gemini: ["gemini-3.5-flash-lite", "gemini-3.5-flash", "gemini-3.1-flash-lite", "gemini-3-flash-preview", "gemini-2.5-flash", "gemini-2.5-pro"],
  nvidia: ["deepseek-ai/deepseek-v4.1-flash", "openai/gpt-oss-20b", "meta/llama-3.2-90b-vision-instruct", "meta/llama-3.2-11b-vision-instruct", "nvidia/nemotron-3-super-120b-a12b"],
  local: ["*"], // runs on your own machine: always $0
};

/** Model-name patterns that are never allowed in Free Beta, whatever the allowlist says. */
export const PAID_MODEL_PATTERNS: RegExp[] = [/-pro-preview/i, /-image\b/i, /omni/i, /ultra/i];

/** Embeddings (knowledge-base semantic search). Gemini only for now. */
export const EMBEDDING_MODEL_DEFAULT = "gemini-embedding-001";
