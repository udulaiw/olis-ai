// The OLIS agent's tools. Each returns text for the model plus
// structured sources for the UI (numbered so the model can cite [n]).
import type { Config } from "./config.js";
import type { ToolDef } from "./ai/types.js";
import { searchKnowledge, relevantHits } from "./rag.js";
import { expandQuery } from "./lang/nlp.mjs";
import { mathCheck, MATH_OPS } from "./mathcheck.js";
import { searchWikipedia, type WikiLang } from "./sources/wikipedia.js";
import { lookupWikidata } from "./sources/wikidata.js";
import { searchOpenAlex, searchArxiv, lookupDoi, type Paper } from "./sources/research.js";
import { SourceError } from "./sources/http.js";
import { aiLog } from "./ai/log.js";

export type SourceKind = "notes" | "paper" | "document" | "wikipedia" | "wikidata" | "research" | "web";
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

export function toolDeclarations(cfg: Config, opts: { research?: boolean } = {}): ToolDef[] {
  const decls: ToolDef[] = [
    {
      name: "search_knowledge_base",
      description:
        "Search OLIS's curated study notes (A-Level Physics, Chemistry, Combined Mathematics, Biology, study skills and any syllabus material added by the admin). Use this FIRST for curriculum questions. Returns numbered excerpts.",
      parameters: { type: "object", properties: { query: { type: "string", description: "What to look up, in plain words" } }, required: ["query"] },
    },
    {
      name: "search_past_papers",
      description:
        "Search the Sri Lankan A/L past-paper questions and marking schemes that have been added to OLIS. Use for questions about past papers, exam patterns, how marks are awarded, or to find real questions on a topic. Returns only real, indexed questions; if none are found, say so and never invent one.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Topic or question text to look for" },
          year: { type: "string", description: "Optional exam year, e.g. 2023" },
        },
        required: ["query"],
      },
    },
    {
      name: "math_check",
      description:
        "Deterministic maths checker. Use it to VERIFY arithmetic, unit conversions, derivatives, definite integrals, quadratic roots, or whether a student's simplified expression equals the original. ops: evaluate (expr; supports units like '72 km/h to m/s'), derivative (expr, variable), simplify (expr), integrate_numeric (expr, variable, a, b), quadratic (a, b, c), equivalent (expr, expr2, variable). Write expressions like x^2, sqrt(x), sin(x), 2*x.",
      parameters: {
        type: "object",
        properties: {
          op: { type: "string", enum: [...MATH_OPS], description: "Which check to run" },
          expr: { type: "string", description: "Expression (not needed for quadratic)" },
          expr2: { type: "string", description: "Second expression, for op=equivalent" },
          variable: { type: "string", description: "Single-letter variable, default x" },
          a: { type: "string", description: "Number: lower limit (integrate_numeric) or quadratic coefficient a" },
          b: { type: "string", description: "Number: upper limit (integrate_numeric) or quadratic coefficient b" },
          c: { type: "string", description: "Number: quadratic coefficient c" },
        },
        required: ["op"],
      },
    },
    {
      name: "search_wikipedia",
      description:
        "Search Wikipedia for encyclopedic background on a concept, person, place, event or definition that the OLIS notes don't cover. Returns numbered article summaries (and a free Wikimedia Commons image link when the article has one). Use language 'si' or 'ta' only for Sri Lankan topics better covered in Sinhala/Tamil Wikipedia; English otherwise.",
      parameters: {
        type: "object",
        properties: { query: { type: "string", description: "Search terms" }, language: { type: "string", enum: ["en", "si", "ta"], description: "Wikipedia edition, default en" } },
        required: ["query"],
      },
    },
    {
      name: "lookup_facts",
      description:
        "Look up exact structured facts about ONE named thing on Wikidata: a person (born, died, discoveries, awards), a place (country, capital, population, area, elevation), a planet or star (discoverer, discovery date, mass, radius, orbital period), a chemical element or compound (atomic number, symbol, formula, melting/boiling point), an event (date, location). Use for 'who discovered…', 'when was…', 'what is the population/capital/atomic number of…'. Not for explanations.",
      parameters: { type: "object", properties: { entity: { type: "string", description: "The name of the thing, e.g. 'Neptune', 'Isaac Newton', 'sodium'" } }, required: ["entity"] },
    },
  ];
  if (opts.research) {
    decls.push({
      name: "search_research",
      description:
        "Find real academic papers (OpenAlex; arXiv for preprints; Crossref for a DOI). Only for requests about research, scientific papers or studies. Returns numbered paper titles, authors, year, venue and abstract snippets with links. Never invent papers.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Research topic in English keywords" },
          source: { type: "string", enum: ["openalex", "arxiv"], description: "Default openalex; arxiv for preprints" },
          doi: { type: "string", description: "A DOI to look up instead of searching" },
          from_year: { type: "string", description: "Only papers from this year onwards, e.g. 2020" },
        },
        required: ["query"],
      },
    });
  }
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
  ctx: { subject?: string; signal?: AbortSignal; level?: "OL" | "AL" | null; requestId?: string },
): Promise<ToolRun> {
  const logSource = (source: string, ok: boolean, cachedHit: boolean, hits: number) => aiLog({ evt: "ai.source", requestId: ctx.requestId, source, ok, cached: cachedHit, hits });
  const failed = (label: string, source: string, e: unknown): ToolRun => {
    if ((e as Error)?.name === "AbortError" && ctx.signal?.aborted) throw e;
    logSource(source, false, false, 0);
    const why = e instanceof SourceError ? e.message : "unavailable";
    return { label, sources: [], result: { error: `${source} is unavailable right now (${why}). Answer from the OLIS notes or your own knowledge, labelled as such, or try another source.` } };
  };
  const q = String(args.query ?? "").slice(0, 200);
  switch (name) {
    case "math_check": {
      const result = mathCheck(args);
      return { label: result.error ? "Checking the maths (couldn't run that check)" : `Checking the maths: ${String(args.op)}`, sources: [], result };
    }

    case "search_knowledge_base": {
      // The model may write a Sinhala / Singlish query; search with its English expansion too
      const hits = relevantHits(await searchKnowledge(cfg, expandQuery(q).expanded, { k: 4, subject: ctx.subject, signal: ctx.signal, level: ctx.level }));
      const sources = hits.map((h) =>
        reg.add({ kind: "notes", title: `${h.chunk.title} · ${h.chunk.heading}${h.chunk.pages ? ` (p.${h.chunk.pages})` : ""}`, url: h.chunk.url, snippet: clip(h.chunk.text.split("\n\n").slice(1).join(" "), 180) }),
      );
      return {
        label: `Searching study notes: “${q}”`,
        sources,
        result: hits.length
          ? { results: hits.map((h, i) => ({ ref: sources[i].ref, title: sources[i].title, text: clip(h.chunk.text, 1400) })) }
          : { results: [], note: "No matching notes. Consider Wikipedia or web search." },
      };
    }

    case "search_past_papers": {
      const year = typeof args.year === "string" && /^\d{4}$/.test(args.year) ? args.year : undefined;
      const hits = relevantHits(await searchKnowledge(cfg, expandQuery(q).expanded, { k: 4, subject: ctx.subject, signal: ctx.signal, types: ["past_paper", "marking_scheme"], year, level: ctx.level }));
      const sources = hits.map((h) =>
        reg.add({
          kind: "paper",
          title: [h.chunk.title, h.chunk.year, h.chunk.paper, h.chunk.question ? `Q${h.chunk.question}` : ""].filter(Boolean).join(" · "),
          url: h.chunk.url,
          snippet: clip(h.chunk.text.split("\n\n").slice(1).join(" "), 180),
        }),
      );
      return {
        label: hits.length ? `Found ${hits.length} past-paper item${hits.length > 1 ? "s" : ""}` : "No matching past-paper questions yet",
        sources,
        result: hits.length
          ? {
              results: hits.map((h, i) => ({
                ref: sources[i].ref,
                type: h.chunk.type,
                subject: h.chunk.subject,
                year: h.chunk.year,
                paper: h.chunk.paper,
                question: h.chunk.question,
                unit: h.chunk.unit,
                marks: h.chunk.marks,
                text: clip(h.chunk.text, 1600),
              })),
            }
          : { results: [], note: "No past-paper questions on this are in OLIS yet. Tell the student honestly. Do NOT invent past-paper questions, years or marking schemes." },
      };
    }

    case "search_wikipedia": {
      const lang: WikiLang = args.language === "si" || args.language === "ta" ? args.language : "en";
      const label = `Searching ${lang === "si" ? "Sinhala " : lang === "ta" ? "Tamil " : ""}Wikipedia: “${q}”`;
      try {
        const { pages, cached: hit } = await searchWikipedia(q, { lang, signal: ctx.signal });
        logSource("wikipedia", true, hit, pages.length);
        const sources = pages.map((p) => reg.add({ kind: "wikipedia", title: p.title, url: p.url, snippet: clip(p.summary, 180) }));
        return {
          label,
          sources,
          result: pages.length
            ? { results: pages.map((p, i) => ({ ref: sources[i].ref, title: p.title, summary: p.summary, ...(p.image ? { image: `Free image on Wikimedia Commons: ${p.image.commons}` } : {}) })), licence: "Wikipedia text is CC BY-SA 4.0" }
            : { results: [], note: "No Wikipedia results." },
        };
      } catch (e) {
        return failed(label, "Wikipedia", e);
      }
    }

    case "lookup_facts": {
      const entity = String(args.entity ?? args.query ?? "").slice(0, 120);
      const label = `Checking facts on Wikidata: “${entity}”`;
      if (!entity.trim()) return { label, sources: [], result: { error: "No entity given." } };
      try {
        const { facts, cached: hit } = await lookupWikidata(entity, { signal: ctx.signal });
        logSource("wikidata", true, hit, facts ? 1 : 0);
        if (!facts || !facts.facts.length) return { label, sources: [], result: { results: [], note: "Wikidata has no matching item with usable facts. Try search_wikipedia." } };
        const src = reg.add({ kind: "wikidata", title: `${facts.label} (Wikidata)`, url: facts.url, snippet: clip(facts.description, 180) });
        return {
          label,
          sources: [src],
          result: { ref: src.ref, item: facts.label, description: facts.description, facts: facts.facts.map((f) => `${f.property}: ${f.values.join("; ")}`), wikipedia: facts.wikipedia ?? null, note: "Dates are YYYY-MM-DD. Check that this item is the thing the student meant (see description)." },
        };
      } catch (e) {
        return failed(label, "Wikidata", e);
      }
    }

    case "search_research": {
      const doi = typeof args.doi === "string" ? args.doi : "";
      const fromYear = /^\d{4}$/.test(String(args.from_year ?? "")) ? Number(args.from_year) : undefined;
      const wantArxiv = args.source === "arxiv";
      const label = doi ? `Looking up DOI ${doi.slice(0, 60)}` : `Searching ${wantArxiv ? "arXiv" : "research papers"}: “${q}”`;
      const toResult = (papers: Paper[], via: string): ToolRun => {
        const sources = papers.map((p) => reg.add({ kind: "research", title: `${p.title}${p.year ? ` (${p.year})` : ""}`, url: p.url, snippet: clip([p.authors.join(", "), p.venue].filter(Boolean).join(" · "), 180) }));
        return {
          label,
          sources,
          result: papers.length
            ? {
                via,
                results: papers.map((p, i) => ({ ref: sources[i].ref, title: p.title, year: p.year, authors: p.authors, venue: p.venue, doi: p.doi, cited_by: p.citedBy, abstract: p.abstract || "(no abstract available)", open_access_pdf: p.openAccessUrl ?? null })),
                note: "Describe these as real papers found via the database; summarise only what the abstracts say.",
              }
            : { results: [], note: "No papers found. Say so; never invent papers." },
        };
      };
      try {
        if (doi) {
          const { paper, cached: hit } = await lookupDoi(doi, { signal: ctx.signal });
          logSource("crossref", true, hit, paper ? 1 : 0);
          if (paper) return toResult([paper], "Crossref");
        }
        if (!wantArxiv) {
          try {
            const { papers, cached: hit } = await searchOpenAlex(q, { fromYear, signal: ctx.signal });
            logSource("openalex", true, hit, papers.length);
            if (papers.length) return toResult(papers, "OpenAlex");
          } catch (e) {
            if ((e as Error)?.name === "AbortError" && ctx.signal?.aborted) throw e;
            logSource("openalex", false, false, 0); // fall back to arXiv below
          }
        }
        const { papers, cached: hit } = await searchArxiv(q, { signal: ctx.signal });
        logSource("arxiv", true, hit, papers.length);
        return toResult(papers, "arXiv");
      } catch (e) {
        return failed(label, "Research search", e);
      }
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
        // A redirect must not lead somewhere OLIS wouldn't have fetched directly
        const finalHost = (() => {
          try {
            return new URL(res.url || url).hostname;
          } catch {
            return "";
          }
        })();
        if (finalHost !== host && !cfg.trustedDomains.some((d) => finalHost === d || finalHost.endsWith("." + d)))
          return { label: `Reading ${host}`, sources: [], result: { error: "The page redirected to an untrusted site." } };
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
