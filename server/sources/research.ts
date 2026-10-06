// ─────────────────────────────────────────────
// Academic sources, used ONLY when a student asks for research / papers /
// studies (the agent doesn't even offer this tool otherwise):
//
//   OpenAlex  works search (250M+ scholarly works, CC0 metadata). Primary.
//             Free without a key (small daily budget); a free OPENALEX_API_KEY
//             raises it ~10×.
//   arXiv     preprints (metadata CC0). Used when the student asks for arXiv /
//             preprints, or when OpenAlex is unavailable. arXiv asks for at most
//             one request every 3 s, so calls are spaced and cached.
//   Crossref  DOI lookup (metadata for a specific paper the student names).
//
// Returns metadata + abstract snippets and links back to the source; never
// re-hosts PDFs (arXiv/publisher terms).
// ─────────────────────────────────────────────
import { cached, cacheKey } from "./cache.js";
import { clip, getJson, getText, SourceError } from "./http.js";

export interface Paper {
  title: string;
  year: number | null;
  authors: string[];
  venue: string | null;
  url: string;
  doi: string | null;
  abstract: string;
  citedBy?: number;
  openAccessUrl?: string | null;
  source: "openalex" | "arxiv" | "crossref";
}

const env = (k: string) => (process.env[k] || "").trim();

/** OpenAlex returns abstracts as an inverted index ({word: [positions]}); rebuild the text. */
export function abstractFromInvertedIndex(idx?: Record<string, number[]> | null): string {
  if (!idx) return "";
  const words: string[] = [];
  for (const [w, pos] of Object.entries(idx)) for (const p of pos) words[p] = w;
  return words.filter(Boolean).join(" ");
}

const decodeXml = (s: string) =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();

export async function searchOpenAlex(query: string, opts: { limit?: number; fromYear?: number; signal?: AbortSignal } = {}): Promise<{ papers: Paper[]; cached: boolean }> {
  const limit = Math.min(8, Math.max(1, opts.limit ?? 5));
  const { value, hit } = await cached(cacheKey("openalex", query, limit, opts.fromYear), 24 * 3600, async () => {
    const params = new URLSearchParams({
      search: query.slice(0, 200),
      per_page: String(limit),
      select: "id,doi,display_name,publication_year,authorships,primary_location,cited_by_count,abstract_inverted_index,open_access",
    });
    if (opts.fromYear) params.set("filter", `from_publication_date:${opts.fromYear}-01-01`);
    if (env("OPENALEX_API_KEY")) params.set("api_key", env("OPENALEX_API_KEY"));
    if (env("OLIS_CONTACT_EMAIL")) params.set("mailto", env("OLIS_CONTACT_EMAIL"));
    type W = {
      id: string;
      doi?: string | null;
      display_name?: string;
      publication_year?: number;
      authorships?: { author?: { display_name?: string } }[];
      primary_location?: { landing_page_url?: string | null; source?: { display_name?: string } | null } | null;
      cited_by_count?: number;
      abstract_inverted_index?: Record<string, number[]> | null;
      open_access?: { oa_url?: string | null };
    };
    const data = await getJson<{ results?: W[] }>("openalex", `https://api.openalex.org/works?${params}`, { signal: opts.signal, timeoutMs: 8000 });
    return (data.results ?? [])
      .filter((w) => w.display_name)
      .map(
        (w): Paper => ({
          title: w.display_name!,
          year: w.publication_year ?? null,
          authors: (w.authorships ?? []).map((a) => a.author?.display_name ?? "").filter(Boolean).slice(0, 4),
          venue: w.primary_location?.source?.display_name ?? null,
          url: w.doi ?? w.primary_location?.landing_page_url ?? w.id,
          doi: w.doi ? w.doi.replace(/^https?:\/\/doi\.org\//, "") : null,
          abstract: clip(abstractFromInvertedIndex(w.abstract_inverted_index), 700),
          citedBy: w.cited_by_count ?? 0,
          openAccessUrl: w.open_access?.oa_url ?? null,
          source: "openalex",
        }),
      );
  });
  return { papers: value ?? [], cached: hit };
}

// arXiv: one request at a time, ≥ 3 s apart, per server instance
let arxivNext = 0;
export async function searchArxiv(query: string, opts: { limit?: number; signal?: AbortSignal } = {}): Promise<{ papers: Paper[]; cached: boolean }> {
  const limit = Math.min(8, Math.max(1, opts.limit ?? 5));
  const { value, hit } = await cached(cacheKey("arxiv", query, limit), 24 * 3600, async () => {
    const wait = arxivNext - Date.now();
    if (wait > 4000) throw new SourceError("arxiv", "busy"); // don't make the student wait; OpenAlex covers arXiv too
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    arxivNext = Date.now() + 3100;
    const q = query
      .replace(/[^\p{L}\p{N}\s-]/gu, " ")
      .trim()
      .split(/\s+/)
      .slice(0, 8)
      .map((w) => `all:${w}`)
      .join("+AND+");
    const xml = await getText("arxiv", `https://export.arxiv.org/api/query?search_query=${q}&start=0&max_results=${limit}&sortBy=relevance`, { signal: opts.signal, timeoutMs: 9000, accept: "application/atom+xml" });
    return [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map((m): Paper => {
      const e = m[1];
      const tag = (t: string) => decodeXml(e.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`))?.[1] ?? "");
      const id = tag("id");
      const doi = e.match(/<arxiv:doi[^>]*>([^<]+)<\/arxiv:doi>/)?.[1] ?? null;
      return {
        title: tag("title"),
        year: parseInt(tag("published").slice(0, 4)) || null,
        authors: [...e.matchAll(/<author>\s*<name>([^<]+)<\/name>/g)].map((a) => decodeXml(a[1])).slice(0, 4),
        venue: "arXiv",
        url: id.replace(/^http:/, "https:"),
        doi,
        abstract: clip(tag("summary"), 700),
        openAccessUrl: id.replace(/^http:/, "https:").replace("/abs/", "/pdf/"),
        source: "arxiv",
      };
    }).filter((p) => p.title);
  });
  return { papers: value ?? [], cached: hit };
}

export async function lookupDoi(doi: string, opts: { signal?: AbortSignal } = {}): Promise<{ paper: Paper | null; cached: boolean }> {
  const clean = doi.trim().replace(/^https?:\/\/(dx\.)?doi\.org\//i, "").replace(/^doi:\s*/i, "");
  if (!/^10\.\d{4,9}\/\S+$/.test(clean)) return { paper: null, cached: false };
  const { value, hit } = await cached(cacheKey("crossref", clean), 7 * 24 * 3600, async () => {
    const mail = env("OLIS_CONTACT_EMAIL") ? `?mailto=${encodeURIComponent(env("OLIS_CONTACT_EMAIL"))}` : "";
    type M = { title?: string[]; issued?: { "date-parts"?: number[][] }; author?: { given?: string; family?: string }[]; "container-title"?: string[]; URL?: string; DOI?: string; abstract?: string; "is-referenced-by-count"?: number };
    const data = await getJson<{ message?: M }>("crossref", `https://api.crossref.org/works/${encodeURIComponent(clean)}${mail}`, { signal: opts.signal, timeoutMs: 8000 });
    const m = data.message;
    if (!m?.title?.[0]) return null;
    return {
      title: m.title[0],
      year: m.issued?.["date-parts"]?.[0]?.[0] ?? null,
      authors: (m.author ?? []).map((a) => [a.given, a.family].filter(Boolean).join(" ")).filter(Boolean).slice(0, 4),
      venue: m["container-title"]?.[0] ?? null,
      url: m.URL ?? `https://doi.org/${clean}`,
      doi: m.DOI ?? clean,
      abstract: clip((m.abstract ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(), 700),
      citedBy: m["is-referenced-by-count"],
      source: "crossref",
    } satisfies Paper;
  });
  return { paper: value, cached: hit };
}

/** Research questions only: "find research on …", "papers about …", "studies on …", arXiv, DOI, citations. Not "past paper". */
export const RESEARCH_CUE = /\b(research(?:es|ers)?\b(?! method)|scientific (?:papers?|articles?|studies|literature)|(?:journal|academic|scholarly) (?:papers?|articles?)|(?<!past |model |exam |question |test )papers? (?:on|about|regarding)|studies (?:on|about|of|show)|literature review|arxiv|preprints?|peer[- ]reviewed|doi\b|10\.\d{4,9}\/|cit(?:e|ation)s? (?:for|of))|පර්යේෂණ|ஆய்வு/i;
