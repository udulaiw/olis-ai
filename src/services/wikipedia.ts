// Direct Wikipedia lookups from the browser (no key needed; the API allows CORS
// with origin=*). Lets OLIS answer general-knowledge questions even without
// OLIS Cloud.
import type { Source } from "../types";

export interface WikiPage {
  title: string;
  extract: string;
  url: string;
  thumb?: string;
  description?: string;
}

const API = "https://en.wikipedia.org/w/api.php";

/** Turn a question into good Wikipedia search terms. */
export function wikiQuery(text: string): string {
  return text
    .replace(/[’‘]/g, "'")
    .replace(
      /^(ok(ay)?|so|hey|hi|olis)[,!\s]+/i,
      "",
    )
    .replace(
      /^(please\s+)?(can|could|would) you\s+(please\s+)?/i,
      "",
    )
    .replace(
      /^(explain|define|describe|summari[sz]e|tell me (more )?(about|of)|what (is|are|was|were|'s)|who (is|was|are|were|'s)|where (is|was|are)|when (is|was|did)|how (does|do|did|is|are)|why (is|are|does|do|did)|teach me( about)?|give me (info(rmation)?|details) (on|about)|i want to (learn|know) about|do you know( about)?)\s+/i,
      "",
    )
    .replace(/\b(like i'?m (a )?(beginner|5|five)|in simple (terms|words)|simply|in detail|briefly|for me|please)\b/gi, "")
    .replace(/^(an?|the)\s+/i, "")
    .replace(/[?!.]+$/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 90);
}

export async function searchWikipedia(query: string, opts: { detailed?: boolean; signal?: AbortSignal } = {}): Promise<WikiPage[]> {
  const params = new URLSearchParams({
    action: "query",
    format: "json",
    origin: "*",
    generator: "search",
    gsrsearch: query,
    gsrlimit: "4",
    prop: "extracts|info|pageimages|description",
    explaintext: "1",
    exchars: opts.detailed ? "3200" : "1600",
    inprop: "url",
    piprop: "thumbnail",
    pithumbsize: "480",
    redirects: "1",
  });
  if (!opts.detailed) params.set("exintro", "1");
  const timeout = AbortSignal.timeout(8000);
  const res = await fetch(`${API}?${params}`, { signal: opts.signal ? AbortSignal.any([opts.signal, timeout]) : timeout });
  if (!res.ok) throw new Error(`Wikipedia ${res.status}`);
  const data = (await res.json()) as {
    query?: { pages?: Record<string, { title: string; index?: number; extract?: string; fullurl?: string; thumbnail?: { source: string }; description?: string }> };
  };
  return Object.values(data.query?.pages ?? {})
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
    .filter((p) => p.extract && !/may refer to:?\s*$/i.test(p.extract.split("\n")[0]) && !/\(disambiguation\)/i.test(p.title))
    .map((p) => ({
      title: p.title,
      extract: p.extract!.trim(),
      url: p.fullurl ?? `https://en.wikipedia.org/wiki/${encodeURIComponent(p.title.replace(/ /g, "_"))}`,
      thumb: p.thumbnail?.source,
      description: p.description,
    }));
}

/** Compose a student-friendly answer from Wikipedia results. */
export function wikiAnswer(pages: WikiPage[], opts: { simple?: boolean; detailed?: boolean }): { text: string; sources: Source[] } {
  const [top, ...rest] = pages;
  const sources: Source[] = pages.map((p, i) => ({ ref: i + 1, kind: "wikipedia", title: p.title, url: p.url, snippet: p.extract.slice(0, 180) }));
  const paras = top.extract
    .split(/\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 40 && !/^==/.test(p));
  const firstSentence = (paras[0] ?? top.extract).match(/^.+?[.!?](\s|$)/)?.[0]?.trim() ?? paras[0] ?? "";
  const body = opts.simple ? paras.slice(0, 1) : opts.detailed ? paras.slice(0, 6) : paras.slice(0, 3);

  const out: string[] = [`## ${top.title}`];
  if (top.description) out.push(`*${top.description.charAt(0).toUpperCase() + top.description.slice(1)}*`);
  if (top.thumb) out.push(`![${top.title}](${top.thumb})`);
  if (opts.simple) out.push(`**In short:** ${firstSentence} [1]`);
  body.forEach((p, i) => out.push(i === body.length - 1 ? `${p} [1]` : p));
  const related = rest.slice(0, 3);
  if (related.length) out.push(`**Related:** ${related.map((p, i) => `${p.title} [${i + 2}]`).join(" · ")}`);
  return { text: out.join("\n\n"), sources };
}
