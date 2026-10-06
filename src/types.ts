// ─────────────────────────────────────────────
// Shared OLIS types
// ─────────────────────────────────────────────

export type Subject = "Physics" | "Chemistry" | "Combined Mathematics" | "Biology" | "General";
export type Level = "Beginner" | "Intermediate" | "Advanced";
export type LearningStyle = "Simple explanation" | "Detailed explanation" | "Step-by-step" | "Exam focused";

export const SUBJECTS: Subject[] = ["Physics", "Chemistry", "Combined Mathematics", "Biology", "General"];
export const LEVELS: Level[] = ["Beginner", "Intermediate", "Advanced"];
export const STYLES: LearningStyle[] = ["Simple explanation", "Detailed explanation", "Step-by-step", "Exam focused"];

export interface LearningContext {
  subject: Subject;
  level: Level;
  style: LearningStyle;
}

/** Answer language. "auto" = match whatever the student writes (English, Sinhala, Tamil or Singlish). */
export type Language = "auto" | "en" | "si" | "ta";
export const LANGUAGES: { id: Language; label: string }[] = [
  { id: "auto", label: "Auto" },
  { id: "en", label: "English" },
  { id: "si", label: "සිංහල" },
  { id: "ta", label: "தமிழ்" },
];

export type Depth = "quick" | "standard" | "deep";

/** Which G.C.E. exam the student is preparing for ("" = not set). */
export type ExamLevel = "" | "OL" | "AL";
export const EXAM_LEVELS: { id: ExamLevel; label: string }[] = [
  { id: "", label: "Not set" },
  { id: "OL", label: "O/L" },
  { id: "AL", label: "A/L" },
];

/**
 * Non-sensitive learning preferences, saved in this browser only and sent with
 * each request so OLIS can tailor answers.
 */
export interface StudyProfile {
  stream: string;
  subjects: string[];
  language: Language;
  depth: Depth;
  currentTopic: string;
  weakTopics: string[];
  goals: string;
  examLevel?: ExamLevel;
}

export const STREAMS = ["", "Physical Science (Maths)", "Biological Science", "Commerce", "Arts", "Technology", "Other"] as const;
export const PROFILE_SUBJECTS = ["Combined Mathematics", "Physics", "Chemistry", "Biology", "ICT", "Mathematics (O/L)", "Science (O/L)", "English", "Sinhala", "History", "Geography", "Commerce", "Other"] as const;

/** What the student wants OLIS to do. "ask" = auto-detect from the message. */
export type Mode = "ask" | "explain" | "solve" | "plan" | "quiz" | "summarize" | "simplify";

export type Difficulty = "Easy" | "Medium" | "Hard";

export interface QuizQuestion {
  q: string;
  options: string[];
  answer: number; // index into options
  explanation: string;
  difficulty?: Difficulty;
}

export interface Quiz {
  title: string;
  subject: Subject;
  difficulty: Difficulty | "Mixed";
  questions: QuizQuestion[];
}

export interface QuizProgress {
  answers: (number | null)[];
  current: number;
  finished: boolean;
}

export interface Flashcard {
  front: string;
  back: string;
}

export interface StudyPlanDay {
  day: number;
  date: string; // ISO yyyy-mm-dd
  phase: "Learn" | "Practice" | "Revise" | "Mock exam" | "Light review";
  focus: string;
  tasks: { label: string; minutes: number }[];
}

export interface StudyPlan {
  subject: string;
  examDate: string;
  days: number;
  hoursPerDay: number;
  schedule: StudyPlanDay[];
  tips: string[];
}

export type MessageStatus = "thinking" | "streaming" | "done" | "error" | "stopped";

export interface Attachment {
  name: string;
  chars: number;
}

/** An image the student attached (e.g. a photo of a question). Only a small preview is saved. */
export interface ImageAttachment {
  name: string;
  /** Small JPEG data URL for the chat bubble (the full image is not stored). */
  thumb: string;
}

export interface Source {
  ref: number;
  kind: "notes" | "paper" | "wikipedia" | "web";
  title: string;
  url: string | null;
  snippet: string;
}

/** What OLIS understood the question to be (OLIS Cloud), shown under the answer. */
export interface AnswerMeta {
  subject: string | null;
  subjectName: string | null;
  topic: string | null;
  level: "OL" | "AL" | null;
  intent: string;
  reply: string;
  /** confident = matched a verified OLIS source; insufficient_source = nothing in OLIS confirms it. */
  confidence: "confident" | "likely" | "uncertain" | "insufficient_source" | null;
  /** Live data used: source and how fresh it is. */
  live?: { domain: string; ok: boolean; source: string; retrievedAt: string; dataTimestamp: string | null } | null;
  /** How much saved context was used (counts). */
  context?: { memories: number; previousChats: number };
  /** Literature & language profile: form and answer mode ("Poetry · Deep analysis"). */
  lit?: { domain: string; form: string | null; task: string; mode: string; label: string } | null;
}

/** Something OLIS remembers about the student across chats. Stored in this browser only. */
export interface MemoryItem {
  /** A newer fact with the same key replaces the old one. */
  key: string;
  memory: string;
  category: "education" | "subjects" | "goals" | "preferences" | "language" | "learning_style" | "interests" | "general";
  /** 1–5: how useful long-term. */
  importance: number;
  value?: string;
  createdAt: number;
  updatedAt: number;
  /** "auto" = OLIS saved it from a message; "manual" = the student added it. */
  origin?: "auto" | "manual";
}

/** A message from an earlier chat, sent when the student refers back to it. */
export interface RecallItem {
  chat: string;
  date: string;
  role: "user" | "assistant";
  text: string;
}

export interface AgentStep {
  id: string;
  label: string;
  status: "running" | "done" | "failed";
}

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: number;
  mode?: Mode;
  status?: MessageStatus;
  error?: string;
  quiz?: Quiz;
  quizProgress?: QuizProgress;
  attachment?: Attachment;
  images?: ImageAttachment[];
  /** Hidden text sent to the engine (e.g. attached file contents). Never shown as a bubble. */
  hiddenContext?: string;
  /** Agent research steps (OLIS Cloud) */
  steps?: AgentStep[];
  /** Sources the answer can cite as [n] */
  sources?: Source[];
  /** Subject / topic / confidence OLIS detected (OLIS Cloud) */
  meta?: AnswerMeta;
  /** Which engine produced this answer */
  engine?: EngineKind;
  feedback?: "up" | "down";
  /** Follow-up prompts shown as chips */
  suggestions?: string[];
  /** Transient status while working, e.g. OLIS switched AI engine after a failure */
  notice?: "switching";
}

export interface Chat {
  id: string;
  title: string;
  titleEdited?: boolean;
  createdAt: number;
  updatedAt: number;
  messages: Message[];
}

export type Theme = "dark" | "light" | "system";
export type EngineKind = "cloud" | "demo";

export interface Settings {
  theme: Theme;
  engine: EngineKind;
  context: LearningContext;
  profile: StudyProfile;
  noticeDismissed: boolean;
  /** Let OLIS remember lasting facts across chats (Settings → OLIS Memory). */
  memoryEnabled: boolean;
}
