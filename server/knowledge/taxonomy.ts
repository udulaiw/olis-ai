// ─────────────────────────────────────────────
// OLIS subject registry (Sri Lankan G.C.E. O/L and A/L).
//
// The DATA lives in ./subjects.json: subjects, units, aliases (English,
// Sinhala, Tamil, Singlish), answer strategies and per-subject prompt notes.
// Adding a subject, unit or alias is a JSON edit; nothing in this file or
// anywhere else needs to change. See docs/subject-architecture.md.
//
// STATUS: PROVISIONAL. Unit names follow common classroom usage, not the
// official NIE syllabus wording. `officialRef` stays null and `verified`
// false until a unit is checked against the syllabus text in
// knowledge/syllabus/<subject>/.
//
// `keywords` and `patterns` are routing hints only, never shown to students.
// ─────────────────────────────────────────────
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Read at runtime (like server/generated/index.json), NOT `import … from "./subjects.json"`:
// Vite accepts a bare JSON import, but Node.js in a Vercel function refuses it
// (ERR_IMPORT_ATTRIBUTE_MISSING) and every route that loads this module crashes with a 500.
// vercel.json ships the file via includeFiles; scripts/prod-smoke.mjs checks every route loads in plain Node.
const REGISTRY_PATH = process.env.OLIS_REGISTRY_PATH || join(process.cwd(), "server", "knowledge", "subjects.json");
const registry: unknown = JSON.parse(readFileSync(REGISTRY_PATH, "utf8"));

export type ExamLevel = "OL" | "AL";
/** "ANY" = shown to both O/L and A/L students (study skills, general knowledge). */
export type SubjectLevel = ExamLevel | "ANY";
export type SubjectId = string;
export type StrategyId = string;
export type SubjectGroup = "mathematics" | "science" | "ict" | "humanities" | "language" | "other";

export interface Unit {
  id: string;
  name: string;
  keywords: string[];
  /** Regular-expression sources (case-insensitive) that also identify this unit, e.g. a quadratic "x²". */
  patterns?: string[];
  /** Overrides the subject's strategy (O/L Science units are physics, chemistry or biology). */
  strategy?: StrategyId;
  officialRef: string | null;
  verified: boolean;
}

export interface SubjectTaxonomy {
  id: SubjectId;
  level: SubjectLevel;
  name: string;
  group: SubjectGroup;
  /** Default answer strategy (key of STRATEGIES). */
  strategy: StrategyId;
  /** Languages OLIS can answer this subject in. */
  languages: ("si" | "en" | "ta")[];
  enabled: boolean;
  /** Names students and knowledge-file frontmatter may use for this subject (English, Sinhala, Tamil, Singlish). */
  aliases: string[];
  /** Subject-specific prompt notes added after the strategy (the "system_prompt" of the spec). */
  prompt: string;
  units: Unit[];
}

export interface Strategy {
  /** Which AI-router task family this strategy prefers (models.config.ts ROUTES). */
  task: "mathematics" | "physics" | "chemistry" | "reasoning" | "general";
  label: string;
  /** Answer-method rules added to the system prompt. */
  prompt: string;
}

interface RawUnit {
  id: string;
  name: string;
  keywords: string[];
  patterns?: string[];
  strategy?: string;
  officialRef?: string | null;
  verified?: boolean;
}
interface RawSubject extends Omit<SubjectTaxonomy, "units"> {
  units: RawUnit[];
}
interface RawRegistry {
  version: number;
  strategies: Record<string, Strategy>;
  subjects: RawSubject[];
}

const raw = registry as unknown as RawRegistry;

export const STRATEGIES: Record<StrategyId, Strategy> = raw.strategies;

/** Enabled subjects, in registry order (A/L before O/L before cross-level: ties go to the earlier entry). */
export const TAXONOMY: SubjectTaxonomy[] = raw.subjects
  .filter((s) => s.enabled !== false)
  .map((s) => ({
    ...s,
    aliases: s.aliases.map((a) => a.normalize("NFC").toLowerCase()),
    units: s.units.map((x) => ({ ...x, officialRef: x.officialRef ?? null, verified: x.verified ?? false })),
  }));

const PATTERNS = new Map<string, RegExp[]>();
for (const s of TAXONOMY) for (const x of s.units) if (x.patterns?.length) PATTERNS.set(`${s.id}/${x.id}`, x.patterns.map((p) => new RegExp(p, "iu")));

const norm = (s: string) => s.normalize("NFC").toLowerCase();
const atLevel = (s: SubjectTaxonomy, level?: ExamLevel | null) => !level || s.level === level || s.level === "ANY";

/** Short keywords ("sin", "ph", "mean") must match as whole words; longer ones may match inside ("derivatives"). */
function hits(text: string, words: string[]): number {
  const padded = ` ${text.replace(/[^\p{L}\p{M}\p{N}∫/'-]+/gu, " ")} `;
  let n = 0;
  for (const w of words) {
    const k = norm(w);
    // Tamil and Sinhala inflect by replacing a final virama with a vowel sign (இயற்பியல் → இயற்பியலில்): match the stem too
    const stem = k.replace(/[்්]$/u, "");
    const found = k.length <= 5 ? padded.includes(` ${k} `) || padded.includes(` ${k}s `) : text.includes(k) || (stem !== k && text.includes(stem));
    if (found) n += k.length > 5 ? 2 : 1;
  }
  return n;
}

function unitHits(text: string, s: SubjectTaxonomy, unit: Unit): number {
  const pats = PATTERNS.get(`${s.id}/${unit.id}`);
  return hits(text, unit.keywords) + (pats?.some((p) => p.test(text)) ? 2 : 0);
}

const isHint = (s: SubjectTaxonomy, hint?: string) => Boolean(hint) && (norm(hint!) === norm(s.name) || s.id === norm(hint!) || s.aliases.includes(norm(hint!)));

export interface TopicGuess {
  subject: SubjectId;
  unit: Unit;
  score: number;
}

/**
 * Best-guess subject + unit for a question (routing and past-paper tagging).
 * `level` restricts the search to one exam level (plus cross-level subjects); pass
 * the student's level whenever it is known so O/L questions never route into A/L units.
 */
export function guessTopic(text: string, subjectHint?: string, level?: ExamLevel | null): TopicGuess | null {
  const t = norm(text);
  let best: TopicGuess | null = null;
  for (const s of TAXONOMY) {
    if (!atLevel(s, level)) continue;
    const boost = isHint(s, subjectHint) ? 1 : 0;
    const alias = hits(t, s.aliases) ? 1 : 0;
    for (const unit of s.units) {
      const uh = unitHits(t, s, unit);
      if (!uh) continue;
      const score = uh + alias + boost;
      if (score > (best?.score ?? 0)) best = { subject: s.id, unit, score };
    }
  }
  return best && best.score >= 2 ? best : null;
}

/** Subject only (works for subjects that have no units, e.g. General Knowledge). */
export function guessSubject(text: string, subjectHint?: string, level?: ExamLevel | null): SubjectTaxonomy | null {
  const t = norm(text);
  let best: { s: SubjectTaxonomy; score: number } | null = null;
  for (const s of TAXONOMY) {
    if (!atLevel(s, level)) continue;
    const score = hits(t, s.aliases) * 2 + s.units.reduce((n, un) => n + Math.min(2, unitHits(t, s, un)), 0) + (isHint(s, subjectHint) ? 1 : 0);
    if (score > (best?.score ?? 0)) best = { s, score };
  }
  return best && best.score >= 2 ? best.s : null;
}

export function subjectById(id: string | undefined): SubjectTaxonomy | undefined {
  return id ? TAXONOMY.find((s) => s.id === id) : undefined;
}

export function subjectByName(name: string | undefined): SubjectTaxonomy | undefined {
  if (!name) return undefined;
  const n = norm(name);
  return TAXONOMY.find((s) => norm(s.name) === n || s.id === n || s.aliases.includes(n));
}

/**
 * The same subject at another exam level, by shared alias ("physics" A/L ↔ O/L Science is NOT a match;
 * "geography" A/L ↔ "ol-geography" is). Used when the level is only known after the subject was guessed.
 */
export function subjectAtLevel(s: SubjectTaxonomy, level: ExamLevel | null | undefined): SubjectTaxonomy {
  if (!level || s.level === level || s.level === "ANY") return s;
  const twin = TAXONOMY.find((o) => o.level === level && o.strategy === s.strategy && o.group === s.group && o.aliases.some((a) => s.aliases.includes(a)));
  return twin ?? s;
}

/** The answer strategy for a subject, refined by the unit when the unit says otherwise (O/L Science → physics). */
export function strategyFor(subjectId: string | undefined, unitId?: string): StrategyId {
  const s = subjectById(subjectId);
  if (!s) return "general";
  const unit = unitId ? s.units.find((x) => x.id === unitId) : undefined;
  return unit?.strategy ?? s.strategy;
}

/**
 * Compact unit list for the system prompt ("what topic is this testing?").
 * With a focus subject only that subject is listed (fewer tokens per request).
 */
export function taxonomyPromptBlock(subjectName?: string, level?: ExamLevel | null, focusId?: string): string {
  const focus = subjectById(focusId);
  if (focus && atLevel(focus, level) && focus.units.length) return `${focus.name}: ${focus.units.map((x) => x.name).join(" · ")}`;
  const one = subjectByName(subjectName);
  const list = one && atLevel(one, level) && one.units.length ? [one] : TAXONOMY.filter((s) => atLevel(s, level) && s.units.length && s.level !== "ANY");
  return list.map((s) => `${s.name}: ${s.units.map((x) => x.name).join(" · ")}`).join("\n");
}

/** Public, student-safe view of the registry (GET /api/subjects). */
export function publicRegistry() {
  return {
    version: raw.version,
    subjects: TAXONOMY.map((s) => ({
      id: s.id,
      name: s.name,
      level: s.level,
      group: s.group,
      strategy: s.strategy,
      languages: s.languages,
      units: s.units.map((x) => ({ id: x.id, name: x.name, verified: x.verified })),
    })),
  };
}
