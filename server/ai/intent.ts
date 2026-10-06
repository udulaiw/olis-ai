// The OLIS subject router.
//
// Decides, for every message: subject · exam level · language · topic ·
// intent · difficulty · whether it needs calculation, retrieval or current
// information, and which answer strategy and AI task family to use.
//
// Rules only: no extra AI call per question (that would roughly halve the
// free-tier quota). Subjects, units and strategies come from the data-driven
// registry in server/knowledge/subjects.json; language, normalisation and
// follow-up logic lives in server/lang/nlp.mjs.
import { guessTopic, guessSubject, subjectById, subjectAtLevel, strategyFor, STRATEGIES, type ExamLevel, type StrategyId, type SubjectTaxonomy } from "../knowledge/taxonomy.js";
import { detectLanguage as detect, replyLanguage, expandQuery, resolveFollowUp, detectExamLevel, stripLanguageRequests } from "../lang/nlp.mjs";
import type { Capability, Task } from "./types.js";

export type LanguagePref = "en" | "si" | "ta" | "auto";
export type DetectedLanguage = "en" | "si" | "ta" | "singlish" | "mixed";
/** Language the ANSWER should be written in. si_mixed = Sinhala with English technical terms. */
export type ReplyLanguage = "en" | "si" | "si_mixed" | "ta";

export const detectLanguage = (text: string): DetectedLanguage => detect(text);

/**
 * What the student wants done. Drives the answer format and a few pipelines
 * (past papers, marking, correction), independent of the subject.
 */
export type Intent =
  | "greeting"
  | "concept_explanation"
  | "definition"
  | "problem_solving"
  | "comparison"
  | "correction"
  | "translation"
  | "summary"
  | "past_paper"
  | "marking"
  | "practice"
  | "planning"
  | "general";

export type Difficulty = "beginner" | "intermediate" | "advanced" | "exam" | "challenge";

/** Prompt role: `<level>-<strategy>` ("al-physics", "ol-biology") or a pipeline ("past-paper", "marking", "planner"). */
export type Specialist = string;

// ── Intent cues (English, Singlish and Sinhala; Sinhala intent words also arrive via expansion terms) ──
const GREETING = /^(hi|hello|hey|thanks|thank you|ok|okay|yo|cool|nice|good (morning|night|evening)|ආයුබෝවන්|ස්තූතියි|හායි|வணக்கம்|நன்றி)\b[\s!.?]*$/i;
const PAST_PAPER = /past ?papers?|model papers?|\bpaper questions?\b|\b(19|20)\d\d\b[^.?!\n]{0,50}\bquestions?\b|\bquestions?\b[^.?!\n]{0,50}\b(19|20)\d\d\b|ප්‍රශ්න ?පත්‍ර|පසුගිය|\bpaper (ek|eke)\b|prashnapathra|வினாத்தாள்/i;
const MARKING = /\bmark (my|this)\b|how many marks (would|will|do|can) i|grade my|evaluate my answer|check my answer|marking scheme|answer scheme|ලකුණු (දෙන්න|දීමේ|කීයද)|lakunu|புள்ளி/i;
const CORRECTION = /\b(correct|proofread|fix|improve|check) (my|this|the) (essay|sentence|sentences|paragraph|letter|grammar|writing|answer|composition|speech)|\bcorrect (this|my)\b|grammar mistakes?|is this (sentence )?(grammatically )?correct|නිවැරදි කරන්න|වැරදි හොයන්න|hari da|wardi/i;
const TRANSLATION = /\btranslat(e|ion)\b|පරිවර්තනය|parivarthana|மொழிபெயர்/i;
const COMPARE = /\b(compare|comparison|contrast|difference(s)? between|differentiate between|distinguish between|versus|vs\.?)\b|සසඳන්න|සංසන්දනය|අතර වෙනස|wenasa|ஒப்பிடு|வேறுபாடு/i;
const SUMMARY = /\b(summari[sz]e|summary|tl;?dr|key points|short note)\b|සාරාංශ|சுருக்கம்/i;
const PLANNING = /\b(study plan|timetable|revision plan|schedule|plan my)\b|කාලසටහන|අධ්‍යයන සැලැස්ම/i;
const PRACTICE = /\b(quiz|practice questions?|give me (a |an |some |\d+ )?([\w/-]+ ){0,3}(questions?|problems?|mcqs?)|similar questions?|test me|mcqs?)\b|ප්‍රශ්න (කිහිපයක්|දෙන්න)|prashna (dennna|denna)/i;
const SOLVE = /\bis (this|the) (argument|syllogism|inference) valid\b|\btest (the )?validity\b|\b(solve|calculate|compute|evaluate|find the|determine|prove|show that|derive|simplify|factori[sz]e|differentiate|integrate|work out|how (much|many|long|far|fast))\b|විසඳන්න|ගණනය|සොයන්න|ඔප්පු|hoyanna|wisandanna|visandanna|தீர்|கணக்கிடு/i;
const DEFINE = /\b(define|definition|meaning of|what does .{1,30} mean|what is meant by|state (the )?(law|principle|definition))\b|අර්ථ දක්වන්න|අර්ථය|வரையறு/i;
const EXPLAIN = /\b(what is|what are|what's|explain|why|how does|how do|describe|tell me about|discuss|account for|causes? of|effects? of)\b|කියන්නේ මොකක්ද|මොකක්ද|පැහැදිලි කරන්න|විස්තර කරන්න|ඇයි|කොහොමද|mokakda|kiyanne|explain karanna|என்ன|விளக்கு/i;

// "current" alone is NOT a signal: "electric current" is a physics topic
const CURRENT = /\b(latest|currently|current (affairs|events|status|president|prime minister|minister|government|population|rate|price|situation)|today'?s?|this year|right now|recent(ly)?|news)\b|\b(population|price|inflation rate|exchange rate|gdp) (of|in)\b|දැනට|වර්තමාන|(^|\s)අද(\s|$)|தற்போது/i;

const BEGINNER = /like i'?m (5|five|new|a beginner)|\b(eli5|basics?|beginner|simple terms|simply|for a beginner|new to)\b|සරලව|ලේසියෙන්|saralawa/i;
const EXAM = /\b(according to (the )?(a\/l|o\/l)?\s?syllabus|syllabus|exam(ination)? (level|style|question)|for the exam|marks?|past paper)\b|විභාග|ලකුණු/i;
const CHALLENGE = /\b(challenge|olympiad|hardest|very hard|tricky|advanced problem)\b/i;
const ADVANCED = /\b(prove|derive|hence|rigorous|in depth|in detail|deep(ly)?)\b/i;

const MATH_SIGNS = /[∫∑√π≤≥≠∞θ²³]|\\frac|\\int|d\/dx|dy\/dx|\^\d|\b(lim|sin|cos|tan|log|ln)\b|\d\s*[x-z]\b|[x-z]\s*[²³]|=\s*-?\d/i;
const HARD_WORDS = /\b(prove|show that|hence|deduce|find the (value|values|range|equation|maximum|minimum)|derive|evaluate|solve|calculate|determine)\b/i;
const NUM_WITH_UNIT = /\d+(\.\d+)?\s*(m\/s|ms-1|m s-1|m\/s2|n\b|kg|j\b|w\b|v\b|a\b|Ω|ohm|mol|k\b|°c|pa\b|hz|g\b|cm|mm|km|dm3|cm3|ml|l\b)/i;
/** An equation in one unknown ("2x² - 5x - 3 = 0", "3x + 4 = 10"). */
const EQUATION = /[a-z](\s*(\^\s*\d|[²³]))?[^=\n]{0,40}=\s*-?\d|\d\s*[a-z]\s*[+\-=]/i;

function intentOf(q: string, terms: string[], mode: string, hasAttachment: boolean): Intent {
  const all = `${q} ${terms.join(" ")}`;
  if (GREETING.test(q.trim())) return "greeting";
  if (mode === "plan" || PLANNING.test(all)) return "planning";
  if (mode === "summarize" || (hasAttachment && SUMMARY.test(all))) return "summary";
  if (mode === "quiz" || PRACTICE.test(all)) return "practice";
  if (MARKING.test(all)) return "marking";
  if (PAST_PAPER.test(all)) return "past_paper";
  if (CORRECTION.test(all)) return "correction";
  if (TRANSLATION.test(all)) return "translation";
  if (COMPARE.test(all)) return "comparison";
  if (mode === "solve" || SOLVE.test(all) || (EQUATION.test(q) && MATH_SIGNS.test(q))) return "problem_solving";
  if (SUMMARY.test(all)) return "summary";
  if (DEFINE.test(all)) return "definition";
  if (mode === "explain" || mode === "simplify" || EXPLAIN.test(all)) return "concept_explanation";
  return "general";
}

function difficultyOf(q: string, intent: Intent, level: ExamLevel | null, mode: string, terms: string[]): Difficulty {
  const all = `${q} ${terms.join(" ")}`;
  if (mode === "simplify" || BEGINNER.test(all)) return "beginner";
  if (CHALLENGE.test(all)) return "challenge";
  if (EXAM.test(all) || intent === "past_paper" || intent === "marking") return "exam";
  if (ADVANCED.test(all)) return "advanced";
  return level === "AL" && intent === "problem_solving" ? "advanced" : "intermediate";
}

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
  /** Registry subject id ("geography", "ol-science"), when one was recognised. */
  subject: string | null;
  /** Human subject name for the UI. */
  subjectName: string | null;
  /** Unit name for the UI ("Climatology"). */
  topicName: string | null;
  /** Answer strategy / discipline ("physics" for an O/L Science electricity question). */
  discipline: StrategyId;
  intent: Intent;
  difficulty: Difficulty;
  requiresCalculation: boolean;
  requiresRetrieval: boolean;
  requiresCurrentInfo: boolean;
  specialist: Specialist;
  /** English search terms found for a Sinhala / Singlish message. */
  terms: string[];
  /** What to search the knowledge base with (the original message is untouched). */
  retrievalQuery: string;
  followUp: { kind: string; hint: string } | null;
}

/** Mathematics questions often carry no subject word ("Solve 2x² - 5x - 3 = 0"): pick the maths subject for the level. */
function mathsFallback(level: ExamLevel | null): SubjectTaxonomy | undefined {
  return subjectById(level === "OL" ? "ol-mathematics" : "combined-mathematics");
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
  // "General" is the UI's "no subject chosen", not a hint
  const hint = input.subject && !/^general$/i.test(input.subject) ? input.subject : undefined;

  // Topic guessing runs on the English-expanded text so "වේගය" / "speed eka" / "speed" land in the same unit.
  // Answer-language requests ("in Sinhala") are removed so they don't look like the Sinhala-language subject.
  const topicText = stripLanguageRequests(follow.isFollowUp ? follow.retrievalQuery : expansion.expanded);
  const topicGuess = guessTopic(topicText, hint, examLevel);
  let subj: SubjectTaxonomy | undefined = topicGuess ? subjectById(topicGuess.subject) : (guessSubject(topicText, hint, examLevel) ?? undefined);
  if (subj) subj = subjectAtLevel(subj, examLevel);

  const intent = intentOf(q, expansion.terms, input.mode, Boolean(input.attachmentChars));
  const mathy = MATH_SIGNS.test(q) || EQUATION.test(q);
  if (!subj && mathy && intent === "problem_solving") subj = mathsFallback(examLevel);

  const unitId = topicGuess && subj && topicGuess.subject === subj.id ? topicGuess.unit.id : undefined;
  const topic = unitId && subj ? { subject: subj.id, unit: unitId } : undefined;
  const topicName = unitId && subj ? (subj.units.find((u) => u.id === unitId)?.name ?? null) : null;
  const discipline = subj ? strategyFor(subj.id, unitId) : "general";

  const numeric = NUM_WITH_UNIT.test(q) || /\d/.test(q);
  const requiresCalculation =
    intent === "problem_solving" && (mathy || numeric || ["mathematics", "physics", "chemistry"].includes(discipline)) && !["language", "history"].includes(discipline);
  const requiresRetrieval = !["greeting", "planning", "translation"].includes(intent) && q.trim().length > 3;
  const requiresCurrentInfo = CURRENT.test(q);
  const difficulty = difficultyOf(q, intent, examLevel, input.mode, expansion.terms);

  const lv = examLevel === "OL" ? "ol" : examLevel === "AL" ? "al" : subj?.level === "OL" ? "ol" : subj?.level === "AL" ? "al" : "any";
  const specialist: Specialist =
    input.mode === "plan" || intent === "planning" ? "planner" : intent === "past_paper" ? "past-paper" : intent === "marking" ? "marking" : `${lv}-${discipline}`;

  const base = {
    language,
    reply: lang.reply as ReplyLanguage,
    replyReason: lang.reason,
    topic,
    examLevel,
    subject: subj?.id ?? null,
    subjectName: subj?.name ?? null,
    topicName,
    discipline,
    intent,
    difficulty,
    requiresCalculation,
    requiresRetrieval,
    requiresCurrentInfo,
    specialist,
    terms: expansion.terms,
    retrievalQuery: follow.isFollowUp ? follow.retrievalQuery : expansion.expanded,
    followUp: follow.isFollowUp ? { kind: follow.kind as string, hint: follow.hint } : null,
  };
  const required: Capability[] = ["text"];

  // ── Model task (which family of models the AI router tries first) ──
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
  const family = STRATEGIES[discipline]?.task ?? "general";

  if (family === "mathematics" && (hard || mathy || intent === "problem_solving")) return { ...base, task: "mathematics", required, reason: "maths problem" };
  if (family === "physics" && (hard || (numeric && q.length > 40) || requiresCalculation)) return { ...base, task: "physics", required, reason: "physics calculation" };
  if (family === "chemistry" && (hard || q.length > 60 || input.mode === "explain" || requiresCalculation)) return { ...base, task: "chemistry", required, reason: "chemistry explanation" };
  if (mathy && hard) return { ...base, task: "mathematics", required, reason: "maths signs + problem wording" };
  if (hard || (family === "reasoning" && intent === "problem_solving")) return { ...base, task: "reasoning", required, reason: "complex request" };
  return { ...base, task: "general", required, reason: "simple question" };
}

/** Confidence label shown to the student, from retrieval evidence. Never "confident" without a verified OLIS source. */
export type Confidence = "confident" | "likely" | "uncertain" | "insufficient_source";
export function confidenceOf(grounding: "strong" | "weak" | "none" | undefined, intent: Intent): Confidence | null {
  if (!grounding || intent === "greeting" || intent === "planning" || intent === "translation") return null;
  if (grounding === "strong") return "confident";
  if (grounding === "weak") return "likely";
  // No OLIS source: maths and pure reasoning can still be checked (math_check), syllabus facts can't
  return intent === "problem_solving" ? "uncertain" : "insufficient_source";
}
