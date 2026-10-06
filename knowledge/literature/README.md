# Literature knowledge (OLIS Literature & Language Intelligence)

Literature material lives here, apart from the factual subject notes, so interpretations never get mixed into
the "facts" OLIS retrieves for science or history. It is indexed like everything else (`npm run index`).

## What goes here

| Folder (suggested) | What | `type` |
|---|---|---|
| `literature/` (this folder) | OLIS reference notes: devices, answer frameworks | `notes` |
| `literature/english/<work>/` | Prescribed poems, extracts, study notes for one English text | `resource` / `notes` |
| `literature/sinhala/<work>/` | Sinhala texts and notes (Unicode Sinhala only, not legacy-font PDFs) | `resource` / `notes` |
| `literature/tamil/<work>/` | Tamil texts and notes | `resource` / `notes` |
| `syllabus/english/` … | Official syllabus / teacher's guide pages for literature | `syllabus` |
| `past-papers/english/` … | One literature question per file, with marking scheme if you have it | `past_paper` |

Use level folders (`knowledge/ol/literature/…`, `knowledge/al/literature/…`) or `level:` when a text belongs to one exam.

## Metadata (frontmatter)

```markdown
---
title: <poem / work title> (study notes)
subject: English Literature        # or Sinhala Literature / Tamil Literature
type: resource                     # resource = the text itself · notes = notes about it · syllabus · past_paper
level: OL                          # OL / AL; leave out if it applies to both
grade: 11
language: en                       # en / si / ta (detected automatically if left out)
form: poetry                       # poetry · prose · novel · short_story · drama
author: <author name>
work: <exact title>                # IMPORTANT: lets OLIS recognise questions that name the work and filter to it
chapter: <chapter / act / scene>   # optional
theme: <theme 1>; <theme 2>
device: <device 1>; <device 2>
source: <where the text came from, e.g. NIE Grade 11 English textbook>
tier: 2                            # 1 syllabus · 2 teacher's guide / textbook · 3 past paper · 4 marking scheme · 5 e-Thaksalawa · 6 notes
syllabus_year: 2024
exam_year: 2023
verified: true                     # only after checking against the official source
---
```

`work` is the field that matters most: when a student names a work that has a `work:` entry here, OLIS treats the
question as literature even without literary words ("Is Macbeth responsible for his downfall?") and searches that
work's notes first. Several works in one note: `work: Title A; Title B`.

## Rules

- **Only add texts you have the right to use.** Many prescribed texts are under copyright: prefer official
  NIE / e-Thaksalawa material, your own notes, and short extracts.
- **Never write a quotation from memory.** Paste it from the source. OLIS quotes what is indexed here exactly,
  so a wrong line here becomes a wrong quotation in an answer.
- Interpretations in your notes are interpretations: write "one reading is…", not "the poet means…".
- Don't list "prescribed texts" for a syllabus unless you copy the list from the official syllabus (and set
  `type: syllabus`, `tier: 1`).
