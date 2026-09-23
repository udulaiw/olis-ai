// The OLIS agent's tools. Each returns text for the model plus
// structured sources for the UI (numbered so the model can cite [n]).
import type { Config } from "./config.js";
import type { FunctionDeclaration } from "./gemini.js";
import { searchKnowledge } from "./rag.js";

export type SourceKind = "notes" | "wikipedia" | "web";
export interface Source {
  ref: number;
  kind: SourceKind;
  title: string;
  url: string | null;
  snippet: string;
}

export class SourceRegistry {
  list: Source[] = [];
  add(s: Omit<Source, "ref">): Source {
    const key = s.url ?? s.title;
    const found = this.list.find((x) => (x.url ?? x.title) === key);
    if (found) return found;
    const src = { ...s, ref: this.list.length + 1 };
    this.list.push(src);
    return src;
  }
  hasUrl(url: string) {
    return this.list.some((s) => s.url === url);
  }
}

const UA = "OLIS-AI-Beta/0.1 (student learning assistant; https://github.com/udulaiw/olis-ai)";
const t = (ms: number) => AbortSignal.timeout(ms);
/** Per-call timeout that also respects the client disconnecting. */
const sig = (ms: number, outer?: AbortSignal) => (outer ? AbortSignal.any([outer, t(ms)]) : t(ms));
const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n).trimEnd() + "…" : s);

export function toolDeclarations(cfg: Config): FunctionDeclaration[] {
  const decls: FunctionDeclaration[] = [
    {
      name: "search_knowledge_base",
      description:
        "Search OLIS's curated study notes (A-Level Physics, Chemistry, Combined Mathematics, Biology, study skills and any syllabus material added by the admin). Use this FIRST for curriculum questions. Returns numbered excerpts.",
      parameters: { type: "object", properties: { query: { type: "string", description: "What to look up, in plain words" } }, required: ["query"] },
    },
    {
      name: "search_wikipedia",
      description: "Search Wikipedia for encyclopedic background on a concept, person, event or definition. Returns numbered article summaries.",
      parameters: { type: "object", properties: { query: { type: "string", description: "Search terms" } }, required: ["query"] },
    },
  ];
  if (cfg.tavilyKey) {
    decls.push({
      name: "search_web",
      description:
        cfg.webScope === "trusted"
          ? "Search trusted educational websites for current or detailed information not in the notes or Wikipedia (e.g. recent discoveries, exam board updates, worked examples). Returns numbered results."
          : "Search the web for current or detailed information not in the notes or Wikipedia. Returns numbered results.",
      parameters: { type: "object", properties: { query: { type: "string", description: "Search terms" } }, required: ["query"] },
    });
  }
  decls.push({
    name: "read_webpage",
    description: "Read the main text of a web page that appeared in earlier search results, when the snippet isn't enough.",
    parameters: { type: "object", properties: { url: { type: "string", description: "A URL from an earlier search result" } }, required: ["url"] },
  });
  return decls;
}

export interface ToolRun {
  label: string; // shown in the UI, e.g. "Searching Wikipedia: “entropy”"
  result: Record<string, unknown>;
  sources: Source[];
}

export async function runTool(
  cfg: Config,
  name: string,
  args: Record<string, unknown>,
  reg: SourceRegistry,
  ctx: { subject?: string; signal?: AbortSignal },
): Promise<ToolRun> {
  const q = String(args.query ?? "").slice(0, 200);
  switch (name) {
    case "search_knowledge_base": {
      const hits = await searchKnowledge(cfg, q, { k: 4, subject: ctx.subject, signal: ctx.signal });
      const sources = hits.map((h) =>
        reg.add({ kind: "notes", title: `${h.chunk.title} · ${h.chunk.heading}`, url: h.chunk.url, snippet: clip(h.chunk.text.split("\n\n").slice(1).join(" "), 180) }),
      );
      return {
        label: `Searching study notes: “${q}”`,
        sources,
        result: hits.length
          ? { results: hits.map((h, i) => ({ ref: sources[i].ref, title: sources[i].title, text: clip(h.chunk.text, 1400) })) }
          : { results: [], note: "No matching notes. Consider Wikipedia or web search." },
      };
    }

    case "search_wikipedia": {
      const url = `${cfg.wikipediaBase}/w/api.php?action=query&format=json&origin=*&generator=search&gsrsearch=${encodeURIComponent(q)}&gsrlimit=3&prop=extracts|info&exintro=1&explaintext=1&exchars=1200&inprop=url`;
      const res = await fetch(url, { headers: { "User-Agent": UA }, signal: sig(8000, ctx.signal) });
      if (!res.ok) return { label: `Searching Wikipedia: “${q}”`, sources: [], result: { error: `Wikipedia unavailable (${res.status})` } };
      const data = (await res.json()) as { query?: { pages?: Record<string, { title: string; extract?: string; fullurl?: string; index?: number }> } };
      const pages = Object.values(data.query?.pages ?? {}).sort((a, b) => (a.index ?? 0) - (b.index ?? 0)).filter((p) => p.extract);
      const sources = pages.map((p) => reg.add({ kind: "wikipedia", title: p.title, url: p.fullurl ?? `https://en.wikipedia.org/wiki/${encodeURIComponent(p.title)}`, snippet: clip(p.extract!, 180) }));
      return {
        label: `Searching Wikipedia: “${q}”`,
        sources,
        result: pages.length ? { results: pages.map((p, i) => ({ ref: sources[i].ref, title: p.title, summary: clip(p.extract!, 1200) })) } : { results: [], note: "No Wikipedia results." },
      };
    }

    case "search_web": {
      if (!cfg.tavilyKey) return { label: "Web search", sources: [], result: { error: "Web search is not configured." } };
      const body: Record<string, unknown> = { query: q, max_results: 4, search_depth: "basic", include_answer: false };
      if (cfg.webScope === "trusted") body.include_domains = cfg.trustedDomains;
      const res = await fetch(`${cfg.tavilyBase}/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.tavilyKey}` },
        body: JSON.stringify(body),
        signal: sig(10000, ctx.signal),
      });
      if (!res.ok) return { label: `Searching the web: “${q}”`, sources: [], result: { error: `Web search unavailable (${res.status})` } };
      const data = (await res.json()) as { results?: { title: string; url: string; content: string }[] };
      const results = (data.results ?? []).slice(0, 4);
      const sources = results.map((r) => reg.add({ kind: "web", title: r.title, url: r.url, snippet: clip(r.content, 180) }));
      return {
        label: `Searching ${cfg.webScope === "trusted" ? "trusted sites" : "the web"}: “${q}”`,
        sources,
        result: results.length ? { results: results.map((r, i) => ({ ref: sources[i].ref, title: r.title, url: r.url, content: clip(r.content, 900) })) } : { results: [], note: "No results." },
      };
    }

    case "read_webpage": {
      const url = String(args.url ?? "");
      let host = "";
      try {
        const u = new URL(url);
        if (!/^https?:$/.test(u.protocol)) throw new Error();
        host = u.hostname;
      } catch {
        return { label: "Reading a page", sources: [], result: { error: "Invalid URL." } };
      }
      // Safety: only pages OLIS already found, or trusted domains. Blocks SSRF and random sites.
      const trusted = cfg.trustedDomains.some((d) => host === d || host.endsWith("." + d));
      if (!reg.hasUrl(url) && !trusted) return { label: `Reading ${host}`, sources: [], result: { error: "OLIS only reads pages from its own search results or trusted sites." } };
      try {
        const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "text/html,text/plain" }, signal: sig(9000, ctx.signal), redirect: "follow" });
        if (!res.ok) return { label: `Reading ${host}`, sources: [], result: { error: `Page unavailable (${res.status})` } };
        const html = (await res.text()).slice(0, 400_000);
        const title = html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim() || host;
        const text = html
          .replace(/<(script|style|nav|footer|header|aside|noscript)[\s\S]*?<\/\1>/gi, " ")
          .replace(/<[^>]+>/g, " ")
          .replace(/&nbsp;/g, " ")
          .replace(/&amp;/g, "&")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&#39;|&apos;/g, "'")
          .replace(/&quot;/g, '"')
          .replace(/\s+/g, " ")
          .trim();
        const src = reg.add({ kind: host.endsWith("wikipedia.org") ? "wikipedia" : "web", title, url, snippet: clip(text, 180) });
        return { label: `Reading ${host}`, sources: [src], result: { ref: src.ref, title, text: clip(text, 6000) } };
      } catch {
        return { label: `Reading ${host}`, sources: [], result: { error: "Couldn't load that page." } };
      }
    }

    default:
      return { label: name, sources: [], result: { error: `Unknown tool ${name}` } };
  }
}
