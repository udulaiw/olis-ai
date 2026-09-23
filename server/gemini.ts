// Minimal server-side Gemini client: streaming turns with function calling,
// JSON generation and embeddings. The API key only ever lives here.
import type { Config } from "./config.js";

export interface Part {
  text?: string;
  thought?: boolean;
  thoughtSignature?: string;
  functionCall?: { name: string; args?: Record<string, unknown>; id?: string };
  functionResponse?: { name: string; response: Record<string, unknown>; id?: string };
}
export interface Content {
  role: "user" | "model";
  parts: Part[];
}
export interface FunctionDeclaration {
  name: string;
  description: string;
  parameters: { type: "object"; properties: Record<string, { type: string; description?: string; enum?: string[] }>; required?: string[] };
}

export class UpstreamError extends Error {
  status: number;
  code: "rate_limit" | "auth" | "bad_request" | "server" | "network" | "blocked" | "config";
  constructor(code: UpstreamError["code"], message: string, status = 500) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

async function toError(res: Response): Promise<UpstreamError> {
  let msg = "";
  try {
    const j = (await res.json()) as { error?: { message?: string } };
    msg = j?.error?.message ?? "";
  } catch {
    /* ignore */
  }
  if (res.status === 429) return new UpstreamError("rate_limit", "OLIS is getting a lot of questions right now (free AI quota). Please wait a minute and try again.", 429);
  if (res.status === 401 || res.status === 403) return new UpstreamError("auth", "The server's Gemini API key is missing or invalid.", 502);
  if (res.status === 400 || res.status === 404) return new UpstreamError("bad_request", `The AI request was rejected. ${msg}`.trim(), 502);
  return new UpstreamError("server", "The AI service had a hiccup. Please try again.", 502);
}

function assertKey(cfg: Config) {
  if (!cfg.geminiKey) throw new UpstreamError("config", "The server isn't configured yet: GEMINI_API_KEY is missing in Vercel's Environment Variables.", 503);
}

async function post(url: string, cfg: Config, body: unknown, signal?: AbortSignal) {
  try {
    return await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": cfg.geminiKey },
      body: JSON.stringify(body),
      signal,
    });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    throw new UpstreamError("network", "Couldn't reach the AI service.", 502);
  }
}

/**
 * One model turn, streamed. Yields each part as it arrives (text deltas,
 * function calls, thought signatures). The caller keeps the raw parts to send
 * back on the next turn — Gemini needs its thought signatures returned intact.
 */
export async function* streamTurn(
  cfg: Config,
  opts: { system: string; contents: Content[]; tools?: FunctionDeclaration[]; forceAnswer?: boolean; temperature?: number },
  signal?: AbortSignal,
): AsyncGenerator<Part> {
  assertKey(cfg);
  const body: Record<string, unknown> = {
    systemInstruction: { parts: [{ text: opts.system }] },
    contents: opts.contents,
    generationConfig: { temperature: opts.temperature ?? 0.5 },
  };
  if (opts.tools?.length) {
    body.tools = [{ functionDeclarations: opts.tools }];
    body.toolConfig = { functionCallingConfig: { mode: opts.forceAnswer ? "NONE" : "AUTO" } };
  }
  const res = await post(`${cfg.geminiBase}/models/${encodeURIComponent(cfg.model)}:streamGenerateContent?alt=sse`, cfg, body, signal);
  if (!res.ok) throw await toError(res);
  if (!res.body) throw new UpstreamError("server", "Empty response from the AI service.");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let blocked = false;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      let json: { candidates?: { content?: { parts?: Part[] }; finishReason?: string }[]; promptFeedback?: { blockReason?: string } };
      try {
        json = JSON.parse(payload);
      } catch {
        continue;
      }
      if (json.promptFeedback?.blockReason) blocked = true;
      for (const p of json.candidates?.[0]?.content?.parts ?? []) yield p;
    }
  }
  if (blocked) throw new UpstreamError("blocked", "That request was blocked by the AI safety filters. Try rephrasing.", 400);
}

/** Structured JSON generation (quizzes, flashcards). */
export async function generateJSON<T>(cfg: Config, system: string, prompt: string, signal?: AbortSignal): Promise<T> {
  assertKey(cfg);
  const res = await post(
    `${cfg.geminiBase}/models/${encodeURIComponent(cfg.model)}:generateContent`,
    cfg,
    {
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.5, responseMimeType: "application/json" },
    },
    signal,
  );
  if (!res.ok) throw await toError(res);
  const data = (await res.json()) as { candidates?: { content?: { parts?: Part[] } }[] };
  const raw = (data.candidates?.[0]?.content?.parts ?? []).filter((p) => !p.thought).map((p) => p.text ?? "").join("");
  const cleaned = raw.replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    throw new UpstreamError("bad_request", "The AI returned something OLIS couldn't read. Please try again.");
  }
}

/** Query embedding for semantic search (same model + dims as the index). */
export async function embedQuery(cfg: Config, text: string, dims: number, signal?: AbortSignal): Promise<number[]> {
  assertKey(cfg);
  const res = await post(
    `${cfg.geminiBase}/models/${cfg.embedModel}:embedContent`,
    cfg,
    { model: `models/${cfg.embedModel}`, content: { parts: [{ text }] }, taskType: "RETRIEVAL_QUERY", outputDimensionality: dims },
    signal,
  );
  if (!res.ok) throw await toError(res);
  const data = (await res.json()) as { embedding?: { values?: number[] } };
  const v = data.embedding?.values ?? [];
  const n = Math.sqrt(v.reduce((a, x) => a + x * x, 0)) || 1;
  return v.map((x) => x / n);
}
