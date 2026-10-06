// ─────────────────────────────────────────────
// Cache for PUBLIC external knowledge (Wikipedia, Wikidata, OpenAlex, arXiv,
// Crossref). Many students ask the same things ("black hole", "Newton's second
// law"), so the same lookup shouldn't hit the same API again and again.
//
//   - In memory per warm serverless instance (LRU, TTL), always.
//   - Shared across instances in Upstash Redis when UPSTASH_REDIS_REST_* is set
//     (the same free Redis OLIS already uses for rate limits).
//
// Only ever store responses from public APIs, keyed by the normalised query.
// Never cache anything about a student (documents, memories, chats, profile).
// ─────────────────────────────────────────────

interface Entry {
  exp: number;
  value: unknown;
}

const MAX_ENTRIES = 400;
const mem = new Map<string, Entry>();

function upstash() {
  const url = (process.env.UPSTASH_REDIS_REST_URL ?? "").trim().replace(/\/$/, "");
  const token = (process.env.UPSTASH_REDIS_REST_TOKEN ?? "").trim();
  return url && token ? { url, token } : null;
}

/** Normalised cache key: source + lower-cased, NFC, whitespace-collapsed parts. */
export const cacheKey = (source: string, ...parts: (string | number | undefined)[]) =>
  `olis:src:${source}:${parts.map((p) => String(p ?? "").normalize("NFC").toLowerCase().replace(/\s+/g, " ").trim()).join("|")}`.slice(0, 300);

function memGet<T>(key: string): T | undefined {
  const e = mem.get(key);
  if (!e) return undefined;
  if (e.exp < Date.now()) {
    mem.delete(key);
    return undefined;
  }
  // LRU: re-insert to mark as recently used
  mem.delete(key);
  mem.set(key, e);
  return e.value as T;
}

function memSet(key: string, value: unknown, ttlSec: number) {
  mem.set(key, { exp: Date.now() + ttlSec * 1000, value });
  while (mem.size > MAX_ENTRIES) mem.delete(mem.keys().next().value!);
}

async function redisGet<T>(key: string): Promise<T | undefined> {
  const u = upstash();
  if (!u) return undefined;
  try {
    const res = await fetch(`${u.url}/get/${encodeURIComponent(key)}`, { headers: { Authorization: `Bearer ${u.token}` }, signal: AbortSignal.timeout(800) });
    if (!res.ok) return undefined;
    const { result } = (await res.json()) as { result?: string | null };
    return result ? (JSON.parse(result) as T) : undefined;
  } catch {
    return undefined;
  }
}

function redisSet(key: string, value: unknown, ttlSec: number) {
  const u = upstash();
  if (!u) return;
  const body = JSON.stringify(value);
  if (body.length > 60_000) return; // keep Redis small
  // fire-and-forget: a cache write must never slow an answer down
  void fetch(`${u.url}/set/${encodeURIComponent(key)}?EX=${ttlSec}`, { method: "POST", headers: { Authorization: `Bearer ${u.token}` }, body, signal: AbortSignal.timeout(1500) }).catch(() => undefined);
}

/**
 * Return the cached value, or run `load`, cache a non-null result and return it.
 * Failures (load throws or returns null) are not cached, so a short outage doesn't stick.
 */
export async function cached<T>(key: string, ttlSec: number, load: () => Promise<T | null>): Promise<{ value: T | null; hit: boolean }> {
  const m = memGet<T>(key);
  if (m !== undefined) return { value: m, hit: true };
  const r = await redisGet<T>(key);
  if (r !== undefined) {
    memSet(key, r, ttlSec);
    return { value: r, hit: true };
  }
  const value = await load();
  if (value !== null && value !== undefined) {
    memSet(key, value, ttlSec);
    redisSet(key, value, ttlSec);
  }
  return { value, hit: false };
}

/** Tests only. */
export function _clearSourceCache() {
  mem.clear();
}
