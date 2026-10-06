# OLIS Literature & Language Intelligence (v0.6)

Literature, language, reading comprehension, critical analysis and writing, built as a layer on top of the
existing router → registry → prompt → RAG pipeline (`docs/subject-architecture.md`). Every other subject
is unchanged: the layer returns `null` for them and adds nothing to their prompts.

## 1. Audit of the existing system (what was there)

| Area | Before this change | Gap for literature |
|---|---|---|
| AI routing (`server/ai/router.ts`, `models.config.ts`) | Task families (`general`, `reasoning`, `mathematics`, `sinhala` …) pick the model order | Close reading went to the fast `general` models |
| Subject detection (`server/ai/intent.ts`, `server/knowledge/subjects.json`) | Rule-based router; English/Sinhala/Tamil subjects had literature units, all on the generic `language` strategy | No form, task, answer mode, command word, or "is the text here?" |
| RAG (`server/rag.ts`) | BM25 + optional Gemini embeddings, RRF; filters: type, year, level | No literature metadata; no way to filter to one work |
| Knowledge base (`knowledge/`) | 22 STEM / study-skills notes | No literature material at all |
| Sinhala processing (`server/lang/`) | Script detection, Singlish expansion, Unicode repair, Malayalam/Devanagari guard | Fine as is; literature reuses it |
| Conversation / memory (`server/memory.ts`, history) | Last 12 messages; saved memories | A follow-up ("what's the tone?") didn't know a poem was pasted earlier |
| Prompt architecture (`server/prompts.ts`) | Persona → topic map → level → subject method → intent pipeline → difficulty → language → grounding | One line for literature: "only discuss texts the student gives you" |
| Exam / question handling | `marking`, `past_paper`, `practice`, `correction` pipelines | No literary command words, essay method or feedback rubric |

No infrastructure changed: no new provider, no database, no extra model call per question (rules only,
same as the rest of the router, to protect the free Gemini quota).

## 2. What the layer does

```
question ─▶ router (subject, unit, level, intent, difficulty)          server/ai/intent.ts
         ─▶ detectLiterature()                                         server/literature/detect.ts
              domain   literature · language · comprehension · writing (null = not literature)
              form     poetry · prose · novel · short_story · drama
              task     analysis · devices · theme · character · context · compare · essay · feedback
                       question_analysis · grammar · vocabulary · comprehension · paraphrase · summary · creative
              mode     quick · teach · exam · deep · essay · feedback · socratic · revision
              command  explain · describe · analyse · discuss · compare · evaluate · how_writer · to_what_extent · comment · identify
              hasText  is the poem / passage / answer in the message, an earlier turn, or an attachment?
              textLanguage, pitch (beginner · intermediate · advanced), label for the UI
         ─▶ work = workMentioned(question)   a work title from the index's `work:` metadata
         ─▶ RAG: filter to that work first (metadata before ranking), then unfiltered fallback
         ─▶ prompt: literaturePromptBlock()  only the parts this request needs        server/literature/prompts.ts
         ─▶ model: deep / essay / feedback / compare / pasted-text analysis → "reasoning" route; quick → "general"; Sinhala/Tamil → "sinhala"
         ─▶ UI line under the answer: "English · Literature · A/L · Poetry · Deep analysis"
```

### Prompt pieces (`server/literature/prompts.ts`)

| Piece | Included when |
|---|---|
| Fact / interpretation / strong interpretation / opinion, hedging language, priorities | literature, comprehension |
| Never invent (quotations, characters, events, intentions, syllabus) | always |
| The text: "provided → it's the evidence" or "not provided → ask for it, general knowledge labelled, no quotations" | literature, comprehension |
| Form method: poetry (5 questions) · prose · novel · short story · drama (on stage) | a form was detected |
| Task method: devices (Device → Evidence → Effect → Meaning → Relevance), character (Trait → Evidence → Explanation → Importance), theme, context, compare, essay (PETAL), feedback (4 headings, no invented mark), question analysis, grammar (Original → Problem → Why → Better), vocabulary, comprehension (says vs infers), paraphrase, summary, creative (keep the student's voice) | matching task |
| Command word | a command word was found |
| Answer mode + pitch | always |
| Sinhala / Tamil literary terms and quoting rules | reply or text is Sinhala / Tamil |
| Sri Lankan curriculum guard (no invented prescribed texts; past papers don't predict) | not grammar-only |

Typical size: ~470 tokens for a grammar question, ~900–1,100 for close reading. Non-literature questions: 0.

### Registry changes (`server/knowledge/subjects.json`)

- New strategies `literature` (task `reasoning`) and `comprehension`.
- Literature units of A/L English, Sinhala, Tamil and O/L English, Sinhala now use the `literature` strategy;
  O/L English comprehension uses `comprehension`.
- More keywords (devices, drama terms; Sinhala උපමා, රූපක, අලංකාර, නාට්‍ය, චරිත, තේමාව; Tamil நாடகம், சிறுகதை, நாவல், உவமை, உருவகம், கதாபாத்திரம்).
  **These need a native-speaker check**, like the other Sinhala/Tamil aliases.
- ICT: `character set`, `character encoding`, `ascii`, `unicode` keywords so "Explain the character set ASCII" stays ICT.

### Knowledge (`knowledge/literature/`)

A separate area so interpretations never mix with factual notes. Two OLIS-written reference notes
(literary devices, answer frameworks; tier 6, `verified: false`), a README with the metadata format, and
`_TEMPLATE.md`. Index metadata added: `form`, `author`, `work`, `chapter`, `theme`, `device`, `syllabus_year`, `exam_year`.

## 3. Anti-hallucination design

- Quotations only from text in the conversation or `<knowledge_excerpts>`; never from memory.
- No text → line-level analysis is refused with a request to paste it; general knowledge about well-known works
  is allowed but labelled, without quotations, and "not sure" beats guessing.
- When the student supplied the text, the "Confidence: No OLIS source" label is hidden (their text *is* the source),
  and the prompt says so, so the model doesn't refuse to analyse what it was given.
- Prescribed texts, syllabus content and marking criteria only from excerpts. Feedback never gives an exact mark
  without a marking scheme or stated total.
- Works are recognised only from indexed `work:` metadata; there is no built-in list of titles to be wrong about.

## 4. Tests

`npm run test:lit` (58 checks, part of `npm test`): detection cases in `evals/olis-eval.json → literature`
(including 12 "must NOT be literature" regression cases: momentum, ASCII character set, a history essay, the twin
paradox, the tone of a sound wave …), routing, prompt assembly per task/mode/language, registry, and the work
filter on a fixture index (`evals/fixtures/literature/`, two invented poems). `npm run eval` gained 6 literature
retrieval cases and 2 literature no-source cases.

## 5. Limits and next steps

- **Content is the bottleneck.** OLIS has no prescribed texts, Sri Lankan literature syllabi, teacher's guides or
  literature past papers yet. Until they're added (`knowledge/literature/README.md`), answers about specific
  prescribed works are general knowledge, and OLIS says so.
- A work is only recognised by name once it has a `work:` entry in the index. "To what extent is Macbeth
  responsible…" with no Macbeth note and no literary words is answered as a general question.
- Rules, not a classifier: unusual phrasing can miss the form or mode. The student can always say the mode
  ("exam answer", "just a hint", "revision notes"), and explicit cues beat defaults.
- Tamil: literature routing works; the O/L Tamil registry entry has no literature unit yet (add one when the
  syllabus is checked).
- Past-paper analysis for literature reuses the existing `past_paper` pipeline; it becomes useful once literature
  papers are indexed under `knowledge/past-papers/`.
