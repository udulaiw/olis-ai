// Decides what KIND of request this is, so the router can pick a suitable
// model: a quick question gets the fast model, a Combined Maths proof gets a
// reasoning model, a photo of a paper gets a vision model, and so on.
// Cheap heuristics only: no extra AI call.
import { guessTopic } from "../knowledge/taxonomy.js";
import type { Capability, Task } from "./types.js";

export type LanguagePref = "en" | "si" | "auto";
export type DetectedLanguage = "en" | "si" | "singlish" | "mixed";

const SINHALA = /[඀-෿]/;
const LATIN = /[a-z]{3,}/i;
// Common Singlish (romanised Sinhala) words students type. Whole words only.
const SINGLISH = [
  "mokadda", "mokakda", "kohomada", "karanne", "karanna", "karapan", "denna", "dennako", "puluwan", "puluwanda", "mata", "oya", "oyage", "meka", "eka",
  "ekak", "nisa", "neda", "nedda", "hari", "harida", "api", "mage", "mona", "monawada", "kiyala", "kiyanna", "kiyala", "therenne", "theruna", "therum",
  "wage", "wenas", "wenne", "thiyenne", "thiyena", "ganna", "hoyanna", "balanna", "igena", "podi", "loku", "godak", "tikak", "aney", "ane", "machan",
  "sinhalen", "sinhala", "saralawa", "pahadili", "pahadilikaranna",
];

export function detectLanguage(text: string): DetectedLanguage {
  const hasSi = SINHALA.test(text);
  const hasEn = LATIN.test(text.replace(/[඀-෿]/g, " "));
  if (hasSi && hasEn) return "mixed";
  if (hasSi) return "si";
  const words = text.toLowerCase().split(/[^a-z]+/).filter(Boolean);
  const singlish = words.filter((w) => SINGLISH.includes(w)).length;
  if (singlish >= 2 || (singlish >= 1 && words.length <= 6)) return "singlish";
  return "en";
}

const MATH_SIGNS = /[∫∑√π≤≥≠∞θ]|\\frac|\\int|d\/dx|dy\/dx|\^\d|\b(lim|sin|cos|tan|log|ln)\b|\d\s*[x-z]\b|[x-z]\s*[²³]|=\s*0\b/i;
const HARD_WORDS = /\b(prove|show that|hence|deduce|find the (value|values|range|equation|maximum|minimum)|derive|evaluate|solve|calculate|determine)\b/i;
const NUM_WITH_UNIT = /\d+(\.\d+)?\s*(m\/s|ms-1|m s-1|m\/s2|n\b|kg|j\b|w\b|v\b|a\b|Ω|ohm|mol|k\b|°c|pa\b|hz)/i;

export interface Classification {
  task: Task;
  required: Capability[];
  language: DetectedLanguage;
  /** For logs: why this task was chosen. */
  reason: string;
  topic?: { subject: string; unit: string };
}

export function classifyRequest(input: {
  question: string;
  mode: string;
  subject?: string;
  imageCount?: number;
  attachmentChars?: number;
  languagePref?: LanguagePref;
}): Classification {
  const q = input.question ?? "";
  const language = detectLanguage(q);
  const required: Capability[] = ["text"];
  const topicGuess = guessTopic(q, input.subject);
  const topic = topicGuess ? { subject: topicGuess.subject, unit: topicGuess.unit.id } : undefined;

  if (input.imageCount) {
    required.push("vision");
    return { task: "vision", required, language, reason: "image attached", topic };
  }
  if ((input.attachmentChars ?? 0) > 60_000) {
    required.push("long_context");
    return { task: "long_context", required, language, reason: "long study material", topic };
  }
  const wantsSinhala = input.languagePref === "si" || language === "si" || language === "mixed" || language === "singlish" || /sinhal|සිංහල/i.test(q);
  if (wantsSinhala) {
    required.push("multilingual");
    return { task: "sinhala", required, language, reason: `language=${input.languagePref === "si" ? "pref-si" : language}`, topic };
  }

  const hard = input.mode === "solve" || HARD_WORDS.test(q) || q.length > 400;
  const mathy = MATH_SIGNS.test(q);
  const numeric = NUM_WITH_UNIT.test(q) || /\d/.test(q);
  const subject = topic?.subject ?? (input.subject ? input.subject.toLowerCase() : "");

  if (subject.includes("math") && (hard || mathy)) return { task: "mathematics", required, language, reason: "maths problem", topic };
  if (subject.includes("physics") && (hard || (numeric && q.length > 40))) return { task: "physics", required, language, reason: "physics calculation", topic };
  if (subject.includes("chem") && (hard || q.length > 60 || input.mode === "explain")) return { task: "chemistry", required, language, reason: "chemistry explanation", topic };
  if (mathy && hard) return { task: "mathematics", required, language, reason: "maths signs + problem wording", topic };
  if (hard) return { task: "reasoning", required, language, reason: "complex request", topic };
  return { task: "general", required, language, reason: "simple question", topic };
}
