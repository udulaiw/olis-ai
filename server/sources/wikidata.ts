// ─────────────────────────────────────────────
// Wikidata: structured facts (CC0) for precise questions about a named thing:
// "Who discovered Neptune?", "When was Isaac Newton born?", "Atomic number of
// sodium?", "Capital of Sri Lanka?". Two or three small API calls:
//   1. wbsearchentities   → the best matching item (Q-id)
//   2. wbgetentities      → its labels, description and claims
//   3. wbgetentities      → labels of the items those claims point to
// Only a curated set of education-relevant properties is returned, so the model
// gets a short, exact fact sheet instead of a raw dump. Cached (public data).
// ─────────────────────────────────────────────
import { cached, cacheKey } from "./cache.js";
import { getJson } from "./http.js";

const API = "https://www.wikidata.org/w/api.php";

/** Property → label, in the order they are shown. */
export const FACT_PROPERTIES: Record<string, string> = {
  P31: "instance of",
  P279: "subclass of",
  P61: "discoverer or inventor",
  P575: "time of discovery or invention",
  P571: "inception",
  P569: "date of birth",
  P19: "place of birth",
  P570: "date of death",
  P20: "place of death",
  P27: "country of citizenship",
  P106: "occupation",
  P101: "field of work",
  P166: "award received",
  P800: "notable work",
  P50: "author",
  P577: "publication date",
  P17: "country",
  P36: "capital",
  P35: "head of state",
  P6: "head of government",
  P37: "official language",
  P38: "currency",
  P1082: "population",
  P2046: "area",
  P2044: "elevation above sea level",
  P2043: "length",
  P885: "origin of the watercourse",
  P403: "mouth of the watercourse",
  P625: "coordinate location",
  P1086: "atomic number",
  P246: "element symbol",
  P274: "chemical formula",
  P2067: "mass",
  P2120: "radius",
  P2583: "distance from Earth",
  P397: "parent astronomical body",
  P2146: "orbital period",
  P2101: "melting point",
  P2102: "boiling point",
  P2054: "density",
  P2068: "thermal conductivity",
  P1120: "number of deaths",
  P580: "start time",
  P582: "end time",
  P585: "point in time",
  P276: "location",
  P710: "participant",
  P1269: "facet of",
};

type Snak = { datavalue?: { type: string; value: unknown } };
type Claim = { mainsnak: Snak; rank?: string; qualifiers?: Record<string, Snak[]> };
type Entity = { id: string; labels?: Record<string, { value: string }>; descriptions?: Record<string, { value: string }>; claims?: Record<string, Claim[]>; sitelinks?: Record<string, { title: string }> };

export interface WikidataFacts {
  id: string;
  label: string;
  description: string;
  url: string;
  wikipedia?: string;
  facts: { property: string; values: string[] }[];
}

const pickLabel = (e: Entity | undefined, langs: string[]) => {
  for (const l of langs) if (e?.labels?.[l]) return e.labels[l].value;
  return e ? Object.values(e.labels ?? {})[0]?.value ?? e.id : "";
};

function formatTime(v: { time: string; precision: number }): string {
  const m = v.time.match(/^([+-])(\d+)-(\d\d)-(\d\d)/);
  if (!m) return v.time;
  const year = `${m[1] === "-" ? "-" : ""}${parseInt(m[2], 10)}`;
  if (v.precision <= 9) return year + (m[1] === "-" ? " (BCE)" : "");
  if (v.precision === 10) return `${year}-${m[3]}`;
  return `${year}-${m[3]}-${m[4]}`;
}

/** Look up facts about the entity best matching `query`. Null when nothing matches. */
export async function lookupWikidata(query: string, opts: { lang?: "en" | "si" | "ta"; signal?: AbortSignal } = {}): Promise<{ facts: WikidataFacts | null; cached: boolean }> {
  const lang = opts.lang ?? "en";
  const langs = [lang, "en"];
  const { value, hit } = await cached(cacheKey("wikidata", lang, query), 24 * 3600, async () => {
    const search = await getJson<{ search?: { id: string }[] }>(
      "wikidata",
      `${API}?action=wbsearchentities&format=json&origin=*&type=item&limit=1&language=${lang}&uselang=${lang}&search=${encodeURIComponent(query.slice(0, 120))}`,
      { signal: opts.signal, timeoutMs: 6000 },
    );
    // Sinhala/Tamil names are often missing on Wikidata: retry in English
    let id = search.search?.[0]?.id;
    if (!id && lang !== "en") {
      const en = await getJson<{ search?: { id: string }[] }>("wikidata", `${API}?action=wbsearchentities&format=json&origin=*&type=item&limit=1&language=en&search=${encodeURIComponent(query.slice(0, 120))}`, { signal: opts.signal, timeoutMs: 6000 });
      id = en.search?.[0]?.id;
    }
    if (!id) return null;
    const got = await getJson<{ entities?: Record<string, Entity> }>(
      "wikidata",
      `${API}?action=wbgetentities&format=json&origin=*&ids=${id}&props=labels|descriptions|claims|sitelinks&languages=${[...new Set(langs)].join("|")}&sitefilter=${lang}wiki|enwiki`,
      { signal: opts.signal, timeoutMs: 6000 },
    );
    const e = got.entities?.[id];
    if (!e) return null;

    // Collect values; entity values need their labels (one more batched call)
    const raw: { property: string; values: ({ ref: string } | string)[] }[] = [];
    const refs = new Set<string>();
    for (const [pid, label] of Object.entries(FACT_PROPERTIES)) {
      const claims = (e.claims?.[pid] ?? []).filter((c) => c.rank !== "deprecated");
      // preferred-rank claims first (e.g. the current population), at most 4 values
      const sorted = [...claims].sort((a, b) => (b.rank === "preferred" ? 1 : 0) - (a.rank === "preferred" ? 1 : 0)).slice(0, pid === "P1082" ? 1 : 4);
      const values: ({ ref: string } | string)[] = [];
      for (const c of sorted) {
        const dv = c.mainsnak.datavalue;
        if (!dv) continue;
        const v = dv.value as Record<string, unknown>;
        if (dv.type === "wikibase-entityid") {
          const qid = String(v.id);
          refs.add(qid);
          values.push({ ref: qid });
        } else if (dv.type === "time") values.push(formatTime(v as { time: string; precision: number }));
        else if (dv.type === "quantity") {
          const unit = String(v.unit ?? "1");
          const amount = String(v.amount).replace(/^\+/, "");
          const when = c.qualifiers?.P585?.[0]?.datavalue?.value as { time: string; precision: number } | undefined;
          if (unit !== "1") {
            const uq = unit.split("/").pop()!;
            refs.add(uq);
            values.push(`${amount} {${uq}}${when ? ` (${formatTime(when)})` : ""}`);
          } else values.push(`${amount}${when ? ` (${formatTime(when)})` : ""}`);
        } else if (dv.type === "string") values.push(String(dv.value));
        else if (dv.type === "monolingualtext") values.push(String(v.text));
        else if (dv.type === "globecoordinate") values.push(`${Number(v.latitude).toFixed(3)}, ${Number(v.longitude).toFixed(3)}`);
      }
      if (values.length) raw.push({ property: label, values });
    }
    const labels = new Map<string, string>();
    const ids = [...refs].slice(0, 50);
    if (ids.length) {
      const l = await getJson<{ entities?: Record<string, Entity> }>("wikidata", `${API}?action=wbgetentities&format=json&origin=*&ids=${ids.join("|")}&props=labels&languages=${[...new Set(langs)].join("|")}`, {
        signal: opts.signal,
        timeoutMs: 6000,
      }).catch(() => ({ entities: {} as Record<string, Entity> }));
      for (const qid of ids) labels.set(qid, pickLabel(l.entities?.[qid], langs));
    }
    const resolve = (v: { ref: string } | string) => (typeof v === "string" ? v.replace(/\{(Q\d+)\}/g, (_m, q) => labels.get(q) ?? "") .trim() : labels.get(v.ref) ?? v.ref);
    const wikiTitle = e.sitelinks?.[`${lang}wiki`]?.title ?? e.sitelinks?.enwiki?.title;
    const wikiLang = e.sitelinks?.[`${lang}wiki`] ? lang : "en";
    const facts: WikidataFacts = {
      id,
      label: pickLabel(e, langs),
      description: e.descriptions?.[lang]?.value ?? e.descriptions?.en?.value ?? "",
      url: `https://www.wikidata.org/wiki/${id}`,
      ...(wikiTitle ? { wikipedia: `https://${wikiLang}.wikipedia.org/wiki/${encodeURIComponent(wikiTitle.replace(/ /g, "_"))}` } : {}),
      facts: raw.map((f) => ({ property: f.property, values: f.values.map(resolve).filter(Boolean) })).filter((f) => f.values.length),
    };
    return facts;
  });
  return { facts: value, cached: hit };
}
