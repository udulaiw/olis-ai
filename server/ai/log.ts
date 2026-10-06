// Safe server-side logging for the AI layer. One JSON line per event, visible
// in Vercel → Logs. Logs WHAT happened (provider, model, timing, error
// category, token counts), never WHAT WAS SAID: no prompts, no answers, no
// keys, no student profile.
import { redact } from "./classify.js";

export interface AiLogEvent {
  evt: "ai.call" | "ai.fallback" | "ai.exhausted" | "ai.policy_block" | "ai.budget" | "ai.script_guard" | "ai.retrieval" | "ai.route";
  requestId?: string;
  route?: string; // agent | generate
  task?: string;
  provider?: string;
  model?: string;
  ms?: number;
  ok?: boolean;
  error?: string; // FailureCategory
  status?: number;
  detail?: string; // short, redacted provider message
  attempt?: number;
  inputTokens?: number;
  outputTokens?: number;
  from?: string;
  to?: string;
  /** ai.retrieval: strong | weak | none */
  grounding?: string;
  hits?: number;
  level?: string;
  specialist?: string;
  reply?: string;
  /** Router output (subject id, intent, difficulty): labels only, never the question. */
  subject?: string;
  intent?: string;
  difficulty?: string;
  /** ai.route: sources used ("rag,memory,live:crypto") and live-data outcome */
  tools?: string;
  live?: string;
}

const quiet = () => process.env.OLIS_AI_LOGS === "off";

export function aiLog(e: AiLogEvent) {
  if (quiet()) return;
  const safe: Record<string, unknown> = { ...e, at: new Date().toISOString() };
  if (typeof safe.detail === "string") safe.detail = redact(safe.detail).slice(0, 140);
  console.log(JSON.stringify(safe));
}

export const newRequestId = () => Math.random().toString(36).slice(2, 10);
