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

/** Optional local model server, e.g. Ollama (http://localhost:11434/v1) or LM Studio. Off unless LOCAL_AI_BASE_URL is set. */
export const LocalProvider = () =>
  new OpenAICompatibleProvider({
    id: "local",
    label: "Local model",
    baseUrl: () => env("LOCAL_AI_BASE_URL"),
    apiKey: () => env("LOCAL_AI_API_KEY"),
    keyRequired: false,
  });

let registry: Map<ProviderId, AIProvider> | null = null;

export function providers(): Map<ProviderId, AIProvider> {
  if (!registry) {
    registry = new Map<ProviderId, AIProvider>([
      ["gemini", new GeminiProvider()],
      ["nvidia", NvidiaProvider()],
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
