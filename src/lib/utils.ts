export function uid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

/** Minimal clsx-compatible class joiner (used by the Animate UI icon components). */
export function cn(...inputs: unknown[]): string {
  const out: string[] = [];
  const walk = (v: unknown) => {
    if (!v) return;
    if (typeof v === "string" || typeof v === "number") out.push(String(v));
    else if (Array.isArray(v)) v.forEach(walk);
    else if (typeof v === "object" && Object.getPrototypeOf(v) === Object.prototype)
      for (const [k, on] of Object.entries(v as Record<string, unknown>)) if (on) out.push(k);
    // anything else (e.g. motion values) isn't a class name → ignored
  };
  inputs.forEach(walk);
  return out.join(" ");
}

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException("Aborted", "AbortError"));
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(t);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });
}

export function isAbort(e: unknown): boolean {
  return e instanceof DOMException && e.name === "AbortError";
}

export function titleFrom(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return "New chat";
  const t = clean.length > 42 ? clean.slice(0, 40).trimEnd() + "…" : clean;
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const m = Math.round(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function dayGroup(ts: number): string {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const t0 = start.getTime();
  if (ts >= t0) return "Today";
  if (ts >= t0 - 86400000) return "Yesterday";
  if (ts >= t0 - 7 * 86400000) return "Previous 7 days";
  if (ts >= t0 - 30 * 86400000) return "Previous 30 days";
  return "Older";
}

export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function daysUntil(iso: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(iso + "T00:00:00");
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback for insecure contexts / older browsers
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}
