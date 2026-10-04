// Decides what KIND of request this is, so the router can pick a suitable
// model: a quick question gets the fast model, a Combined Maths proof gets a
// reasoning model, a photo of a paper gets a vision model, and so on.
// Cheap heuristics only: no extra AI call.
//
// Language, normalisation and follow-up logic lives in server/lang/nlp.mjs.
import { guessTopic, guessSubject, type ExamLevel } from "../knowledge/taxonomy.js";
import { detectLanguage as detect, replyLanguage, expandQuery, resolveFollowUp, detectExamLevel } from "../lang/nlp.mjs";
import type { Capability, Task } from "./types.js";

export type LanguagePref = "en" | "si" | "auto";
export type DetectedLanguage = "en" | "si" | "ta" | "singlish" | "mixed";
/** Language the ANSWER should be written in. si_mixed = Sinhala with English technical terms. */
export type ReplyLanguage = "en" | "si" | "si_mixed" | "ta";

export const detectLanguage = (text: string): DetectedLanguage => detect(text);

export type Specialist = "ol-mathematics" | "ol-science" | "ol-ict" | "ol-language" | "ol-humanities" | "al-mathematics" | "al-physics" | "al-chemistry" | "past-paper" | "planner" | "general";

const PAST_PAPER = /past ?papers?|model papers?|marking scheme|answer scheme|ප්‍රශ්න ?පත්‍ර|පසුගිය|ලකුණු දීමේ|\bpaper (ek|eke)\b|prashnapathra/i;

function specialistFor(subjectId: string | undefined, mode: string, expanded: string): Specialist {
  if (mode === "plan") return "planner";
  if (PAST_PAPER.test(expanded)) return "past-paper";
  switch (subjectId) {
    case "ol-mathematics": return "ol-mathematics";
    case "ol-science": return "ol-science";
    case "ol-ict": return "ol-ict";
    case "ol-english":
    case "ol-sinhala": return "ol-language";
    case "ol-history":
    case "ol-geography":
    case "ol-commerce":
    case "ol-health":
    case "ol-religion": return "ol-humanities";
    case "combined-mathematics": return "al-mathematics";
    case "physics": return "al-physics";
    case "chemistry": return "al-chemistry";
    default: return "general";
  }
}

const MATH_SIGNS = /[∫∑√π≤≥≠∞θ]|\\frac|\\int|d\/dx|dy\/dx|\^\d|\b(lim|sin|cos|tan|log|ln)\b|\d\s*[x-z]\b|[x-z]\s*[²³]|=\s*0\b/i;
const HARD_WORDS = /\b(prove|show that|hence|deduce|find the (value|values|range|equation|maximum|minimum)|derive|evaluate|solve|calculate|determine)\b/i;
const NUM_WITH_UNIT = /\d+(\.\d+)?\s*(m\/s|ms-1|m s-1|m\/s2|n\b|kg|j\b|w\b|v\b|a\b|Ω|ohm|mol|k\b|°c|pa\b|hz)/i;

export interface Classification {
  task: Task;
  required: Capability[];
  /** What the student's message looks like (script / Singlish). */
  language: DetectedLanguage;
  /** What the answer should be written in, and why. */
  reply: ReplyLanguage;
  replyReason: string;
  /** For logs: why this task was chosen. */
  reason: string;
  topic?: { subject: string; unit: string };
  examLevel: ExamLevel | null;
  specialist: Specialist;
  /** English search terms found for a Sinhala / Singlish message. */
  terms: string[];
  /** What to search the knowledge base with (the original message is untouched). */
  retrievalQuery: string;
  followUp: { kind: string; hint: string } | null;
}

export function classifyRequest(input: {
  question: string;
  mode: string;
  subject?: string;
  imageCount?: number;
  attachmentChars?: number;
  languagePref?: LanguagePref;
  history?: { role: string; content: string }[];
  stream?: string;
  examLevel?: string;
}): Classification {
  const q = input.question ?? "";
  const history = input.history ?? [];
  const lang = replyLanguage({ question: q, pref: input.languagePref, history });
  const language = lang.detected;
  const follow = resolveFollowUp(q, history);
  const expansion = expandQuery(q);
  const examLevel = detectExamLevel({ question: q, stream: input.stream, examLevel: input.examLevel, subject: input.subject });
  // Topic guessing runs on the English-expanded text so "වේගය" / "speed eka" / "speed" all land in the same unit
  const topicText = follow.isFollowUp ? follow.retrievalQuery : expansion.expanded;
  const topicGuess = guessTopic(topicText, input.subject, examLevel);
  const topic = topicGuess ? { subject: topicGuess.subject, unit: topicGuess.unit.id } : undefined;
  const subjectId = topicGuess?.subject ?? guessSubject(topicText, input.subject, examLevel)?.id;
  const specialist = specialistFor(subjectId, input.mode, topicText);
  const base = {
    language,
    reply: lang.reply as ReplyLanguage,
    replyReason: lang.reason,
    topic,
    examLevel,
    specialist,
    terms: expansion.terms,
    retrievalQuery: follow.isFollowUp ? follow.retrievalQuery : expansion.expanded,
    followUp: follow.isFollowUp ? { kind: follow.kind as string, hint: follow.hint } : null,
  };
  const required: Capability[] = ["text"];

  if (input.imageCount) {
    required.push("vision");
    return { ...base, task: "vision", required, reason: "image attached" };
  }
  if ((input.attachmentChars ?? 0) > 60_000) {
    required.push("long_context");
    return { ...base, task: "long_context", required, reason: "long study material" };
  }
  if (lang.reply !== "en") {
    required.push("multilingual");
    return { ...base, task: "sinhala", required, reason: `reply=${lang.reply} (${lang.reason})` };
  }

  const hard = input.mode === "solve" || HARD_WORDS.test(q) || q.length > 400;
  const mathy = MATH_SIGNS.test(q);
  const numeric = NUM_WITH_UNIT.test(q) || /\d/.test(q);
  // Normalise O/L ids onto the subject families the model routes use
  const physicsUnit = /^ol-(motion|work|pressure|heat|light|electricity)/.test(topic?.unit ?? "");
  const chemUnit = /^ol-(matter|chem|carbon)/.test(topic?.unit ?? "");
  const family = (topic?.subject === "ol-science" ? (physicsUnit ? "physics" : chemUnit ? "chemistry" : "science") : (topic?.subject ?? "").replace(/^ol-/, "")) || (input.subject ?? "").toLowerCase();
  const subject = family.toLowerCase();

  if (subject.includes("math") && (hard || mathy)) return { ...base, task: "mathematics", required, reason: "maths problem" };
  if (subject.includes("physics") && (hard || (numeric && q.length > 40))) return { ...base, task: "physics", required, reason: "physics calculation" };
  if (subject.includes("chem") && (hard || q.length > 60 || input.mode === "explain")) return { ...base, task: "chemistry", required, reason: "chemistry explanation" };
  if (mathy && hard) return { ...base, task: "mathematics", required, reason: "maths signs + problem wording" };
  if (hard) return { ...base, task: "reasoning", required, reason: "complex request" };
  return { ...base, task: "general", required, reason: "simple question" };
}
