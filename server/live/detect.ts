// Time-sensitive query detection: does this question need data that changes
// over time (prices, rates, weather, news, scores, "latest X")?
//
// Rules only (English, Sinhala, Singlish). Model knowledge is never treated as
// current: anything matched here is answered from a live source or not at all.

export type LiveDomain = "crypto" | "fx" | "weather" | "news" | "sports" | "web";

export interface LiveQuery {
  domain: LiveDomain;
  /** crypto: CoinGecko ids */
  coins?: string[];
  /** fx: ISO currency codes */
  base?: string;
  target?: string;
  /** weather: place name ("" = not given) */
  place?: string;
  /** news / sports / web: search terms */
  query?: string;
}

// ── Cues ──────────────────────────────────────────────────────────────────────
/** "now / today / latest / current" in English, Sinhala and Singlish. */
// "current" and "live" alone are NOT cues: "electric current", "where do lions live"
const NOW = /\b(now|right now|currently|today'?s?|tonight|tomorrow|yesterday|latest|newest|recent(ly)?|this (week|month|year)|at the moment)\b|දැන්|අද|හෙට|ඊයේ|දැනට|වර්තමාන|අලුත්ම|නවතම|\b(dan|ada|heta|iye|aluthma|aluth)\b/i;
const PRICE = /\b(price|prices|rate|rates|cost|costs|value|worth|trading|how much|kiyada|keeyada|ganan|gana|gaana)\b|මිල|කීයද|ගාන|වටිනාකම/i;

// ── Crypto ────────────────────────────────────────────────────────────────────
const COINS: [RegExp, string][] = [
  [/\b(bitcoin|btc)\b|බිට්කොයින්/i, "bitcoin"],
  [/\b(ethereum|eth|ether)\b|ඊතීරියම්/i, "ethereum"],
  [/\b(solana|sol)\b/i, "solana"],
  [/\b(bnb|binance coin)\b/i, "binancecoin"],
  [/\b(xrp|ripple)\b/i, "ripple"],
  [/\b(dogecoin|doge)\b/i, "dogecoin"],
  [/\b(cardano|ada coin)\b/i, "cardano"],
  [/\b(tether|usdt)\b/i, "tether"],
  [/\b(tron|trx)\b/i, "tron"],
  [/\b(litecoin|ltc)\b/i, "litecoin"],
  [/\b(toncoin|ton coin)\b/i, "the-open-network"],
];
const CRYPTO_WORD = /\b(crypto|cryptocurrency|coin price)\b|ක්‍රිප්ටෝ/i;

// ── Currencies ────────────────────────────────────────────────────────────────
const CODES = "USD|LKR|EUR|GBP|INR|JPY|AUD|CAD|AED|SAR|QAR|KWD|OMR|BHD|SGD|CNY|CHF|NZD|MYR|THB|KRW|PKR|BDT|MVR|ILS|RUB";
const WORDS: [RegExp, string][] = [
  [/\b(us )?dollars?\b|ඩොලර්|\bdollar(e|a|eke)?\b/i, "USD"],
  [/\brupees?\b.*\b(sri lanka|lankan|lkr)\b|\b(sri lankan|lankan) rupees?\b|රුපියල්|\brupiyal\b/i, "LKR"],
  [/\bindian rupees?\b/i, "INR"],
  [/\beuros?\b|යුරෝ/i, "EUR"],
  [/\b(pounds?|sterling)\b|පවුම්/i, "GBP"],
  [/\byen\b/i, "JPY"],
  [/\bdirhams?\b/i, "AED"],
  [/\briyals?\b/i, "SAR"],
  [/\bdinars?\b/i, "KWD"],
];
const FX_WORD = /\b(exchange rate|currency|forex|fx|convert)\b|විනිමය|\bdollar rate\b|ඩොලර් එකේ|ඩොලර් රේට්/i;

function currencies(q: string): string[] {
  const out: { code: string; at: number }[] = [];
  for (const m of q.matchAll(new RegExp(`\\b(${CODES})\\b`, "gi"))) out.push({ code: m[1].toUpperCase(), at: m.index ?? 0 });
  for (const [re, code] of WORDS) {
    const m = q.match(re);
    if (m && !out.some((o) => o.code === code)) out.push({ code, at: m.index ?? 0 });
  }
  return out.sort((a, b) => a.at - b.at).map((o) => o.code);
}

// ── Weather ───────────────────────────────────────────────────────────────────
const WEATHER = /\b(weather|forecast|temperature|rain(ing)?|will it rain|humidity|sunny|hot today|monsoon today)\b|කාලගුණ|වැස්ස|වැහි|උෂ්ණත්වය|\b(kalaguna|wahinawada|wahida|wessa)\b/i;
function weatherPlace(q: string): string {
  const m =
    q.match(/\b(?:weather|forecast|temperature|rain)\s+(?:in|at|for|of)\s+([A-Za-z][A-Za-z .'-]{1,40}?)(?:\s+(?:today|tomorrow|now|this week|right now))?\s*[?.!]*$/i) ??
    q.match(/\b(?:in|at)\s+([A-Z][A-Za-z .'-]{1,40}?)\s+(?:today|tomorrow|now)\b/) ??
    q.match(/^([A-Z][A-Za-z .'-]{1,30}?)\s+weather\b/i) ??
    q.match(/([඀-෿]{2,})\s*(?:වල|ට|හි)?\s*කාලගුණ/) ??
    q.match(/\b(?:in|at|for)\s+([A-Z][A-Za-z.'-]{2,30}(?:\s+[A-Z][A-Za-z.'-]{2,30})?)/);
  return m ? m[1].trim().replace(/\s+(today|tomorrow|now)$/i, "") : "";
}

// ── News / sports / other current ─────────────────────────────────────────────
const NEWS = /\b(news|headlines?|what('?s| is) happening|what happened|current events|breaking|announce(d|ment)?)\b|පුවත්|ප්‍රවෘත්ති|\b(puwath|aluth puwath)\b/i;
const SPORTS = /\b(match|matches|score|scores|scorecard|who won|won the|result of|fixture|tournament|world cup|ipl|lpl|test match|odi|t20|premier league|cricket|football|rugby)\b|තරගය|ලකුණු|කවුද දිනුවේ|දිනුවේ/i;
const CURRENT_THING = /\b(latest|newest)\s+[a-z0-9]|\bcurrent (price|rate|president|prime minister|ceo|version|model|champion|world record|leader|government)\b|\bcurrent\b.{0,25}\b(price|rate)\b|\b(gold|silver|oil|petrol|diesel|fuel|gas|share|stock) (price|rate)s?\b/i;
const ROLE_NOW = /\bwho is (the )?(current )?(president|prime minister|ceo|minister|governor|captain|chairman|chancellor)\b/i;
const EDU_NOW = /\b(syllabus|past paper|marking scheme|a\/l|o\/l|exam)\b/i;

const FILLER = /\b(what('?s| is| are)?|the|a|an|of|in|for|me|tell|show|give|please|right|now|today|current(ly)?|latest|recent|news|about|on|is|are|was|did|do|does|how|much|price|rate|kiyada|dan|ada|eka|ekak|mokakda|happening|happened)\b|[?!.,]/gi;
const topicOf = (q: string) => q.replace(FILLER, " ").replace(/\s+/g, " ").trim().slice(0, 80);

/**
 * Returns what live data the question needs, or null when model knowledge / OLIS notes are enough.
 * `expanded` is the English-expanded retrieval text (adds terms like "price" for "මිල").
 */
export function detectLive(question: string, expanded = ""): LiveQuery | null {
  const q = question.normalize("NFC");
  const all = `${q} ${expanded}`;
  const now = NOW.test(all);
  const price = PRICE.test(all);

  // Crypto: a named coin with a price or "now" cue ("btc price eka dan kiyada?")
  const coins = COINS.filter(([re]) => re.test(q)).map(([, id]) => id);
  if (coins.length && (price || now)) return { domain: "crypto", coins: [...new Set(coins)].slice(0, 4) };
  if (CRYPTO_WORD.test(q) && (price || now)) return { domain: "crypto", coins: ["bitcoin", "ethereum"] };

  // Exchange rates: two currencies, or one + rate/price wording
  const cur = currencies(q);
  if ((FX_WORD.test(all) || (cur.length >= 1 && (price || now))) && cur.length) {
    const base = cur[0] === "LKR" && cur[1] ? cur[1] : cur[0];
    const target = cur.find((c) => c !== base) ?? (base === "LKR" ? "USD" : "LKR");
    return { domain: "fx", base, target };
  }

  if (WEATHER.test(all) && !/\bweathering\b/i.test(q)) return { domain: "weather", place: weatherPlace(q) };

  // Education questions that merely say "latest syllabus" stay with the knowledge base
  if (EDU_NOW.test(q) && !NEWS.test(q)) return null;

  if (SPORTS.test(q) && (now || /\b(who won|score|result)\b|දිනුවේ/i.test(q))) return { domain: "sports", query: topicOf(q) || "Sri Lanka cricket" };
  if (NEWS.test(all)) return { domain: "news", query: topicOf(q) };
  // Web searches keep the student's wording (minus punctuation): "who is the current president of Sri Lanka" searches better whole
  const whole = q.replace(/[?!.]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 100);
  if (ROLE_NOW.test(q)) return { domain: "web", query: whole };
  if ((now && price) || CURRENT_THING.test(q)) return { domain: "web", query: whole };
  return null;
}
