// ─────────────────────────────────────────────
// Embedding providers for OLIS semantic search. Shared by the build-time indexer
// (scripts/build-index.mjs) and query time (server/rag.ts), so documents and
// questions are always embedded by the same model.
//
//   EMBED_PROVIDER=gemini (default)  gemini-embedding-001, free tier, 100+ languages
//                                    incl. Sinhala and Tamil. Needs GEMINI_API_KEY.
//   EMBED_PROVIDER=tei               any model served by Hugging Face
//                                    text-embeddings-inference (Apache-2.0), e.g.
//                                    BAAI/bge-m3 (MIT, 100+ languages, 1024 dims).
//                                    Needs EMBED_URL (your TEI server) and runs
//                                    outside Vercel (a GPU/CPU box, HF Endpoint…).
//
// The index records provider + model + dims. At query time OLIS only uses
// semantic search when the configured provider/model match the index; otherwise
// it uses keyword search (never mixes vector spaces).
// Plain JS (.mjs) so the Node build script can import it.
// ─────────────────────────────────────────────

const env = (/** @type {string} */ k, d = "") => (process.env[k] || "").trim() || d;

export function embedSettings() {
  const provider = env("EMBED_PROVIDER", "gemini") === "tei" ? "tei" : "gemini";
  return provider === "tei"
    ? { provider, model: env("EMBED_MODEL", "BAAI/bge-m3"), dims: parseInt(env("EMBED_DIMS", "1024")) || 1024, url: env("EMBED_URL").replace(/\/$/, ""), key: env("EMBED_API_KEY") }
    : {
        provider,
        model: env("GEMINI_EMBED_MODEL", "gemini-embedding-001"),
        dims: 768,
        url: env("GEMINI_BASE_URL", "https://generativelanguage.googleapis.com/v1beta").replace(/\/$/, ""),
        key: env("GEMINI_API_KEY"),
      };
}

/** Is the configured embedding provider usable at all? */
export function embeddingsConfigured(s = embedSettings()) {
  return s.provider === "tei" ? Boolean(s.url) : Boolean(s.key);
}

const normalize = (/** @type {number[]} */ v, round = false) => {
  const n = Math.sqrt(v.reduce((a, x) => a + x * x, 0)) || 1;
  return v.map((x) => (round ? Math.round((x / n) * 10000) / 10000 : x / n));
};

/**
 * Embed texts. kind: "document" for the index, "query" for a question
 * (Gemini uses different task types; bge-m3 needs no prefix).
 * @param {string[]} texts
 * @param {{ kind: "document" | "query", signal?: AbortSignal, settings?: ReturnType<typeof embedSettings>, onProgress?: (done: number) => void }} opts
 * @returns {Promise<number[][]>}
 */
export async function embedTexts(texts, opts) {
  const s = opts.settings ?? embedSettings();
  const round = opts.kind === "document"; // keeps index.json small
  const out = [];
  const batch = s.provider === "tei" ? 32 : 90;
  for (let i = 0; i < texts.length; i += batch) {
    const part = texts.slice(i, i + batch);
    let attempt = 0;
    for (;;) {
      const timeout = AbortSignal.timeout(opts.kind === "query" ? 5000 : 60_000);
      const signal = opts.signal ? AbortSignal.any([opts.signal, timeout]) : timeout;
      /** @type {Response} */
      let res;
      if (s.provider === "tei") {
        /** @type {Record<string,string>} */
        const headers = { "Content-Type": "application/json" };
        if (s.key) headers.Authorization = `Bearer ${s.key}`;
        res = await fetch(`${s.url}/embed`, { method: "POST", headers, body: JSON.stringify({ inputs: part, normalize: true, truncate: true }), signal });
      } else {
        res = await fetch(`${s.url}/models/${s.model}:batchEmbedContents`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": s.key },
          body: JSON.stringify({
            requests: part.map((text) => ({ model: `models/${s.model}`, content: { parts: [{ text }] }, taskType: opts.kind === "query" ? "RETRIEVAL_QUERY" : "RETRIEVAL_DOCUMENT", outputDimensionality: s.dims })),
          }),
          signal,
        });
      }
      if (res.status === 429 && opts.kind === "document" && attempt < 4) {
        attempt++;
        await new Promise((r) => setTimeout(r, 5000 * attempt));
        continue;
      }
      if (!res.ok) throw new Error(`embedding failed (${res.status})`);
      const data = await res.json();
      const vecs = s.provider === "tei" ? data : (data.embeddings ?? []).map((/** @type {{ values: number[] }} */ e) => e.values);
      if (!Array.isArray(vecs) || vecs.length !== part.length) throw new Error("embedding count mismatch");
      for (const v of vecs) {
        if (!Array.isArray(v) || v.length !== s.dims) throw new Error(`embedding has ${v?.length} dims, expected ${s.dims}`);
        out.push(normalize(v, round));
      }
      break;
    }
    opts.onProgress?.(Math.min(i + batch, texts.length));
  }
  return out;
}
