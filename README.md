# OLIS AI · Beta

**Orbix Learning Intelligence System**: an AI learning workspace for students.
`v0.2` · In active development · **$0 to run**

OLIS is a research agent for learning. It checks a curated knowledge base, researches Wikipedia and trusted websites when it needs to, and answers with **cited sources**, adapted to each student's subject, level and learning style. If the cloud is unavailable, a full offline engine takes over automatically.

---

## How it works

```
Browser (React)                     Vercel Functions (/api)                 Free services
───────────────                     ───────────────────────                 ─────────────
Chat / Study Tools  ──POST──▶  /api/agent ─┬─ 1. RAG: search knowledge base ─▶ Gemini embeddings
  (no API keys)     ◀──SSE───  steps,      ├─ 2. Gemini decides: tool call?  ─▶ Gemini (function calling)
                               sources,    ├─ 3. run tools ──────────────────▶ Wikipedia · Tavily (optional)
                               text        └─ 4. repeat (max 4) → cited answer
                               /api/generate  quiz & flashcards (grounded JSON)
                               /api/feedback  👍/👎 → logs / webhook
                               /api/health    what's configured (no secrets)
```

**All API keys live only in Vercel's Environment Variables.** The browser bundle contains no keys and no AI endpoints. Requests are also origin-checked, rate-limited and size-limited.

---

## Deploy (Vercel, free)

1. **Import** this GitHub repo in Vercel → *Add New → Project*. The settings are read from `vercel.json`.
2. **Environment Variables** (Project → Settings → Environment Variables):

   | Variable | Required | Where to get it |
   |---|---|---|
   | `GEMINI_API_KEY` | ✅ | https://aistudio.google.com/apikey (free, no card) |
   | `TAVILY_API_KEY` | optional | https://tavily.com (free tier), enables web search |
   | `GEMINI_MODEL` | optional | default `gemini-3.5-flash-lite` |
   | `FEEDBACK_WEBHOOK_URL` | optional | store 👍/👎 permanently (Google Sheets Apps Script, Discord…) |

   See `.env.example` for every option (trusted domains, rate limits, max agent steps).
3. **Deploy.** The build runs `scripts/build-index.mjs`, which embeds the knowledge base with Gemini, then builds the app.
4. Open the site → Settings → *OLIS Cloud: connected* ✓

> After changing environment variables, **redeploy** (Deployments → ⋯ → Redeploy) so the build re-embeds the knowledge base.

---

## Run locally

```bash
npm install
cp .env.example .env.local   # add GEMINI_API_KEY (optional)
npm run dev
```

`npm run dev` runs the frontend **and** the `/api` functions together (a Vite plugin). No Vercel CLI needed. Without a key, OLIS runs on its offline engine.

---

## "Training" OLIS in beta

OLIS isn't fine-tuned (that needs thousands of examples). It's shaped by four layers:

1. **Persona + teaching examples:** `server/prompts.ts`. Edit the rules and the worked examples to change how OLIS teaches.
2. **Knowledge base (RAG):** add notes to `knowledge/` (see `knowledge/README.md`). Hybrid search = BM25 keywords + Gemini semantic embeddings, fused with Reciprocal Rank Fusion.
3. **Research tools:** Wikipedia always; trusted-domain web search with Tavily (`WEB_SEARCH_SCOPE=trusted` by default).
4. **Feedback loop:** every 👍/👎 is logged with the question, answer and sources (Vercel → Logs, or your webhook). This becomes your evaluation set, and later fine-tuning data.

---

## Architecture

```
api/                     Vercel Functions (Web Request/Response handlers)
  agent.ts               research agent (SSE stream)
  generate.ts            quiz / flashcards JSON
  health.ts  feedback.ts
server/                  backend logic (never shipped to the browser)
  agent.ts               the tool-use loop
  tools.ts               knowledge base · Wikipedia · web search · read page
  rag.ts                 hybrid retrieval over server/generated/index.json
  gemini.ts              Gemini client (streaming, function calling, JSON, embeddings)
  prompts.ts             persona + teaching examples  ← "training" layer
  http.ts  config.ts  text.mjs
knowledge/               the curated notes OLIS searches first
scripts/
  build-index.mjs        knowledge/ → chunks + embeddings
  vite-api.ts            runs /api inside `npm run dev`
src/
  services/olisEngine.ts the ONLY thing the UI calls (routes cloud ↔ offline)
  services/cloud.ts      browser client for /api (no keys)
  services/demo/*        offline engine: lessons, solver, planner, quiz bank, summariser
  services/wikipedia.ts  browser Wikipedia lookups (offline engine)
  components/Brand.tsx   OLIS logo (SVG) + creator info
  components/Orb.tsx     thinking-orbs wrapper (state per activity)
  components/animate-ui/ vendored Animate UI icons
  components/ pages/ store/ lib/
```

---

## Features

- **Persona:** OLIS is a friendly study buddy that knows it's a beta built by Udula ([@udulaiw](https://github.com/udulaiw)). "hi" gets a short hi, small talk stays human, and questions go well beyond the syllabus (people, history, space, tech, anything on Wikipedia)
- **Wikipedia, even offline:** with no backend, the browser still asks Wikipedia directly (CORS API). It gives cited summaries with images, "explain simpler" follow-ups, and an honest fallback when there's no connection
- **Thinking orbs:** [`thinking-orbs`](https://libraries.dev/orbs.html) animate every state: breathing (idle), researching, solving, shaping (flashcards), listening (voice), connecting (cloud check)
- **Animated icons:** [Animate UI](https://animate-ui.com/docs/icons) icons (vendored in `src/components/animate-ui/`, powered by `motion`) animate on hover. They respect *reduce motion*
- **Research agent:** live step trail ("Checking OLIS study notes → Searching Wikipedia → …"), numbered citation chips, source cards
- **Chat:** streaming, Markdown, LaTeX (KaTeX), code blocks, copy, regenerate, stop, clear, 👍/👎
- **Quick actions:** Explain · Solve · Quiz me · Study plan · Summarize
- **Learning context:** subject × level × style, sent with every request
- **Study Tools:** Flashcards, Quiz (both grounded in the knowledge base), Study Planner, Concept Explainer
- **History:** local, searchable, rename, delete, export and import
- **Resilience:** cloud unreachable or out of quota → automatic offline engine, clearly labelled
- **Design:** dark and light modes, responsive to 320 px, accessible, reduced motion

## Known beta limitations
- Free Gemini quotas are shared by all users of your deployment. The rate limit (default 30 requests per 10 min per IP) is best-effort and per instance.
- Web search needs a (free) Tavily key. Without it, research uses Wikipedia plus the knowledge base.
- Knowledge base files: `.md` / `.txt` only (no PDFs yet).
- Chat history is stored per browser (no accounts yet).
- The offline engine can't reason freely. It uses lessons, a solver and Wikipedia summaries. The cloud agent is the full model.

## Credits
- Created by **Udula**, [github.com/udulaiw](https://github.com/udulaiw)
- [thinking-orbs](https://libraries.dev/orbs.html) · [Animate UI](https://animate-ui.com) icons (MIT + Commons Clause; fine to use in an app, not to resell the icons themselves) · [Wikipedia](https://www.wikipedia.org) content (CC BY-SA)

---

Made by UDULAIW
