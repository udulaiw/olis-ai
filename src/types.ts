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

/** Answer language. "auto" = match whatever the student writes (English, Sinhala or Singlish). */
export type Language = "auto" | "en" | "si";
export const LANGUAGES: { id: Language; label: string }[] = [
  { id: "auto", label: "Auto" },
  { id: "en", label: "English" },
  { id: "si", label: "සිංහල" },
];

export type Depth = "quick" | "standard" | "deep";

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
}

export const STREAMS = ["", "Physical Science (Maths)", "Biological Science", "Commerce", "Arts", "Technology", "Other"] as const;
export const PROFILE_SUBJECTS = ["Combined Mathematics", "Physics", "Chemistry", "Biology", "ICT", "Other"] as const;

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
}
