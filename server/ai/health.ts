// Provider / model health, kept in memory per warm server instance.
// A model that hits a rate limit or errors repeatedly is taken out of rotation
// for a cooldown (a simple circuit breaker), so OLIS doesn't keep hammering it.
import type { FailureCategory, ProviderId } from "./types.js";

export type HealthStatus = "healthy" | "degraded" | "rate_limited" | "down" | "unconfigured" | "blocked";

interface ModelHealth {
  cooldownUntil: number;
  cooldownReason?: FailureCategory;
  consecutiveFailures: number;
  successes: number;
  failures: number;
  lastError?: FailureCategory;
  lastErrorAt?: number;
  lastSuccessAt?: number;
  avgMs?: number;
}

const models = new Map<string, ModelHealth>();
const providerCooldown = new Map<ProviderId, { until: number; reason: FailureCategory }>();

const get = (key: string): ModelHealth => {
  let h = models.get(key);
  if (!h) models.set(key, (h = { cooldownUntil: 0, consecutiveFailures: 0, successes: 0, failures: 0 }));
  return h;
};

export function recordSuccess(key: string, ms: number) {
  const h = get(key);
  h.successes++;
  h.consecutiveFailures = 0;
  h.lastSuccessAt = Date.now();
  h.avgMs = h.avgMs ? Math.round(h.avgMs * 0.8 + ms * 0.2) : ms;
  if (h.cooldownReason !== "unsupported") h.cooldownUntil = 0;
}

export function recordFailure(key: string, provider: ProviderId, category: FailureCategory, cooldownSec: number, providerCooldownSec: number) {
  const h = get(key);
  h.failures++;
  h.consecutiveFailures++;
  h.lastError = category;
  h.lastErrorAt = Date.now();
  // Circuit breaker: 3 failures in a row → 30 s out of rotation, even for "retryable" errors.
  const breaker = h.consecutiveFailures >= 3 ? 30 : 0;
  const secs = Math.max(cooldownSec, breaker);
  if (secs) {
    h.cooldownUntil = Math.max(h.cooldownUntil, Date.now() + secs * 1000);
    h.cooldownReason = category;
  }
  if (providerCooldownSec) providerCooldown.set(provider, { until: Date.now() + providerCooldownSec * 1000, reason: category });
}

/** null = available; otherwise why the model is out of rotation right now. */
export function coolingDown(key: string, provider: ProviderId): FailureCategory | null {
  const p = providerCooldown.get(provider);
  if (p && p.until > Date.now()) return p.reason;
  const h = models.get(key);
  if (h && h.cooldownUntil > Date.now()) return h.cooldownReason ?? "server";
  return null;
}

export function modelStatus(key: string, provider: ProviderId): { status: HealthStatus; until?: number; h?: ModelHealth } {
  const h = models.get(key);
  const cd = coolingDown(key, provider);
  const until = Math.max(providerCooldown.get(provider)?.until ?? 0, h?.cooldownUntil ?? 0) || undefined;
  if (cd === "rate_limit") return { status: "rate_limited", until, h };
  if (cd) return { status: "down", until, h };
  if (h && h.consecutiveFailures > 0) return { status: "degraded", h };
  return { status: "healthy", h };
}

/** Test helper. */
export function _resetHealth() {
  models.clear();
  providerCooldown.clear();
}
