// ─────────────────────────────────────────────
// Provider-neutral types for the OLIS AI layer.
//
// Nothing outside server/ai/providers/* knows what a Gemini "part" or an
// OpenAI "choice" looks like. Everything talks in these shapes.
// ─────────────────────────────────────────────

export type ProviderId = "gemini" | "nvidia" | "local";

/** What a request needs from a model. The router matches these against the catalog. */
export type Capability = "text" | "tools" | "vision" | "json" | "long_context" | "reasoning" | "multilingual";

/** Task buckets used for routing (see models.config.ts → ROUTES). */
export type Task = "general" | "reasoning" | "mathematics" | "physics" | "chemistry" | "vision" | "sinhala" | "long_context" | "structured";

export interface ImageInput {
  /** e.g. image/jpeg */
  mimeType: string;
  /** base64 without the data: prefix */
  data: string;
}

export interface ToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

/** One message in a neutral conversation. */
export type ChatMessage =
  | { role: "user"; text: string; images?: ImageInput[] }
  | {
      role: "assistant";
      text: string;
      toolCalls?: ToolCall[];
      /**
       * Opaque provider data needed to continue the conversation natively
       * (e.g. Gemini thought signatures). Only reused when the SAME provider
       * serializes the next turn; other providers ignore it.
       */
      native?: { provider: ProviderId; data: unknown };
    }
  | { role: "tool"; results: { callId: string; name: string; result: Record<string, unknown> }[] };

export interface ToolDef {
  name: string;
  description: string;
  parameters: { type: "object"; properties: Record<string, { type: string; description?: string; enum?: string[] }>; required?: string[] };
}

export interface ChatRequest {
  system: string;
  messages: ChatMessage[];
  tools?: ToolDef[];
  /** Tools declared but the model must answer in text now (last agent step). */
  forceAnswer?: boolean;
  temperature?: number;
  maxOutputTokens?: number;
  /** Ask for a JSON object response. */
  json?: boolean;
}

export interface Usage {
  inputTokens?: number;
  outputTokens?: number;
}

/** Streamed output from a provider. */
export type StreamChunk =
  | { type: "text"; delta: string }
  | { type: "tool_call"; call: ToolCall }
  | { type: "native"; data: unknown }
  | { type: "usage"; usage: Usage };

/** Everything a provider needs to make one call. */
export interface CallContext {
  model: string;
  signal: AbortSignal;
}

export interface AIProvider {
  readonly id: ProviderId;
  /** Human label for logs / internal health (never shown to students). */
  readonly label: string;
  /** True when the provider has what it needs (API key, base URL…). */
  isConfigured(): boolean;
  /** Stream one model turn. Must throw ProviderError on failure. */
  stream(req: ChatRequest, ctx: CallContext): AsyncGenerator<StreamChunk>;
}

// ── Errors ─────────────────────────────────────

/**
 * Failure categories. The router decides what to do from these alone
 * (see classify.ts → decide()).
 */
export type FailureCategory =
  | "rate_limit" // 429 / quota exhausted → switch provider, cool this one down
  | "server" // 5xx / overloaded → retry once, then fall back
  | "timeout" // no response in time → fall back (no retry, it just wastes the budget)
  | "network" // DNS / connection reset → fall back
  | "bad_request" // our request is invalid → do NOT retry the same request anywhere
  | "unsupported" // this model can't do what we asked (e.g. no images) → try the next model
  | "auth" // key invalid / revoked → log safely, cool down, fall back
  | "config" // provider not configured (missing key) → skip
  | "blocked" // safety filter → stop, tell the student
  | "policy"; // blocked by OLIS free-beta policy → skip

export class ProviderError extends Error {
  readonly category: FailureCategory;
  readonly provider: ProviderId | "router";
  readonly status?: number;
  /** Seconds, from Retry-After or the provider's retry info. */
  readonly retryAfter?: number;
  constructor(category: FailureCategory, provider: ProviderId | "router", message: string, opts: { status?: number; retryAfter?: number } = {}) {
    super(message);
    this.name = "ProviderError";
    this.category = category;
    this.provider = provider;
    this.status = opts.status;
    this.retryAfter = opts.retryAfter;
  }
}
