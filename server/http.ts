// Request guards shared by every API route: origin check, rate limit,
// body size limit, JSON helpers.
import type { Config } from "./config.js";

export const json = (data: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...headers } });

export const errorJson = (status: number, code: string, message: string, headers: Record<string, string> = {}) =>
  json({ error: { code, message } }, status, headers);

function clientIp(req: Request) {
  return (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || req.headers.get("x-real-ip") || "unknown";
}

function originAllowed(req: Request, cfg: Config) {
  const origin = req.headers.get("origin");
  if (!origin) return true; // same-origin navigations / server-to-server
  let host = "";
  try {
    host = new URL(origin).host;
  } catch {
    return false;
  }
  if (cfg.allowedOrigins.length) return cfg.allowedOrigins.some((o) => o === origin || o === host);
  // Default: only the site OLIS is deployed on (plus local dev)
  const self = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "";
  return host === self || /^localhost(:\d+)?$|^127\.0\.0\.1(:\d+)?$/.test(host);
}

// Best-effort in-memory rate limit (per warm function instance).
// For strict limits across instances, swap in Upstash Redis (free tier).
const hits = new Map<string, number[]>();
function rateLimited(key: string, limit: number, windowMs = 10 * 60_000) {
  const now = Date.now();
  const arr = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (arr.length >= limit) {
    hits.set(key, arr);
    return Math.ceil((windowMs - (now - arr[0])) / 1000);
  }
  arr.push(now);
  hits.set(key, arr);
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((t) => now - t < windowMs)) hits.delete(k);
  return 0;
}

export async function guard(req: Request, cfg: Config, bucket: string, opts: { limit?: number; maxBytes?: number } = {}): Promise<{ body: unknown } | Response> {
  if (!originAllowed(req, cfg)) return errorJson(403, "forbidden_origin", "Requests are only accepted from the OLIS app.");
  const wait = rateLimited(`${bucket}:${clientIp(req)}`, opts.limit ?? cfg.rateLimit);
  if (wait) return errorJson(429, "rate_limit", `You're asking faster than the beta allows. Try again in ${Math.ceil(wait / 60)} min.`, { "Retry-After": String(wait) });
  if (req.method !== "POST") return { body: null };
  const text = await req.text();
  if (text.length > (opts.maxBytes ?? 120_000)) return errorJson(413, "too_large", "That message is too long for OLIS Beta.");
  try {
    return { body: JSON.parse(text || "{}") };
  } catch {
    return errorJson(400, "bad_json", "Invalid request.");
  }
}

export function sseStream(run: (send: (event: unknown) => void, signal: AbortSignal) => Promise<void>, reqSignal?: AbortSignal): Response {
  const ctrl = new AbortController();
  reqSignal?.addEventListener("abort", () => ctrl.abort(), { once: true });
  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: unknown) => {
        try {
          controller.enqueue(enc.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          /* client gone */
        }
      };
      try {
        await run(send, ctrl.signal);
      } finally {
        try {
          controller.enqueue(enc.encode(`data: ${JSON.stringify({ type: "done" })}\n\n`));
          controller.close();
        } catch {
          /* already closed */
        }
      }
    },
    cancel() {
      ctrl.abort();
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" },
  });
}
