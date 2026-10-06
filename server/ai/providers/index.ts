// Provider registry. To add a provider: create an adapter (usually a few
// lines with OpenAICompatibleProvider), register it here, add its models to
// models.config.ts, and add its ID to ProviderId in types.ts.
import type { AIProvider, ProviderId } from "../types.js";
import { GeminiProvider } from "./gemini.js";
import { OpenAICompatibleProvider } from "./openai-compatible.js";

const env = (k: string) => (process.env[k] || "").trim();

/** NVIDIA API catalog (build.nvidia.com). OpenAI-compatible. */
export const NvidiaProvider = () =>
  new OpenAICompatibleProvider({
    id: "nvidia",
    label: "NVIDIA",
    baseUrl: () => env("NVIDIA_BASE_URL") || "https://integrate.api.nvidia.com/v1",
    apiKey: () => env("NVIDIA_API_KEY"),
    keyRequired: true,
  });

// Official free tiers (no card), all OpenAI-compatible. Each is off until its key is set.
// Source list: github.com/open-free-llm-api/awesome-freellm-apis (checked against each provider's docs, Oct 2026).

/** Groq (console.groq.com). Free plan: per-model RPM/RPD limits, no billing unless you upgrade. */
export const GroqProvider = () =>
  new OpenAICompatibleProvider({ id: "groq", label: "Groq", baseUrl: () => env("GROQ_BASE_URL") || "https://api.groq.com/openai/v1", apiKey: () => env("GROQ_API_KEY"), keyRequired: true });

/** Cerebras Inference (cloud.cerebras.ai). Free tier. */
export const CerebrasProvider = () =>
  new OpenAICompatibleProvider({ id: "cerebras", label: "Cerebras", baseUrl: () => env("CEREBRAS_BASE_URL") || "https://api.cerebras.ai/v1", apiKey: () => env("CEREBRAS_API_KEY"), keyRequired: true });

/** Mistral AI (console.mistral.ai). Free "Experiment" plan; Mistral may use free-plan data for training (opt-out in their console). */
export const MistralProvider = () =>
  new OpenAICompatibleProvider({ id: "mistral", label: "Mistral", baseUrl: () => env("MISTRAL_BASE_URL") || "https://api.mistral.ai/v1", apiKey: () => env("MISTRAL_API_KEY"), keyRequired: true });

/** OpenRouter (openrouter.ai). Only ":free" models / the openrouter/free router are allowed in Free Beta: 20 RPM, 50 requests/day without credits. */
export const OpenRouterProvider = () =>
  new OpenAICompatibleProvider({
    id: "openrouter",
    label: "OpenRouter",
    baseUrl: () => env("OPENROUTER_BASE_URL") || "https://openrouter.ai/api/v1",
    apiKey: () => env("OPENROUTER_API_KEY"),
    keyRequired: true,
    extraHeaders: { "HTTP-Referer": "https://olis-ai.vercel.app", "X-Title": "OLIS AI" },
  });

/**
 * Open-source model server: Ollama (local, or Ollama Cloud at https://ollama.com/v1 with LOCAL_AI_API_KEY),
 * LM Studio, vLLM, a Hugging Face endpoint, or any other OpenAI-compatible host. Off unless LOCAL_AI_BASE_URL is set.
 * On Vercel the URL must be reachable from the internet (a Vercel function can't reach localhost on your PC).
 */
export const LocalProvider = () =>
  new OpenAICompatibleProvider({
    id: "local",
    label: "Open-source model server",
    baseUrl: () => env("LOCAL_AI_BASE_URL"),
    apiKey: () => env("LOCAL_AI_API_KEY"),
    keyRequired: false,
  });

let registry: Map<ProviderId, AIProvider> | null = null;

export function providers(): Map<ProviderId, AIProvider> {
  if (!registry) {
    registry = new Map<ProviderId, AIProvider>([
      ["gemini", new GeminiProvider()],
      ["groq", GroqProvider()],
      ["cerebras", CerebrasProvider()],
      ["nvidia", NvidiaProvider()],
      ["mistral", MistralProvider()],
      ["openrouter", OpenRouterProvider()],
      ["local", LocalProvider()],
    ]);
  }
  return registry;
}

/** Test hook: swap a provider implementation. */
export function _setProvider(p: AIProvider) {
  providers().set(p.id, p);
}
export function _resetProviders() {
  registry = null;
}
