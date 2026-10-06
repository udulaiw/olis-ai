// Long-term memory: what OLIS should know about a student across chats.
//
// Storage: in the student's browser (like chats and the study profile; OLIS has no
// accounts). The browser sends its saved memories with each request; the server
// picks only the relevant ones for the prompt and proposes new ones from the
// student's latest message. Nothing is stored on the server.
//
// Extraction is rule-based on purpose: an extra model call per message would cut
// the free quota, and rules are predictable. They only match durable facts the
// student states about themselves (exam, stream, subjects, language, goals,
// learning style, weak topics, name). One-off facts ("today I studied 3 hours")
// and sensitive data are never saved.
import { tokenize } from "./text.mjs";
import { cleanSinhala } from "./lang/unicode.mjs";

export type MemoryCategory = "education" | "subjects" | "goals" | "preferences" | "language" | "learning_style" | "interests" | "general";

export interface MemoryItem {
  /** Stable key: a new fact with the same key replaces the old one ("exam", "language_pref", "weak:integration"). */
  key: string;
  memory: string;
  category: MemoryCategory;
  /** 1–5. Only ≥4 is used automatically; 3 when relevant; lower is never used. */
  importance: number;
  /** Machine-readable value where useful (language_pref → "si"). */
  value?: string;
}

const CATS = new Set<MemoryCategory>(["education", "subjects", "goals", "preferences", "language", "learning_style", "interests", "general"]);

/** Never saved, even when the student says "remember": contact details, IDs, passwords, money, health. */
const SENSITIVE =
  /\b(password|passcode|pin|otp|nic|national id|passport|bank|account number|card number|credit card|cvv|salary|address|phone|mobile|whatsapp|email|e-mail|diagnos|disease|illness|medicine|medication|depress|anxiety|suicid|self.?harm|pregnan|caste)\w*\b|\b\d{9,}\b|\b\d{9}[vVxX]\b|@[\w-]+\.\w+/i;

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const clean = (s: string) => s.replace(/\s+/g, " ").replace(/^[\s,.:;-]+|[\s,.!?;:]+$/g, "").trim();
const LANG: Record<string, { code: string; name: string }> = {
  sinhala: { code: "si", name: "Sinhala" }, සිංහල: { code: "si", name: "Sinhala" }, sinhalen: { code: "si", name: "Sinhala" }, සිංහලෙන්: { code: "si", name: "Sinhala" },
  english: { code: "en", name: "English" }, ඉංග්‍රීසි: { code: "en", name: "English" }, ඉංග්‍රීසියෙන්: { code: "en", name: "English" },
  tamil: { code: "ta", name: "Tamil" }, தமிழ்: { code: "ta", name: "Tamil" }, தமிழில்: { code: "ta", name: "Tamil" },
};
const STREAMS: [RegExp, string][] = [
  [/physical science|maths? stream|mathematics stream|ganitha|ගණිත අංශ/i, "Physical Science (Maths)"],
  [/bio(logical)? science|bio stream|jeewa|ජීව විද්‍යා අංශ/i, "Biological Science"],
  [/commerce stream|commerce section|wanija|වාණිජ/i, "Commerce"],
  [/arts stream|arts section|kala|කලා අංශ/i, "Arts"],
  [/technology stream|tech stream|engineering technology|තාක්ෂණ අංශ/i, "Technology"],
];

/** Durable facts in one student message. */
export function extractMemories(message: string): MemoryItem[] {
  const text = cleanSinhala(message).trim();
  if (!text || text.length > 1500) return [];
  const t = text.replace(/\s+/g, " ");
  const out: MemoryItem[] = [];
  const add = (m: MemoryItem) => {
    if (SENSITIVE.test(m.memory) || m.memory.length > 200 || m.memory.length < 6) return;
    if (!out.some((o) => o.key === m.key)) out.push(m);
  };

  // ── Explicit "remember that …" (still filtered for sensitive content) ──
  const rem = t.match(/^(?:please\s+)?(?:remember|note|keep in mind|don'?t forget)(?: that)?[:,]?\s+(.{6,180})$/i) ?? t.match(/(.{6,180}?)\s*(?:මතක තියාගන්න|mathaka thiyaganna)\s*$/);
  if (rem) {
    // Third person, so the memory reads as a fact about the student ("my exam" → "their exam")
    const fact = clean(rem[1])
      .replace(/\bI'?m\b/gi, "they're")
      .replace(/\bI am\b/gi, "they are")
      .replace(/\bI\b/g, "they")
      .replace(/\bmy\b/gi, "their")
      .replace(/\bme\b/gi, "them");
    // Beliefs are the student's business: an explicit "remember" about religion or politics is not stored either
    if (!SENSITIVE.test(fact) && !/\b(religio|politic|vote|party|buddhis|christian|catholic|muslim|islam|hindu|atheis)\w*/i.test(fact)) add({ key: `note:${fact.toLowerCase().slice(0, 40)}`, memory: `${cap(fact)}.`, category: "general", importance: 4 });
  }

  // ── Answer language: only standing preferences ("I prefer…", "always…", "from now on…"), never "explain this in Sinhala" ──
  const pref =
    t.match(/\b(?:i (?:prefer|like|want|would like)|please always|always|from now on|by default)\b[^.?!]{0,40}?\b(sinhala|english|tamil)\b/i) ??
    t.match(/(සිංහලෙන්|ඉංග්‍රීසියෙන්|தமிழில்)[^.?!]{0,30}(කැමතියි|කැමති|හැමවිටම|හැම වෙලේම|எப்போதும்)/) ??
    t.match(/\b(sinhalen|english walin)\b[^.?!]{0,30}\b(kamathi|hamadama|hama welema)\b/i);
  if (pref) {
    const raw = (pref[1] ?? "").toLowerCase();
    const l = LANG[raw] ?? (raw.startsWith("english") ? LANG.english : LANG.sinhala);
    add({ key: "language_pref", memory: `Prefers explanations in ${l.name}.`, category: "language", importance: 5, value: l.code });
  }

  // ── Exam and year ──
  const exam =
    t.match(/\b(?:i'?m|i am|im)\s+(?:preparing|studying|sitting|doing|getting ready|facing|going to (?:sit|face|do))\s+(?:for\s+)?(?:the\s+|my\s+)?(?:(20\d\d)\s+)?(?:g\.?c\.?e\.?\s+)?(a\/l|o\/l|a[\s.-]?levels?|o[\s.-]?levels?|advanced level|ordinary level)(?:\s+exam(?:ination)?s?)?(?:\s+(?:in|on)\s+(20\d\d))?/i) ??
    t.match(/\bmy\s+(a\/l|o\/l|a[\s.-]?levels?|o[\s.-]?levels?)\s+(?:exam(?:ination)?s?\s+)?(?:is|are)\s+(?:in|on)\s+(20\d\d)/i) ??
    t.match(/(20\d\d)?\s*(උසස් පෙළ|සාමාන්‍ය පෙළ)\s*(?:විභාගයට|විභාගය)?\s*(?:කරනවා|ලියනවා|සූදානම්)/);
  if (exam) {
    const lvlRaw = ((Array.from(exam) as (string | undefined)[]).find((g, i) => i > 0 && g && /a|o|පෙළ|level/i.test(g) && !/^20\d\d$/.test(g)) ?? "").toLowerCase();
    const level = /^o|ordinary|සාමාන්‍ය/.test(lvlRaw) ? "O/L" : "A/L";
    const year = (Array.from(exam) as (string | undefined)[]).slice(1).find((g) => g && /^20\d\d$/.test(g));
    add({ key: "exam", memory: `Preparing for the ${year ? `${year} ` : ""}G.C.E. ${level} examination.`, category: "education", importance: 5, value: level === "O/L" ? "OL" : "AL" });
  }

  // ── A/L stream ──
  if (/\b(stream|section|a\/l|a level|doing|studying|i'?m in|im in)\b|අංශ/i.test(t)) {
    for (const [re, name] of STREAMS) if (re.test(t)) add({ key: "stream", memory: `Studies in the A/L ${name} stream.`, category: "education", importance: 5, value: name });
  }

  // ── Grade ──
  const grade = t.match(/\b(?:i'?m|i am|im)\s+in\s+grade\s+(\d{1,2})\b/i) ?? t.match(/(\d{1,2})\s*ශ්‍රේණියේ\s*(?:ඉගෙන ගන්නවා|ඉන්නේ)/);
  if (grade && +grade[1] >= 6 && +grade[1] <= 13) add({ key: "grade", memory: `Is in Grade ${grade[1]}.`, category: "education", importance: 4 });

  // ── Subjects ──
  const subj = t.match(/\bmy\s+(?:a\/l\s+|o\/l\s+)?subjects\s+are\s+([^.?!]{4,120})/i) ?? t.match(/\bi(?:'m| am)\s+(?:taking|doing|studying)\s+((?:combined maths?|combined mathematics|physics|chemistry|biology|ict|economics|geography|history|accounting|business studies|agriculture|logic|political science|sinhala|english|tamil|buddhism|maths?)(?:\s*(?:,|and|&)\s*(?:combined maths?|combined mathematics|physics|chemistry|biology|ict|economics|geography|history|accounting|business studies|agriculture|logic|political science|sinhala|english|tamil|buddhism|maths?))+)/i);
  if (subj) add({ key: "subjects", memory: `Studies ${clean(subj[1])}.`, category: "subjects", importance: 4 });

  // ── Weak / strong / favourite ──
  for (const m of t.matchAll(/\bi(?:'m| am)\s+(?:really\s+|very\s+)?(?:weak|bad|not good)\s+(?:in|at|with)\s+([^.?!,]{3,50})/gi)) add({ key: `weak:${clean(m[1]).toLowerCase()}`, memory: `Finds ${clean(m[1])} difficult.`, category: "subjects", importance: 4 });
  for (const m of t.matchAll(/\bi\s+(?:always\s+|really\s+)?struggle\s+(?:with|in)\s+([^.?!,]{3,50})/gi)) add({ key: `weak:${clean(m[1]).toLowerCase()}`, memory: `Finds ${clean(m[1])} difficult.`, category: "subjects", importance: 4 });
  const weakTopic = t.match(/\bmy\s+weak(?:est)?\s+(?:subject|topic|area)s?\s+(?:is|are)\s+([^.?!]{3,60})/i);
  if (weakTopic) add({ key: `weak:${clean(weakTopic[1]).toLowerCase()}`, memory: `Finds ${clean(weakTopic[1])} difficult.`, category: "subjects", importance: 4 });
  const fav = t.match(/\bmy\s+favou?rite\s+subject\s+is\s+([^.?!,]{3,40})/i);
  if (fav) add({ key: "favourite_subject", memory: `Favourite subject is ${clean(fav[1])}.`, category: "interests", importance: 3 });

  // ── Goals ──
  const goal = t.match(/\bmy\s+(?:main\s+)?(?:goal|target|aim|dream)\s+is\s+(?:to\s+)?([^.?!]{4,120})/i) ?? t.match(/\bi\s+want\s+to\s+(get\s+(?:3\s*a'?s|three a'?s|a\s+passes|an?\s+[a-c]\b|into\s+[^.?!]{3,60}|selected[^.?!]{0,60})[^.?!]{0,60}|become\s+(?:a|an)\s+[^.?!]{3,40}|study\s+(?:medicine|engineering|it|law|at university)[^.?!]{0,40})/i);
  if (goal) add({ key: "goal", memory: `Goal: ${clean(goal[1])}.`, category: "goals", importance: 4 });

  // ── Learning style ──
  const style =
    t.match(/\bi\s+(?:learn|understand)\s+(?:better|best|more easily)\s+(?:with|through|from|when)\s+([^.?!]{3,60})/i) ??
    t.match(/\bi\s+prefer\s+((?:short|brief|detailed|long|simple|step[- ]by[- ]step)\s+(?:answers?|explanations?)|examples|diagrams|analogies)/i);
  if (style) add({ key: "learning_style", memory: `Learns best with ${clean(style[1])}.`, category: "learning_style", importance: 4 });

  // ── Name ──
  const name = t.match(/\b(?:my name is|call me)\s+([A-Z][a-zA-Z'-]{1,20}(?:\s+[A-Z][a-zA-Z'-]{1,20})?)\b/);
  if (name) add({ key: "name", memory: `Name: ${name[1]}.`, category: "general", importance: 3 });

  return out;
}

/** Validate memories sent by the browser (untrusted). */
export function parseMemories(v: unknown): MemoryItem[] {
  if (!Array.isArray(v)) return [];
  const out: MemoryItem[] = [];
  for (const raw of v.slice(0, 60)) {
    const m = raw as Record<string, unknown>;
    const memory = typeof m?.memory === "string" ? cleanSinhala(m.memory).replace(/[\u0000-\u001f<>{}`]/g, " ").replace(/\s+/g, " ").trim().slice(0, 200) : "";
    const key = typeof m?.key === "string" ? m.key.slice(0, 60) : "";
    const category = CATS.has(m?.category as MemoryCategory) ? (m.category as MemoryCategory) : "general";
    const importance = Math.min(5, Math.max(1, Math.round(Number(m?.importance) || 3)));
    const value = typeof m?.value === "string" ? m.value.slice(0, 40) : undefined;
    if (memory && key) out.push({ key, memory, category, importance, value });
  }
  return out;
}

const CORE = new Set<MemoryCategory>(["education", "language", "learning_style"]);
const STOP = new Set("user prefers studies finds difficult goal name learns best with the and for exam examination g.c.e asked olis remember".split(" "));

/**
 * The memories worth putting in front of the model for THIS question.
 * Core profile facts (exam, stream, language, learning style) at importance ≥4 always;
 * anything else only when it shares words with the question, or when the student asks about themselves.
 */
export function selectMemories(all: MemoryItem[], question: string, opts: { askingAboutSelf?: boolean; max?: number } = {}): MemoryItem[] {
  const max = opts.max ?? 8;
  const usable = all.filter((m) => m.importance >= 3);
  const q = new Set(tokenize(question).filter((w: string) => w.length > 2 && !STOP.has(w)));
  const scored = usable.map((m) => {
    const words = tokenize(m.memory).filter((w: string) => w.length > 2 && !STOP.has(w));
    const overlap = words.filter((w: string) => q.has(w)).length;
    const core = CORE.has(m.category) && m.importance >= 4;
    const score = (core ? 10 : 0) + overlap * 3 + m.importance + (opts.askingAboutSelf ? 5 : 0);
    return { m, score, keep: core || overlap > 0 || opts.askingAboutSelf };
  });
  return scored.filter((s) => s.keep).sort((a, b) => b.score - a.score).slice(0, max).map((s) => s.m);
}

/** A saved standing answer-language preference, if any. */
export function languageFromMemory(all: MemoryItem[]): "en" | "si" | "ta" | undefined {
  const v = all.find((m) => m.key === "language_pref")?.value;
  return v === "en" || v === "si" || v === "ta" ? v : undefined;
}

/** A saved exam level, if any. */
export function levelFromMemory(all: MemoryItem[]): "OL" | "AL" | undefined {
  const v = all.find((m) => m.key === "exam")?.value;
  return v === "OL" || v === "AL" ? v : undefined;
}
