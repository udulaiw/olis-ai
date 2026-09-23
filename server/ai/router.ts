// ─────────────────────────────────────────────
// The OLIS AI router.
//
//   request ─▶ candidates for the task (models.config.ts ROUTES)
//           ─▶ drop: unconfigured · Free-Beta-blocked · missing capability ·
//                    cooling down · over OLIS's daily budget
//           ─▶ try #1 ─ ok ─────────────────────────▶ response
//                     └ fail ─▶ classify ─▶ decide:
//                         rate limit  → cool down, next model
//                         server 5xx  → retry once, then next model
//                         timeout     → next model
//                         bad request → never resend to that provider
//                         auth/config → skip provider (logged safely)
//                         blocked     → stop
//           ─▶ all failed ─▶ RouterExhausted (friendly message upstream)
//
// Each model is tried at most twice per call, and the candidate list is
// finite, so fallback can't loop.
// ─────────────────────────────────────────────
import { decide, toProviderError } from "./classify.js";
import { recordFailure, recordSuccess, coolingDown } from "./health.js";
import { aiLog } from "./log.js";
import { catalog, ROUTES, type ModelSpec } from "./models.config.js";
import { policyBlock } from "./policy.js";
import { providers } from "./providers/index.js";
import { incr, today } from "./store.js";
import { ProviderError, type AIProvider, type Capability, type ChatRequest, type FailureCategory, type ProviderId, type StreamChunk, type Task, type Usage } from "./types.js";

export interface Candidate {
  spec: ModelSpec;
  provider: AIProvider;
}

export interface Skipped {
  key: string;
  reason: string;
}

/** Ordered, filtered list of models to try for a task. */
export function candidates(task: Task, required: Capability[], opts: { prefer?: string } = {}): { list: Candidate[]; skipped: Skipped[] } {
  const all = catalog();
  const byKey = new Map(all.map((m) => [m.key, m]));
  const order = [...(ROUTES[task] ?? ROUTES.general)];
  // Keep using the model that served earlier turns of the same answer, if it's suitable
  if (opts.prefer && order.includes(opts.prefer)) order.splice(order.indexOf(opts.prefer), 1), order.unshift(opts.prefer);

  const list: Candidate[] = [];
  const skipped: Skipped[] = [];
  const seen = new Set<string>();
  for (const key of order) {
    if (seen.has(key)) continue;
    seen.add(key);
    const spec = byKey.get(key);
    if (!spec) {
      skipped.push({ key, reason: "not in catalog" });
      continue;
    }
    const provider = providers().get(spec.provider);
    if (!provider) {
      skipped.push({ key, reason: "unknown provider" });
      continue;
    }
    if (!provider.isConfigured()) {
      skipped.push({ key, reason: "provider not configured" });
      continue;
    }
    const blocked = policyBlock(spec);
    if (blocked) {
      skipped.push({ key, reason: `free beta: ${blocked}` });
      aiLog({ evt: "ai.policy_block", provider: spec.provider, model: spec.model, detail: blocked });
      continue;
    }
    const missing = required.filter((c) => c !== "text" && !spec.capabilities.includes(c));
    if (missing.length) {
      skipped.push({ key, reason: `missing ${missing.join(", ")}` });
      continue;
    }
    const cd = coolingDown(spec.key, spec.provider);
    if (cd) {
      skipped.push({ key, reason: `cooling down (${cd})` });
      continue;
    }
    list.push({ spec, provider });
  }
  return { list, skipped };
}

/** True when at least one model is configured and allowed for the task (it may be cooling down right now). */
export function anyEngineConfigured(task: Task = "general") {
  const { list, skipped } = candidates(task, ["text"]);
  return list.length > 0 || skipped.some((s) => s.reason.startsWith("cooling"));
}

/** All models failed or none were available. The message is safe to show students. */
export class RouterExhausted extends Error {
  readonly lastCategory?: FailureCategory;
  readonly allRateLimited: boolean;
  constructor(lastCategory: FailureCategory | undefined, allRateLimited: boolean) {
    super(
      allRateLimited
        ? "OLIS is very busy right now (free beta limits). Please try again in a minute or two."
        : "OLIS's AI engines are unavailable right now. Please try again shortly.",
    );
    this.name = "RouterExhausted";
    this.lastCategory = lastCategory;
    this.allRateLimited = allRateLimited;
  }
}

/** Events the router streams to its caller, on top of the provider's chunks. */
export type RouterEvent =
  | StreamChunk
  /** A model started answering. `tools` = whether it received the tool list. */
  | { type: "attempt"; key: string; provider: string; model: string; tools: boolean }
  /** The previous attempt failed after producing output (text / tool calls): discard it. */
  | { type: "rewind" }
  /** Switching engines (shown to students as "OLIS is switching to another AI engine…"). */
  | { type: "switching"; reason: FailureCategory };

export interface StreamOptions {
  task: Task;
  required: Capability[];
  req: ChatRequest;
  signal?: AbortSignal;
  prefer?: string;
  /** Absolute time (ms) by which the whole call must finish. */
  deadline?: number;
  requestId?: string;
  route?: string;
  /** Wait at most this long for the first chunk of an attempt. */
  firstChunkMs?: number;
  /** Per-attempt cap when no deadline is given. */
  attemptMs?: number;
}

const num = (k: string, d: number) => {
  const v = parseInt(process.env[k] ?? "");
  return Number.isFinite(v) && v > 0 ? v : d;
};

async function withinBudget(spec: ModelSpec): Promise<boolean> {
  if (!spec.dailyBudget) return true;
  const { day, ttl } = today();
  const used = await incr(`model:${spec.key}:${day}`, ttl);
  if (used > spec.dailyBudget) {
    aiLog({ evt: "ai.budget", provider: spec.provider, model: spec.model, detail: `daily budget ${spec.dailyBudget} reached` });
    return false;
  }
  return true;
}

/**
 * Stream one model turn with automatic fallback. Yields provider chunks plus
 * router events. Throws RouterExhausted, ProviderError("blocked"), or an
 * AbortError if the caller aborts.
 */
export async function* streamWithFallback(o: StreamOptions): AsyncGenerator<RouterEvent> {
  const { list, skipped } = candidates(o.task, o.required, { prefer: o.prefer });
  const firstChunkMs = o.firstChunkMs ?? num("AI_FIRST_CHUNK_TIMEOUT_MS", 30_000);
  const attemptMs = o.attemptMs ?? num("AI_ATTEMPT_TIMEOUT_MS", 45_000);
  const idleMs = num("AI_IDLE_TIMEOUT_MS", 20_000);
  let lastErr: ProviderError | undefined;
  let rateLimited = 0;
  let failures = 0;
  let badRequests = 0;
  const skipProviders = new Set<string>();
  let attemptNo = 0;

  if (!list.length) {
    const rl = skipped.some((s) => s.reason.includes("rate_limit"));
    aiLog({ evt: "ai.exhausted", requestId: o.requestId, route: o.route, task: o.task, detail: skipped.map((s) => `${s.key}:${s.reason}`).join("; ") });
    throw new RouterExhausted(rl ? "rate_limit" : "config", rl);
  }

  for (let i = 0; i < list.length; i++) {
    const { spec, provider } = list[i];
    if (skipProviders.has(spec.provider)) continue;
    if (coolingDown(spec.key, spec.provider)) continue;
    if (!(await withinBudget(spec))) continue;

    for (let retry = 0; retry < 2; retry++) {
      o.signal?.throwIfAborted();
      const remaining = o.deadline ? o.deadline - Date.now() : Infinity;
      if (remaining < 4000) {
        aiLog({ evt: "ai.exhausted", requestId: o.requestId, route: o.route, task: o.task, detail: "deadline reached" });
        throw new RouterExhausted("timeout", false);
      }

      attemptNo++;
      const useTools = Boolean(o.req.tools?.length) && spec.capabilities.includes("tools");
      const req: ChatRequest = useTools ? o.req : { ...o.req, tools: undefined, forceAnswer: false };
      const ctrl = new AbortController();
      let timedOut = false;
      const onOuterAbort = () => ctrl.abort();
      o.signal?.addEventListener("abort", onOuterAbort, { once: true });
      // Timeouts: wait up to firstChunkMs for the model to start, then abort only if
      // the stream goes silent for idleMs. A long answer that keeps streaming is
      // never cut off, except by the overall deadline.
      const cap = Math.min(o.deadline ? remaining - 1500 : attemptMs, 290_000);
      const timeout = () => ((timedOut = true), ctrl.abort());
      let idle = setTimeout(timeout, Math.min(firstChunkMs, cap));
      const totalTimer = setTimeout(timeout, cap);
      const started = Date.now();
      let usage: Usage | undefined;
      let wroteThisAttempt = false;

      yield { type: "attempt", key: spec.key, provider: spec.provider, model: spec.model, tools: useTools };
      try {
        for await (const chunk of provider.stream(req, { model: spec.model, signal: ctrl.signal })) {
          clearTimeout(idle);
          idle = setTimeout(timeout, idleMs);
          if (chunk.type === "usage") {
            usage = chunk.usage;
            continue;
          }
          wroteThisAttempt = true; // text, tool calls or native data the caller must discard on failure
          yield chunk;
        }
        const ms = Date.now() - started;
        recordSuccess(spec.key, ms);
        aiLog({
          evt: "ai.call",
          requestId: o.requestId,
          route: o.route,
          task: o.task,
          provider: spec.provider,
          model: spec.model,
          ms,
          ok: true,
          attempt: attemptNo,
          inputTokens: usage?.inputTokens,
          outputTokens: usage?.outputTokens,
        });
        return;
      } catch (e) {
        if (o.signal?.aborted) throw e; // the student left / pressed stop
        const err = toProviderError(e, spec.provider, timedOut);
        const d = decide(err);
        lastErr = err;
        failures++;
        if (err.category === "rate_limit") rateLimited++;
        if (err.category === "bad_request") badRequests++;
        recordFailure(spec.key, spec.provider, err.category, d.cooldown, d.providerCooldown);
        aiLog({
          evt: "ai.call",
          requestId: o.requestId,
          route: o.route,
          task: o.task,
          provider: spec.provider,
          model: spec.model,
          ms: Date.now() - started,
          ok: false,
          error: err.category,
          status: err.status,
          detail: err.message,
          attempt: attemptNo,
        });
        if (d.stop) throw err;
        if (wroteThisAttempt) yield { type: "rewind" };
        if (d.skipProvider) skipProviders.add(spec.provider);
        if (badRequests >= 2) break; // don't keep sending a request two providers rejected
        if (d.retrySame && retry === 0) {
          await new Promise((r) => setTimeout(r, 600 + Math.random() * 400));
          continue;
        }
        const next = list.slice(i + 1).find((c) => !skipProviders.has(c.spec.provider));
        if (next) {
          aiLog({ evt: "ai.fallback", requestId: o.requestId, route: o.route, task: o.task, from: spec.key, to: next.spec.key, error: err.category });
          yield { type: "switching", reason: err.category };
        }
        break;
      } finally {
        clearTimeout(idle);
        clearTimeout(totalTimer);
        o.signal?.removeEventListener("abort", onOuterAbort);
      }
    }
    if (badRequests >= 2) break;
  }

  aiLog({ evt: "ai.exhausted", requestId: o.requestId, route: o.route, task: o.task, error: lastErr?.category, detail: `${failures} failed attempt(s)` });
  throw new RouterExhausted(lastErr?.category, failures > 0 && rateLimited === failures);
}

/** Non-streaming JSON generation with the same fallback rules (quiz, flashcards). */
export async function generateJSONWithFallback<T>(
  o: Omit<StreamOptions, "req"> & { system: string; prompt: string; validate: (v: unknown) => T | null },
): Promise<{ data: T; key: string }> {
  // A model that returns unusable JSON is cooled down for a minute, so the next
  // round picks a different model. At most 3 rounds.
  for (let round = 0; round < 3; round++) {
    let text = "";
    let spec: { key: string; provider: string } | null = null;
    for await (const ev of streamWithFallback({
      ...o,
      required: [...o.required, "json"],
      req: { system: o.system, messages: [{ role: "user", text: o.prompt }], json: true, temperature: 0.5 },
    })) {
      if (ev.type === "attempt") {
        spec = { key: ev.key, provider: ev.provider };
        text = "";
      } else if (ev.type === "rewind") text = "";
      else if (ev.type === "text") text += ev.delta;
    }
    const parsed = parseJSONLoose(text);
    const valid = parsed === undefined ? null : o.validate(parsed);
    if (valid && spec) return { data: valid, key: spec.key };
    if (spec) {
      recordFailure(spec.key, spec.provider as ProviderId, "server", 60, 0);
      aiLog({ evt: "ai.fallback", requestId: o.requestId, route: o.route, task: o.task, from: spec.key, error: "server", detail: "unusable JSON" });
    }
  }
  throw new RouterExhausted("server", false);
}

export function parseJSONLoose(raw: string): unknown {
  const cleaned = raw.replace(/^\s*```(?:json)?\s*|\s*```\s*$/g, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const a = cleaned.indexOf("{");
    const b = cleaned.lastIndexOf("}");
    if (a >= 0 && b > a) {
      try {
        return JSON.parse(cleaned.slice(a, b + 1));
      } catch {
        return undefined;
      }
    }
    return undefined;
  }
}
