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

## Structure

```
knowledge/
  combined-mathematics/ physics/ chemistry/ biology/ general/   ← study notes (type: notes)
  syllabus/<subject>/        ← official syllabus text (type: syllabus)      see syllabus/README.md
  past-papers/<subject>/     ← one past-paper question per file (type: past_paper)  see past-papers/README.md
```

Optional frontmatter fields on any file: `type` (`notes`, `syllabus`,
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
