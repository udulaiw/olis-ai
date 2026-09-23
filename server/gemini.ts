// Gemini embeddings for knowledge-base semantic search.
// (Chat/generation moved to server/ai/: the provider-neutral router.)
import type { Config } from "./config.js";

/** Query embedding for semantic search (same model + dims as the index). Throws on any failure; callers fall back to keyword search. */
export async function embedQuery(cfg: Config, text: string, dims: number, signal?: AbortSignal): Promise<number[]> {
  if (!cfg.geminiKey) throw new Error("no key");
  const res = await fetch(`${cfg.geminiBase}/models/${cfg.embedModel}:embedContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": cfg.geminiKey },
    body: JSON.stringify({ model: `models/${cfg.embedModel}`, content: { parts: [{ text }] }, taskType: "RETRIEVAL_QUERY", outputDimensionality: dims }),
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(5000)]) : AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`embedding failed (${res.status})`);
  const data = (await res.json()) as { embedding?: { values?: number[] } };
  const v = data.embedding?.values ?? [];
  const n = Math.sqrt(v.reduce((a, x) => a + x * x, 0)) || 1;
  return v.map((x) => x / n);
}
