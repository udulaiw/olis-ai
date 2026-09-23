// Input validation for everything the browser sends. The client is untrusted:
// every field is type-checked, clipped, and profile text is stripped of
// characters that could be used to fake prompt structure.
import type { LearningContext, StudentProfile } from "./prompts.js";
import type { ImageInput } from "./ai/types.js";

export const str = (v: unknown, max: number, d = "") => (typeof v === "string" ? v.slice(0, max) : d);

/** Short free text from the profile: one line, no markup/tag characters. */
const line = (v: unknown, max: number) =>
  str(v, max * 2)
    .replace(/[\u0000-\u001f<>{}`#]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);

export function parseContext(v: unknown): LearningContext {
  const c = (v ?? {}) as Record<string, unknown>;
  return { subject: line(c.subject, 40) || "General", level: line(c.level, 20) || "Intermediate", style: line(c.style, 40) || "Detailed explanation" };
}

export function parseProfile(v: unknown): StudentProfile | undefined {
  if (!v || typeof v !== "object") return undefined;
  const p = v as Record<string, unknown>;
  const list = (x: unknown, n: number, max: number) => (Array.isArray(x) ? x.map((s) => line(s, max)).filter(Boolean).slice(0, n) : undefined);
  const profile: StudentProfile = {
    stream: line(p.stream, 40) || undefined,
    subjects: list(p.subjects, 6, 40),
    language: p.language === "si" || p.language === "en" || p.language === "auto" ? p.language : undefined,
    depth: p.depth === "quick" || p.depth === "standard" || p.depth === "deep" ? p.depth : undefined,
    currentTopic: line(p.currentTopic, 80) || undefined,
    weakTopics: list(p.weakTopics, 8, 60),
    goals: line(p.goals, 200) || undefined,
  };
  return Object.values(profile).some((x) => (Array.isArray(x) ? x.length : x)) ? profile : undefined;
}

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
export const MAX_IMAGE_BASE64 = 1_400_000; // ≈1 MB image; the browser downsizes photos before sending

/** Up to 2 images (e.g. a photo of a past-paper question). Returns null if any image is invalid. */
export function parseImages(v: unknown): ImageInput[] | null {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v) || v.length > 2) return null;
  const out: ImageInput[] = [];
  for (const raw of v) {
    const i = raw as Record<string, unknown>;
    const mimeType = str(i?.mimeType, 30);
    const data = str(i?.data, MAX_IMAGE_BASE64 + 1);
    if (!IMAGE_TYPES.has(mimeType) || !data || data.length > MAX_IMAGE_BASE64 || !/^[A-Za-z0-9+/]+=*$/.test(data)) return null;
    out.push({ mimeType, data });
  }
  return out;
}
