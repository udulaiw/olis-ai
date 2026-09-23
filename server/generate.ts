// Structured generation (quiz, flashcards), grounded in the knowledge base.
// Goes through the AI router, so it falls back across engines like chat does.
import type { Config } from "./config.js";
import { searchKnowledge } from "./rag.js";
import { systemPrompt, type LearningContext, type StudentProfile } from "./prompts.js";
import { generateJSONWithFallback } from "./ai/router.js";
import { newRequestId } from "./ai/log.js";
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
  profile?: StudentProfile;
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
  const block = hits.length
    ? `<knowledge_excerpts>\nBase the content on these OLIS notes where relevant:\n\n${hits.map((h) => h.chunk.text.slice(0, 1400)).join("\n\n---\n\n")}\n</knowledge_excerpts>\n\n`
    : "";
  return { block, sources };
}

export async function generate(cfg: Config, req: GenerateRequest, signal?: AbortSignal) {
  const topic = req.topic.slice(0, 200) || req.subject || req.context.subject;
  const { block, sources } = await grounding(cfg, topic, req.subject, signal);
  const system = systemPrompt(req.context, "quiz", { tools: false, webSearch: false, profile: req.profile });
  const common = { task: "structured" as const, required: [], signal, deadline: Date.now() + cfg.generateDeadlineMs, requestId: newRequestId(), route: "generate", system };
  const lang = req.profile?.language === "si" ? " Write the questions and explanations in Sinhala, keeping technical terms in English." : "";

  if (req.kind === "quiz") {
    const n = Math.min(10, Math.max(3, req.count ?? 5));
    const { data } = await generateJSONWithFallback({
      ...common,
      prompt: `${block}Create a ${n}-question multiple-choice quiz on "${topic}" (${req.subject ?? req.context.subject}), difficulty: ${req.difficulty ?? "Mixed"}, for a ${req.context.level} A-Level student.${lang}
Return JSON exactly like: {"title": string, "questions": [{"q": string, "options": [4 strings], "answer": 0-3, "explanation": string, "difficulty": "Easy"|"Medium"|"Hard"}]}
Rules: one clearly correct answer; plausible distractors based on real misconceptions; explanations 1–2 sentences; LaTeX ($…$) for maths. These are OLIS practice questions: don't claim they come from past papers.`,
      validate: (v) => {
        const d = v as { title?: string; questions?: QuizQ[] };
        const questions = (Array.isArray(d?.questions) ? d.questions : [])
          .filter((x) => typeof x?.q === "string" && Array.isArray(x.options) && x.options.length >= 2 && Number.isInteger(x.answer) && x.answer >= 0 && x.answer < x.options.length)
          .slice(0, n);
        return questions.length ? { title: typeof d.title === "string" && d.title ? d.title : topic, questions } : null;
      },
    });
    return { data, sources };
  }

  const { data } = await generateJSONWithFallback({
    ...common,
    prompt: `${block}Create 8 concise revision flashcards on "${topic}" for a ${req.context.level} ${req.subject ?? req.context.subject} student.${lang}
Return JSON exactly like: {"title": string, "cards": [{"front": string, "back": string}]}
Fronts are questions or prompts; backs are short, exam-accurate answers. LaTeX ($…$) for maths.`,
    validate: (v) => {
      const d = v as { title?: string; cards?: { front: string; back: string }[] };
      const cards = (Array.isArray(d?.cards) ? d.cards : []).filter((c) => c && typeof c.front === "string" && typeof c.back === "string" && c.front && c.back).slice(0, 12);
      return cards.length ? { title: typeof d.title === "string" && d.title ? d.title : topic, cards } : null;
    },
  });
  return { data, sources };
}
