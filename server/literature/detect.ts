// ─────────────────────────────────────────────
// OLIS Literature & Language Intelligence: request analysis.
//
// Runs inside the subject router (server/ai/intent.ts) and decides, for a
// literature / language / reading / writing question:
//   domain   literature · language · comprehension · writing
//   form     poetry · prose · novel · short_story · drama
//   task     what the student wants done (device analysis, essay, feedback …)
//   mode     how to answer (quick · teach · exam · deep · essay · feedback · socratic · revision)
//   command  the exam command word ("explain", "to what extent" …)
//   hasText  whether the actual text is in front of OLIS (message, earlier turn, attachment)
//
// Rules only, like the rest of the router: no extra model call per question.
// Returns null for everything that is not a literature/language question, so
// other subjects are untouched.
// ─────────────────────────────────────────────

export type LitDomain = "literature" | "language" | "comprehension" | "writing";
export type LitForm = "poetry" | "prose" | "novel" | "short_story" | "drama";
export type LitTask =
  | "analysis"
  | "devices"
  | "theme"
  | "character"
  | "context"
  | "compare"
  | "essay"
  | "feedback"
  | "question_analysis"
  | "grammar"
  | "vocabulary"
  | "comprehension"
  | "paraphrase"
  | "summary"
  | "creative"
  | "general";
export type AnswerMode = "quick" | "teach" | "exam" | "deep" | "essay" | "feedback" | "socratic" | "revision";
export type CommandWord = "explain" | "describe" | "analyse" | "discuss" | "compare" | "evaluate" | "how_writer" | "to_what_extent" | "comment" | "identify";
export type Pitch = "beginner" | "intermediate" | "advanced";

export interface LitProfile {
  domain: LitDomain;
  form: LitForm | null;
  task: LitTask;
  mode: AnswerMode;
  /** True when the mode came from the student's wording, not a default. */
  modeExplicit: boolean;
  command: CommandWord | null;
  /** The text being discussed is available (in this message, an earlier turn or an attachment). */
  hasText: boolean;
  textWhere: "message" | "history" | "attachment" | null;
  /** Which literature: the language the TEXT is in (not the answer language). */
  textLanguage: "en" | "si" | "ta";
  pitch: Pitch;
  /** Short label for the UI ("Poetry · Deep analysis"). */
  label: string;
}

// ── Cues ─────────────────────────────────────────────────────────────────────
// Strong: on its own, this is a literature question.
// Device names that mean literature wherever they appear ("paradox", "irony", "refrain", "apostrophe" also mean other things)
const DEVICES =
  "metaphors?|similes?|personification|alliteration|assonance|onomatopoeia|hyperbole|oxymorons?|juxtaposition|enjambe?ment|caesura|dramatic irony|foreshadowing|anaphora|epiphora|allegory|satire|euphemism|flashbacks?|symbolism|imagery|rhyme scheme|synecdoche|metonymy|literary devices?|poetic devices?|figures? of speech|figurative language|sound devices?";
const MORE_DEVICES = "irony|ironic|paradox(es)?|puns?|motifs?|repetition|contrast|tone|mood|rhythm|meter|metre|refrain|caesura";
const STRONG_LIT = new RegExp(
  `\\b(${DEVICES}|poems?|poetry|poets?|poetic|stanzas?|sonnets?|ballads?|odes?|elegy|haiku|lyric poem|novels?|novelists?|novella|short stor(y|ies)|drama|dramatist|playwright|soliloqu(y|ies)|monologues?|stage directions?|an aside|the play|this play|in the play|act \\d|scene \\d|protagonist|antagonist|narrator|narrative (voice|perspective|technique)|characteri[sz]ation|literary|literature|persona of|the speaker of|critical appreciation|literary appreciation)\\b` +
    `|කවිය|කවි|කාව්‍ය|පද්‍ය|නවකතා|කෙටිකතා|නාට්‍ය|උපමා|රූපක|අලංකාර|සාහිත්‍ය|ගීතය|கவிதை|நாவல்|நாடக|சிறுகதை|உவமை|உருவக|இலக்கிய`,
  "iu",
);
// Weak: literature-flavoured, but also used elsewhere ("ASCII character", "theme of the conference").
const WEAK_LIT =
  /\b(themes?|tragic|tragedy|hero(ine)?|villain|downfall|climax|characters?|tone|mood|irony|ironic|point of view|symbol(s|ic)?|setting|plot|the (author|writer|poet)|writer'?s|author'?s|the story|the passage|extract|lines? \d+|this line|imagery|interpret(ation)?|meaning of the (poem|line|title|story)|title of the)\b|තේමා|චරිත|සංකේත|කථකයා|கருப்பொருள்|கதாபாத்திர/iu;

const LANGUAGE =
  /\b(grammar|grammatical(ly)?|tenses?|past (simple|perfect|continuous)|present (simple|perfect|continuous)|future tense|passive voice|active voice|reported speech|indirect speech|direct speech|subject[- ]verb agreement|parts of speech|nouns?|pronouns?|adjectives?|adverbs?|prepositions?|conjunctions?|articles? (a|an|the)|clauses?|phrases?|modals?|modal verbs?|conditionals?|connectives?|punctuation|apostrophes?|commas?|spelling|vocabulary|synonyms?|antonyms?|idioms?|phrasal verbs?|sentence structure|cohesion|formal (and|or|vs) informal|register)\b|ව්‍යාකරණ|සන්ධි|සමාස|විභක්ති|කාරක|ක්‍රියා පද|නාම පද|இலக்கணம்|புணர்ச்சி|வேற்றுமை/iu;
const COMPREHENSION = /\b(comprehension|unseen passage|read(ing)? (the|this) passage|according to the (passage|text|extract|writer|author)|from the passage|in the passage|infer(ence|red)?|what can (we|you) infer|implied|imply)\b|ඡේදය|අවබෝධය|பந்தி|புரிதல்/iu;
// "write a story", "help me write my speech" (the thing to write follows the verb), not "how does the writer create tension in the story"
const CREATIVE =
  /\b(write|draft|compose|create|make up|help me (write|start|plan|draft))( me)?( (a|an|my|the|some|one|two|three|\d+))?( (short|descriptive|narrative|formal|informal|persuasive|creative|funny|sad|scary))?\s+(story|stories|poem|speech|dialogue|descriptive essay|narrative essay|narrative|article|letter|diary entry|blog post|report|notice|email|opening|ending|description)\b|\bcreative writing\b|\bstory (ideas?|prompts?)\b|කතාවක් ලියන්න|කවියක් ලියන්න|රචනාවක් ලියන්න|ලිපියක් ලියන්න|கதை எழுது|கட்டுரை எழுது/iu;

// ── Task cues ────────────────────────────────────────────────────────────────
const FEEDBACK = /\b(check|mark|grade|evaluate|assess|review|rate|give (me )?feedback on|improve|critique)\b[^.?!\n]{0,20}\b(my|this) (answer|essay|analysis|paragraph|response|writing|story|poem|speech|letter|introduction|conclusion|work)\b|\bhow (good|well) is my\b|\bhow many marks\b|\bfeedback\b|මගේ (පිළිතුර|රචනාව)|බලලා කියන්න/iu;
const GRAMMAR_FIX = /\b(correct|proofread|fix|check)\b[^.?!\n]{0,20}\b(grammar|sentences?|spelling|punctuation|tenses?)\b|\bis this (sentence )?(grammatically )?correct\b|\bgrammar mistakes?\b|නිවැරදි කරන්න|වැරදි/iu;
const QUESTION_ANALYSIS = /\bwhat (is|does) (this|the) question (asking|want|mean)|\bwhat does the examiner (want|expect)|\bhow (should|do) i (answer|approach|tackle|structure) (this|the|a|an)\b|\bbreak (down|this) (this |the )?question|\bunderstand (this|the) question\b|\bcommand words?\b|ප්‍රශ්නය (අහන්නේ|තේරෙන්නේ)/iu;
const ESSAY = /\b(essay|model answer|answer plan|essay plan|outline (an|the|my) (essay|answer)|thesis statement|introduction (for|to)|conclusion (for|to)|build (an|the|my) (essay|argument|answer)|structure (an|my|the) (essay|answer))\b|රචනාව|රචනා|නිබන්ධ|கட்டுரை/iu;
const COMPARE_RE = /\b(compare|comparison|contrast|similarit(y|ies)|differences? between|versus|vs\.?)\b|සසඳන්න|සංසන්දනය|ஒப்பிடு/iu;
const DEVICE_TASK = new RegExp(`\\b(${DEVICES}|${MORE_DEVICES}|devices?|techniques?|language features?|what (device|technique)|figures? of speech)\\b|උපමා|රූපක|අලංකාර|உவமை|உருவக`, "iu");
const CHARACTER = /\b(characters?|characteri[sz]ation|protagonist|antagonist|character arc|motivations?|personality of|portray(al|ed|s)?)\b|චරිත|கதாபாத்திர/iu;
const THEME = /\b(themes?|central idea|main idea|message|moral|what is the poem about|what is the story about)\b|තේමා|පණිවිඩය|කරුණ|கருப்பொருள்|செய்தி/iu;
const CONTEXT = /\b(context|background|historical|social|cultural|biography|when was .* written|why did the (author|poet|writer) write)\b|පසුබිම|பின்னணி/iu;
const PARAPHRASE = /\b(paraphrase|rephrase|put (it|this) in (simple|my own|plain) words|in simple (words|english|terms)|simplif(y|ied)|rewrite (it|this) simply|what does (this|the) (line|stanza|passage|sentence) mean)\b|සරල කරන්න|සරලව|எளிமையாக/iu;
const SUMMARY_RE = /\b(summari[sz]e|summary|synopsis|plot of|retell|gist)\b|සාරාංශ|சுருக்கம்/iu;
const VOCAB = /\b(meaning of (the )?word|what does (the )?word|define the word|synonyms?|antonyms?|word meaning|vocabulary|idioms?|what does "[^"]{1,30}" mean)\b|වචනයේ තේරුම|அர்த்தம்/iu;

// ── Mode cues ────────────────────────────────────────────────────────────────
const SOCRATIC = /\b(socratic|don'?t (give|tell) me the answer|guide me|ask me (questions|guiding questions)|help me (think|figure|work) (it )?out|just (a )?hints?|let me try)\b|උත්තරේ (දෙන්න එපා|කියන්න එපා)|hint එකක්/iu;
const REVISION = /\b(revision|revise|short notes|quick notes|key points|cheat ?sheet|bullet notes|notes on|flash ?cards?)\b|කෙටි සටහන්|සටහන්|குறிப்புகள்/iu;
const EXAM_MODE = /\b(exam|exam[- ]style|exam answer|model answer|for the paper|marks?|marking|past paper|o\/l|a\/l)\b|විභාග|ලකුණු|பரீட்சை/iu;
const DEEP = /\b(in depth|in detail|detailed|deep(ly)?|thorough(ly)?|critical(ly)?|close reading|line by line|full analysis|deep analysis)\b|විස්තරාත්මක|ගැඹුරින්|விரிவாக/iu;
const TEACH = /\b(teach me|from the (beginning|start|basics)|step by step|i don'?t understand|i'?m confused|explain (it )?like|basics?|beginner|new to)\b|මුල ඉඳන්|තේරෙන්නෙ නෑ|තේරෙන්නේ නැහැ|උගන්වන්න|கற்றுக்கொடு/iu;
const QUICK = /\b(quick(ly)?|brief(ly)?|in (one|a) (line|sentence)|one[- ]liner|short answer|just tell me|tl;?dr)\b|කෙටියෙන්|சுருக்கமாக/iu;

const COMMAND: [CommandWord, RegExp][] = [
  ["to_what_extent", /\bto what extent\b|කොතෙක් දුරට/iu],
  ["how_writer", /\bhow (does|do|did) the (writer|poet|author|playwright|dramatist|novelist|speaker|narrator)\b|\bhow is .{1,60} (presented|portrayed|conveyed|shown|created)\b/iu],
  ["evaluate", /\b(evaluate|assess|judge|how effective(ly)?|how successful(ly)?)\b|ඇගයීම/iu],
  ["compare", /\b(compare|contrast)\b|සසඳන්න|ஒப்பிடு/iu],
  ["discuss", /\bdiscuss\b|සාකච්ඡා කරන්න/iu],
  ["analyse", /\banaly[sz]e\b|විශ්ලේෂණය|பகுப்பாய்/iu],
  ["comment", /\bcomment on\b|අදහස් දක්වන්න/iu],
  ["identify", /\b(identify|pick out|find (a|an|the|two|three|\d) .{0,30}(device|example|word|phrase|line)s?|name (a|the|two|three) )\b|හඳුනාගන්න|හොයන්න/iu],
  ["describe", /\bdescribe\b|විස්තර කරන්න|விவரி/iu],
  ["explain", /\b(explain|why)\b|පැහැදිලි කරන්න|ඇයි|விளக்கு/iu],
];

const LANG_SUBJECT = /(^|-)(sinhala|english|tamil)$/;
/** Computing words: "character set" and "string" are ICT, whatever the registry guessed. */
const NOT_LIT = /\b(ascii|unicode|utf-?8|character (sets?|encoding|codes?)|strings? (variable|type|in python|in java)|data types?|font|keyboard)\b/iu;

/** Is there a block of actual text to analyse? (a pasted poem, passage, quoted extract or the student's own answer) */
export function findText(s: string): boolean {
  if (!s) return false;
  const t = s.trim();
  const lines = t.split(/\n/).filter((l) => l.trim());
  if (lines.length >= 3 && t.length >= 120) return true; // a pasted poem / passage / answer
  if (lines.length >= 4 && t.length >= 60) return true; // a short poem (Sinhala lines are short)
  if (/["“”'‘’]([^"“”\n]{60,})["“”'‘’]/u.test(t)) return true; // a quoted extract
  if (/(passage|poem|extract|text|my answer|my essay|my paragraph|my introduction|my conclusion|my story|my poem|my analysis|stanza|lines?)\s*[:\-–]\s*\S[\s\S]{30,}/iu.test(t)) return true;
  return t.length >= 600; // a long message is almost always pasted material
}

function formOf(all: string, text: string | null): LitForm | null {
  if (/\b(drama|the play|this play|in the play|playwright|dramatist|soliloqu(y|ies)|monologues?|asides?|stage directions?|act \d|scene \d)\b|නාට්‍ය|நாடக/iu.test(all)) return "drama";
  if (/\b(poems?|poetry|poets?|poetic|stanzas?|verses?|sonnets?|ballads?|odes?|elegy|haiku|rhyme|enjambe?ment|caesura)\b|කවිය|කවි|කාව්‍ය|පද්‍ය|ගීතය|கவிதை/iu.test(all)) return "poetry";
  if (/\b(short stor(y|ies))\b|කෙටිකතා|சிறுகதை/iu.test(all)) return "short_story";
  if (/\b(novels?|novella|novelist|chapters?)\b|නවකතා|நாவல்/iu.test(all)) return "novel";
  if (/\b(prose|extract|passage|story|narrator|narrative)\b/iu.test(all)) return "prose";
  // A pasted text with many short lines reads as a poem
  if (text) {
    const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
    if (lines.length >= 4 && lines.reduce((a, l) => a + l.length, 0) / lines.length < 55) return "poetry";
  }
  return null;
}

function taskOf(q: string, domain: LitDomain, intent: string): LitTask {
  if (FEEDBACK.test(q) || intent === "marking") return "feedback";
  if (QUESTION_ANALYSIS.test(q)) return "question_analysis";
  if (domain === "language" && (GRAMMAR_FIX.test(q) || intent === "correction")) return "grammar";
  const creativeForm = /\b(story|stories|poem|speech|dialogue|letter|article|diary|blog|notice|email|report|description)\b|කතාව|කවිය|ලිපිය|கதை|கடிதம்/iu.test(q);
  if (ESSAY.test(q) && !(CREATIVE.test(q) && creativeForm)) return "essay";
  if (domain === "writing" || CREATIVE.test(q)) return "creative";
  if (COMPARE_RE.test(q)) return "compare";
  if (PARAPHRASE.test(q)) return "paraphrase";
  if (SUMMARY_RE.test(q)) return "summary";
  if (domain === "comprehension") return "comprehension";
  if (domain === "language") return VOCAB.test(q) ? "vocabulary" : "grammar";
  if (DEVICE_TASK.test(q)) return "devices";
  if (CHARACTER.test(q)) return "character";
  if (THEME.test(q)) return "theme";
  if (CONTEXT.test(q)) return "context";
  if (VOCAB.test(q)) return "vocabulary";
  return domain === "literature" ? "analysis" : "general";
}

function modeOf(q: string, task: LitTask, intent: string, difficulty: string, hasText: boolean): { mode: AnswerMode; explicit: boolean } {
  if (SOCRATIC.test(q)) return { mode: "socratic", explicit: true };
  if (task === "feedback") return { mode: "feedback", explicit: true };
  if (task === "essay") return { mode: "essay", explicit: true };
  if (REVISION.test(q)) return { mode: "revision", explicit: true };
  if (QUICK.test(q)) return { mode: "quick", explicit: true };
  if (TEACH.test(q) || difficulty === "beginner") return { mode: "teach", explicit: true };
  if (EXAM_MODE.test(q) || difficulty === "exam") return { mode: "exam", explicit: true };
  if (DEEP.test(q) || difficulty === "advanced" || difficulty === "challenge") return { mode: "deep", explicit: true };
  // Defaults
  if (intent === "definition" || task === "vocabulary") return { mode: "quick", explicit: false };
  if (hasText && ["analysis", "devices", "theme", "character", "compare"].includes(task)) return { mode: "deep", explicit: false };
  return { mode: "teach", explicit: false };
}

const FORM_LABEL: Record<LitForm, string> = { poetry: "Poetry", prose: "Prose", novel: "Novel", short_story: "Short story", drama: "Drama" };
const DOMAIN_LABEL: Record<LitDomain, string> = { literature: "Literature", language: "Language", comprehension: "Comprehension", writing: "Writing" };
const MODE_LABEL: Record<AnswerMode, string> = { quick: "Quick answer", teach: "Teach mode", exam: "Exam mode", deep: "Deep analysis", essay: "Essay mode", feedback: "Feedback", socratic: "Socratic", revision: "Revision notes" };
export const modeLabel = (m: AnswerMode) => MODE_LABEL[m];

export interface LitInput {
  question: string;
  /** Registry subject id chosen by the router, if any. */
  subject: string | null;
  /** Registry subject group ("language", "science" …). */
  group: string | null;
  /** Answer strategy chosen by the router ("literature", "comprehension", "language" …). */
  discipline: string;
  intent: string;
  difficulty: string;
  history?: { role: string; content: string }[];
  attachmentChars?: number;
  /** A literary work from the OLIS knowledge base that the question names (server/rag.ts → workMentioned). */
  knownWork?: string | null;
}

/** Literature / language profile of a question, or null when it isn't one. */
export function detectLiterature(input: LitInput): LitProfile | null {
  const q = input.question ?? "";
  // Cues are read from the question only, never from pasted text (a pasted physics passage is not a literature request);
  // the first two lines are enough to catch "Analyse this poem:" headers.
  const head = q.length > 400 ? q.split("\n").slice(0, 2).join("\n").slice(0, 400) : q;
  const inMessage = findText(q);
  const lastUserText = [...(input.history ?? [])].reverse().filter((m) => m.role === "user").slice(0, 3).find((m) => findText(m.content))?.content ?? null;
  const strong = STRONG_LIT.test(head);
  const weakCount = (head.match(new RegExp(WEAK_LIT.source, "giu")) ?? []).length;
  const langSubject = input.group === "language" || LANG_SUBJECT.test(input.subject ?? "");
  const otherSubject = Boolean(input.subject) && !langSubject && !["general-knowledge", "study-skills"].includes(input.subject ?? "");
  const litDiscipline = ["literature", "comprehension"].includes(input.discipline);
  // Translation has its own pipeline; computing questions that mention "characters" are ICT
  if (input.intent === "translation" || input.intent === "greeting") return null;
  if (NOT_LIT.test(head) && !strong) return null;

  let domain: LitDomain | null = null;
  if (input.discipline === "comprehension" || COMPREHENSION.test(head)) domain = "comprehension";
  // A follow-up like "what is the tone?" right after the student pasted a poem is about that poem
  else if (litDiscipline || strong || (weakCount >= 2 && !otherSubject) || (weakCount >= 1 && (langSubject || (Boolean(lastUserText) && !otherSubject))) || (input.knownWork && !otherSubject)) domain = "literature";
  if (CREATIVE.test(head) && !strong && (!otherSubject || langSubject)) domain = "writing";
  // "Write an essay about my school" (no other subject): a writing task, handled with the essay method
  if (!domain && ESSAY.test(head) && (!otherSubject || langSubject)) domain = "writing";
  if (!domain && (LANGUAGE.test(head) || (langSubject && /correction|translation/.test(input.intent))) && !otherSubject) domain = "language";
  if (!domain && langSubject && input.intent === "marking") domain = "writing";
  // A history / geography / science essay is not a literature essay
  if (domain && otherSubject && !strong && !litDiscipline) return null;
  if (!domain) return null;

  const hasText = inMessage || Boolean(input.attachmentChars) || Boolean(lastUserText);
  const textWhere = inMessage ? "message" : input.attachmentChars ? "attachment" : lastUserText ? "history" : null;
  const sample = inMessage ? q : lastUserText;
  const form = domain === "literature" || domain === "comprehension" ? formOf(`${head} ${lastUserText && !inMessage ? lastUserText.slice(0, 200) : ""}`, sample) : null;
  const task = taskOf(head, domain, input.intent);
  const { mode, explicit } = modeOf(head, task, input.intent, input.difficulty, hasText);
  const command = COMMAND.find(([, re]) => re.test(head))?.[0] ?? null;

  const subj = input.subject ?? "";
  // The text's language: from the text itself when we have it, else the subject, else the script of the question ("English poem" wins)
  const probe = sample ?? (/\benglish\b|ඉංග්‍රීසි/iu.test(head) ? "" : head);
  const textLanguage: LitProfile["textLanguage"] = /sinhala/.test(subj) || /[\u0D80-\u0DFF]/.test(probe) ? "si" : /tamil/.test(subj) || /[\u0B80-\u0BFF]/.test(probe) ? "ta" : "en";
  // Pitch follows the student's level and explicit requests, never a default mode
  const pitch: Pitch = input.difficulty === "beginner" || (explicit && mode === "teach") ? "beginner" : input.difficulty === "advanced" || input.difficulty === "challenge" || (explicit && mode === "deep") ? "advanced" : "intermediate";

  const label = [form ? FORM_LABEL[form] : DOMAIN_LABEL[domain], MODE_LABEL[mode]].join(" · ");
  return { domain, form, task, mode, modeExplicit: explicit, command, hasText, textWhere, textLanguage, pitch, label };
}
