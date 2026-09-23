// Generic adapter for any OpenAI-compatible Chat Completions API (NVIDIA,
// local Ollama / LM Studio, and most other hosts). A new provider of this kind
// is a few lines: see nvidia.ts and local.ts.
//
// Tool calling is intentionally not used here: OLIS only routes tool-using
// turns to models whose catalog entry lists the "tools" capability. For
// others, the router strips tools and earlier research is passed as text.
import { errorFromResponse } from "../classify.js";
import { ProviderError, type AIProvider, type CallContext, type ChatRequest, type ProviderId, type StreamChunk } from "../types.js";
import { normalizeForProvider, sseData, thinkFilter } from "./shared.js";

type OAContent = string | ({ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } })[];

export interface OpenAICompatibleOptions {
  id: ProviderId;
  label: string;
  /** Read at call time so env changes (and tests) apply without a restart. */
  baseUrl: () => string;
  apiKey: () => string;
  /** Local servers don't need a key. */
  keyRequired: boolean;
  extraHeaders?: Record<string, string>;
}

export class OpenAICompatibleProvider implements AIProvider {
  readonly id: ProviderId;
  readonly label: string;
  constructor(private opts: OpenAICompatibleOptions) {
    this.id = opts.id;
    this.label = opts.label;
  }

  isConfigured() {
    return Boolean(this.opts.baseUrl()) && (!this.opts.keyRequired || Boolean(this.opts.apiKey()));
  }

  async *stream(req: ChatRequest, ctx: CallContext): AsyncGenerator<StreamChunk> {
    if (!this.isConfigured()) throw new ProviderError("config", this.id, `${this.label} not configured`);
    const msgs = normalizeForProvider(req.messages, this.id, false);
    const system = req.json ? `${req.system}\n\nRespond with ONE valid JSON object only. No markdown fences, no text before or after it.` : req.system;
    const messages: { role: string; content: OAContent }[] = [{ role: "system", content: system }];
    for (const m of msgs) {
      if (m.role === "user") {
        messages.push({
          role: "user",
          content: m.images?.length
            ? [...m.images.map((i) => ({ type: "image_url" as const, image_url: { url: `data:${i.mimeType};base64,${i.data}` } })), { type: "text" as const, text: m.text }]
            : m.text,
        });
      } else if (m.role === "assistant") messages.push({ role: "assistant", content: m.text || " " });
    }

    const headers: Record<string, string> = { "Content-Type": "application/json", Accept: "text/event-stream", ...(this.opts.extraHeaders ?? {}) };
    const key = this.opts.apiKey();
    if (key) headers.Authorization = `Bearer ${key}`;

    let res: Response;
    try {
      res = await fetch(`${this.opts.baseUrl().replace(/\/$/, "")}/chat/completions`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: ctx.model,
          messages,
          stream: true,
          temperature: req.temperature ?? 0.5,
          ...(req.maxOutputTokens ? { max_tokens: req.maxOutputTokens } : { max_tokens: 4096 }),
        }),
        signal: ctx.signal,
      });
    } catch (e) {
      if (ctx.signal.aborted) throw e;
      throw new ProviderError("network", this.id, `Couldn't reach ${this.label}`);
    }
    if (!res.ok) throw await errorFromResponse(this.id, res);
    if (!res.body) throw new ProviderError("server", this.id, "Empty body");

    const strip = thinkFilter();
    let produced = false;
    for await (const payload of sseData(res.body)) {
      let json: {
        choices?: { delta?: { content?: string | null }; finish_reason?: string | null }[];
        usage?: { prompt_tokens?: number; completion_tokens?: number };
        error?: { message?: string; code?: number | string };
      };
      try {
        json = JSON.parse(payload);
      } catch {
        continue;
      }
      if (json.error) throw new ProviderError(String(json.error.code) === "429" ? "rate_limit" : "server", this.id, json.error.message?.slice(0, 140) ?? "stream error");
      const choice = json.choices?.[0];
      const delta = choice?.delta?.content;
      if (delta) {
        const visible = strip(delta);
        if (visible) {
          produced = true;
          yield { type: "text", delta: visible };
        }
      }
      if (choice?.finish_reason === "content_filter" && !produced) throw new ProviderError("blocked", this.id, "Blocked by content filter");
      if (json.usage) yield { type: "usage", usage: { inputTokens: json.usage.prompt_tokens, outputTokens: json.usage.completion_tokens } };
    }
    if (!produced) throw new ProviderError("server", this.id, "Empty response");
  }
}
