// Internal provider health summary (for /api/health?detail=1 with the admin token).
// Contains provider/model names and states, never keys.
import { modelStatus, type HealthStatus } from "./health.js";
import { catalog } from "./models.config.js";
import { freeBetaEnabled, policyBlock } from "./policy.js";
import { providers } from "./providers/index.js";
import { storeKind } from "./store.js";

export interface ModelRow {
  key: string;
  model: string;
  status: HealthStatus;
  cooldownSeconds?: number;
  successes: number;
  failures: number;
  lastError?: string;
  avgMs?: number;
  note?: string;
}
export interface ProviderRow {
  id: string;
  label: string;
  status: HealthStatus;
  models: ModelRow[];
}

const RANK: HealthStatus[] = ["healthy", "degraded", "rate_limited", "down", "blocked", "unconfigured"];

export function providerHealth(): { freeBeta: boolean; limitsStore: string; providers: ProviderRow[] } {
  const rows: ProviderRow[] = [];
  for (const [id, p] of providers()) {
    const models: ModelRow[] = catalog()
      .filter((m) => m.provider === id)
      .map((m) => {
        if (!p.isConfigured()) return { key: m.key, model: m.model, status: "unconfigured" as const, successes: 0, failures: 0 };
        const blocked = policyBlock(m);
        if (blocked) return { key: m.key, model: m.model, status: "blocked" as const, successes: 0, failures: 0, note: blocked };
        const s = modelStatus(m.key, m.provider);
        return {
          key: m.key,
          model: m.model,
          status: s.status,
          cooldownSeconds: s.until ? Math.max(0, Math.round((s.until - Date.now()) / 1000)) : undefined,
          successes: s.h?.successes ?? 0,
          failures: s.h?.failures ?? 0,
          lastError: s.h?.lastError,
          avgMs: s.h?.avgMs,
        };
      });
    // Provider status = its best model's status
    const status = models.length ? models.map((m) => m.status).sort((a, b) => RANK.indexOf(a) - RANK.indexOf(b))[0] : "unconfigured";
    rows.push({ id, label: p.label, status, models });
  }
  return { freeBeta: freeBetaEnabled(), limitsStore: storeKind(), providers: rows };
}

/** Public, student-safe summary: counts only, no names. */
export function publicEngineSummary() {
  const h = providerHealth();
  const usable = h.providers.filter((p) => p.status === "healthy" || p.status === "degraded");
  const busy = h.providers.filter((p) => p.status === "rate_limited");
  return {
    engines: usable.length,
    busy: busy.length > 0 && usable.length === 0,
    freeBeta: h.freeBeta,
  };
}
