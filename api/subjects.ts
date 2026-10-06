// GET /api/subjects: the OLIS subject registry (subjects, levels, units, answer languages).
// Public and student-safe: names and ids only, no prompts or routing keywords.
import { json } from "../server/http.js";
import { publicRegistry } from "../server/knowledge/taxonomy.js";

export async function GET(request: Request): Promise<Response> {
  const level = new URL(request.url).searchParams.get("level");
  const reg = publicRegistry();
  const subjects = level === "OL" || level === "AL" ? reg.subjects.filter((s) => s.level === level || s.level === "ANY") : reg.subjects;
  return json({ version: reg.version, subjects });
}
