// Tiny counter store for daily limits.
//
// Default: in-memory, per warm serverless instance (best effort, $0, no setup).
// Optional: Upstash Redis REST (free tier) for limits shared across instances:
//   UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN
// If Upstash is configured but unreachable, OLIS falls back to memory rather
// than blocking students.

const mem = new Map<string, { n: number; exp: number }>();

function memIncr(key: string, ttlSec: number): number {
  const now = Date.now();
  const cur = mem.get(key);
  if (!cur || cur.exp < now) {
    mem.set(key, { n: 1, exp: now + ttlSec * 1000 });
    if (mem.size > 20_000) for (const [k, v] of mem) if (v.exp < now) mem.delete(k);
    return 1;
  }
  cur.n++;
  return cur.n;
}

function memGet(key: string): number {
  const cur = mem.get(key);
  return cur && cur.exp >= Date.now() ? cur.n : 0;
}

function upstash() {
  const url = (process.env.UPSTASH_REDIS_REST_URL ?? "").trim().replace(/\/$/, "");
  const token = (process.env.UPSTASH_REDIS_REST_TOKEN ?? "").trim();
  return url && token ? { url, token } : null;
}

/** Increment a counter that expires after ttlSec. Returns the new value. */
export async function incr(key: string, ttlSec: number): Promise<number> {
  const u = upstash();
  if (u) {
    try {
      const res = await fetch(`${u.url}/pipeline`, {
        method: "POST",
        headers: { Authorization: `Bearer ${u.token}`, "Content-Type": "application/json" },
        body: JSON.stringify([
          ["INCR", `olis:${key}`],
          ["EXPIRE", `olis:${key}`, String(ttlSec), "NX"],
        ]),
        signal: AbortSignal.timeout(1500),
      });
      if (res.ok) {
        const out = (await res.json()) as { result?: number }[];
        if (typeof out[0]?.result === "number") return out[0].result;
      }
    } catch {
      /* fall through to memory */
    }
  }
  return memIncr(key, ttlSec);
}

export async function peek(key: string): Promise<number> {
  const u = upstash();
  if (u) {
    try {
      const res = await fetch(`${u.url}/get/olis:${encodeURIComponent(key)}`, {
        headers: { Authorization: `Bearer ${u.token}` },
        signal: AbortSignal.timeout(1500),
      });
      if (res.ok) return Number(((await res.json()) as { result?: string | null }).result ?? 0) || 0;
    } catch {
      /* fall through */
    }
  }
  return memGet(key);
}

export const storeKind = () => (upstash() ? "upstash" : "memory");

/** UTC day stamp, e.g. 2026-09-23, and seconds until it rolls over. */
export function today(): { day: string; ttl: number } {
  const now = new Date();
  const end = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  return { day: now.toISOString().slice(0, 10), ttl: Math.ceil((end - now.getTime()) / 1000) + 60 };
}

/** Test helper. */
export function _resetMemoryStore() {
  mem.clear();
}
