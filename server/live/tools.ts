// Live-data tools. Free, keyless public APIs (fixed hosts only, so no SSRF):
//   crypto  → CoinGecko simple price          (optional COINGECKO_API_KEY = demo key, higher limits)
//   fx      → open.er-api.com (daily reference rates)
//   weather → Open-Meteo geocoding + forecast
//   news / sports → Google News RSS (Sri Lanka edition)
//   web     → Tavily (if TAVILY_API_KEY) else Google News RSS search
//
// Every result carries source, retrieved_at and data_timestamp. A failure returns ok:false
// with a reason; it never throws and never fills in a value.
import type { Config } from "../config.js";
import type { LiveDomain, LiveQuery } from "./detect.js";

export interface LiveItem {
  title: string;
  url: string;
  source: string;
  published: string | null;
}

export interface LiveResult {
  ok: boolean;
  domain: LiveDomain;
  /** Short label for the step / source card, e.g. "Bitcoin price". */
  label: string;
  source: { name: string; url: string };
  /** When OLIS fetched it (ISO). */
  retrievedAt: string;
  /** When the data itself was last updated, if the provider says (ISO). */
  dataTimestamp: string | null;
  /** Compact facts for the model. */
  data?: Record<string, unknown>;
  items?: LiveItem[];
  /** Caveat the answer must carry (e.g. "daily reference rate"). */
  note?: string;
  error?: string;
}

const UA = "OLIS-AI-Beta/0.5 (student learning assistant; https://github.com/udulaiw/olis-ai)";
const TIMEOUT = 7000;
const sig = (outer?: AbortSignal) => (outer ? AbortSignal.any([outer, AbortSignal.timeout(TIMEOUT)]) : AbortSignal.timeout(TIMEOUT));
const iso = (ms: number) => (Number.isFinite(ms) && ms > 0 ? new Date(ms).toISOString() : null);

async function getJSON<T>(url: string, signal?: AbortSignal, headers: Record<string, string> = {}): Promise<T> {
  const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json", ...headers }, signal: sig(signal) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as T;
}

const COIN_NAMES: Record<string, string> = {
  bitcoin: "Bitcoin (BTC)", ethereum: "Ethereum (ETH)", solana: "Solana (SOL)", binancecoin: "BNB", ripple: "XRP", dogecoin: "Dogecoin (DOGE)",
  cardano: "Cardano (ADA)", tether: "Tether (USDT)", tron: "TRON (TRX)", litecoin: "Litecoin (LTC)", "the-open-network": "Toncoin (TON)",
};

async function crypto(cfg: Config, q: LiveQuery, signal?: AbortSignal): Promise<LiveResult> {
  const ids = q.coins?.length ? q.coins : ["bitcoin"];
  const base: LiveResult = {
    ok: false, domain: "crypto", label: `${ids.map((i) => COIN_NAMES[i] ?? i).join(", ")} price`,
    source: { name: "CoinGecko", url: `https://www.coingecko.com/en/coins/${ids[0]}` }, retrievedAt: new Date().toISOString(), dataTimestamp: null,
  };
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids.join(",")}&vs_currencies=usd,lkr&include_24hr_change=true&include_last_updated_at=true`;
  const data = await getJSON<Record<string, { usd?: number; lkr?: number; usd_24h_change?: number; last_updated_at?: number }>>(
    url, signal, cfg.coingeckoKey ? { "x-cg-demo-api-key": cfg.coingeckoKey } : {},
  );
  const coins = ids.filter((id) => typeof data[id]?.usd === "number").map((id) => ({
    coin: COIN_NAMES[id] ?? id,
    usd: data[id].usd,
    lkr: data[id].lkr ?? null,
    change_24h_percent: typeof data[id].usd_24h_change === "number" ? Math.round(data[id].usd_24h_change! * 100) / 100 : null,
    updated_at: iso((data[id].last_updated_at ?? 0) * 1000),
  }));
  if (!coins.length) return { ...base, error: "CoinGecko returned no price for that coin." };
  const newest = Math.max(...ids.map((id) => (data[id]?.last_updated_at ?? 0) * 1000));
  return { ...base, ok: true, dataTimestamp: iso(newest), data: { prices: coins }, note: "Crypto prices move every second; this is a snapshot from the time shown." };
}

async function fx(q: LiveQuery, signal?: AbortSignal): Promise<LiveResult> {
  const b = (q.base ?? "USD").toUpperCase();
  const t = (q.target ?? "LKR").toUpperCase();
  const base: LiveResult = {
    ok: false, domain: "fx", label: `${b} to ${t} exchange rate`, source: { name: "ExchangeRate-API (open.er-api.com)", url: "https://www.exchangerate-api.com" },
    retrievedAt: new Date().toISOString(), dataTimestamp: null,
  };
  const data = await getJSON<{ result?: string; time_last_update_unix?: number; rates?: Record<string, number> }>(`https://open.er-api.com/v6/latest/${b}`, signal);
  const rate = data.rates?.[t];
  if (data.result !== "success" || typeof rate !== "number") return { ...base, error: `No ${b}→${t} rate available.` };
  return {
    ...base, ok: true, dataTimestamp: iso((data.time_last_update_unix ?? 0) * 1000),
    data: { base: b, target: t, rate: Math.round(rate * 10000) / 10000, inverse: Math.round((1 / rate) * 1e6) / 1e6 },
    note: "This is a daily mid-market reference rate (updated about once a day). Bank and exchange-counter buying/selling rates differ; for official rates see the Central Bank of Sri Lanka.",
  };
}

const WMO: Record<number, string> = {
  0: "clear sky", 1: "mainly clear", 2: "partly cloudy", 3: "overcast", 45: "fog", 48: "fog", 51: "light drizzle", 53: "drizzle", 55: "heavy drizzle",
  61: "light rain", 63: "rain", 65: "heavy rain", 66: "freezing rain", 67: "freezing rain", 71: "light snow", 73: "snow", 75: "heavy snow",
  80: "light showers", 81: "showers", 82: "heavy showers", 95: "thunderstorm", 96: "thunderstorm with hail", 99: "thunderstorm with hail",
};

async function weather(q: LiveQuery, signal?: AbortSignal): Promise<LiveResult> {
  const asked = (q.place ?? "").trim();
  const place = asked || "Colombo";
  const base: LiveResult = {
    ok: false, domain: "weather", label: `Weather in ${place}`, source: { name: "Open-Meteo", url: "https://open-meteo.com" },
    retrievedAt: new Date().toISOString(), dataTimestamp: null,
  };
  const geo = await getJSON<{ results?: { name: string; country?: string; admin1?: string; latitude: number; longitude: number }[] }>(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(place)}&count=1&language=en&format=json`, signal,
  );
  const g = geo.results?.[0];
  if (!g) return { ...base, error: `Couldn't find a place called "${place}".` };
  const f = await getJSON<{
    utc_offset_seconds?: number;
    current?: { time: string; temperature_2m?: number; apparent_temperature?: number; relative_humidity_2m?: number; precipitation?: number; weather_code?: number; wind_speed_10m?: number };
    daily?: { time: string[]; weather_code: number[]; temperature_2m_max: number[]; temperature_2m_min: number[]; precipitation_probability_max?: (number | null)[]; precipitation_sum?: number[] };
  }>(
    `https://api.open-meteo.com/v1/forecast?latitude=${g.latitude}&longitude=${g.longitude}&current=temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum&timezone=auto&forecast_days=3`,
    signal,
  );
  if (!f.current) return { ...base, error: "No current weather returned." };
  // Open-Meteo's times are local (no offset): convert with utc_offset_seconds
  const localToIso = (t: string) => iso(Date.parse(`${t}:00Z`) - (f.utc_offset_seconds ?? 0) * 1000);
  const days = (f.daily?.time ?? []).map((d, i) => ({
    date: d,
    conditions: WMO[f.daily!.weather_code[i]] ?? `code ${f.daily!.weather_code[i]}`,
    max_c: f.daily!.temperature_2m_max[i],
    min_c: f.daily!.temperature_2m_min[i],
    rain_chance_percent: f.daily!.precipitation_probability_max?.[i] ?? null,
    rain_mm: f.daily!.precipitation_sum?.[i] ?? null,
  }));
  return {
    ...base, ok: true, label: `Weather in ${g.name}`, dataTimestamp: localToIso(f.current.time),
    data: {
      place: [g.name, g.admin1, g.country].filter(Boolean).join(", "),
      place_assumed: !asked,
      now: {
        conditions: WMO[f.current.weather_code ?? -1] ?? null, temperature_c: f.current.temperature_2m, feels_like_c: f.current.apparent_temperature,
        humidity_percent: f.current.relative_humidity_2m, rain_mm: f.current.precipitation, wind_kmh: f.current.wind_speed_10m,
      },
      forecast: days,
    },
    note: asked ? undefined : "The student didn't name a place: this is Colombo. Say so and ask for their town.",
  };
}

const decode = (s: string) =>
  s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/<[^>]+>/g, "").trim();

/** Minimal RSS parser for Google News (title, link, pubDate, source). */
export function parseNewsRss(xml: string, max = 6): LiveItem[] {
  const items: LiveItem[] = [];
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const body = m[1];
    const tag = (t: string) => body.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)<\\/${t}>`))?.[1];
    const source = decode(tag("source") ?? "");
    let title = decode(tag("title") ?? "");
    if (source && title.endsWith(` - ${source}`)) title = title.slice(0, -(source.length + 3));
    const link = decode(tag("link") ?? "");
    const pub = tag("pubDate");
    if (title && /^https?:\/\//.test(link)) items.push({ title, url: link, source: source || "Google News", published: pub ? iso(Date.parse(decode(pub))) : null });
  }
  return items.sort((a, b) => Date.parse(b.published ?? "0") - Date.parse(a.published ?? "0")).slice(0, max);
}

async function news(q: LiveQuery, signal?: AbortSignal): Promise<LiveResult> {
  const query = (q.query ?? "").trim();
  const url = query
    ? `https://news.google.com/rss/search?q=${encodeURIComponent(query + (q.domain === "sports" ? " when:3d" : " when:7d"))}&hl=en-LK&gl=LK&ceid=LK:en`
    : "https://news.google.com/rss?hl=en-LK&gl=LK&ceid=LK:en";
  const base: LiveResult = {
    ok: false, domain: q.domain, label: query ? `Latest news: ${query}` : "Today's headlines", source: { name: "Google News", url: url.replace("/rss", "") },
    retrievedAt: new Date().toISOString(), dataTimestamp: null,
  };
  const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/rss+xml, application/xml, text/xml" }, signal: sig(signal) });
  if (!res.ok) return { ...base, error: `News feed unavailable (HTTP ${res.status}).` };
  const items = parseNewsRss(await res.text());
  if (!items.length) return { ...base, error: "No recent news found for that." };
  return {
    ...base, ok: true, items, dataTimestamp: items[0].published,
    note: "Headlines only: report what they say, cite them, and don't add details that aren't in them.",
  };
}

async function web(cfg: Config, q: LiveQuery, signal?: AbortSignal): Promise<LiveResult> {
  if (!cfg.tavilyKey) return news({ ...q, domain: "web" }, signal);
  const base: LiveResult = {
    ok: false, domain: "web", label: `Web search: ${q.query}`, source: { name: "Web search (Tavily)", url: "https://tavily.com" },
    retrievedAt: new Date().toISOString(), dataTimestamp: null,
  };
  const res = await fetch(`${cfg.tavilyBase}/search`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.tavilyKey}` },
    body: JSON.stringify({ query: q.query, max_results: 5, search_depth: "basic", include_answer: false }),
    signal: sig(signal),
  });
  if (!res.ok) return news({ ...q, domain: "web" }, signal); // fall back to news headlines
  const data = (await res.json()) as { results?: { title: string; url: string; content: string; published_date?: string }[] };
  const items = (data.results ?? []).slice(0, 5).map((r) => ({ title: r.title, url: r.url, source: hostOf(r.url), published: r.published_date ? iso(Date.parse(r.published_date)) : null, content: r.content.slice(0, 600) }));
  if (!items.length) return { ...base, error: "No web results." };
  const dated = items.map((i) => Date.parse(i.published ?? "")).filter(Number.isFinite);
  return { ...base, ok: true, items, dataTimestamp: dated.length ? iso(Math.max(...dated)) : null, note: "Search results can be out of date: use each result's own date, and say when a result has no date." };
}

const hostOf = (u: string) => {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return u;
  }
};

/** Run the live tool for a query. Never throws. */
export async function fetchLive(cfg: Config, q: LiveQuery, signal?: AbortSignal): Promise<LiveResult> {
  const t0 = new Date().toISOString();
  try {
    switch (q.domain) {
      case "crypto": return await crypto(cfg, q, signal);
      case "fx": return await fx(q, signal);
      case "weather": return await weather(q, signal);
      case "news":
      case "sports": return await news(q, signal);
      default: return await web(cfg, q, signal);
    }
  } catch (e) {
    if ((e as Error).name === "AbortError" && signal?.aborted) throw e;
    return { ok: false, domain: q.domain, label: "Live data", source: { name: "live data", url: "" }, retrievedAt: t0, dataTimestamp: null, error: (e as Error).name === "TimeoutError" ? "The data source timed out." : "The data source couldn't be reached." };
  }
}
