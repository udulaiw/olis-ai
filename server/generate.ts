// Structured generation (quiz, flashcards), grounded in the knowledge base.
import type { Config } from "./config.js";
import { generateJSON } from "./gemini.js";
import { searchKnowledge } from "./rag.js";
import { systemPrompt, type LearningContext } from "./prompts.js";
import type { Source } from "./tools.js";

interface QuizQ {
  q: string;
  options: string[];
  answer: number;
  explanation: string;
  difficulty?: string;
}

export interface GenerateRequest {
  kind: "quiz" | "flashcards";
  topic: string;
  subject?: string;
  difficulty?: string;
  count?: number;
  context: LearningContext;
}

async function grounding(cfg: Config, topic: string, subject?: string, signal?: AbortSignal) {
  const hits = await searchKnowledge(cfg, topic, { k: 4, subject, signal }).catch(() => []);
  const sources: Source[] = hits.map((h, i) => ({
    ref: i + 1,
    kind: "notes",
    title: `${h.chunk.title} · ${h.chunk.heading}`,
    url: h.chunk.url,
    snippet: h.chunk.text.slice(0, 180),
  }));
  const block = hits.length ? `Base the content on these OLIS notes where relevant:\n\n${hits.map((h) => h.chunk.text.slice(0, 1400)).join("\n\n---\n\n")}\n\n` : "";
  return { block, sources };
}

export async function generate(cfg: Config, req: GenerateRequest, signal?: AbortSignal) {
  const topic = req.topic.slice(0, 200) || req.subject || req.context.subject;
  const { block, sources } = await grounding(cfg, topic, req.subject, signal);
  const system = systemPrompt(req.context, "quiz", { tools: false, webSearch: false });

  if (req.kind === "quiz") {
    const n = Math.min(10, Math.max(3, req.count ?? 5));
    const data = await generateJSON<{ title?: string; questions?: QuizQ[] }>(
      cfg,
      system,
      `${block}Create a ${n}-question multiple-choice quiz on "${topic}" (${req.subject ?? req.context.subject}), difficulty: ${req.difficulty ?? "Mixed"}, for a ${req.context.level} A-Level student.
Return JSON exactly like: {"title": string, "questions": [{"q": string, "options": [4 strings], "answer": 0-3, "explanation": string, "difficulty": "Easy"|"Medium"|"Hard"}]}
Rules: one clearly correct answer; plausible distractors based on real misconceptions; explanations 1–2 sentences; LaTeX ($…$) for maths.`,
      signal,
    );
    const questions = (data.questions ?? [])
      .filter((x) => typeof x.q === "string" && Array.isArray(x.options) && x.options.length >= 2 && Number.isInteger(x.answer) && x.answer >= 0 && x.answer < x.options.length)
      .slice(0, n);
    if (!questions.length) throw new Error("no valid questions");
    return { data: { title: data.title || topic, questions }, sources };
  }

  const data = await generateJSON<{ title?: string; cards?: { front: string; back: string }[] }>(
    cfg,
    system,
    `${block}Create 8 concise revision flashcards on "${topic}" for a ${req.context.level} ${req.subject ?? req.context.subject} student.
Return JSON exactly like: {"title": string, "cards": [{"front": string, "back": string}]}
Fronts are questions or prompts; backs are short, exam-accurate answers. LaTeX ($…$) for maths.`,
    signal,
  );
  const cards = (data.cards ?? []).filter((c) => c && typeof c.front === "string" && typeof c.back === "string" && c.front && c.back).slice(0, 12);
  if (!cards.length) throw new Error("no valid cards");
  return { data: { title: data.title || topic, cards }, sources };
}
