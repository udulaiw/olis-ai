// Unicode safety for Sinhala (and the other scripts a Sri Lankan student mixes in).
// Plain .mjs so the build-time indexer, the ingest script and the TypeScript
// server share one implementation.
//
// Design rule: we DETECT and REPORT. We only rewrite when the rewrite is
// provably lossless (NFC, or a UTF-8-read-as-Latin-1 round trip that yields
// valid Sinhala). We never silently delete characters.

export const RE = {
  sinhala: /[\u0D80-\u0DFF]/g,
  devanagari: /[ऀ-ॿ]/g,
  tamil: /[஀-௿]/g,
  /** Malayalam: the block right before Sinhala (U+0D00–0D7F). Models swap look-alike letters ("കൊළඹ" for "කොළඹ"). */
  malayalam: /[\u0D00-\u0D7F]/g,
  /** Bengali, Gurmukhi, Gujarati, Oriya, Telugu, Kannada: never expected in an OLIS answer. */
  otherIndic: /[\u0980-\u0B7F\u0C00-\u0CFF]/g,
  latin: /[A-Za-z]/g,
  replacement: /�/g,
};

const count = (s, re) => (s.match(re) ?? []).length;

/** Per-script character counts. */
export function scriptStats(text) {
  return {
    sinhala: count(text, RE.sinhala),
    devanagari: count(text, RE.devanagari),
    tamil: count(text, RE.tamil),
    malayalam: count(text, RE.malayalam),
    otherIndic: count(text, RE.otherIndic),
    latin: count(text, RE.latin),
    replacement: count(text, RE.replacement),
    length: text.length,
  };
}

// Sinhala combining marks: U+0D82/0D83 (anusvara/visarga), U+0DCA virama,
// U+0DCF–U+0DDF vowel signs, U+0DF2/0DF3. ZWJ (U+200D) is legitimate ONLY right
// after the virama, to form rakaransaya/yansaya (ශ්\u200Dරී, විද්\u200Dයා).
const SI_DEPENDENT = /[ංඃ්ා-ෟෲෳ]/;
const SI_CONSONANT_OR_VOWEL = /[අ-ෆ]/;

/**
 * Canonical form for storage, search and display. NFC keeps Sinhala vowel signs
 * composed (NFKD would split ො into two code points, which then differ from what
 * the keyboard produced). Also drops BOM / zero-width no-break space, and
 * removes ZWJ/ZWNJ that are NOT in a position where Sinhala uses them.
 */
export function cleanSinhala(text) {
  let s = text.normalize("NFC").replace(/\uFEFF/g, "");
  // stray ZWJ: keep only when preceded by virama and followed by ර/ය
  s = s.replace(/\u200D/g, (m, offset, str) => (str[offset - 1] === "්" && /[රය]/.test(str[offset + 1] ?? "") ? m : ""));
  // ZWNJ has no role in Sinhala
  s = s.replace(/\u200C/g, "");
  return s;
}

/**
 * Detect "UTF-8 read as Latin-1/Windows-1252" (à¶· à· …) and reverse it, but ONLY
 * if the reversed text is valid and contains more Sinhala than the original.
 */
export function repairMojibake(text) {
  if (!/[À-ÿ][\u0080-¿Œ-ƒ‘-›]/.test(text)) return { text, repaired: false };
  const cp1252 = {
    0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87, 0x02c6: 0x88, 0x2030: 0x89, 0x0160: 0x8a,
    0x2039: 0x8b, 0x0152: 0x8c, 0x017d: 0x8e, 0x2018: 0x91, 0x2019: 0x92, 0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97,
    0x02dc: 0x98, 0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b, 0x0153: 0x9c, 0x017e: 0x9e, 0x0178: 0x9f,
  };
  const bytes = [];
  for (const ch of text) {
    const c = ch.codePointAt(0);
    if (c <= 0xff) bytes.push(c);
    else if (cp1252[c] !== undefined) bytes.push(cp1252[c]);
    else return { text, repaired: false }; // contains real non-Latin text: not mojibake
  }
  let fixed;
  try {
    fixed = new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(bytes));
  } catch {
    return { text, repaired: false };
  }
  const before = scriptStats(text);
  const after = scriptStats(fixed);
  const better = after.sinhala + after.tamil > before.sinhala + before.tamil && after.replacement === 0;
  return better ? { text: fixed, repaired: true } : { text, repaired: false };
}

/**
 * Report problems in a piece of text. `expect` is the script the text is meant
 * to be in: "si" | "en" | "ta" | "any".
 * @returns {{ code: string, detail: string }[]}
 */
export function scanText(text, expect = "any") {
  const issues = [];
  const st = scriptStats(text);
  if (st.replacement) issues.push({ code: "replacement_char", detail: `${st.replacement} × U+FFFD` });
  if (/[À-ÿ][\u0080-¿Œ-ƒ‘-›]/.test(text) && repairMojibake(text).repaired) issues.push({ code: "mojibake", detail: "UTF-8 decoded as Latin-1" });
  if (st.devanagari && expect !== "any" && expect !== "hi") issues.push({ code: "devanagari", detail: `${st.devanagari} Devanagari chars in ${expect} text` });
  if (st.tamil && (expect === "si" || expect === "en")) issues.push({ code: "tamil", detail: `${st.tamil} Tamil chars in ${expect} text` });
  if (st.malayalam && expect !== "any") issues.push({ code: "malayalam", detail: `${st.malayalam} Malayalam chars in ${expect} text` });
  if (st.otherIndic && expect !== "any") issues.push({ code: "other_indic", detail: `${st.otherIndic} Bengali/Telugu/Kannada/… chars in ${expect} text` });
  if (/\?{3,}/.test(text)) issues.push({ code: "question_marks", detail: "run of ??? (lossy encoding)" });

  // malformed combining sequences (Sinhala only)
  if (st.sinhala) {
    const chars = [...text];
    for (let i = 0; i < chars.length; i++) {
      const c = chars[i];
      if (!SI_DEPENDENT.test(c)) continue;
      const prev = chars[i - 1] ?? "";
      const prevOk = SI_CONSONANT_OR_VOWEL.test(prev) || SI_DEPENDENT.test(prev) || prev === "\u200D";
      if (!prevOk) {
        issues.push({ code: "orphan_combining", detail: `U+${c.codePointAt(0).toString(16).toUpperCase()} after ${JSON.stringify(prev)}` });
        break;
      }
      // two vowel signs in a row (excluding the legit ෙ+ා / ෙ+ෟ style splits that NFC composes)
      if (/[ා-ෟ]/.test(c) && /[ා-ෟ]/.test(prev) && !/[ෙො]/.test(prev)) {
        issues.push({ code: "double_vowel_sign", detail: `U+${prev.codePointAt(0).toString(16).toUpperCase()} U+${c.codePointAt(0).toString(16).toUpperCase()}` });
        break;
      }
    }
    if (/(?<!්)\u200D|\u200D(?![රය])/.test(text)) issues.push({ code: "stray_zwj", detail: "ZWJ outside rakaransaya/yansaya" });
  }
  return issues;
}

/**
 * Streaming guard: feed it each text delta; it reports the first time the
 * running answer contains a script it should not. Used to retry an answer on
 * another model instead of showing the student a corrupted one.
 */
export function createScriptGuard(expect) {
  let seen = "";
  return (delta) => {
    seen += delta;
    if (seen.length > 4000) seen = seen.slice(-2000);
    if (expect === "any") return null;
    const st = scriptStats(delta);
    if (st.devanagari) return { code: "devanagari", detail: `${st.devanagari} Devanagari chars` };
    if (st.replacement) return { code: "replacement_char", detail: "U+FFFD in output" };
    if (st.tamil && expect !== "ta") return { code: "tamil", detail: `${st.tamil} Tamil chars` };
    // Sinhala answers have Malayalam repaired before the guard sees it (repairIndicToSinhala); anywhere else it is wrong
    if (st.malayalam) return { code: "malayalam", detail: `${st.malayalam} Malayalam chars` };
    if (st.otherIndic) return { code: "other_indic", detail: `${st.otherIndic} other Indic chars` };
    return null;
  };
}

/**
 * PDF text extraction often returns Sinhala in VISUAL order: the pre-base vowel
 * signs ෙ ේ ෛ (and the ො ෝ ෞ pair-forms) come out BEFORE their consonant. Unicode
 * wants them after. We only touch a vowel sign that has no consonant before it
 * (so a legitimate "කෙක" is never altered).
 * @returns {{ text: string, fixed: number }}
 */
export function fixVisualOrder(text) {
  let fixed = 0;
  let s = text.normalize("NFC");
  // ෙ + C + ා / ෟ  →  C + ො / ෞ  (NFC composes the pair)
  s = s.replace(/(?<![\u0D80-\u0DFF\u200D])ෙ([ක-ෆ](?:්\u200D[රය])?)([ාෟ])/g, (_m, c, tail) => (fixed++, c + "ෙ" + tail));
  // ෙ ේ ෛ + C  →  C + sign
  s = s.replace(/(?<![\u0D80-\u0DFF\u200D])([ෙ-ෛ])([ක-ෆ](?:්\u200D[රය])?)/g, (_m, v, c) => (fixed++, c + v));
  return { text: s.normalize("NFC"), fixed };
}

/**
 * Text from pre-Unicode Sinhala fonts (FM Abhaya, Kandy, DL-Manel…) extracts as
 * Latin-looking garbage ("fuu úoHd"). Common in older Sri Lankan government
 * PDFs. Heuristic: lots of text, no Sinhala, and few real English words.
 */
export function looksLikeLegacySinhalaFont(text) {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length < 200) return false;
  const st = scriptStats(t);
  if (st.sinhala > t.length * 0.05) return false;
  const words = t.toLowerCase().match(/[a-z]{2,}/g) ?? [];
  const common = new Set("the of and to in is that for are with as be by on or this from at an it which was can not have has more these their".split(" "));
  const hits = words.filter((w) => common.has(w)).length;
  const odd = (t.match(/[À-ÿŒ-ƒ‘-›;{}\[\]|~`^]/g) ?? []).length;
  return words.length > 30 && hits / words.length < 0.04 && odd / t.length > 0.04;
}

// ── Look-alike repair: Malayalam / Devanagari letters inside a Sinhala answer ──
//
// Sinhala, Malayalam and Devanagari are all Brahmic scripts with the same letter
// inventory and the same consonant + vowel-sign structure, so a stray letter maps
// one-to-one onto the Sinhala letter with the same sound: "കൊළඹ പැത്തේ" → "කොළඹ පැත්තේ".
// Stateless per character, so it is safe on a stream split anywhere.

const CONS = "කඛගඝඞචඡජඣඤටඨඩඪණතථදධනපඵබභමයරලවශෂසහළ";
/** Devanagari / Malayalam consonants in the same order as CONS. */
const DEVA_CONS = "कखगघङचछजझञटठडढणतथदधनपफबभमयरलवशषसहळ";
const MLYM_CONS = "കഖഗഘങചഛജഝഞടഠഡഢണതഥദധനപഫബഭമയരലവശഷസഹള";
const VOWELS = { si: "අආඉඊඋඌඍඑඒඓඔඕඖ", deva: "अआइईउऊऋऎएऐऒओऔ", mlym: "അആഇഈഉഊഋഎഏഐഒഓഔ" };
const SIGNS = { si: "ාිීුූෘෙේෛොෝෞ්ංඃ", deva: "ािीुूृॆेैॊोौ्ंः", mlym: "ാിീുൂൃെേൈൊോൌ്ംഃ" };

const LOOKALIKE = new Map();
for (let i = 0; i < CONS.length; i++) {
  LOOKALIKE.set(DEVA_CONS[i], CONS[i]);
  LOOKALIKE.set(MLYM_CONS[i], CONS[i]);
}
for (const k of ["deva", "mlym"]) {
  [...VOWELS[k]].forEach((c, i) => LOOKALIKE.set(c, VOWELS.si[i]));
  [...SIGNS[k]].forEach((c, i) => LOOKALIKE.set(c, SIGNS.si[i]));
}
// Extras: Malayalam ṟa / ḻa, chillu (consonant with built-in virama), au length mark;
// Devanagari candrabindu, nukta, danda; both scripts' digits.
for (const [k, v] of Object.entries({
  "റ": "ර", "ഴ": "ළ", "ൺ": "ණ්", "ൻ": "න්", "ർ": "ර්", "ൽ": "ල්", "ൾ": "ළ්", "ൿ": "ක්", "ൗ": "ෟ",
  "ँ": "ං", "़": "", "।": ".", "॥": ".",
})) LOOKALIKE.set(k, v);
for (let d = 0; d < 10; d++) {
  LOOKALIKE.set(String.fromCharCode(0x0966 + d), String(d));
  LOOKALIKE.set(String.fromCharCode(0x0D66 + d), String(d));
}

/**
 * Map Malayalam (always) and, when `devanagari` is true, Devanagari letters to their Sinhala
 * equivalents. Returns the text and how many characters changed. Text in any other script is untouched.
 * @param {string} text
 * @param {{ devanagari?: boolean }} [opts]
 */
export function repairIndicToSinhala(text, opts = {}) {
  let changed = 0;
  let out = "";
  let viramaMapped = false; // the previous char was a repaired virama: "്ര" / "्य" must become rakaransaya / yansaya (්\u200Dර)
  for (const ch of text) {
    const cp = ch.codePointAt(0);
    const isMl = cp >= 0x0d00 && cp <= 0x0d7f;
    const isDeva = opts.devanagari && cp >= 0x0900 && cp <= 0x097f;
    if ((isMl || isDeva) && LOOKALIKE.has(ch)) {
      const si = LOOKALIKE.get(ch);
      if (viramaMapped && (si === "ර" || si === "ය")) out += "\u200D";
      out += si;
      viramaMapped = si === "්";
      changed++;
    } else {
      if (viramaMapped && (ch === "ර" || ch === "ය")) out += "\u200D";
      out += ch;
      viramaMapped = false;
    }
  }
  return { text: changed ? out.normalize("NFC") : text, changed };
}
