// Intent detection shared by both engines.
import type { Mode } from "../types";

export type Intent = Exclude<Mode, "ask"> | "ask" | "greeting" | "thanks" | "about";

export function detectIntent(text: string, mode: Mode): Intent {
  if (mode !== "ask") return mode;
  const t = text.trim().toLowerCase().replace(/[’‘]/g, "'");

  if (/^(hi|hello|hey|yo|hiya|good (morning|afternoon|evening))\b[!. ]*$/.test(t)) return "greeting";
  if (/^(thanks|thank you|thx|ty|cheers)\b/.test(t)) return "thanks";
  if (/who are you|what are you|what is olis|what can you do|^help\b/.test(t)) return "about";
  if (/\b(quiz|test) me\b|\bmcqs?\b|practice questions|give me (a )?quiz/.test(t)) return "quiz";
  if (/(exam|test|paper)s?\s+(is\s+)?(in|on)\s+\d+|\d+\s*(days?|weeks?)\s+(left|until|before|to)|study plan|revision plan|timetable|schedule/.test(t)) return "plan";
  if (/^(please )?(summari[sz]e|tl;?dr)|key points of|summary of/.test(t) || text.length > 700) return "summarize";
  if (/like i'?m (a )?(beginner|5|five|new)|eli5|simpl(er|ify)|in simple (terms|words)|dumb it down/.test(t)) return "simplify";
  const hasMaths = /\d\s*[a-z]\s*[+\-=^²]|=\s*-?\d|\d\s*[+\-*/^]\s*\d|[a-z]\s*\^\s*\d/.test(t);
  if (/^(explain|what (is|are)|define|describe|how (does|do)|why (does|do|is)|tell me about|teach me)\b/.test(t) && !hasMaths) return "explain";
  if (/^(solve|calculate|compute|evaluate|work out|find)\b|differentiat|integrat|derivative/.test(t) || hasMaths) return "solve";
  if (/^(explain|what (is|are)|define|describe|how (does|do)|why (does|do|is)|tell me about|teach me)\b/.test(t)) return "explain";
  return "ask";
}

export const MODE_META: Record<Exclude<Mode, "ask">, { label: string; placeholder: string; prefix: string }> = {
  explain: { label: "Explain", placeholder: "What should OLIS explain? e.g. Newton's laws", prefix: "Explain " },
  solve: { label: "Solve", placeholder: "Paste a problem, e.g. Solve 2x² − 5x − 3 = 0", prefix: "" },
  quiz: { label: "Quiz me", placeholder: "Quiz me on… e.g. organic chemistry", prefix: "Quiz me on " },
  plan: { label: "Study plan", placeholder: "e.g. I have a physics exam in 10 days, 3 hours a day", prefix: "" },
  summarize: { label: "Summarize", placeholder: "Paste the text you want summarised…", prefix: "" },
  simplify: { label: "Simplify", placeholder: "What should OLIS simplify? e.g. entropy", prefix: "Explain like I'm a beginner: " },
};
