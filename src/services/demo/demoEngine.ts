// ─────────────────────────────────────────────
// OLIS Demo Engine — the $0, offline intelligence layer.
// Pattern-based intent detection + a hand-written knowledge base,
// a real step-by-step solver, an extractive summariser and an
// algorithmic planner. No network, no key, no cost.
// ─────────────────────────────────────────────
import type { Difficulty, Flashcard, LearningContext, Quiz, Subject } from "../../types";
import { SUBJECTS } from "../../types";
import { shuffle } from "../../lib/utils";
import { TOPICS, findTopic, topicsFor, type Topic } from "./knowledge";
import { bankCovers, findQuestions } from "./quizBank";
import { solveProblem } from "./solver";
import { buildStudyPlan, planToMarkdown } from "./planner";
import { summarize, summaryToMarkdown } from "./summarizer";
import type { Intent } from "../intent";
import { wikiQuery } from "../wikipedia";

export interface DemoTurn {
  role: "user" | "assistant";
  content: string;
}

// ── Helpers ────────────────────────────────────
export function detectSubject(text: string): Subject | undefined {
  const t = text.toLowerCase();
  if (/\bphysics\b/.test(t)) return "Physics";
  if (/\bchem(istry)?\b|organic/.test(t)) return "Chemistry";
  if (/\b(combined )?math(s|ematics)?\b|calculus|algebra/.test(t)) return "Combined Mathematics";
  if (/\bbio(logy)?\b/.test(t)) return "Biology";
  return undefined;
}

function lastTopicFrom(history: DemoTurn[], subject?: Subject): Topic | undefined {
  for (let i = history.length - 1; i >= 0; i--) {
    const t = findTopic(history[i].content, subject);
    if (t) return t;
  }
  return undefined;
}

const QSTOP = new Set("a an the of in on at to for and or is are was were what how why who when where which does do did explain tell me about define describe please can you could work works mean means".split(" "));
const stem = (w: string) => w.replace(/'s$/, "").replace(/(?<=\w{3})s$/, "");

/**
 * A lesson is only used when it genuinely covers the question: at least half of
 * the meaningful words must appear in the lesson's title or keywords. This stops
 * "quantum entanglement" or "Marie Curie" being answered with an unrelated lesson.
 */
export function confidentTopic(text: string, subject?: Subject): Topic | undefined {
  const topic = findTopic(text, subject);
  if (!topic) return undefined;
  const q = wikiQuery(text).toLowerCase().replace(/[’']/g, "'");
  const toks = (q.match(/[a-z0-9']+/g) ?? []).filter((w) => w.length > 1 && !QSTOP.has(w)).map(stem);
  if (!toks.length) return topic;
  const hay = (topic.title + " " + topic.keywords.join(" ")).toLowerCase().replace(/[’']/g, "'");
  const covered = toks.filter((w) => hay.includes(w)).length;
  return covered / toks.length >= 0.5 ? topic : undefined;
}

/** Follow-up prompts shown as tappable chips under an answer. */
export function topicSuggestions(topic: Topic): string[] {
  return [`Quiz me on ${topic.title}`, "Explain this like I'm a beginner", `Give me exam tips on ${topic.title}`];
}

// ── Explanations ───────────────────────────────
export function composeExplanation(topic: Topic, ctx: LearningContext, opts: { simplify?: boolean } = {}): string {
  const level = opts.simplify ? "Beginner" : ctx.level;
  const style = opts.simplify ? "Simple explanation" : ctx.style;
  const parts: string[] = [`## ${topic.title}`, `*${topic.oneLiner}*`];

  if (opts.simplify) parts.push("Let's strip it right back to basics.");

  switch (style) {
    case "Simple explanation":
      parts.push(topic.beginner);
      if (level !== "Beginner") parts.push("### The key idea, in one step up", firstSection(topic.core));
      break;
    case "Detailed explanation":
      if (level === "Beginner") parts.push("### Intuition first", topic.beginner, "### Now properly");
      parts.push(topic.core);
      if (level !== "Beginner") parts.push(topic.advanced);
      parts.push("### Common mistakes", topic.mistakes.map((m) => `- ${m}`).join("\n"));
      break;
    case "Step-by-step":
      if (level === "Beginner") parts.push(topic.beginner);
      parts.push("### Step by step", topic.steps.map((s, i) => `${i + 1}. ${s}`).join("\n"));
      if (level === "Advanced") parts.push(topic.advanced);
      break;
    case "Exam focused":
      if (level === "Beginner") parts.push(topic.beginner);
      parts.push(topic.core);
      if (level === "Advanced") parts.push(topic.advanced);
      parts.push("### Exam tips", topic.examTips.map((m) => `- ${m}`).join("\n"));
      parts.push("### Mistakes that lose marks", topic.mistakes.map((m) => `- ${m}`).join("\n"));
      break;
  }
  parts.push(`**Check yourself:** ${topic.check}`);
  return parts.join("\n\n");
}

function firstSection(md: string): string {
  // Everything up to the second heading. Keeps "simple" answers short.
  const idx = md.indexOf("\n### ", 5);
  return idx > 0 ? md.slice(0, idx).trim() : md;
}

function unknownTopic(query: string, ctx: LearningContext, subject?: Subject): string {
  const subj = subject ?? ctx.subject;
  const known = (subj === "General" ? TOPICS : topicsFor(subj)).slice(0, 8);
  const cleaned = query
    .replace(/^(please\s+)?(can you\s+)?(explain|what (is|are)|tell me about|define|describe|how does|why does|teach me)\s+/i, "")
    .replace(/[?.!]+$/, "")
    .trim();
  const label = cleaned.length > 2 && cleaned.length < 60 ? cleaned : "this topic";
  return [
    `## ${label.charAt(0).toUpperCase() + label.slice(1)}`,
    `OLIS Beta's **offline library** doesn't have a lesson on *${label}* yet, so rather than make something up, here's a reliable way to learn it:`,
    [
      `1. **Define it** in one sentence using your textbook's wording.`,
      `2. **Find the core idea or equation.** What are the 2–3 things everything else depends on?`,
      `3. **Work one example** from start to finish, writing each step.`,
      `4. **Explain it out loud** as if teaching a friend. Where you stumble is what to revisit.`,
      `5. **Test yourself** tomorrow without notes (active recall).`,
    ].join("\n"),
    `**Topics I can teach offline right now${subj !== "General" ? ` in ${subj}` : ""}:**\n${known.map((t) => `- ${t.title}`).join("\n")}`,
    `*For open-ended questions on any topic, OLIS Cloud gives full answers. It turns on automatically when it's reachable (see **Settings**).*`,
  ].join("\n\n");
}

const pick = <T,>(xs: T[]): T => xs[Math.floor(Math.random() * xs.length)];
const CREATOR_LINE = "I was created by **Udula ([UDULAIW](https://github.com/udulaiw))**, the student developer behind the ORBIX learning ecosystem.";

/** Natural small talk, so OLIS feels like someone, not a search box. */
export function smallTalk(raw: string): string | null {
  const t = raw.trim().toLowerCase().replace(/[’‘]/g, "'").replace(/\s+/g, " ");
  const hour = new Date().getHours();
  const partOfDay = hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";

  if (/^(hi+|hey+|hello+|helo|hiya|yo|sup|hola|ayubowan|greetings)( there)?( olis)?[\s!.👋🙂😊]*$/.test(t))
    return pick([
      "Hi! 👋 I'm **OLIS**. What are we learning today?",
      "Hey there! 😊 Ask me anything: a concept, a problem to solve, or a study plan.",
      `Hello! Good ${partOfDay} 👋 What's on your mind?`,
      "Hi! Ready when you are. What should we explore first?",
    ]);
  if (/^good (morning|afternoon|evening)( olis)?[\s!.]*$/.test(t)) {
    const said = t.match(/good (morning|afternoon|evening)/)![1];
    return `Good ${said}! ☀️ Hope your day's going well. What would you like to learn?`;
  }
  if (/^good ?night|^(bye+|goodbye|see (you|ya)|cya|gn)\b/.test(t))
    return pick(["Bye! 👋 Good luck with your studies. Come back anytime.", "See you soon! Remember: a short review tomorrow beats a long cram later 🌙"]);
  if (/^(how are you|how r u|how's it going|how are things|what'?s up|wassup)\b/.test(t) || /^hi,? how are you/.test(t))
    return pick([
      "I'm doing great, all orbits stable 🪐 Thanks for asking! How's your studying going?",
      "Running smoothly and ready to help 😊 What are you working on today?",
    ]);
  if (/(who|which person) (made|created|built|developed|designed|owns) you|who is your (creator|developer|maker|owner)|your (creator|developer|maker)|who'?s behind (you|olis)|who made olis|who created olis/.test(t))
    return `${CREATOR_LINE} You can see his work on [GitHub](https://github.com/udulaiw).\n\nI'm still a **beta model**, so I'm learning and improving every day.`;
  if (/^(what'?s|what is) your name|^who are you|^what are you\b|^are you (an? )?(ai|bot|robot|human|real|chatgpt|gemini|claude)/.test(t))
    return `I'm **OLIS**, the *Orbix Learning Intelligence System*: an AI learning assistant, currently in **beta**. ${CREATOR_LINE}\n\nIn cloud mode I use several AI engines behind the scenes, research with Wikipedia and my own study notes, and cite my sources. Offline, I use my built-in lessons, solver and Wikipedia.`;
  if (/^(thanks|thank you|thx|ty|tysm|cheers|thank u)\b/.test(t))
    return pick(["Anytime! 😊 Want a quick quiz to lock it in?", "You're welcome! Keep going, you're doing great.", "Happy to help! What's next?"]);
  if (/^(ok(ay)?|cool|nice|great|awesome|got it|alright|k|kk|sure)[\s!.👍]*$/.test(t))
    return pick(["👍 Anything else you'd like to explore?", "Great! Want to try a few practice questions on it?"]);
  if (/(you'?re|you are) (awesome|amazing|great|cool|smart|the best|helpful)|good (job|bot)|love you|i like you/.test(t))
    return pick(["Thank you, that made my circuits glow ✨ What shall we learn next?", "That's kind of you! 😊 I'm here whenever you need me."]);
  if (/tell me a joke|say something funny|make me laugh|^joke\b/.test(t))
    return pick([
      "Why can't you trust atoms? 🧪 Because they make up everything.",
      "I told a chemistry joke once… there was no reaction. 😅",
      "Why was the maths book sad? It had too many problems. 📘",
      "A photon checks into a hotel. \"Any luggage?\" \"No, I'm travelling light.\" 💡",
    ]) + "\n\nNow, want to tackle an actual problem? 😄";
  if (/(i'?m|i am|feeling) (so )?(stressed|tired|anxious|nervous|overwhelmed|burn(ed|t) out|demotivated|bored)/.test(t))
    return "That's completely normal, especially before exams, and you're not alone. 💙\n\nA few things that genuinely help:\n- **Take a real break:** 10 minutes away from screens, a short walk, some water.\n- **Shrink the task:** pick *one* small topic for the next 25 minutes, nothing more.\n- **Sleep counts:** it's when your brain locks in what you studied.\n\nIf you'd like, tell me what's coming up and I'll build a calm, realistic study plan with you. And if it ever feels like too much, talk to someone you trust.";
  return null;
}

function aboutOlis(): string {
  return [
    `## Hi, I'm OLIS 👋`,
    `**Orbix Learning Intelligence System**: an AI learning assistant inside the ORBIX ecosystem, currently in **beta**. ${CREATOR_LINE}`,
    `### What I can do`,
    [
      `- **Explain**: "Explain Newton's laws"`,
      `- **Solve**: "Solve 2x² − 5x − 3 = 0" (with full working)`,
      `- **Plan**: "I have a physics exam in 10 days"`,
      `- **Quiz**: "Quiz me on organic chemistry"`,
      `- **Summarize**: paste a paragraph of notes`,
      `- **Simplify**: "Explain this like I'm a beginner"`,
    ].join("\n"),
    `I can also look up almost anything on **Wikipedia**: people, history, science, technology. Just ask.`,
    `Set your **subject, level and learning style**, and I'll adapt every answer to it.`,
  ].join("\n\n");
}

// ── Quiz / flashcards / plan / summary ────────
export function demoQuiz(opts: { topic?: string; subject?: Subject; difficulty?: Difficulty | "Mixed"; count?: number }): Quiz | null {
  const subject = opts.subject ?? (opts.topic ? detectSubject(opts.topic) : undefined);
  const pool = findQuestions({ topic: opts.topic, subject, difficulty: opts.difficulty });
  if (!pool.length) return null;
  const order = { Easy: 0, Medium: 1, Hard: 2 } as const;
  const picked = shuffle(pool)
    .slice(0, opts.count ?? 5)
    .sort((a, b) => order[a.difficulty] - order[b.difficulty]);
  const topicTitle = opts.topic?.trim() || subject || "General knowledge";
  return {
    title: topicTitle.charAt(0).toUpperCase() + topicTitle.slice(1),
    subject: picked[0].subject,
    difficulty: opts.difficulty ?? "Mixed",
    questions: picked.map(({ q, options, answer, explanation, difficulty }) => ({ q, options, answer, explanation, difficulty })),
  };
}

export function demoFlashcards(topicText: string, subject?: Subject): { title: string; cards: Flashcard[] } | null {
  const topic = findTopic(topicText, subject);
  if (topic) return { title: topic.title, cards: topic.cards.map(([front, back]) => ({ front, back })) };
  const subj = detectSubject(topicText) ?? (SUBJECTS.find((s) => s.toLowerCase() === topicText.toLowerCase().trim()) as Subject | undefined);
  if (subj) {
    const cards = shuffle(topicsFor(subj).flatMap((t) => t.cards)).slice(0, 10);
    if (cards.length) return { title: `${subj}: mixed review`, cards: cards.map(([front, back]) => ({ front, back })) };
  }
  return null;
}

export function parsePlanRequest(text: string, ctx: LearningContext) {
  const t = text.toLowerCase();
  let days: number | undefined;
  const m = t.match(/(\d+)\s*(day|week|month)s?/);
  if (m) days = parseInt(m[1]) * (m[2] === "week" ? 7 : m[2] === "month" ? 30 : 1);
  else if (/tomorrow/.test(t)) days = 1;
  else if (/next week/.test(t)) days = 7;
  else if (/next month/.test(t)) days = 30;
  const h = t.match(/(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h)\b/);
  const hours = h ? parseFloat(h[1]) : ctx.level === "Advanced" ? 4 : 3;
  const subject = detectSubject(text) ?? ctx.subject;
  return { days, hours, subject, assumedDays: days === undefined, assumedHours: !h };
}

// ── Main responder ─────────────────────────────
export type DemoOutput =
  | { kind: "text"; text: string; suggestions?: string[] }
  | { kind: "quiz"; intro: string; quiz: Quiz }
  /** Not in the offline library → look it up on Wikipedia (fallback text if that fails) */
  | { kind: "lookup"; query: string; simple: boolean; detailed: boolean; fallback: string };

export function demoRespond(input: string, intent: Intent, ctx: LearningContext, history: DemoTurn[]): DemoOutput {
  const text = input.trim();
  const subjectInText = detectSubject(text);

  // Small talk first: greetings, "who made you", jokes, feelings…
  if (intent === "ask" || intent === "greeting" || intent === "thanks" || intent === "about") {
    const chat = smallTalk(text);
    if (chat) return { kind: "text", text: chat };
  }

  switch (intent) {
    case "greeting":
    case "thanks":
    case "about":
      return { kind: "text", text: aboutOlis(), suggestions: ["Explain Newton's laws", "Who was Marie Curie?", "Quiz me on organic chemistry"] };

    case "quiz": {
      const topicPhrase = text
        .replace(/^(please\s+)?(can you\s+)?(quiz|test)( me)?(\s+(on|about|in))?/i, "")
        .replace(/\b(give me|some|practice|questions?|mcqs?|a quiz|on|about)\b/gi, " ")
        .replace(/[?.!]/g, "")
        .trim();
      const topic = topicPhrase || lastTopicFrom(history, ctx.subject)?.title || undefined;
      if (topicPhrase && !bankCovers(topicPhrase) && !detectSubject(topicPhrase) && !findTopic(topicPhrase))
        return {
          kind: "text",
          text: `My offline question bank covers **Physics, Chemistry, Combined Maths, Biology and study skills**, and doesn't have questions on *${topicPhrase}* yet. 📚\n\nWhen OLIS Cloud is connected, I can write a quiz on any topic. For now, try one of these:`,
          suggestions: ["Quiz me on organic chemistry", "Quiz me on waves", "Quiz me on differentiation"],
        };
      const difficulty: Difficulty | "Mixed" =
        /\bhard\b|difficult|advanced/i.test(text) ? "Hard" : /\beasy\b|basic|beginner/i.test(text) ? "Easy" : ctx.level === "Advanced" ? "Hard" : ctx.level === "Beginner" ? "Easy" : "Mixed";
      const quiz = demoQuiz({ topic, subject: subjectInText ?? ctx.subject, difficulty, count: 5 });
      if (!quiz) return { kind: "text", text: `I couldn't find questions for that yet. Try "Quiz me on physics" or "Quiz me on organic chemistry".` };
      return {
        kind: "quiz",
        intro: `Here's a **${quiz.questions.length}-question quiz** on **${quiz.title}**. Pick an answer to see the explanation straight away.`,
        quiz,
      };
    }

    case "plan": {
      const req = parsePlanRequest(text, ctx);
      const plan = buildStudyPlan({ subject: req.subject, days: req.days ?? 14, hoursPerDay: req.hours });
      const notes: string[] = [];
      if (req.assumedDays) notes.push("I assumed **14 days** until your exam. Tell me the real number and I'll rebuild it.");
      if (req.assumedHours) notes.push(`I assumed **${req.hours} hours/day**. Say e.g. "2 hours a day" to change it.`);
      return { kind: "text", text: (notes.length ? notes.map((n) => `> ${n}`).join("\n>\n") + "\n\n" : "") + planToMarkdown(plan) };
    }

    case "summarize": {
      const body = text.replace(/^(please\s+)?(summari[sz]e|tl;?dr|key points( of)?)( this| the following)?[:\s-]*/i, "");
      const s = summarize(body);
      if (!s)
        return {
          kind: "text",
          text: `Paste the text you want summarised (at least a few sentences) and I'll pull out the key points.\n\n*Tip: use the **Summarize** quick action or the 📎 button to attach a .txt / .md file.*`,
        };
      return { kind: "text", text: summaryToMarkdown(s, ctx.style === "Exam focused") };
    }

    case "solve": {
      const solved = solveProblem(text);
      if (solved) {
        const extra =
          ctx.style === "Exam focused"
            ? `\n\n**Exam tip:** write each line of working. Method marks are usually awarded even if the final answer slips.`
            : ctx.level === "Beginner"
              ? `\n\n*Want me to explain the idea behind this method? Ask "Explain this like I'm a beginner".*`
              : "";
        return { kind: "text", text: solved + extra };
      }
      const topic = findTopic(text, ctx.subject);
      if (topic && !/\d/.test(text)) return { kind: "text", text: composeExplanation(topic, ctx) };
      return {
        kind: "text",
        text: [
          `## Let's work through it`,
          `I can't fully solve this one offline, but here's the method to crack it yourself:`,
          [
            `1. **Read and restate**: what exactly is being asked? Underline the unknown.`,
            `2. **List the knowns** with units (look for hidden info like "from rest" → $u = 0$).`,
            `3. **Pick the principle** that links knowns to the unknown${topic ? `. For this, think **${topic.title}**` : ""}.`,
            `4. **Write the equation symbolically first**, then substitute numbers.`,
            `5. **Solve, then sanity-check** the size, sign and units of your answer.`,
          ].join("\n"),
          topic ? `### Relevant method: ${topic.title}\n${topic.steps.map((s, i) => `${i + 1}. ${s}`).join("\n")}` : "",
          `**Offline, I can fully solve:** linear & quadratic equations, polynomial derivatives and integrals (incl. definite), arithmetic & percentages, SUVAT problems, $F = ma$ and $V = IR$.\n\nTry: *"Solve 2x² − 5x − 3 = 0"* or *"A car starts from rest and accelerates at 2 m/s² for 5 s. Find v and s."*`,
        ]
          .filter(Boolean)
          .join("\n\n"),
      };
    }

    case "simplify": {
      // What should be simplified? The thing named in the message wins; "this/that/it" means the last topic.
      const named = wikiQuery(text);
      const pronoun = !named || /^(this|that|it|them|these|those)$/i.test(named);
      if (!pronoun) {
        const topic = confidentTopic(text, ctx.subject);
        if (topic) return { kind: "text", text: composeExplanation(topic, ctx, { simplify: true }), suggestions: topicSuggestions(topic).slice(0, 1) };
        return { kind: "lookup", query: named, simple: true, detailed: false, fallback: unknownTopic(text, ctx, subjectInText) };
      }
      const prevLookup = lastLookupFrom(history);
      const prevTopic = lastTopicFrom(history.filter((h) => h.role === "user"), ctx.subject);
      const lastAssistant = [...history].reverse().find((h) => h.role === "assistant")?.content ?? "";
      // Prefer whatever the most recent answer was about
      if (prevLookup && lastAssistant.includes(`## ${prevLookup}`) && !(prevTopic && lastAssistant.includes(`## ${prevTopic.title}`)))
        return { kind: "lookup", query: prevLookup, simple: true, detailed: false, fallback: unknownTopic(prevLookup, ctx, subjectInText) };
      if (prevTopic) return { kind: "text", text: composeExplanation(prevTopic, ctx, { simplify: true }), suggestions: topicSuggestions(prevTopic).slice(0, 1) };
      if (prevLookup) return { kind: "lookup", query: prevLookup, simple: true, detailed: false, fallback: unknownTopic(prevLookup, ctx, subjectInText) };
      return { kind: "text", text: `Happy to simplify. What should I explain? Try *"Explain photosynthesis like I'm a beginner"*.` };
    }

    case "explain":
    case "ask":
    default: {
      // People, places and events → Wikipedia, even if a keyword matches a lesson ("Who was Newton?")
      const personOrPlace = /^(who|where|when)\b/i.test(text);
      const topic = personOrPlace ? undefined : confidentTopic(text, subjectInText ?? ctx.subject);
      if (topic) return { kind: "text", text: composeExplanation(topic, ctx), suggestions: topicSuggestions(topic) };
      // Maybe it's actually a solvable problem typed in Ask mode
      const solved = solveProblem(text);
      if (solved) return { kind: "text", text: solved };
      // Follow-up like "give me exam tips" or "more detail" on the last topic
      const last = lastTopicFrom(history, ctx.subject);
      if (last && /exam tips?|tips|mistakes|more detail|go deeper|in detail|advanced|step by step|steps/i.test(text)) {
        const style = /exam|tips|mistakes/i.test(text) ? "Exam focused" : /step/i.test(text) ? "Step-by-step" : "Detailed explanation";
        const level = /advanced|deeper/i.test(text) ? "Advanced" : ctx.level;
        return { kind: "text", text: composeExplanation(last, { ...ctx, style, level }) };
      }
      const q = wikiQuery(text);
      if (q.length >= 2)
        return {
          kind: "lookup",
          query: q,
          simple: ctx.level === "Beginner" || ctx.style === "Simple explanation",
          detailed: /\bmore\b|in detail|detailed|everything/i.test(text) || ctx.style === "Detailed explanation",
          fallback: unknownTopic(text, ctx, subjectInText),
        };
      return { kind: "text", text: unknownTopic(text, ctx, subjectInText) };
    }
  }
}

/** Last thing we looked up, for follow-ups like "explain that like I'm a beginner". */
function lastLookupFrom(history: DemoTurn[]): string {
  for (let i = history.length - 1; i >= 0; i--) {
    const m = history[i].content.match(/^## (.+)$/m);
    if (history[i].role === "assistant" && m) return m[1].trim();
  }
  return "";
}

export function demoExplain(topicText: string, ctx: LearningContext): string {
  const topic = findTopic(topicText, ctx.subject);
  return topic ? composeExplanation(topic, ctx) : unknownTopic(topicText, ctx);
}
