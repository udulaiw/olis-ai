# OLIS AI · Beta

**Orbix Learning Intelligence System**: an AI learning workspace for students, built for the Sri Lankan G.C.E. A/L.
`v0.3` · In active development · **$0 to run (Free Beta)**

OLIS is a research agent for learning. It checks a curated knowledge base (notes and past papers), researches Wikipedia and trusted websites when it needs to, and answers with **cited sources** in English or Sinhala, adapted to each student's subject, level and study profile. It routes every question to a suitable AI engine and **switches engines automatically** when one is busy or failing. If the cloud is unavailable, a full offline engine takes over.

---

## Architecture

```
Browser (React, no keys)          Vercel Functions (/api)                         AI engines (free tier)
────────────────────────          ───────────────────────                         ──────────────────────
Chat / Tools / Settings ─POST─▶  /api/agent ─▶ guard ─▶ classify ─▶ RAG ─▶ AI router ─┬─▶ Google Gemini (primary)
   language · profile    ◀─SSE─   steps, sources, text, rewind, notice               ├─▶ NVIDIA (optional)
   photos (downsized)             /api/generate  quiz & flashcards (JSON, same router) └─▶ Local model (dev only)
                                  /api/health    public status · ?detail=1 admin health
                                  /api/feedback  👍/👎 → logs / webhook
```

Full routing details: **[docs/ai-architecture.md](docs/ai-architecture.md)**.

```
api/                      Vercel Functions
server/
  ai/                     ◀ multi-provider AI layer
    models.config.ts        ★ models, routes per task, Free Beta allowlist
    router.ts               fallback, retries, timeouts
    intent.ts               task + language (Sinhala / Singlish) detection
    classify.ts policy.ts health.ts store.ts log.ts status.ts types.ts
    providers/              gemini.ts · openai-compatible.ts (NVIDIA, Local) · index.ts
  knowledge/taxonomy.ts   A/L topic map (provisional, for routing & tagging)
  agent.ts                research loop (tools, citations, streaming fallback)
  generate.ts             quiz / flashcards
  prompts.ts              persona, language, profile, A/L + past-paper rules
  rag.ts tools.ts http.ts sanitize.ts config.ts gemini.ts (embeddings) text.mjs
knowledge/                notes · syllabus/ · past-papers/ (see knowledge/README.md)
scripts/                  build-index.mjs · vite-api.ts · test-ai.mjs + ai-selftest.ts
src/                      React app (services/olisEngine.ts is the only thing the UI calls)
```

---

## Provider setup

| Provider | Role | Key | Notes |
|---|---|---|---|
| **Google Gemini** | Primary: all tasks, tools, photos, Sinhala | `GEMINI_API_KEY` from https://aistudio.google.com/apikey | Use a project **with billing OFF**. With billing on, Google bills even "free" models, and OLIS can't detect that. |
| **NVIDIA** | Optional fallback (text, reasoning, vision) | `NVIDIA_API_KEY` from https://build.nvidia.com | ⚠ NVIDIA's free endpoints are for **development, testing and evaluation**, not production. Check their terms before enabling it on a public site. No tool calling (OLIS pre-fetches notes instead). |
| **Local** | Optional, `npm run dev` only | `LOCAL_AI_BASE_URL` (e.g. Ollama `http://localhost:11434/v1`) | A Vercel function can't reach your computer. |

With only `GEMINI_API_KEY` set, OLIS still falls back between three Gemini models, which have separate free quotas.

## Environment variables

See **`.env.example`** for every option. The important ones:

| Variable | Default | Purpose |
|---|---|---|
| `GEMINI_API_KEY` | none | Primary provider (and knowledge-base embeddings) |
| `NVIDIA_API_KEY` | none | Optional fallback provider |
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

## Sri Lankan A/L knowledge

- `server/knowledge/taxonomy.ts`: a **provisional** topic map for Combined Maths, Physics and Chemistry, used for routing, tagging and "what topic is this testing?". Units are marked `verified: false` until checked against the NIE syllabus.
- `knowledge/syllabus/`: put official syllabus text here (empty on purpose: OLIS doesn't ship syllabus facts it hasn't verified).
- `knowledge/past-papers/`: one real question per file with year, paper, question number, unit, difficulty and marking scheme. Copy `_TEMPLATE.md`. OLIS searches these with `search_past_papers` and **never invents** past-paper questions or marking schemes. "Similar questions" are labelled as OLIS practice questions.
- Sinhala: answers in natural Sinhala with English technical terms (Integration, Momentum, Mole…). Understands Sinhala script, Singlish and mixed input. Language picker: Auto / English / සිංහල.

## Student personalisation

Settings → **Study profile**: A/L stream, subjects, answer language, explanation depth, current topic, weak topics, goal. It's stored in the browser only, sanitised on the server, and used in the system prompt. No names or contact details are collected.

## Observability

Every AI call logs one JSON line (Vercel → Logs):

```json
{"evt":"ai.call","requestId":"k3j9a1","route":"agent","task":"mathematics","provider":"gemini","model":"gemini-3.5-flash","ms":2140,"ok":true,"inputTokens":1830,"outputTokens":412}
{"evt":"ai.fallback","from":"gemini-fast","to":"gemini-reasoning","error":"rate_limit"}
```

Never logged: API keys (also redacted from provider error text), prompts, answers, profiles. Feedback logs keep only short excerpts (the full text goes to your webhook, if set).

**Provider health:** set `OLIS_ADMIN_TOKEN`, then open Settings → *Developer: AI engine health* (or `GET /api/health?detail=1` with header `x-olis-admin`). Students only ever see "OLIS Cloud" and an engine count.

## Security

- All keys are server-side; the browser bundle calls only `/api/*`.
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
npm run test:ai              # 22 router/agent/API scenarios with mocked providers (no keys, no network)
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
- NVIDIA/Local models answer without live tool calls (notes are pre-fetched).
- The A/L taxonomy is provisional and the past-paper / syllabus folders start empty.
- Photos are sent for the current session only; history keeps a small thumbnail.
- Chat history and the study profile live in the browser (no accounts yet).

## Credits

- Created by **Udula**, [github.com/udulaiw](https://github.com/udulaiw)
- [thinking-orbs](https://libraries.dev/orbs.html) · [Animate UI](https://animate-ui.com) icons (MIT + Commons Clause) · [Wikipedia](https://www.wikipedia.org) content (CC BY-SA)

---

Made by UDULAIW
