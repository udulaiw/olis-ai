// Wikipedia (MediaWiki Action API) in English, Sinhala or Tamil, with the
// article's lead image from Wikimedia Commons when it is freely licensed.
// Text: CC BY-SA 4.0. Results are cached (public data).
import { cached, cacheKey } from "./cache.js";
import { clip, getJson } from "./http.js";

export type WikiLang = "en" | "si" | "ta";
export interface WikiPage {
  title: string;
  url: string;
  summary: string;
  lang: WikiLang;
  /** Lead image on Wikimedia Commons (free licence only), for "see the diagram" links. */
  image?: { file: string; url: string; commons: string };
}

const base = (lang: WikiLang) => (lang === "en" && process.env.WIKIPEDIA_BASE_URL ? process.env.WIKIPEDIA_BASE_URL.replace(/\/$/, "") : `https://${lang}.wikipedia.org`);

export async function searchWikipedia(query: string, opts: { lang?: WikiLang; limit?: number; signal?: AbortSignal } = {}): Promise<{ pages: WikiPage[]; cached: boolean }> {
  const lang = opts.lang ?? "en";
  const limit = Math.min(5, Math.max(1, opts.limit ?? 3));
  const { value, hit } = await cached(cacheKey("wikipedia", lang, query, limit), 6 * 3600, async () => {
    const url =
      `${base(lang)}/w/api.php?action=query&format=json&formatversion=2&origin=*&generator=search&gsrsearch=${encodeURIComponent(query)}&gsrlimit=${limit}` +
      `&prop=extracts|info|pageimages&exintro=1&explaintext=1&exchars=1200&inprop=url&piprop=thumbnail|name&pithumbsize=640&pilicense=free`;
    type Page = { title: string; index?: number; extract?: string; fullurl?: string; pageimage?: string; thumbnail?: { source: string } };
    const data = await getJson<{ query?: { pages?: Page[] | Record<string, Page> } }>("wikipedia", url, { signal: opts.signal });
    const raw = data.query?.pages ?? [];
    return (Array.isArray(raw) ? raw : Object.values(raw))
      .filter((p) => p.extract)
      .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
      .map(
        (p): WikiPage => ({
          title: p.title,
          url: p.fullurl ?? `${base(lang)}/wiki/${encodeURIComponent(p.title.replace(/ /g, "_"))}`,
          summary: clip(p.extract!, 1200),
          lang,
          ...(p.pageimage && p.thumbnail ? { image: { file: p.pageimage, url: p.thumbnail.source, commons: `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(p.pageimage)}` } } : {}),
        }),
      );
  });
  return { pages: value ?? [], cached: hit };
}
