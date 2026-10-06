# OLIS subject architecture (v0.4)

How OLIS works out *what* a student is asking before it answers, and how to add subjects without touching code.
This builds on the RAG / language / Unicode layer described in `docs/ol-al-upgrade.md`. Literature, language, comprehension and writing questions get an extra layer on top of this router: see `docs/literature-intelligence.md`.

```
question ─▶ language (nlp.mjs) ─▶ subject + unit (registry) ─▶ level ─▶ intent ─▶ difficulty
         ─▶ requires: calculation · retrieval · current info
         ─▶ RAG (only if retrieval is needed) ─▶ confidence (from grounding)
         ─▶ prompt = persona + level + subject method + intent pipeline + difficulty + grounding
         ─▶ AI router (task family from the strategy) ─▶ answer
         ─▶ browser: answer + sources + "Geography · Climatology · A/L · 2 OLIS sources · Confidence: High"
```

## 1. Subject registry (`server/knowledge/subjects.json`)

The single source of truth for subjects. `server/knowledge/taxonomy.ts` only loads and queries it.

```jsonc
{
  "strategies": {                       // answer methods, shared by subjects
    "physics": { "task": "physics", "label": "Physics", "prompt": "Physics method: list the KNOWN values …" }
  },
  "subjects": [
    {
      "id": "geography",                // stable id; O/L twins are "ol-geography"
      "level": "AL",                    // "AL" | "OL" | "ANY" (shown to both)
      "name": "Geography",
      "group": "humanities",            // mathematics | science | ict | humanities | language | other
      "strategy": "geography",          // key of "strategies"
      "languages": ["si", "en", "ta"],
      "enabled": true,                  // false = hidden from routing and /api/subjects
      "aliases": ["geography", "භූගෝල විද්‍යාව", "புவியியல்"],
      "prompt": "",                     // subject-specific notes added after the strategy
      "units": [
        { "id": "geo-climatology", "name": "Climatology", "keywords": ["monsoon", "rainfall", …],
          "patterns": ["regex, optional"], "strategy": "optional override" }
      ]
    }
  ]
}
```

28 subjects (14 A/L, 12 O/L, 2 cross-level), 144 units, 13 strategies.

| Group | A/L | O/L |
|---|---|---|
| Mathematics | Combined Mathematics | Mathematics |
| Science | Physics, Chemistry, Biology | Science (units route to physics / chemistry / biology) |
| ICT | ICT | ICT |
| Humanities | Geography, History, Economics, Political Science, Logic | History, Geography, Commerce, Civic Education |
| Languages | Sinhala, English, Tamil | Sinhala, English, Tamil |
| Other | Buddhism | Health, Religion |
| Cross-level | Study Skills and Exam Preparation, General Knowledge | |

**Status: provisional.** Unit names follow common classroom usage, not NIE wording. Every unit is `verified: false` until it is
checked against the syllabus text in `knowledge/syllabus/<subject>/`. The Sinhala and Tamil aliases need a native-speaker check.

### Add a subject / unit / alias

1. Edit `server/knowledge/subjects.json` (keep it NFC; Sinhala conjuncts use ZWJ `‍`).
2. `npm test`. The registry test fails on unknown strategies, duplicate ids or non-NFC aliases.
3. Add a router case to `evals/olis-eval.json → router` for the new subject.

Matching rules (`taxonomy.ts → hits`): keywords of ≤5 characters must match a whole word (1 point), longer ones may match inside
a word (2 points), and a long Sinhala/Tamil keyword also matches without its final virama (இயற்பியல் → இயற்பியலில்). A unit needs
2 points. On a tie with no known level, the earlier entry wins, so A/L subjects come first in the file.

## 2. Router (`server/ai/intent.ts → classifyRequest`)

Rule-based on purpose: a second model call per question would roughly halve the free Gemini quota, and the rules are testable.

| Field | Values |
|---|---|
| `subject`, `subjectName`, `topic`, `topicName` | registry ids / names, or null |
| `discipline` | strategy actually used (an O/L Science electricity question → `physics`) |
| `examLevel` | `OL` · `AL` · null (message wording beats the saved profile) |
| `language` / `reply` | detected script; answer language `en` · `si` · `si_mixed` · `ta` |
| `intent` | `greeting` `concept_explanation` `definition` `problem_solving` `comparison` `correction` `translation` `summary` `past_paper` `marking` `practice` `planning` `general` |
| `difficulty` | `beginner` `intermediate` `advanced` `exam` `challenge` |
| `requiresCalculation` / `requiresRetrieval` / `requiresCurrentInfo` | booleans |
| `task` | AI-router task family (from the strategy's `task`) |

Details worth knowing:
- "in Sinhala / සිංහලෙන් / in Tamil" is stripped before subject matching, so it never routes to the Sinhala-language subject.
- An equation with no subject word ("Solve 2x² − 5x − 3 = 0") falls back to the maths subject for the level.
- "current" alone is not a current-information signal ("electric current"); "current inflation rate" is.
- `POST /api/olis/classify` returns these labels without answering (no AI call, same origin check and rate limit as the agent).

## 3. Prompt assembly (`server/prompts.ts`)

Per request, in order: persona → topic map (only the detected subject, fewer tokens) → level → **subject method** (strategy + subject
`prompt` + O/L note) → **intent pipeline** → **difficulty** → **current-information rule** → language rules → grounding → research rules.

| Intent | Pipeline rule |
|---|---|
| `marking` | expected points from a marking scheme (or OLIS's own checklist, labelled), ✓/partly/✗, estimated mark only if total marks are known, and always *"Estimated based on the available marking scheme. This is not an official examination mark."* |
| `past_paper` | `search_past_papers` first; only quote indexed questions |
| `practice` | real indexed questions first, otherwise new ones labelled "OLIS practice question (not from a past paper)" |
| `correction` | your version → corrected version → why → stronger alternative |
| `comparison` | table with the same criteria for both sides |
| `translation` | faithful, technical terms kept |

## 4. Confidence

Shown under each answer, derived from retrieval evidence, never from the model's own opinion:

| Grounding | Intent | Shown |
|---|---|---|
| strong | any | **High**: matched a verified OLIS source |
| weak | any | **Medium**: OLIS sources only partly cover it |
| none | problem solving | **Check working**: no source, verifiable by working |
| none | anything else | **No OLIS source**: treat as general knowledge |
| n/a | greeting, plan, translation, attached document | not shown |

With only 22 seed notes, most real questions will show "No OLIS source" until the knowledge base is filled. That is honest, not a bug.

## 5. APIs

| Route | Purpose |
|---|---|
| `POST /api/agent` | answer (SSE). New event: `{ type: "meta", meta: { subject, subjectName, topic, level, intent, reply, confidence } }` |
| `POST /api/olis/classify` | router labels only |
| `GET /api/subjects[?level=OL\|AL]` | public registry: ids, names, levels, units (no prompts or keywords) |
| `POST /api/generate`, `GET /api/health`, `POST /api/feedback` | unchanged |

## 6. Storage: why not Supabase yet

The spec asks for Supabase "if the current architecture already uses Supabase". It doesn't: OLIS runs at $0 with a JSON index
bundled into the function, and that is the right size for tens to low thousands of chunks. Move when **any** of these is true:
the index passes ~3,000 chunks or ~15 MB, ingestion must happen without a redeploy (admin uploads), or per-student progress must
sync across devices.

Planned shape (Supabase free tier, pgvector):

```
subjects(id pk, level, name, group, strategy, enabled)            ← seeded from subjects.json
units(id pk, subject_id fk, name, verified, official_ref)
documents(id pk, title, subject_id, level, language, source_type, source_name, tier, year, url, verified, file_hash unique)
chunks(id pk, document_id fk, heading, page_from, page_to, unit_id, text, tsv tsvector, embedding vector(768))
past_papers(id pk, document_id fk, exam, year, subject_id, medium, paper, question_no, unit_id, marks, question, answer, marking_scheme)
students(id = auth.uid), student_profile(level, subjects[], medium, reply_language, weak_units[], exam_year)
chat_sessions / chat_messages (opt-in only), ai_evaluations(run_id, case_id, model, scores jsonb)
```

Hybrid search = `tsv @@ query` (keyword) + `embedding <=> q` (vector) fused with RRF in one SQL function, metadata filters on
`level`, `subject_id`, `unit_id`, `language`. RLS: content tables read-only to `anon`; student tables `id = auth.uid()`; writes only
with the service role from server functions. `server/rag.ts → searchKnowledge` is the one function to swap.

## 7. Not done in this pass

- Admin knowledge dashboard (uploads, re-index, retrieval tester): needs storage that can be written at runtime (section 6).
- Knowledge graph / related-topic recommendations: the registry's subject → unit tree is the first level of it.
- Tamil retrieval: Tamil questions route and are answered in Tamil, but the knowledge base is English, so Tamil queries only match
  through subject words. A Tamil glossary like `server/lang/glossary.mjs` is the next step.
- Personalisation beyond the saved study profile (weak-topic tracking from answers).
- Optional LLM fallback for the router when rules find no subject.
