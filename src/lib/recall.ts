// Finds messages in the student's EARLIER chats (saved in this browser) that match a
// question like "continue the Physics plan we made" or "what did you tell me about
// integration before?". Runs only when the question refers back (same cue as the server),
// so ordinary questions never send old chats anywhere.
import { HISTORY_CUE } from "../../server/ai/cues";
import type { Chat, RecallItem } from "../types";

const STOP = new Set(
  "the a an and or of to in on for with is are was were be it this that these those what which who how do did does can could would should will you your yours we our me my i im i'm about from at by as please make made give gave tell told continue previous before earlier last time yesterday plan again that's thats there here some any just also".split(
    " ",
  ),
);

const words = (s: string) =>
  (s.normalize("NFC").toLowerCase().match(/[\p{L}\p{M}\p{N}]+/gu) ?? []).filter((w) => w.length > 2 && !STOP.has(w));

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n).trimEnd() + "…" : s);

/**
 * Up to `max` messages from other chats that best match the question.
 * Scored by shared words (rarer words count more), plus a small bonus for recent chats
 * and for "plan"-type answers when the student asks to continue a plan.
 */
export function findRecall(question: string, chats: Chat[], currentChatId: string | null, max = 3): RecallItem[] {
  if (!HISTORY_CUE.test(question)) return [];
  const q = new Set(words(question));
  const wantsPlan = /\b(plan|timetable|schedule)\b|සැලැස්ම/i.test(question);
  const others = chats.filter((c) => c.id !== currentChatId && c.messages.length);
  if (!others.length) return [];

  // Document frequency over candidate messages → rarer shared words weigh more
  const cands = others.flatMap((c) =>
    c.messages
      .filter((m) => (m.status === undefined || m.status === "done" || m.status === "stopped") && m.content.trim().length > 20)
      .map((m) => ({ chat: c, m, w: new Set(words(m.content + " " + c.title)) })),
  );
  const df = new Map<string, number>();
  for (const c of cands) for (const w of c.w) if (q.has(w)) df.set(w, (df.get(w) ?? 0) + 1);
  const newest = Math.max(...others.map((c) => c.updatedAt));

  const scored = cands
    .map(({ chat, m, w }) => {
      let s = 0;
      for (const t of q) if (w.has(t)) s += Math.log(1 + cands.length / (df.get(t) ?? 1));
      if (!s && !(wantsPlan && /\b(week|day \d|phase|plan|timetable)\b/i.test(m.content))) return null;
      if (wantsPlan && m.role === "assistant" && /\b(week|day \d|phase|timetable|plan)\b/i.test(m.content)) s += 1.5;
      s += 0.5 * (1 - Math.min(1, (newest - chat.updatedAt) / (30 * 864e5))); // up to +0.5 for chats in the last month
      return { chat, m, s };
    })
    .filter(Boolean) as { chat: Chat; m: Chat["messages"][number]; s: number }[];

  return scored
    .sort((a, b) => b.s - a.s)
    .slice(0, max)
    .map(({ chat, m }) => ({
      chat: clip(chat.title, 80),
      date: new Date(m.createdAt || chat.updatedAt).toISOString().slice(0, 10),
      role: m.role,
      text: clip(m.content, 1100),
    }));
}
