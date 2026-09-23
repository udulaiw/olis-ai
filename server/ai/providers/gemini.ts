// Google Gemini adapter (REST, streaming). Supports tools (function calling),
// images, JSON mode, and keeps Gemini's thought signatures intact across turns.
import { errorFromResponse } from "../classify.js";
import { ProviderError, type AIProvider, type CallContext, type ChatRequest, type StreamChunk, type ToolCall } from "../types.js";
import { normalizeForProvider, sseData } from "./shared.js";

interface Part {
  text?: string;
  thought?: boolean;
  thoughtSignature?: string;
  inlineData?: { mimeType: string; data: string };
  functionCall?: { name: string; args?: Record<string, unknown>; id?: string };
  functionResponse?: { name: string; response: Record<string, unknown>; id?: string };
}
interface Content {
  role: "user" | "model";
  parts: Part[];
}

const env = (k: string, d = "") => (process.env[k] || "").trim() || d;

export class GeminiProvider implements AIProvider {
  readonly id = "gemini" as const;
  readonly label = "Google Gemini";

  private key() {
    return env("GEMINI_API_KEY");
  }
  private base() {
    return env("GEMINI_BASE_URL", "https://generativelanguage.googleapis.com/v1beta").replace(/\/$/, "");
  }
  isConfigured() {
    return Boolean(this.key());
  }

  private toContents(req: ChatRequest): Content[] {
    const msgs = normalizeForProvider(req.messages, "gemini", true);
    const contents: Content[] = [];
    for (const m of msgs) {
      if (m.role === "user") {
        contents.push({ role: "user", parts: [...(m.images ?? []).map((i) => ({ inlineData: { mimeType: i.mimeType, data: i.data } })), { text: m.text || " " }] });
      } else if (m.role === "assistant") {
        const raw = m.native?.provider === "gemini" ? (m.native.data as Part[]) : null;
        contents.push({ role: "model", parts: raw?.length ? raw : [{ text: m.text || " " }] });
      } else {
        contents.push({
          role: "user",
          parts: m.results.map((r) => ({ functionResponse: { name: r.name, response: r.result, ...(r.callId.startsWith("g_") ? {} : { id: r.callId }) } })),
        });
      }
    }
    return contents;
  }

  async *stream(req: ChatRequest, ctx: CallContext): AsyncGenerator<StreamChunk> {
    if (!this.isConfigured()) throw new ProviderError("config", "gemini", "GEMINI_API_KEY missing");
    const body: Record<string, unknown> = {
      systemInstruction: { parts: [{ text: req.system }] },
      contents: this.toContents(req),
      generationConfig: {
        temperature: req.temperature ?? 0.5,
        ...(req.maxOutputTokens ? { maxOutputTokens: req.maxOutputTokens } : {}),
        ...(req.json ? { responseMimeType: "application/json" } : {}),
      },
    };
    if (req.tools?.length) {
      body.tools = [{ functionDeclarations: req.tools }];
      body.toolConfig = { functionCallingConfig: { mode: req.forceAnswer ? "NONE" : "AUTO" } };
    }

    let res: Response;
    try {
      res = await fetch(`${this.base()}/models/${encodeURIComponent(ctx.model)}:streamGenerateContent?alt=sse`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": this.key() },
        body: JSON.stringify(body),
        signal: ctx.signal,
      });
    } catch (e) {
      if (ctx.signal.aborted) throw e;
      throw new ProviderError("network", "gemini", "Couldn't reach Gemini");
    }
    if (!res.ok) throw await errorFromResponse("gemini", res);
    if (!res.body) throw new ProviderError("server", "gemini", "Empty body");

    const parts: Part[] = [];
    let produced = false;
    let blocked = false;
    let n = 0;
    for await (const payload of sseData(res.body)) {
      let json: {
        candidates?: { content?: { parts?: Part[] }; finishReason?: string }[];
        promptFeedback?: { blockReason?: string };
        usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
        error?: { message?: string; code?: number };
      };
      try {
        json = JSON.parse(payload);
      } catch {
        continue;
      }
      if (json.error) {
        // Errors can arrive mid-stream (e.g. overloaded)
        throw new ProviderError(json.error.code === 429 ? "rate_limit" : "server", "gemini", json.error.message?.slice(0, 140) ?? "stream error", { status: json.error.code });
      }
      if (json.promptFeedback?.blockReason) blocked = true;
      const cand = json.candidates?.[0];
      if (cand?.finishReason === "SAFETY" || cand?.finishReason === "PROHIBITED_CONTENT") blocked = true;
      for (const p of cand?.content?.parts ?? []) {
        parts.push(p);
        if (p.functionCall) {
          produced = true;
          const call: ToolCall = { id: p.functionCall.id ?? `g_${++n}`, name: p.functionCall.name, args: p.functionCall.args ?? {} };
          yield { type: "tool_call", call };
        } else if (p.text && !p.thought) {
          produced = true;
          yield { type: "text", delta: p.text };
        }
      }
      if (json.usageMetadata) yield { type: "usage", usage: { inputTokens: json.usageMetadata.promptTokenCount, outputTokens: json.usageMetadata.candidatesTokenCount } };
    }
    if (blocked && !produced) throw new ProviderError("blocked", "gemini", "Blocked by safety filters");
    if (!produced) throw new ProviderError("server", "gemini", "Empty response");
    // Raw parts (incl. thought signatures) so the next turn can be replayed natively
    yield { type: "native", data: parts };
  }
}
