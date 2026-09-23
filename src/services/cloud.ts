// Browser client for the OLIS Cloud backend (/api/*).
// No API keys live here. The server holds them.
import type { AgentStep, Flashcard, LearningContext, Mode, Quiz, Source, StudyProfile } from "../types";

export type CloudErrorCode =
  | "config"
  | "auth"
  | "rate_limit"
  | "daily_limit"
  | "network"
  | "bad_request"
  | "server"
  | "blocked"
  | "unavailable"
  | "forbidden_origin"
  | "too_large";

/** An image sent to OLIS Cloud (already downsized in the browser). */
export interface CloudImage {
  mimeType: string;
  data: string; // base64, no data: prefix
}

export class OlisError extends Error {
  code: CloudErrorCode | "empty";
  constructor(code: OlisError["code"], message: string) {
    super(message);
    this.code = code;
  }
}

export interface CloudHealth {
  ok: boolean;
  version: string;
  /** How many AI engines are usable right now (names are deliberately not exposed). */
  engines?: { engines: number; busy: boolean; freeBeta: boolean };
  knowledge: { files: number; chunks: number; pastPaperChunks?: number; semantic: boolean; builtAt: string | null };
  tools: { knowledgeBase: boolean; pastPapers?: boolean; wikipedia: boolean; webSearch: false | "trusted" | "open"; readPages: boolean; images?: boolean };
}

/** Internal provider health (Settings → Developer, needs OLIS_ADMIN_TOKEN). */
export interface ProviderHealth {
  freeBeta: boolean;
  limitsStore: string;
  providers: {
    id: string;
    label: string;
    status: string;
    models: { key: string; model: string; status: string; cooldownSeconds?: number; successes: number; failures: number; lastError?: string; avgMs?: number; note?: string }[];
  }[];
}

export type CloudEvent =
  | { type: "step"; id: string; label: string; status: AgentStep["status"] }
  | { type: "sources"; sources: Source[] }
  | { type: "text"; delta: string }
  /** An engine failed mid-answer: keep only the first `to` characters. */
  | { type: "rewind"; to: number }
  | { type: "notice"; kind: "switching" };

async function errorFrom(res: Response): Promise<OlisError> {
  let code: CloudErrorCode = "server";
  let message = `OLIS Cloud error (${res.status}).`;
  try {
    const j = (await res.json()) as { error?: { code?: CloudErrorCode; message?: string } };
    if (j.error?.message) message = j.error.message;
    if (j.error?.code) code = j.error.code;
  } catch {
    if (res.status === 404) {
      code = "unavailable";
      message = "OLIS Cloud isn't available here. Using offline mode is fine.";
    }
  }
  return new OlisError(code, message);
}

async function doFetch(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    throw new OlisError("network", "Couldn't reach OLIS Cloud. Check your connection, or switch to offline Demo mode.");
  }
}

export async function cloudHealth(signal?: AbortSignal): Promise<CloudHealth | null> {
  try {
    const res = await fetch("/api/health", { signal, headers: { Accept: "application/json" } });
    if (!res.ok || !(res.headers.get("content-type") ?? "").includes("json")) return null;
    return (await res.json()) as CloudHealth;
  } catch {
    return null;
  }
}

export async function* cloudAgent(
  body: {
    messages: { role: "user" | "assistant"; content: string }[];
    attachment?: string;
    images?: CloudImage[];
    mode: Mode;
    context: LearningContext;
    profile?: StudyProfile;
  },
  signal?: AbortSignal,
): AsyncGenerator<CloudEvent> {
  const res = await doFetch("/api/agent", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) throw await errorFrom(res);
  if (!res.body) throw new OlisError("server", "Empty response from OLIS Cloud.");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let sep: number;
    while ((sep = buf.indexOf("\n\n")) >= 0) {
      const frame = buf.slice(0, sep);
      buf = buf.slice(sep + 2);
      const data = frame
        .split("\n")
        .filter((l) => l.startsWith("data:"))
        .map((l) => l.slice(5).trim())
        .join("");
      if (!data) continue;
      let ev: CloudEvent | { type: "done" } | { type: "error"; code: CloudErrorCode; message: string };
      try {
        ev = JSON.parse(data);
      } catch {
        continue;
      }
      if (ev.type === "done") return;
      if (ev.type === "error") throw new OlisError(ev.code, ev.message);
      yield ev;
    }
  }
}

export async function cloudGenerate<T extends Quiz | { title: string; cards: Flashcard[] }>(
  body: { kind: "quiz" | "flashcards"; topic: string; subject?: string; difficulty?: string; count?: number; context: LearningContext; profile?: StudyProfile },
  signal?: AbortSignal,
): Promise<{ data: T; sources: Source[] }> {
  const res = await doFetch("/api/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal });
  if (!res.ok) throw await errorFrom(res);
  return (await res.json()) as { data: T; sources: Source[] };
}

export function sendFeedback(body: {
  rating: "up" | "down";
  question: string;
  answer: string;
  mode?: string;
  context?: LearningContext;
  sources?: { title: string; url: string | null }[];
  engine: string;
}) {
  // Fire-and-forget; feedback must never break the chat
  return fetch("/api/feedback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), keepalive: true })
    .then((r) => r.ok)
    .catch(() => false);
}

/** Internal provider health. Returns null on a wrong token or when disabled. */
export async function providerHealth(token: string, signal?: AbortSignal): Promise<ProviderHealth | { error: string }> {
  try {
    const res = await fetch("/api/health?detail=1", { headers: { "x-olis-admin": token, Accept: "application/json" }, signal });
    if (res.status === 401) return { error: "Wrong admin token." };
    if (res.status === 404) return { error: "Internal health is disabled on the server (OLIS_ADMIN_TOKEN not set)." };
    if (!res.ok) return { error: `Server error (${res.status}).` };
    return (await res.json()) as ProviderHealth;
  } catch {
    return { error: "Couldn't reach the server." };
  }
}
