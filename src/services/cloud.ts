// Browser client for the OLIS Cloud backend (/api/*).
// No API keys live here. The server holds them.
import type { AgentStep, Flashcard, LearningContext, Mode, Quiz, Source } from "../types";

export type CloudErrorCode = "config" | "auth" | "rate_limit" | "network" | "bad_request" | "server" | "blocked" | "unavailable" | "forbidden_origin" | "too_large";

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
  model: string | null;
  knowledge: { files: number; chunks: number; semantic: boolean; builtAt: string | null };
  tools: { knowledgeBase: boolean; wikipedia: boolean; webSearch: false | "trusted" | "open"; readPages: boolean };
}

export type CloudEvent =
  | { type: "step"; id: string; label: string; status: AgentStep["status"] }
  | { type: "sources"; sources: Source[] }
  | { type: "text"; delta: string };

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
  body: { messages: { role: "user" | "assistant"; content: string }[]; attachment?: string; mode: Mode; context: LearningContext },
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
  body: { kind: "quiz" | "flashcards"; topic: string; subject?: string; difficulty?: string; count?: number; context: LearningContext },
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
