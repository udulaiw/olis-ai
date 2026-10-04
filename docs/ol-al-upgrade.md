# OLIS AI — O/L + A/L, Sinhala and evaluation upgrade

Status: implemented and tested offline. Not committed, not deployed, not run against live models.

## 1. What changed

- **Both levels.** O/L and A/L are first-class: `level` on the study profile, on the taxonomy, on KB chunks, and in the prompt.
- **Sinhala / Singlish / typos.** New language layer (`server/lang/`): NFC normalisation, Sinhala stemmer, glossary (Sinhala + Singlish → English retrieval terms), language detection (en / si / ta / singlish / mixed), explicit-language-request handling, KB-vocabulary typo correction.
- **Unicode.** Tokenizer no longer uses NFKD. Script guard on streamed output (Devanagari / Tamil / U+FFFD → rewind and one stricter retry). Scan/repair tooling for KB and PDFs.
- **RAG.** `level` filter (only when a chunk declares one), `tier` source priority (1 syllabus … 7 general) as soft boost, `pages` metadata, evidence-based grounding (strong / weak / none). With "none", no excerpts are sent and the model is told to say it is unsure.
- **Agent.** Specialist role blocks (O/L science, maths, ICT, language, humanities, A/L subjects), follow-up resolver ("මේක තේරෙන්නෙ නෑ", "in English", "more", "simpler"), `math_check` tool (sandboxed mathjs), marking rule.
- **Evaluation.** 80 language tests, 28 agent tests, offline retrieval eval with regression floors, live eval script.
- **Ingestion.** `npm run ingest` for PDF / ZIP / folder.

## 2. Files changed

Modified: `server/agent.ts`, `server/ai/intent.ts`, `server/ai/log.ts`, `server/generate.ts`, `server/knowledge/taxonomy.ts`, `server/prompts.ts`, `server/rag.ts`, `server/sanitize.ts`, `server/text.mjs`, `server/tools.ts`, `scripts/build-index.mjs`, `scripts/ai-selftest.ts`, `src/types.ts`, `src/components/StudyProfile.tsx`, `src/index.css`, `package.json`, `package-lock.json`, `tsconfig.json`, `.gitignore`, `README.md`, `knowledge/README.md`, `knowledge/past-papers/README.md`, `knowledge/past-papers/_TEMPLATE.md`, `server/generated/index.json` (rebuilt).

## 3. New files

`server/lang/unicode.mjs`, `server/lang/glossary.mjs`, `server/lang/nlp.mjs`, `server/mathcheck.ts`, `scripts/ingest.mjs`, `scripts/run-ts.mjs`, `scripts/lang-selftest.ts`, `scripts/eval.ts`, `scripts/eval-live.mjs`, `evals/olis-eval.json`, `evals/fixtures/knowledge/**`, this document.

## 4. Schema / index changes

Chunk: added `level` (OL | AL | absent), `grade`, `tier` (1–7), `pages`, `language`. Front-matter keys the indexer reads: `level`, `tier`, `exam`, `grade`, `language`. Folders `knowledge/ol/…` and `knowledge/al/…` set the level automatically. `[p.N]` markers are stripped from text and stored in `pages`. Untagged notes are shown to both levels (existing content keeps working).

`StudyProfile.examLevel` is optional; old saved profiles still load.

## 5. RAG architecture

query → `resolveFollowUp` (previous-turn context) → `expandQuery` (NFC, stem, glossary, Singlish fix, typo correction; separate retrieval query, the student's message is never rewritten) → BM25 (+ Gemini embeddings if a key exists) fused with RRF → level hard filter + tier/level/subject soft boosts → `groundingOf` → excerpts with level/tier/page labels → model.

Grounding "none" = the question's distinctive terms are mostly absent from the KB (`GROUND_NONE_UNKNOWN = 0.4`, a heuristic). Exam task words, digits and scripts the KB doesn't contain are ignored.

## 6. Sinhala NLP

Stemmer (suffix stripping, min stem 3), glossary of ~200 terms, strong/weak Singlish markers (so "Mata Hari" stays English), reply-language precedence: explicit request > saved preference > detected language. Tamil is detection only.

## 7. Unicode findings (honest)

- Transport is correct: SSE + `TextDecoder(stream:true)` survives byte splits (tested; removing `stream:true` makes a test fail).
- The old NFKD tokenizer split Sinhala vowel signs. That hurt search matching only, not display. Fixed.
- Poppins has no Sinhala glyphs but does have Devanagari, so Devanagari output renders cleanly and Sinhala falls back to an OS font. Added Noto Sans Sinhala / Iskoola Pota / Nirmala UI to the stack.
- Devanagari in answers is most likely model-side. **Not reproduced here (no API keys).** The `ai.script_guard` log event now records frequency and model in production; check Vercel logs after deploy.

## 8. Prompts

`languageRules`, `levelBlock`, `SPECIALISTS`, `groundingBlock` (incl. Sinhala "unsure" sentence and source-priority rule), math_check rule, marking rule, stricter retry rule. The exact phrase "Reply in Sinhala (Sinhala script)" is kept (existing test depends on it).

## 9. Ingestion

```
npm run ingest -- <file.pdf | archive.zip | folder> --level ol|al --subject <id> [--type syllabus|past-paper|notes] [--ocr] [--dry-run]
npm run build:index
```

Dedupes by file hash and text hash, flags corrupt / scanned / legacy-font (FM Abhaya style) PDFs, fixes visual-order Sinhala vowels, strips running headers/footers, writes `[p.N]` markers and `knowledge/_ingest-report.json`. `--ocr` needs `tesseract` with `sin` + `eng` data and `pdftoppm`. Always review output before committing.

## 10. Dependencies

`mathjs` (runtime). `fflate`, `pdfjs-dist` (dev, ingest only).

## 11. Env vars

None new. `OLIS_INDEX_PATH`, `OLIS_KB_DIR`, `OLIS_INDEX_OUT` are optional test overrides.

## 12. Migration

1. Apply the patch, `npm ci`.
2. `npm test` (28 + 80 + eval floors).
3. `npm run build`.
4. Deploy through `update-github.bat`. No data migration.

## 13. Evaluation results (offline, keyword mode, 22 seed notes)

| Metric | Result |
|---|---|
| test:ai | 28/28 |
| test:lang | 80/80 |
| Retrieval hit@1 / hit@3 / MRR (33 cases) | 97% / 100% / 0.98 |
| Sinhala hit@1 | 87.5% (hit@3 100%) |
| Singlish, typo hit@3 | 100%, 100% |
| No-source questions correctly ungrounded | 6/6 |
| Covered questions not called "none" | 96.9% |
| Level isolation | 4/4 |
| Language detection / reply language | 24/24, 24/24 |

These measure retrieval and language logic only. **Factual accuracy, Sinhala fluency and hallucination rate of the model are unmeasured**: run `npm run eval:live` against a deployment with keys.

## 14. Limitations

- Glossary and O/L taxonomy are provisional; need a teacher / NIE review.
- No O/L content ingested; the KB is the 22 seed notes.
- Ingest tested on synthetic English PDFs only. Real Sinhala PDFs and OCR untested.
- Embeddings were off locally; semantic mode is unmeasured.
- 4-letter typos are not corrected on purpose (avoids false "covered").
- Grounding thresholds are heuristics.
- No post-hoc citation/answer verification pass; the script guard is the only runtime check.
- Past papers are metadata + template only; no structured question extraction.
- Tamil is detection only.

## 15. Next phase

1. Ingest real O/L + A/L material (syllabus first, then past papers + marking schemes).
2. Deploy, watch `ai.script_guard` and `ai.retrieval` logs for a week.
3. Run `eval:live`; extend `evals/olis-eval.json` with teacher-written Sinhala questions.
4. Teacher review of the glossary.
5. Index size: the JSON index lives in the Vercel function. Past a few thousand chunks, move to Supabase pgvector or Upstash Vector.
6. Past-paper structured extraction (question, marks, year, topic).

## Fine-tuning: not now

RAG-first is correct here: the failures are missing/misrouted knowledge and script drift, not model weights, and fine-tuning free-tier models isn't available. The one defensible candidate later is supervised tuning for Sinhala style and answer format, and only once a few hundred teacher-reviewed Q&A pairs exist.
