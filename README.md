# OLIS AI · Beta

**Orbix Learning Intelligence System**: an AI learning workspace for students, built for the Sri Lankan G.C.E. A/L.
`v0.7` · In active development · **$0 to run (Free Beta)**

OLIS is a research agent for learning. It checks a curated knowledge base (notes and past papers) and the **PDFs / Word files students attach** (with real page citations), then Wikipedia, Wikidata, research papers (OpenAlex, arXiv, Crossref) and trusted websites when it needs to, and answers with **cited sources** in English, Sinhala or Tamil, adapted to each student's subject, level, study profile and chosen **personality** (Teacher, Tutor, Exam Coach, Socratic…). It routes every question to a suitable AI engine and **switches engines automatically** when one is busy or failing. If the cloud is unavailable, a full offline engine takes over.

---

## Architecture

```
Browser (React, no keys)          Vercel Functions (/api)                         AI engines (free tier)
────────────────────────          ───────────────────────                         ──────────────────────
Chat / Tools / Settings ─POST─▶  /api/agent ─▶ guard ─▶ classify ─▶ RAG ─▶ AI router ─┬─▶ Google Gemini (primary)
   language · profile    ◀─SSE─   steps, sources, text, rewind, notice, meta         ├─▶ NVIDIA (optional)
   photos (downsized)             /api/generate  quiz & flashcards (JSON, same router) ├─▶ Groq · Cerebras · Mistral · OpenRouter free (optional)
   PDF/DOCX read in browser                                                         └─▶ Open-source model server (optional)
                                  /api/health    public {ok,busy} only · ?detail=1 admin health (404 without token)
                                  /api/feedback  👍/👎 → logs / webhook
                                  /api/subjects  public subject registry · /api/olis/classify  router labels only
```

Full routing details: **[docs/ai-architecture.md](docs/ai-architecture.md)**. Retrieval, documents, knowledge sources, personality and evaluation: **[docs/rag-documents-and-sources.md](docs/rag-documents-and-sources.md)**.

```
api/                      Vercel Functions
server/
  ai/                     ◀ multi-provider AI layer
    models.config.ts        ★ models, routes per task, Free Beta allowlist
    router.ts               fallback, retries, timeouts
    intent.ts               subject router: subject, level, language, intent, difficulty, requires_*
    classify.ts policy.ts health.ts store.ts log.ts status.ts types.ts
    providers/              gemini.ts · openai-compatible.ts (Groq, Cerebras, NVIDIA, Mistral, OpenRouter, open-source; tool calling) · index.ts
  docs/                   pdflayout.mjs (PDF → markdown, shared with ingest) · docx.mjs · retrieve.ts (search inside an attached document)
  sources/                wikipedia · wikidata · research (OpenAlex, arXiv, Crossref) · cache · http
  rerank.ts               second-stage reranking (exact formula/question/year signals + optional bge-reranker)
  embeddings.mjs          Gemini or TEI (bge-m3) embeddings, shared by the indexer and queries
  personality.ts          Settings → AI Personality (style only, never facts)
  knowledge/subjects.json ★ subject registry: subjects, units, aliases, answer strategies (edit to add a subject)
  knowledge/taxonomy.ts   loads and queries the registry
  agent.ts                research loop (tools, citations, streaming fallback)
  generate.ts             quiz / flashcards
  prompts.ts              persona, language, profile, A/L + past-paper rules
  rag.ts tools.ts http.ts sanitize.ts config.ts text.mjs (education-aware chunker)
knowledge/                notes · syllabus/ · past-papers/ (see knowledge/README.md)
scripts/                  build-index.mjs · vite-api.ts · test-ai.mjs + ai-selftest.ts
src/                      React app (services/olisEngine.ts is the only thing the UI calls)
```

---

## Provider setup

| Provider | Role | Key | Notes |
|---|---|---|---|
| **Google Gemini** | Primary: all tasks, tools, photos, Sinhala | `GEMINI_API_KEY` from https://aistudio.google.com/apikey | Use a project **with billing OFF**. With billing on, Google bills even "free" models, and OLIS can't detect that. |
| **NVIDIA** | Optional fallback (DeepSeek, gpt-oss, Nemotron, Llama Vision) | `NVIDIA_API_KEY` from https://build.nvidia.com | ⚠ NVIDIA's free endpoints are for **development, testing and evaluation**, not production. Check their terms before enabling it on a public site. No tool calling (OLIS pre-fetches notes instead). |
| **Groq** | Optional fallback (Llama 3.3 70B, gpt-oss-120b), tool calling | `GROQ_API_KEY` from https://console.groq.com/keys | Free plan, very fast. Per-model daily limits. |
| **Cerebras** | Optional fallback (gpt-oss-120b), tool calling | `CEREBRAS_API_KEY` from https://cloud.cerebras.ai | Free tier; 64k context. |
| **Mistral** | Optional fallback (Mistral Small), tool calling | `MISTRAL_API_KEY` from https://console.mistral.ai | Free "Experiment" plan. ⚠ Free-plan data may be used for training unless you opt out. |
| **OpenRouter** | Optional last-resort fallback | `OPENROUTER_API_KEY` from https://openrouter.ai/keys | Only free models (`openrouter/free`, `*:free`) pass Free Beta. 50 requests/day without credits. |
| **Open-source server** | Optional (Ollama, Ollama Cloud, vLLM, LM Studio, HF endpoint) | `LOCAL_AI_BASE_URL` (+ `LOCAL_AI_API_KEY`) | Must be reachable from the internet when deployed. |

Provider list source: [awesome-freellm-apis](https://github.com/open-free-llm-api/awesome-freellm-apis), each checked against the provider's own docs (Oct 2026). Unofficial "free GPT" proxies that reverse-engineer other companies' chat sites are deliberately **not** supported: they break those services' terms and send students' questions to unknown third parties.

With only `GEMINI_API_KEY` set, OLIS still falls back between three Gemini models, which have separate free quotas.

## Environment variables

See **`.env.example`** for every option. The important ones:

| Variable | Default | Purpose |
|---|---|---|
| `GEMINI_API_KEY` | none | Primary provider (and knowledge-base embeddings) |
| `NVIDIA_API_KEY` | none | Optional fallback provider |
| `GROQ_API_KEY`, `CEREBRAS_API_KEY`, `MISTRAL_API_KEY`, `OPENROUTER_API_KEY` | none | Optional free fallback providers |
| `OPENALEX_API_KEY`, `OLIS_CONTACT_EMAIL` | none | Optional: bigger research-search budget / polite pool |
| `RERANKER_URL`, `EMBED_PROVIDER` + `EMBED_URL` | none / `gemini` | Optional open-source reranker / embeddings on your own server |
| `OLIS_FREE_BETA` | `true` | Blocks paid / unknown models. Only the exact value `false` turns it off |
| `DAILY_REQUEST_LIMIT` | `150` | Per-student (IP) requests per day |
| `RATE_LIMIT_PER_10MIN` | `30` | Per-student burst limit |
| `OLIS_ADMIN_TOKEN` | none | Unlocks provider health (`/api/health?detail=1`, Settings → Developer) |
| `UPSTASH_REDIS_REST_URL` / `_TOKEN` | none | Optional: limits shared across serverless instances |
| `TAVILY_API_KEY` | none | Optional web search |
| `GEMINI_MODEL`, `GEMINI_REASONING_MODEL`, `GEMINI_BACKUP_MODEL`, `NVIDIA_*_MODEL` | see config | Model overrides (must be on the allowlist in Free Beta) |

## Model configuration

Everything lives in **`server/ai/models.config.ts`**:

- `catalog()`: every model, with provider, tier (`free`/`paid`), capabilities (`tools`, `vision`, `json`, `reasoning`, `multilingual`, `long_context`), context size and OLIS's own soft daily budget.
- `ROUTES`: for each task, the models to try in order.

  | Task | Chosen when | First choice |
  |---|---|---|
  | `general` | simple questions | Gemini fast (Flash-Lite) |
  | `mathematics` / `physics` / `reasoning` | Combined Maths problems, physics calculations, "prove / hence / calculate" | Gemini reasoning (Flash) |
  | `chemistry` | chemistry explanations | Gemini reasoning, then fast |
  | `sinhala` | Sinhala, Singlish or mixed input, or language = සිංහල | Gemini reasoning |
  | `vision` | a photo is attached | Gemini reasoning (multimodal) |
  | `long_context` | attached material over 60k characters | Gemini fast (1M context) |
  | `structured` | quizzes and flashcards (JSON) | Gemini fast |

- `FREE_BETA_ALLOWLIST` / `PAID_MODEL_PATTERNS`: what Free Beta allows.

Change model preferences by editing these lists. No application code changes.

## Adding a provider

1. **OpenAI-compatible API** (most hosts): add a factory in `server/ai/providers/index.ts`:
   ```ts
   export const MyProvider = () => new OpenAICompatibleProvider({
     id: "myprov", label: "My Provider",
     baseUrl: () => env("MYPROV_BASE_URL") || "https://api.example.com/v1",
     apiKey: () => env("MYPROV_API_KEY"), keyRequired: true,
   });
   ```
   and register it in `providers()`. Anything else: implement `AIProvider.stream()` (see `gemini.ts`) and throw `ProviderError` with the right category.
2. Add `"myprov"` to `ProviderId` in `server/ai/types.ts` and to `KNOWN_PROVIDERS` in `server/ai/policy.ts`.
3. Add its models to `catalog()` (with an honest `tier`), put their keys into `ROUTES`, and add the model IDs to `FREE_BETA_ALLOWLIST.myprov` **only if** they are genuinely free.
4. Add `MYPROV_API_KEY` to `.env.example` and Vercel, then run `npm run test:ai`.

## Fallback behaviour

| Failure | What OLIS does |
|---|---|
| Rate limit / quota (429) | Takes that model out of rotation for its `Retry-After` (20–600 s) and tries the next model |
| Server error (5xx) | Retries the same model once, then falls back |
| Timeout (no output in 30 s, or 20 s of silence) | Falls back (no retry) |
| Invalid request (400) | Never resends it to that provider; tries another provider once, then stops |
| Invalid key / auth | Logs it (without the key), skips the provider for 10 min |
| Model gone / unsupported | Skips the model for an hour |
| Safety block | Stops and asks the student to rephrase |
| Fails mid-answer | Browser discards the partial text; students see *"OLIS is switching to another AI engine. One moment…"* |
| Everything unavailable | *"OLIS is very busy right now (free beta limits)…"* or *"OLIS's AI engines are unavailable right now…"*, with **Answer offline instead** |

A 3-failures-in-a-row circuit breaker also cools a model down for 30 s.

## Free-tier protection

- **Free Beta mode** (`OLIS_FREE_BETA`, on by default): only models marked `free` **and** on the exact-ID allowlist can be called. Paid patterns (`-pro-preview`, image, omni…) and unknown providers are always blocked. A misconfigured model is skipped and logged (`ai.policy_block`), never billed.
- **Limits:** per-student burst (30 / 10 min) and daily (150 / day) caps, plus a soft daily budget per model that keeps OLIS below each free quota so it fails over before hitting a wall.
- **Body limits:** 120 kB text requests, ~3 MB with photos (max 2 per message, JPEG/PNG/WebP, downsized in the browser).
- **What OLIS does NOT do:** create extra accounts, rotate keys or identities, or otherwise work around a provider's limits. One key per provider. The goal is reliable orchestration, not quota abuse.

## O/L + A/L, Sinhala and evaluation

OLIS serves both G.C.E. O/L and A/L students. The language layer (`server/lang/`), level-aware retrieval,
grounding rules, PDF ingest and the evaluation suite are described in **`docs/ol-al-upgrade.md`**.

```
npm test            # agent tests + language/router/memory tests + retrieval eval + plain-Node route check
npm run test:lang   # Sinhala Unicode, language detection, Singlish expansion, maths tool
npm run eval        # retrieval / no-source / level-isolation metrics with regression floors
npm run eval:live   # against a running OLIS with real model keys (not part of npm test)
npm run ingest -- <folder|pdf|zip> --level ol --subject "Science"
```

## Live data, memory and earlier chats

OLIS answers current questions (Bitcoin price, USD→LKR, weather, news, "latest X") from live sources with the source and
data time shown, and never invents a figure when a source is down. It remembers lasting facts the student mentions (exam,
stream, subjects, language preference, goals) in their browser, uses only the relevant ones, and lets them edit or clear them
in **Settings → OLIS Memory**. "Continue the plan we made" searches their earlier chats. No new keys needed.
Details: **[docs/live-data-and-memory.md](docs/live-data-and-memory.md)**.

## Subjects, router and answer strategies

28 O/L and A/L subjects (Maths, Science, ICT, Geography, History, Economics, Political Science, Logic, Sinhala, English, Tamil,
Buddhism, Civics, Commerce, Study Skills…) live in **`server/knowledge/subjects.json`**. Adding a subject is a JSON edit. Every
question is classified (subject · level · language · topic · intent · difficulty · needs calculation / sources / current info),
answered with that subject's method (e.g. physics: knowns → law → equation → substitution → units → sanity check), and shown
with a one-line footer: *Geography · Climatology · A/L · 2 OLIS sources · Confidence: High*. Marking mode always says the result
is an estimate, not an official mark. Details: **[docs/subject-architecture.md](docs/subject-architecture.md)**.

**Literature & language.** Poetry, prose, novels, drama, grammar, comprehension and creative writing get their own layer: OLIS
works out the form, the task (devices, theme, character, essay, feedback, question analysis…), the answer mode (quick · teach ·
exam · deep · essay · feedback · Socratic · revision), the exam command word, and whether the actual text is in front of it. It
separates fact from interpretation, never invents quotations, and asks for the passage before line-level analysis. Add texts
with `work:` metadata in `knowledge/literature/`. Details: **[docs/literature-intelligence.md](docs/literature-intelligence.md)**.

## Sri Lankan O/L and A/L knowledge

- `server/knowledge/subjects.json`: the **provisional** topic map, used for routing, tagging and "what topic is this testing?". Units are marked `verified: false` until checked against the NIE syllabus.
- `knowledge/syllabus/`: put official syllabus text here (empty on purpose: OLIS doesn't ship syllabus facts it hasn't verified).
- `knowledge/past-papers/`: one real question per file with year, paper, question number, unit, difficulty and marking scheme. Copy `_TEMPLATE.md`. OLIS searches these with `search_past_papers` and **never invents** past-paper questions or marking schemes. "Similar questions" are labelled as OLIS practice questions.
- Sinhala: answers in natural Sinhala with English technical terms (Integration, Momentum, Mole…). Understands Sinhala script, Singlish and mixed input. Language picker: Auto / English / සිංහල / தமிழ்.

## Student personalisation

Settings → **AI Personality**: Normal, Friend, Teacher, Tutor, Exam Coach, Socratic, Professional, Simple, Motivator; response length (Concise / Balanced / Detailed); language (Auto / සිංහල / English / தமிழ்). Style only: accuracy and citation rules always win.

Settings → **Study profile**: exam level, A/L stream, subjects, current topic, weak topics, goal. Everything is stored in the browser only, sanitised on the server, and used in the system prompt. No names or contact details are collected.

## Observability

Every AI call logs one JSON line (Vercel → Logs):

```json
{"evt":"ai.call","requestId":"k3j9a1","route":"agent","task":"mathematics","provider":"gemini","model":"gemini-3.5-flash","ms":2140,"ok":true,"inputTokens":1830,"outputTokens":412}
{"evt":"ai.fallback","from":"gemini-fast","to":"gemini-reasoning","error":"rate_limit"}
```

Never logged: API keys (also redacted from provider error text), prompts, answers, profiles. Feedback logs keep only short excerpts (the full text goes to your webhook, if set).

**Provider health:** set `OLIS_ADMIN_TOKEN`. In Settings, tap the **v0.7 · beta** label 5 times to reveal *Developer: AI engine health* (hidden from students), enter the token, and press **Test all** to send one tiny request to every configured engine: the quickest way to confirm a new key (e.g. NVIDIA) works. Same data: `GET /api/health?detail=1&probe=1` with header `x-olis-admin`. Without a valid token the endpoint answers 404, and the public `/api/health` returns only `{ok, busy}`.

## Security

- All keys are server-side; the browser bundle calls only `/api/*` and contains no key, provider name, model name or env var name. No source maps are shipped; the chat and admin code load on demand.
- API responses are `no-store` and `noindex`; errors are generic ("OLIS Cloud isn't available right now") and never mention configuration.
- POSTs must come from the OLIS origin (a POST without `Origin` is refused); rate limits, daily caps and size limits apply.
- Every client field is validated and clipped (`server/sanitize.ts`). Profile text is stripped of markup characters.
- Prompt injection: notes, attachments and tool results are fenced (`<knowledge_excerpts>`, `<student_document>`) and the model is told to treat them as data. `read_webpage` only fetches search results or trusted domains, and refuses redirects to untrusted hosts.
- **There are no user accounts** (by design in this beta). "Unauthorized" means a wrong origin or a missing admin token. When ORBIX accounts exist, add an auth check in `server/http.ts → guard()`.

---

## Local development

```bash
npm install
cp .env.example .env.local   # add GEMINI_API_KEY (optional)
npm run dev                  # frontend + /api together
npm test                     # all suites: AI router/agent, language, literature, RAG/documents/sources, eval, plain-Node prod smoke
npm run test:rag             # chunking, PDF/DOCX, document retrieval, reranker, embeddings, Wikipedia/Wikidata/OpenAlex/arXiv/Crossref (mocked)
npm run eval                 # retrieval + document metrics with regression floors (no keys)
npm run build                # typecheck + production build
```

Without a key, OLIS runs on its offline engine.

## Deploy on Vercel

1. Import the GitHub repo (settings come from `vercel.json`).
2. Add environment variables: at least `GEMINI_API_KEY`. Recommended: `OLIS_ADMIN_TOKEN`. Leave `OLIS_FREE_BETA` unset (= on).
3. Deploy. The build runs `scripts/build-index.mjs` (embeds the knowledge base), then builds the app.
4. Open the site → Settings → *OLIS Cloud: connected*.

> After changing environment variables or adding knowledge files, **redeploy** so the index is rebuilt.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Settings says *not reachable* | The API isn't running (static hosting?) or the deploy failed. Check Vercel → Deployments |
| *No AI provider key is set* | Add `GEMINI_API_KEY` in Vercel and redeploy |
| Constant *"switching engine"* | Check Settings → Developer: a model may be rate-limited or `down` (bad key → `auth`) |
| A model shows **Blocked (Free Beta)** | Its ID isn't on the allowlist. Fix the env override, or approve it with `OLIS_FREE_BETA_EXTRA_MODELS=provider:model` if it's genuinely free |
| *"You've reached today's OLIS Beta limit"* | `DAILY_REQUEST_LIMIT` per IP. Schools share IPs, so raise it if needed. It resets at 00:00 UTC (05:30 Sri Lanka time) |
| Limits reset randomly | In-memory limits are per serverless instance. Set Upstash for shared limits |
| Semantic search off | The build had no `GEMINI_API_KEY`, or embedding quota was hit. Redeploy |
| Photos rejected | JPEG/PNG/WebP only, max 2 per message |

## Known beta limitations

- Health and limits are per server instance unless Upstash is configured.
- NVIDIA, OpenRouter and the open-source slot answer without tool calls (notes and document passages are pre-fetched); Groq, Cerebras and Mistral use tools.
- Attached documents are read in the browser: scanned PDFs and old-font Sinhala PDFs are refused (attach photos instead). Up to 150 pages / 200k characters.
- The knowledge base still has no History notes and only starter ICT / Geography notes; History questions fall back to Wikipedia and are labelled as such.
- Without `RERANKER_URL`, reranking uses deterministic signals only (no cross-encoder).
- The subject registry is provisional and the past-paper / syllabus folders start empty.
- Tamil questions are routed and answered in Tamil, but retrieval has no Tamil glossary yet (semantic search still matches Tamil when embeddings are on).
- Photos are sent for the current session only; history keeps a small thumbnail.
- Chat history and the study profile live in the browser (no accounts yet).

## Credits

- Created by **Udula**, [github.com/udulaiw](https://github.com/udulaiw)
- [thinking-orbs](https://libraries.dev/orbs.html) · [Animate UI](https://animate-ui.com) icons (MIT + Commons Clause) · [Wikipedia](https://www.wikipedia.org) content (CC BY-SA)
- [pdf.js](https://github.com/mozilla/pdf.js) (Apache-2.0) · [fflate](https://github.com/101arrowz/fflate) (MIT) · [Wikidata](https://www.wikidata.org) (CC0) · [OpenAlex](https://openalex.org) (CC0) · [arXiv API](https://info.arxiv.org/help/api/) · [Crossref](https://www.crossref.org)
- Optional: [text-embeddings-inference](https://github.com/huggingface/text-embeddings-inference) (Apache-2.0) with [bge-m3](https://huggingface.co/BAAI/bge-m3) (MIT) and [bge-reranker-v2-m3](https://huggingface.co/BAAI/bge-reranker-v2-m3) (Apache-2.0)

---

Made by UDULAIW
