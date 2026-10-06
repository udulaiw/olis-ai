// Generic adapter for any OpenAI-compatible Chat Completions API (NVIDIA,
// local Ollama / LM Studio, and most other hosts). A new provider of this kind
// is a few lines: see nvidia.ts and local.ts.
//
// Tool calling (OpenAI "tools" / streamed "tool_calls") is used only when the
// router passes tools, which it does only for models whose catalog entry lists
// the "tools" capability. For others the router strips tools and earlier
// research is passed as text (shared.ts → normalizeForProvider).
import { errorFromResponse } from "../classify.js";
import { ProviderError, type AIProvider, type CallContext, type ChatRequest, type ProviderId, type StreamChunk, type ToolCall } from "../types.js";
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
    const nativeTools = Boolean(req.tools?.length);
    const msgs = normalizeForProvider(req.messages, this.id, nativeTools);
    const system = req.json ? `${req.system}\n\nRespond with ONE valid JSON object only. No markdown fences, no text before or after it.` : req.system;
    type OAToolCall = { id: string; type: "function"; function: { name: string; arguments: string } };
    const messages: { role: string; content: OAContent | null; tool_calls?: OAToolCall[]; tool_call_id?: string }[] = [{ role: "system", content: system }];
    for (const m of msgs) {
      if (m.role === "user") {
        messages.push({
          role: "user",
          content: m.images?.length
            ? [...m.images.map((i) => ({ type: "image_url" as const, image_url: { url: `data:${i.mimeType};base64,${i.data}` } })), { type: "text" as const, text: m.text }]
            : m.text,
        });
      } else if (m.role === "assistant") {
        if (nativeTools && m.toolCalls?.length)
          messages.push({ role: "assistant", content: m.text || null, tool_calls: m.toolCalls.map((c) => ({ id: c.id, type: "function", function: { name: c.name, arguments: JSON.stringify(c.args) } })) });
        else messages.push({ role: "assistant", content: m.text || " " });
      } else if (m.role === "tool") {
        for (const r of m.results) messages.push({ role: "tool", tool_call_id: r.callId, content: JSON.stringify(r.result).slice(0, 12_000) });
      }
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
          ...(nativeTools
            ? { tools: req.tools!.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.parameters } })), tool_choice: req.forceAnswer ? "none" : "auto" }
            : {}),
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
    // Streamed tool calls arrive in pieces (name first, then argument fragments), keyed by index
    const pending = new Map<number, { id: string; name: string; args: string }>();
    for await (const payload of sseData(res.body)) {
      let json: {
        choices?: {
          delta?: { content?: string | null; reasoning_content?: string | null; reasoning?: string | null; tool_calls?: { index?: number; id?: string; function?: { name?: string; arguments?: string } }[] };
          finish_reason?: string | null;
        }[];
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
      if (choice?.delta?.reasoning_content || choice?.delta?.reasoning) yield { type: "keepalive" };
      const delta = choice?.delta?.content;
      if (delta) {
        const visible = strip(delta);
        if (visible) {
          produced = true;
          yield { type: "text", delta: visible };
        } else yield { type: "keepalive" };
      }
      for (const tc of choice?.delta?.tool_calls ?? []) {
        const i = tc.index ?? 0;
        const cur = pending.get(i) ?? { id: "", name: "", args: "" };
        if (tc.id) cur.id = tc.id;
        if (tc.function?.name) cur.name += tc.function.name;
        if (tc.function?.arguments) cur.args += tc.function.arguments;
        pending.set(i, cur);
        yield { type: "keepalive" };
      }
      if (choice?.finish_reason === "content_filter" && !produced) throw new ProviderError("blocked", this.id, "Blocked by content filter");
      if (json.usage) yield { type: "usage", usage: { inputTokens: json.usage.prompt_tokens, outputTokens: json.usage.completion_tokens } };
    }
    if (pending.size) {
      const calls: ToolCall[] = [];
      for (const [i, c] of [...pending.entries()].sort((a, b) => a[0] - b[0])) {
        if (!c.name) continue;
        let args: Record<string, unknown> = {};
        try {
          args = c.args.trim() ? (JSON.parse(c.args) as Record<string, unknown>) : {};
        } catch {
          continue; // a truncated/invalid call is dropped rather than run with guessed arguments
        }
        calls.push({ id: c.id || `call_${i}`, name: c.name, args });
      }
      if (calls.length) {
        produced = true;
        for (const call of calls) yield { type: "tool_call", call };
        // Marks the assistant turn as replayable natively by this provider (tool_calls + tool messages)
        yield { type: "native", data: { openaiTools: true } };
      }
    }
    if (!produced) throw new ProviderError("server", this.id, "Empty response");
  }
}
