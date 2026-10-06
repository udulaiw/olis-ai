# OLIS v0.7: retrieval, documents, knowledge sources, personality

What changed in v0.7 and how the pieces fit. Everything here runs on Vercel
serverless functions at $0; the only optional extras that need a separate
machine are the open-source embedding / reranking models (see the end).

```
Student question (+ optional PDF/DOCX/text, extracted in the browser)
   │
   ▼
classify (subject, O/L·A/L, language, intent)                    server/ai/intent.ts
   │
   ├─ 1. OLIS knowledge base ──────────────────────────────────── server/rag.ts
   │     BM25 (Sinhala-stemmed, typo-tolerant)
   │   + exact formula match ("v = u + at", "H₂SO₄" = "H2SO4")
   │   + semantic vectors (Gemini embedding / bge-m3) when the index has them
   │   → RRF fusion → metadata filters (level hard, subject/tier soft)
   │   → rerank (server/rerank.ts) → grounding: strong / weak / none
   │   → weak/none? retry once with the detected topic (capped at "weak")
   │
   ├─ 2. The student's document ──────────────────────────────── server/docs/retrieve.ts
   │     same chunker → BM25 + Sinhala↔English glossary → rerank
   │     → passages with REAL page numbers (PDF) or section headings (DOCX)
   │
   ├─ 3. Model tools, in priority order (the model stops when it has a reliable answer)
   │     search_knowledge_base · search_past_papers · math_check
   │     search_wikipedia (en / si / ta, free Commons image link) · lookup_facts (Wikidata)
   │     search_research (OpenAlex → arXiv, Crossref DOI)  ← only offered for research questions
   │     search_web (Tavily, optional) · read_webpage
   │
   ▼
AI router (Gemini → Groq → Cerebras → NVIDIA → Mistral → OpenRouter free → your server)
   │  system prompt = persona + personality block + length + language + grounding + source rules
   ▼
streamed answer with [n] citations; Sources list shows notes / past papers / your document (p.N) / Wikipedia / Wikidata / papers
```

## 1. Chunking (server/text.mjs)

The same education-aware chunker is used for the knowledge base and for
attached documents:

- sections split on `##`/`###` headings;
- **atomic blocks are never cut**: `$$…$$` display maths, fenced code, markdown tables, list runs;
- **a question owns its answer**: `Q3`, `Question 3`, `3.`, `(3)`, `ප්‍රශ්නය 3` start a unit, and
  `Answer / Solution / Marking scheme / පිළිතුර / විසඳුම` attach to the question before them;
- chunks know their **page range** from `[p.N]` markers even when the marker was on an earlier line;
- tiny neighbouring sections are merged (but never sections that contain questions).

## 2. PDF and DOCX reading

| | Where | How |
|---|---|---|
| PDF in chat | browser, `src/lib/docparse.ts` | pdf.js (lazy-loaded only when a PDF is attached), up to 150 pages / 200k characters |
| PDF into the knowledge base | `scripts/ingest.mjs` | same pdf.js layout code (`server/docs/pdflayout.mjs`) |
| DOCX | `server/docs/docx.mjs` | `word/document.xml` → markdown: headings, lists, tables, Word equations (OMML → `x^{2}`, `\frac{a}{b}`, `H_{2}O`) |
| TXT / MD / CSV / TEX | browser | as text |

PDF clean-up: running headers/footers and bare page numbers dropped; larger-font
lines and "Unit / Chapter / ඒකකය / பாடம்" lines become headings; questions and
answers start their own paragraphs; mojibake repaired; Sinhala NFC-normalised and
visual-order vowel signs fixed.

**Sinhala ZWJ fix.** pdf.js silently drops every zero-width joiner, so
rakaransaya/yansaya (`ප්‍ර`, `ද්‍ය`) came out as `ප්ර`. OLIS restores the ZWJ after a
virama before ර/ය, and search ignores ZWJ entirely so `ප්‍රකාශ` and `ප්රකාශ` match.

Refused with a clear message (never sent as garbage): password-protected PDFs,
damaged files, scanned PDFs (no text layer → "attach photos instead"), PDFs in
old Sinhala fonts (FM Abhaya etc.), `.doc`.

**Page numbers are never invented.** PDF passages carry the real page index;
DOCX/text have no pages (Word paginates at render time), so they are cited by
section heading. The prompt forbids any page number that isn't on a passage
label, and `npm run eval` fails if a DOCX passage ever gets one.

The attached document stays with the chat: follow-up questions search the same
document again (only its name goes into the history).

## 3. Reranking (server/rerank.ts)

Second stage over the top ~12 candidates:

1. **Exact-evidence signals (always on, free):** formula / chemical formula / unit
   tokens typed exactly, question numbers, exam years, quoted phrases, shared word
   pairs; near-duplicates pushed down.
2. **Cross-encoder (optional):** `BAAI/bge-reranker-v2-m3` (Apache-2.0,
   multilingual incl. Sinhala/Tamil) served by Hugging Face
   **text-embeddings-inference** (`/rerank`). Set `RERANKER_URL`. 2.5 s timeout;
   on any failure OLIS silently uses the signals alone.

## 4. Embeddings (server/embeddings.mjs)

- Default: **Gemini `gemini-embedding-001`** (free tier, 100+ languages incl.
  Sinhala and Tamil, 768 dims), built at deploy time from `GEMINI_API_KEY`.
- Open-source option: `EMBED_PROVIDER=tei` + `EMBED_URL` → **`BAAI/bge-m3`**
  (MIT, 100+ languages, 1024 dims) on your own TEI server.
- The index stores provider + model + dims; a mismatch disables vectors instead
  of comparing different vector spaces. Keyword search always works.
- Storage: the vectors live in `server/generated/index.json`, shipped with the
  functions. No vector database is needed at this size (hundreds to a few
  thousand chunks). Move to Supabase pgvector when the knowledge base reaches
  tens of thousands of chunks or needs per-user documents stored server-side.

## 5. External knowledge sources (server/sources/)

| Source | Used for | Key | Licence / terms |
|---|---|---|---|
| Wikipedia (en, si, ta) | explanations outside the notes | none | text CC BY-SA 4.0; only freely licensed Commons images are linked |
| Wikidata | exact facts about one named thing (discoverer, dates, population, atomic number…) | none | CC0 |
| OpenAlex | research papers (primary) | optional `OPENALEX_API_KEY` (free; ~100 searches/day without one) | metadata CC0 |
| arXiv | preprints; fallback when OpenAlex is down | none | ≤ 1 request / 3 s (enforced); links back, never re-hosts PDFs |
| Crossref | metadata for a DOI the student gives | none (`OLIS_CONTACT_EMAIL` joins the polite pool) | metadata |

**Routing.** OLIS notes and the student's document always come first; the
prompt tells the model to stop when it has a reliable answer, and not to call
external tools when grounding is strong. Academic search isn't even offered
unless the question asks for research/papers/studies (`RESEARCH_CUE`; "past
paper" never counts). Live data (prices, weather, news) keeps its own path.

**Caching** (`server/sources/cache.ts`): public results only, in memory per
instance + Upstash Redis when configured. Wikipedia 6 h, Wikidata / OpenAlex /
arXiv 24 h, Crossref 7 days. Failures are never cached. Nothing about a student
is ever cached.

**Failures:** every source has a timeout; a failure becomes a tool result saying
the source is unavailable, so the model carries on with the other sources.

Checked and not integrated: OpenStax and CK-12 (no general open content API for
this use), Wikimedia Commons image downloads (OLIS only links free images).

## 6. Personality, length, language (Settings → AI Personality)

`server/personality.ts` — Normal, Friend, Teacher, Tutor, Exam Coach, Socratic,
Professional, Simple, Motivator. One model, one pipeline: the personality is a
prompt block that changes tone, structure, examples and teaching approach, and
states that accuracy, citation and "say when unsure" rules win on conflict.
Response length (Concise / Balanced / Detailed) and language (Auto / සිංහල /
English / தமிழ்) reuse the existing profile fields. All saved in localStorage
with the study profile; the server validates the value.

## 7. AI providers

See [ai-architecture.md](ai-architecture.md). New in v0.7: Groq, Cerebras,
Mistral and OpenRouter (free models only) as fallbacks, OpenAI-style **tool
calling** for OpenAI-compatible providers (so Groq/Cerebras/Mistral can run the
research loop when Gemini is busy), and the local slot generalised to any
open-source model server (Ollama, Ollama Cloud, vLLM, LM Studio, HF endpoints).

## 8. Evaluation

| Command | What it measures | Needs |
|---|---|---|
| `npm run eval` | retrieval hit@1/@3/MRR overall, by language, subject, formula; reranker ablation; no-source honesty; level isolation; **document retrieval** on real PDF/DOCX fixtures; invented DOCX pages; knowledge-base coverage per subject | nothing |
| `npm run test:rag` | chunker, PDF/DOCX parsing, document retrieval, reranker, embeddings, all external sources (mocked), caching, timeouts, personality | nothing |
| `npm run test:ai` | router, agent, tool calling (Gemini + OpenAI-style), documents, research routing, personality via the real API route | nothing |
| `npm run eval:live -- --base https://…` | real answers: script, required facts, citations exist, source kinds, **page citations faithful to the document** | a deployed OLIS with keys |

RAGAS was evaluated: it needs Python plus an LLM judge on every run. OLIS keeps
the RAGAS ideas (context precision via hit@k/MRR, faithfulness via citation and
page checks, answer relevance via required facts) as deterministic checks in
TypeScript, so they run in CI for free.

## Optional open-source services (outside Vercel)

Vercel functions can't host a GPU model or a long-running server. Run these
anywhere reachable over HTTPS (a VPS, a Hugging Face Inference Endpoint, a home
machine behind a tunnel) and point OLIS at them:

```bash
# Reranker (bge-reranker-v2-m3) → RERANKER_URL=https://your-host:8080
docker run -p 8080:80 ghcr.io/huggingface/text-embeddings-inference:cpu-1.9 --model-id BAAI/bge-reranker-v2-m3
# Embeddings (bge-m3) → EMBED_PROVIDER=tei, EMBED_URL=https://your-host:8081
docker run -p 8081:80 ghcr.io/huggingface/text-embeddings-inference:cpu-1.9 --model-id BAAI/bge-m3
# Open-source chat model → LOCAL_AI_BASE_URL=https://your-host/v1, LOCAL_AI_MODEL=qwen3:8b
ollama serve   # or Ollama Cloud: LOCAL_AI_BASE_URL=https://ollama.com/v1 + LOCAL_AI_API_KEY
```
