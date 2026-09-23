# Past papers

Real Sri Lankan G.C.E. A/L past-paper questions and marking schemes, one
question per file. OLIS searches these with the `search_past_papers` tool and
**only** quotes what is here. It never invents past-paper questions.

```
knowledge/past-papers/
  combined-mathematics/2023-paper1-q11.md
  physics/2022-paper2-q5.md
  chemistry/2021-paper1-q34.md
```

The pipeline each file represents:

```
Past paper → question extraction → subject → unit/topic → year
          → question type → difficulty → marking scheme / answer
```

## File format

Copy `_TEMPLATE.md` (files starting with `_` are not indexed), fill it in, and
rename it. Frontmatter fields:

| Field | Required | Example | Used for |
|---|---|---|---|
| `type` | ✅ | `past_paper` | Keeps it separate from notes |
| `subject` | ✅ | `Physics` | Filtering, subject boost |
| `year` | ✅ | `2023` | "Show me 2023 questions" |
| `paper` | ✅ | `Paper II (Structured)` | Labels, citations |
| `question` | ✅ | `5` | Citations ("2023 · Paper II · Q5") |
| `unit` | recommended | `electricity` | Unit IDs from `server/knowledge/taxonomy.ts` |
| `question_type` | recommended | `structured` / `essay` / `mcq` | Filtering |
| `difficulty` | optional | `medium` | "Give me a hard one" |
| `marks` | optional | `10` | Marking-scheme answers |
| `language` | optional | `en` / `si` | Sinhala-medium papers |
| `source` | ✅ | `Department of Examinations, 2023` | Honest citation |
| `url` | optional | link to the official PDF | Source card link |
| `verified` | ✅ | `true` only after you've checked it against the paper | |

Use `##` headings for **Question**, **Marking scheme / answer**, and
**Common mistakes** (only if they come from an examiner's report or your own
marking experience; say which).

## Rights

Only add papers and marking schemes you're allowed to use. Link to the official
source rather than copying whole papers where possible.
