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

export interface Source {
  ref: number;
  kind: "notes" | "wikipedia" | "web";
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
  noticeDismissed: boolean;
}
