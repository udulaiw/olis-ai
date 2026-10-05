# OLIS knowledge base

Everything in this folder becomes searchable by OLIS (RAG). OLIS checks these
notes **before** it goes to Wikipedia or the web, and cites them as sources.

## Add your own material

1. Create a `.md` or `.txt` file in the right subject folder, e.g.
   `knowledge/physics/electromagnetic-induction.md`
2. (Optional) start it with a header so OLIS labels it nicely:

   ```markdown
   ---
   title: Electromagnetic Induction
   subject: Physics
   source: Udula's A/L notes
   url: https://example.com/original (optional)
   ---
   ```

3. Write normally with `##` headings. Each heading section becomes a searchable
   passage, so **clear headings = better answers**. LaTeX maths (`$F = ma$`) is fine.
4. Commit and push. Vercel rebuilds the index automatically (with semantic
   embeddings, using the free Gemini embedding model).

Run `npm run index` locally to rebuild the index yourself.

## O/L and A/L

Every note can belong to one exam level. Put the level in the frontmatter (`level: OL` or `level: AL`)
or use a level folder (`knowledge/ol/science/…`, `knowledge/al/physics/…`); the folder is stripped when
OLIS works out the subject and type. A note **with** a level is only shown to students of that level;
a note **without** one (all the original notes) is shown to both, ranked slightly lower. Tag your notes
as you go, because that is what stops O/L students getting A/L methods (and the reverse).

## Source priority (`tier`)

`tier: 1–7` ranks how authoritative a source is. When two excerpts disagree, OLIS prefers the lower number and
tells the student about the disagreement. Defaults come from `type`, so you rarely need to set it:
1 official syllabus · 2 official teacher's guide / textbook · 3 official past paper · 4 official marking scheme ·
5 government platform (e-Thaksalawa) · 6 notes and other resources · 7 the model's own knowledge (never stored).

## Bulk-adding PDFs

```
node scripts/ingest.mjs <folder|file.pdf|file.zip> --level ol --subject "Science" --type notes --tier 2 \
     --source "Grade 10 Science Teacher's Guide (NIE)" --grade 10 [--ocr] [--dry-run]
```
Skips duplicates, reports corrupt / scanned / old-font Sinhala PDFs instead of importing garbage, keeps page
numbers (answers can then say "p.12"), and writes `knowledge/_ingest-report.json`. Review a file or two, then `npm run index`.
Details: `docs/ol-al-upgrade.md`.

## Structure

```
knowledge/
  combined-mathematics/ physics/ chemistry/ biology/ general/   ← study notes (type: notes)
  syllabus/<subject>/        ← official syllabus text (type: syllabus)      see syllabus/README.md
  past-papers/<subject>/     ← one past-paper question per file (type: past_paper)  see past-papers/README.md
```

Optional frontmatter fields on any file: `level` (`OL` / `AL`), `grade`, `tier` (1–7), `type` (`notes`, `syllabus`,
`past_paper`, `marking_scheme`, `resource`), `unit` (a unit ID from
`server/knowledge/taxonomy.ts`), `year`, `paper`, `question`, `question_type`,
`difficulty`, `marks`, `language` (`en` / `si`), `verified` (`true` / `false`).
Files and folders starting with `_` are skipped (templates, drafts).
Sinhala notes are fine: Sinhala words are searchable too.

## What to add first (highest value)
- Syllabus topic lists and learning outcomes (NIE / DoE A/L syllabus)
- Your own concise notes per unit
- Past-paper questions **with marking-scheme answers**, which teach OLIS how marks are awarded
- Common mistakes you or your students make

## Tips
- Keep one topic per file. Split huge files.
- PDFs aren't read yet. Paste the text into a `.md` file.
- Only add material you have the right to use.
