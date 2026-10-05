// Language detection, Singlish normalization, query expansion and follow-up
// resolution for OLIS. Pure functions, no network, shared by the server, the
// indexer and the tests.
//
// The student's original message is NEVER rewritten. Everything here produces
// a separate "retrieval query" used only for searching the knowledge base.
import { cleanSinhala, scriptStats } from "./unicode.mjs";
import { SI_TERMS, SI_INTENT, SINGLISH_FIX, SINGLISH_TERMS, SINGLISH_MARKERS, SINGLISH_WEAK } from "./glossary.mjs";

// ── Sinhala stemming ────────────────────────────────────────────────────────
// Sinhala is heavily inflected (වේගය / වේගයේ / වේගයෙන් / වේගයක් / වේගයට). A
// conservative suffix stripper lets one glossary entry or one note word match
// all of them. Longest suffix first; never leaves a stem shorter than 3 code
// points. Used for both indexing and querying, so it only has to be consistent.
const SI_SUFFIXES = ["වලින්", "වලට", "වලදී", "වල", "යෙන්", "යන්ගේ", "යන්ට", "යන්", "යේ", "යට", "යක්", "යෙක්", "ගේ", "ෙන්", "ක්", "ය", "ට", "ේ"].sort((a, b) => b.length - a.length);

/** @param {string} w */
export function stemSinhala(w) {
  for (const suf of SI_SUFFIXES) {
    if (w.length - suf.length >= 3 && w.endsWith(suf)) return w.slice(0, -suf.length);
  }
  return w;
}

const SI_WORD = /[\u0D80-\u0DFF\u200D]+/g;
const LATIN_WORD = /[a-z0-9']+/g;

// glossary lookups keyed by stem (built once)
const TERM_BY_STEM = new Map();
const PHRASES = [];
for (const [k, v] of Object.entries(SI_TERMS)) {
  const key = cleanSinhala(k);
  if (key.includes(" ")) PHRASES.push([key, v]);
  else TERM_BY_STEM.set(stemSinhala(key), v);
}
const INTENT_BY_WORD = new Map(Object.entries(SI_INTENT).map(([k, v]) => [cleanSinhala(k), v]));
// "කියන්නේ" (means) stems to "කියන්න" (say!), so intent words are matched stem-wise only when they are not that one
const INTENT_BY_STEM = new Map([...INTENT_BY_WORD].filter(([k]) => k !== "කියන්නේ").map(([k, v]) => [stemSinhala(k), v]));

// ── Language detection ──────────────────────────────────────────────────────

const ASK_EN = /\bin english\b|\benglish (eken|walin|ekata|ekak|wala)\b|\benglish(?:\s+)?(?:eken|walin)\b|ඉංග්\u200Dරීසියෙන්|ඉංග්\u200Dරීසි\s?වලින්|ඉංග්\u200Dරීසිෙන්|translate (it )?(in)?to english|reply in english|answer in english/i;
const ASK_SI = /\bin sinhala\b|\bsinhalen\b|\bsinhala (eken|walin|ekata|wala)\b|සිංහලෙන්|සිංහල\s?වලින්|සිංහලට|reply in sinhala|answer in sinhala|translate (it )?(in)?to sinhala/i;
const ASK_TA = /\bin tamil\b|\btamilil\b|தமிழில்|reply in tamil/i;

/**
 * Did the student explicitly ask for an answer language?
 * @returns {"en"|"si"|"ta"|null}
 */
export function explicitLanguageRequest(text) {
  const t = cleanSinhala(text);
  // Check the LAST mention first: "සිංහලෙන් නෙවෙයි, in English" → en
  const hits = [];
  for (const [lang, re] of [["en", ASK_EN], ["si", ASK_SI], ["ta", ASK_TA]]) {
    const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
    let m;
    while ((m = g.exec(t))) hits.push({ lang, at: m.index });
  }
  if (!hits.length) return null;
  return hits.sort((a, b) => b.at - a.at)[0].lang;
}

/** @param {string} text */
export function singlishWords(text) {
  return (text.toLowerCase().match(/[a-z]+/g) ?? []).map((w) => SINGLISH_FIX[w] ?? w);
}

/**
 * @param {string} text
 * @returns {"en"|"si"|"ta"|"singlish"|"mixed"}
 */
export function detectLanguage(text) {
  const st = scriptStats(text);
  const latinWords = (text.replace(/[\u0D80-\u0DFF஀-௿]/g, " ").match(/[A-Za-z]{2,}/g) ?? []).length;
  if (st.tamil > st.sinhala && st.tamil >= 2) return latinWords >= 2 ? "mixed" : "ta";
  if (st.sinhala >= 2) return latinWords >= 1 ? "mixed" : "si";
  const words = singlishWords(text);
  const markers = words.filter((w) => SINGLISH_MARKERS.has(w)).length;
  const weak = words.filter((w) => SINGLISH_WEAK.has(w)).length;
  // "Mata Hari was a spy" must stay English: weak words (could be names/English) only count with a real marker or with each other
  if (markers >= 2 || (markers >= 1 && (words.length <= 6 || markers / words.length >= 0.15 || weak >= 1)) || weak >= 3) return "singlish";
  return "en";
}

/**
 * Decide the reply language.
 *  - an explicit request ("in English", "සිංහලෙන්") always wins
 *  - then the student's saved preference (en / si)
 *  - then whatever they wrote; a short message with no language signal inherits from the previous student message
 * @param {{ question: string, pref?: "en"|"si"|"auto", history?: {role:string, content:string}[] }} a
 * @returns {{ reply: "en"|"si"|"si_mixed"|"ta", reason: string, detected: ReturnType<typeof detectLanguage> }}
 */
export function replyLanguage({ question, pref = "auto", history = [] }) {
  const detected = detectLanguage(question);
  const asked = explicitLanguageRequest(question);
  if (asked === "en") return { reply: "en", reason: "explicit request", detected };
  if (asked === "si") return { reply: detected === "mixed" || detected === "singlish" ? "si_mixed" : "si", reason: "explicit request", detected };
  if (asked === "ta") return { reply: "ta", reason: "explicit request", detected };
  if (pref === "en") return { reply: "en", reason: "profile: English", detected };
  if (pref === "si") return { reply: "si", reason: "profile: Sinhala", detected };
  if (detected === "si") return { reply: "si", reason: "wrote Sinhala", detected };
  if (detected === "ta") return { reply: "ta", reason: "wrote Tamil", detected };
  if (detected === "mixed" || detected === "singlish") return { reply: "si_mixed", reason: `wrote ${detected}`, detected };
  // English-looking: a very short, signal-free message ("ok", "more", "why?") keeps the previous language
  const words = (question.match(/[A-Za-z]+/g) ?? []).length;
  if (words <= 3) {
    const prev = [...history].reverse().find((m) => m.role === "user" && m.content.trim().length > 6);
    if (prev) {
      const d = detectLanguage(prev.content);
      if (d !== "en") return { reply: d === "si" || d === "ta" ? d : "si_mixed", reason: "inherited from previous message", detected };
    }
  }
  return { reply: "en", reason: "wrote English", detected };
}

// ── Normalization / query expansion ─────────────────────────────────────────

/**
 * Build English search terms from a Sinhala / Singlish / mixed message.
 * @param {string} question
 * @returns {{ normalized: string, terms: string[], expanded: string }}
 *   normalized: the cleaned original (NFC, shorthand fixed)
 *   terms: English concept terms found via the glossary
 *   expanded: original + terms, for BM25 + embedding
 */
export function expandQuery(question) {
  const clean = cleanSinhala(question);
  const terms = [];
  const add = (v) => v && terms.push(...v.split(" ").filter(Boolean));

  let rest = clean;
  for (const [phrase, en] of PHRASES) {
    if (rest.includes(phrase)) {
      add(en);
      rest = rest.split(phrase).join(" ");
    }
  }
  for (const w of rest.match(SI_WORD) ?? []) {
    if (INTENT_BY_WORD.has(w)) add(INTENT_BY_WORD.get(w));
    else {
      const st = stemSinhala(w);
      if (TERM_BY_STEM.has(st)) add(TERM_BY_STEM.get(st));
      else if (INTENT_BY_STEM.has(st)) add(INTENT_BY_STEM.get(st));
    }
  }

  const latin = clean.toLowerCase().replace(SI_WORD, " ");
  const fixed = [];
  for (const raw of latin.match(LATIN_WORD) ?? []) {
    const w = SINGLISH_FIX[raw] ?? raw;
    fixed.push(w);
    if (w in SINGLISH_TERMS) add(SINGLISH_TERMS[w]);
  }
  // "2nd law" / "1st" / "3rd" → words, so they match "second law" in the notes
  const ORD = { "1st": "first", "2nd": "second", "3rd": "third" };
  for (const m of clean.toLowerCase().match(/\b[123](?:st|nd|rd)\b/g) ?? []) add(ORD[m]);
  const normalized = clean.replace(/[a-z']+/gi, (m) => SINGLISH_FIX[m.toLowerCase()] ?? m);
  // For SEARCH, romanised-Sinhala function words ("wala", "kiyanne", "mokakda") carry no topic information
  // and would count as "unknown words" against an English knowledge base, so they are dropped. Their meaning is in `terms`.
  const forSearch = normalized.replace(/[A-Za-z']+/g, (m) => (SINGLISH_MARKERS.has(m.toLowerCase()) || m.toLowerCase() in SINGLISH_TERMS ? " " : m)).replace(/\s+/g, " ").trim();
  // "භෞතික විද්‍යාව" is "physics", not "physics science": a bare "science" would only pull in generic notes
  const uniq = [...new Set(terms)].filter((t) => !(t === "science" && terms.some((x) => ["physics", "chemistry", "biology"].includes(x))));
  return { normalized, terms: uniq, expanded: uniq.length ? `${forSearch} ${uniq.join(" ")}`.trim() : forSearch };
}

// ── Follow-ups ("මේක තේරෙන්නෙ නෑ", "සිංහලෙන් explain කරන්න") ───────────────────

const NOT_UNDERSTOOD = /තේරෙන්නේ?\s?නෑ|තේරෙන්නෙ\s?නෑ|තේරුනේ\s?නෑ|තේරුණේ\s?නෑ|තේරුණේ\s?නැහැ|තේරෙන්නේ\s?නැහැ|තේරුම්\s?ගන්න\s?බෑ|\b(therenne|therune|theruna)\s?(naha|na|naa)\b|don'?t (get|understand)|confus|not clear|didn'?t understand|i'?m lost/i;
const ANAPHORA = /(මේක|මේකේ|මේකට|ඒක|ඒකට|මෙය|මෙම|මේ)(?![\u0D80-\u0DFF])|\b(meka|meke|mekata|eka|ekata|this|that|it|previous|above)\b/i;
const MORE = /^\s*(තව|තවත්|thawa|thawath|more|continue|next|go on|ඊළඟ)\b|තව\s?(ටිකක්|පැහැදිලි|විස්තර)|explain more|in more detail/i;
const SIMPLER = /සරලව|ලේසියෙන්|simpler|simply|like i'?m (5|five|a beginner)|saralawa|podi.*pahadili/i;

/**
 * Detect that the message only makes sense with the previous exchange.
 * @param {string} question
 * @param {{role:string, content:string}[]} history  messages BEFORE this one
 * @returns {{ isFollowUp: boolean, kind: "not_understood"|"language_switch"|"more"|"simpler"|"anaphora"|null, referent: string|null, retrievalQuery: string, hint: string }}
 */
export function resolveFollowUp(question, history) {
  const prevUser = [...history].reverse().find((m) => m.role === "user" && m.content.trim().length > 12);
  const q = cleanSinhala(question);
  const contentWords = (expandQuery(q).terms.length) + (q.match(/[A-Za-z]{4,}/g) ?? []).filter((w) => !SINGLISH_MARKERS.has(w.toLowerCase())).length;
  const short = q.trim().length <= 70;

  let kind = null;
  if (NOT_UNDERSTOOD.test(q)) kind = "not_understood";
  else if (short && explicitLanguageRequest(q) && contentWords <= 3) kind = "language_switch";
  else if (short && SIMPLER.test(q) && contentWords <= 3) kind = "simpler";
  else if (short && MORE.test(q)) kind = "more";
  else if (short && ANAPHORA.test(q) && contentWords <= 2) kind = "anaphora";

  if (!kind || !prevUser) return { isFollowUp: false, kind: null, referent: null, retrievalQuery: expandQuery(q).expanded, hint: "" };

  const referent = prevUser.content.trim().slice(0, 240);
  const prevExpanded = expandQuery(referent).expanded;
  const labels = {
    not_understood: "The student did not understand the previous explanation. Re-explain the SAME concept in a different, simpler way (new analogy or smaller steps). Do not repeat the same words.",
    language_switch: "The student wants the previous explanation in another language. Re-present the SAME content in the requested language; do not start a new topic.",
    more: "The student wants more depth on the previous topic. Continue from where the last answer stopped; don't repeat it.",
    simpler: "The student wants the previous explanation simpler. Re-explain the SAME concept for a beginner.",
    anaphora: "The student's message refers back to the previous exchange (\"this\" / \"මේක\" / \"meka\").",
  };
  return {
    isFollowUp: true,
    kind,
    referent,
    retrievalQuery: `${prevExpanded} ${expandQuery(q).terms.join(" ")}`.trim(),
    hint: `${labels[kind]} The topic is whatever the previous student question was about: "${referent}".`,
  };
}

// ── Level (O/L vs A/L) ──────────────────────────────────────────────────────

/**
 * Work out which exam level the student is on.
 * Explicit words in the message beat the saved profile.
 * @param {{ question: string, stream?: string, examLevel?: string, subject?: string }} a
 * @returns {"OL"|"AL"|null}
 */
export function detectExamLevel({ question, stream, examLevel, subject }) {
  const q = cleanSinhala(question).toLowerCase();
  const OL = /(^|[^a-z])(o\/l|o\.l\.?|o[ -]?levels?|ordinary level|grade ?(10|11))([^a-z]|$)|සාමාන්\u200Dය පෙළ|(10|11)\s?ශ්\u200Dරේණි/;
  const AL = /(^|[^a-z])(a\/l|a\.l\.?|a[ -]?levels?|advanced level|grade ?(12|13))([^a-z]|$)|උසස් පෙළ|(12|13)\s?ශ්\u200Dරේණි/;
  const ol = OL.test(q);
  const al = AL.test(q);
  if (ol && !al) return "OL";
  if (al && !ol) return "AL";
  if (examLevel === "OL" || examLevel === "AL") return examLevel;
  if (stream && stream.trim()) return "AL";
  if (subject && /combined math/i.test(subject)) return "AL";
  return null;
}
