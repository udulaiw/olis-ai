// Turns provider HTTP failures into a FailureCategory, and decides what the
// router should do about each category. All retry/fallback policy lives here.
import { ProviderError, type FailureCategory, type ProviderId } from "./types.js";

/** Parse "30s", "1.5s" or a number of seconds. */
function seconds(v: unknown): number | undefined {
  if (typeof v === "number" && isFinite(v)) return v;
  if (typeof v === "string") {
    const m = v.match(/^(\d+(?:\.\d+)?)s?$/);
    if (m) return parseFloat(m[1]);
  }
  return undefined;
}

/** Build a ProviderError from a non-2xx response. Reads the body once, never logs it. */
export async function errorFromResponse(provider: ProviderId, res: Response): Promise<ProviderError> {
  let message = "";
  let retryAfter = seconds(res.headers.get("retry-after") ?? undefined);
  try {
    const body = (await res.json()) as {
      error?: { message?: string; status?: string; details?: { "@type"?: string; retryDelay?: string }[] } | string;
      detail?: string;
      message?: string;
    };
    const err = typeof body.error === "string" ? { message: body.error } : body.error;
    message = err?.message ?? body.detail ?? body.message ?? "";
    for (const d of (typeof body.error === "object" ? body.error?.details : undefined) ?? []) {
      if (d["@type"]?.includes("RetryInfo")) retryAfter = seconds(d.retryDelay) ?? retryAfter;
    }
  } catch {
    /* non-JSON body */
  }
  const s = res.status;
  const m = message.toLowerCase();
  const cat: FailureCategory =
    s === 429 || m.includes("resource_exhausted") || m.includes("quota")
      ? "rate_limit"
      : s === 401 || s === 403 || m.includes("api key not valid") || m.includes("api_key_invalid") || m.includes("unauthorized")
        ? "auth"
        : s === 404 || m.includes("not found for api version") || m.includes("is not supported") || m.includes("does not support") || m.includes("image input")
          ? "unsupported"
          : s === 408 || s === 504
            ? "timeout"
            : s >= 500
              ? "server"
              : s === 400 || s === 413 || s === 422
                ? "bad_request"
                : "server";
  return new ProviderError(cat, provider, safeMessage(message) || `HTTP ${s}`, { status: s, retryAfter });
}

/** Provider messages can echo parts of the request. Keep a short, key-free summary for logs. */
export function safeMessage(msg: string): string {
  return redact(msg).replace(/\s+/g, " ").slice(0, 140);
}

export function redact(s: string): string {
  return s
    .replace(/AIza[0-9A-Za-z_-]{10,}/g, "[key]")
    .replace(/nvapi-[0-9A-Za-z_-]{6,}/g, "[key]")
    .replace(/(bearer\s+)[^\s"']+/gi, "$1[key]")
    .replace(/([?&]key=)[^&\s]+/gi, "$1[key]");
}

/** Normalise anything thrown during a call into a ProviderError. */
export function toProviderError(e: unknown, provider: ProviderId, timedOut: boolean): ProviderError {
  if (e instanceof ProviderError) return e;
  if (timedOut) return new ProviderError("timeout", provider, "No response in time");
  const name = (e as Error)?.name;
  if (name === "AbortError" || name === "TimeoutError") return new ProviderError("timeout", provider, "Aborted");
  return new ProviderError("network", provider, safeMessage(String((e as Error)?.message ?? e)));
}

export interface Decision {
  /** Try the same model once more (only once per model per request). */
  retrySame: boolean;
  /** Move on to the next candidate. */
  fallback: boolean;
  /** Skip every remaining model from the same provider. */
  skipProvider: boolean;
  /** Stop entirely and report to the student. */
  stop: boolean;
  /** Seconds to keep this model out of rotation (0 = don't). */
  cooldown: number;
  /** Seconds to keep the whole provider out of rotation. */
  providerCooldown: number;
}

export function decide(err: ProviderError): Decision {
  const d: Decision = { retrySame: false, fallback: true, skipProvider: false, stop: false, cooldown: 0, providerCooldown: 0 };
  switch (err.category) {
    case "rate_limit":
      // Quota is per model on Gemini, so other models of the same provider may still work.
      d.cooldown = Math.min(600, Math.max(20, err.retryAfter ?? 60));
      return d;
    case "server":
      d.retrySame = true;
      return d;
    case "timeout":
    case "network":
      return d;
    case "unsupported":
      d.cooldown = 3600; // the model is gone or can't do this: don't keep asking
      return d;
    case "auth":
      d.skipProvider = true;
      d.providerCooldown = 600;
      return d;
    case "config":
    case "policy":
      d.skipProvider = true;
      return d;
    case "bad_request":
      // Our request was rejected. Never resend it to the same provider; a
      // different provider serializes it differently, so allow that (the
      // router caps this at two bad_request failures per call).
      d.skipProvider = true;
      return d;
    case "blocked":
      return { ...d, fallback: false, stop: true };
  }
}
