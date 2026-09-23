// Content for the OLIS × ORBIX preview page.
// This is a DEMO: nothing here reads real ORBIX data. Statuses are honest labels
// of what exists in OLIS today vs. what is planned.
import type { IconName } from "../Icon";
import type { Mode } from "../../types";

export const ORBIX_URL = "https://orbix.lk";

export type AppId = "workspace" | "notes" | "papers" | "planner" | "cards" | "progress" | "calendar" | "tasks";

export interface OrbixApp {
  id: AppId;
  name: string;
  icon: IconName;
  /** What OLIS would do with this app, one line. */
  role: string;
  /** Can be switched on in the demo connect panel. Others are shown as "coming". */
  connectable: boolean;
  /** What OLIS would be allowed to read, shown under the switch. */
  access?: string;
  /** Position on the ecosystem map, in % of the map box. */
  pos: { x: number; y: number };
}

// Eight apps on an ellipse around OLIS (top-left → clockwise).
export const APPS: OrbixApp[] = [
  { id: "workspace", name: "Workspace", icon: "sidebar", connectable: true, pos: { x: 21, y: 22 },
    role: "Let OLIS understand what you're currently working on.",
    access: "The board you have open and the cards on it" },
  { id: "notes", name: "Notes", icon: "feather", connectable: true, pos: { x: 50, y: 11 },
    role: "Let OLIS use your own notes when explaining concepts.",
    access: "Notes you choose to share, by subject" },
  { id: "papers", name: "Papers", icon: "file", connectable: true, pos: { x: 79, y: 22 },
    role: "Let OLIS analyse your practice and past-paper activity.",
    access: "Papers attempted, marks and time taken" },
  { id: "progress", name: "Progress", icon: "target", connectable: true, pos: { x: 86, y: 50 },
    role: "Let OLIS understand your strengths and weak areas.",
    access: "Topic mastery and revision history" },
  { id: "cards", name: "Flashcards", icon: "layers", connectable: false, pos: { x: 79, y: 78 },
    role: "OLIS will turn explanations into ORBIX flashcard decks." },
  { id: "planner", name: "Study Planner", icon: "calendar", connectable: false, pos: { x: 50, y: 89 },
    role: "OLIS will place revision sessions straight into your planner." },
  { id: "calendar", name: "Calendar", icon: "clock", connectable: false, pos: { x: 21, y: 78 },
    role: "OLIS will fit study sessions around your exams and classes." },
  { id: "tasks", name: "Tasks", icon: "tasks", connectable: false, pos: { x: 14, y: 50 },
    role: "OLIS will add follow-up tasks (\"redo Q5\", \"revise moles\") to your list." },
];

export type Status = "live" | "beta" | "soon";
export const STATUS_LABEL: Record<Status, string> = { live: "Available", beta: "Beta", soon: "Coming to OLIS" };

// A realistic A/L Physics note used by the Workspace preview. Sending an action
// really opens OLIS with this note attached, so the demo shows real answers.
export const DEMO_NOTE = {
  title: "Momentum & impulse",
  subject: "Physics · Mechanics",
  text: [
    "Momentum p = mv (vector, unit kg m s⁻¹).",
    "Newton's 2nd law: resultant force = rate of change of momentum, F = Δp/Δt.",
    "Impulse = FΔt = Δp (area under an F–t graph).",
    "Conservation: if the resultant external force on a system is zero, total momentum stays constant.",
    "Elastic collision: kinetic energy conserved. Inelastic: KE not conserved, momentum still is.",
  ].join("\n"),
};

export const DEMO_QUESTION = {
  title: "Practice question",
  subject: "Physics · Structured",
  text:
    "A 2 kg trolley moving at 3 m s⁻¹ collides with a stationary 1 kg trolley and they stick together. " +
    "(a) Find their common velocity. (b) Find the kinetic energy lost in the collision.",
};

export interface WorkspaceAction {
  label: string;
  status: Status;
  mode?: Mode;
  /** Prompt sent to OLIS with the selected card attached. */
  prompt?: string;
}

export const ACTIONS: WorkspaceAction[] = [
  { label: "Explain this", status: "live", mode: "explain", prompt: "Explain this for an A/L student. Start with the intuition, then the key equations." },
  { label: "Summarize", status: "live", mode: "summarize", prompt: "Summarize this into the few points I must remember for the exam." },
  { label: "Create flashcards", status: "live", mode: "ask", prompt: "Turn this into 8 short question-and-answer flashcards." },
  { label: "Practice questions", status: "live", mode: "ask", prompt: "Write 5 A/L-style practice questions on this, from easy to hard, with short answers at the end." },
  { label: "Explain in Sinhala", status: "beta", mode: "explain", prompt: "මේක සිංහලෙන් explain කරන්න. Physics terms ඉංග්‍රීසියෙන්ම තියන්න (Sinhala + English mix, A/L student කෙනෙක්ට)." },
  { label: "Add to revision plan", status: "soon" },
  { label: "Analyse my mistakes", status: "soon" },
];

export const MODES: { name: string; body: string; status: Status }[] = [
  { name: "Tutor", body: "Teaches a concept from intuition to exam level.", status: "live" },
  { name: "Solver", body: "Works through a question step by step.", status: "live" },
  { name: "Planner", body: "Maps the days to your exam into sessions.", status: "live" },
  { name: "Researcher", body: "Checks notes, Wikipedia and trusted sites, with sources.", status: "live" },
  { name: "Examiner", body: "Marks your answer against how A/L papers are graded.", status: "soon" },
];

export const LAYERS: { name: string; body: string; items: { label: string; status: Status }[] }[] = [
  {
    name: "OLIS intelligence",
    body: "Understands the question, decides what to look up, then answers with sources.",
    items: [
      { label: "Research agent", status: "live" },
      { label: "Cited answers", status: "live" },
      { label: "Sinhala + Singlish", status: "beta" },
    ],
  },
  {
    name: "ORBIX apps",
    body: "Where you already study. OLIS acts inside them instead of in a separate chat.",
    items: [
      { label: "Workspace actions", status: "soon" },
      { label: "Notes & Papers access", status: "soon" },
      { label: "Planner & Cards", status: "soon" },
    ],
  },
  {
    name: "Your study context",
    body: "What you've practised, where you lose marks, what you've forgotten. Always under your control.",
    items: [
      { label: "Topic mastery", status: "soon" },
      { label: "Study memory", status: "soon" },
      { label: "Repeated-mistake detection", status: "soon" },
    ],
  },
  {
    name: "Sri Lankan knowledge",
    body: "Structured by syllabus: theory, formulae, worked examples, past questions and common mistakes.",
    items: [
      { label: "A/L starter notes", status: "beta" },
      { label: "Past-paper retrieval", status: "soon" },
      { label: "Marking-scheme-aware answers", status: "soon" },
      { label: "O/L subjects", status: "soon" },
    ],
  },
];
