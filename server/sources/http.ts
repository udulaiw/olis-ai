// Shared fetch helper for external knowledge sources: identifies OLIS (Wikimedia,
// Crossref and arXiv ask for a descriptive User-Agent), always has a timeout,
// and respects the student cancelling the request.

export const OLIS_UA = "OLIS-AI/0.7 (student learning assistant; https://github.com/udulaiw/olis-ai)";

export class SourceError extends Error {
  constructor(
    readonly source: string,
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

export async function getJson<T>(source: string, url: string, opts: { timeoutMs?: number; signal?: AbortSignal; headers?: Record<string, string> } = {}): Promise<T> {
  const text = await getText(source, url, { ...opts, accept: "application/json" });
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new SourceError(source, "bad JSON");
  }
}

export async function getText(source: string, url: string, opts: { timeoutMs?: number; signal?: AbortSignal; headers?: Record<string, string>; accept?: string } = {}): Promise<string> {
  const timeout = AbortSignal.timeout(opts.timeoutMs ?? 8000);
  let res: Response;
  try {
    res = await fetch(url, { headers: { "User-Agent": OLIS_UA, "Api-User-Agent": OLIS_UA, Accept: opts.accept ?? "*/*", ...opts.headers }, signal: opts.signal ? AbortSignal.any([opts.signal, timeout]) : timeout });
  } catch (e) {
    if (opts.signal?.aborted) throw e; // the student stopped: propagate
    throw new SourceError(source, timeout.aborted ? "timed out" : "unreachable");
  }
  if (!res.ok) throw new SourceError(source, `HTTP ${res.status}`, res.status);
  return res.text();
}

export const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n).trimEnd() + "…" : s);
