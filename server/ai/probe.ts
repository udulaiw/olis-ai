// Admin-only connectivity check: sends one tiny request to every configured,
// allowed model and reports whether it answered. Used by Settings → Developer
// ("Test all engines") to confirm keys and endpoints after deploying.
import { toProviderError } from "./classify.js";
import { recordFailure, recordSuccess } from "./health.js";
import { catalog } from "./models.config.js";
import { policyBlock } from "./policy.js";
import { providers } from "./providers/index.js";

export interface ProbeResult {
  key: string;
  provider: string;
  model: string;
  ok: boolean;
  ms: number;
  error?: string;
  status?: number;
  detail?: string;
}

export async function probeAll(): Promise<ProbeResult[]> {
  const jobs = catalog()
    .filter((m) => providers().get(m.provider)?.isConfigured() && !policyBlock(m))
    .map(async (m): Promise<ProbeResult> => {
      const p = providers().get(m.provider)!;
      const ctrl = new AbortController();
      let timedOut = false;
      const t = setTimeout(() => ((timedOut = true), ctrl.abort()), 25_000);
      const started = Date.now();
      try {
        let text = "";
        for await (const c of p.stream(
          { system: "You are a connectivity check. Reply with the single word OK.", messages: [{ role: "user", text: "ping" }], maxOutputTokens: 512, temperature: 0 },
          { model: m.model, signal: ctrl.signal },
        )) {
          if (c.type === "text") text += c.delta;
        }
        const ms = Date.now() - started;
        recordSuccess(m.key, ms);
        return { key: m.key, provider: m.provider, model: m.model, ok: true, ms, detail: text.trim().slice(0, 20) };
      } catch (e) {
        const err = toProviderError(e, m.provider, timedOut);
        recordFailure(m.key, m.provider, err.category, 0, 0);
        return { key: m.key, provider: m.provider, model: m.model, ok: false, ms: Date.now() - started, error: err.category, status: err.status, detail: err.message };
      } finally {
        clearTimeout(t);
      }
    });
  return Promise.all(jobs);
}
