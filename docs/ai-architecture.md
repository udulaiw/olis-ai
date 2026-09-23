# OLIS AI routing architecture

OLIS talks to AI models only through **`server/ai/`**. Nothing else in the app
knows which provider or model answered.

```
Browser ──POST /api/agent──▶ guard (origin · burst limit · daily limit · size)
                              │
                              ▼
                  classify request (server/ai/intent.ts)
                  task: general | reasoning | mathematics | physics | chemistry
                        | vision | sinhala | long_context | structured
                  language: en | si | singlish | mixed · topic guess (taxonomy)
                              │
                              ▼
                  RAG: OLIS notes / past papers (server/rag.ts)
                              │
                              ▼
          ┌──────── AI router (server/ai/router.ts) ─────────┐
          │ candidates = ROUTES[task] (models.config.ts)      │
          │   − provider not configured                      │
          │   − blocked by Free Beta policy (policy.ts)      │
          │   − missing capability (vision, tools, json…)    │
          │   − cooling down (health.ts)                     │
          │   − over OLIS's daily budget for that model      │
          │                                                  │
          │ try model ─ ok ──────────────────▶ stream answer │
          │     └ fail → classify.ts → decide():             │
          │        rate_limit   cool down, next model        │
          │        server 5xx   retry once, then next model  │
          │        timeout      next model                   │
          │        bad_request  never resend to that provider│
          │        auth/config  skip provider, log safely    │
          │        blocked      stop                         │
          │ all failed → RouterExhausted (friendly message)  │
          └──────────────────────────────────────────────────┘
```

## Files

| File | Role |
|---|---|
| `server/ai/types.ts` | Provider-neutral messages, `AIProvider` interface, `ProviderError` + failure categories |
| `server/ai/models.config.ts` | **The one file to edit**: model catalog, per-task routes, Free Beta allowlist |
| `server/ai/intent.ts` | Cheap heuristics: task, language (Sinhala / Singlish / mixed), topic |
| `server/ai/router.ts` | Candidate selection, fallback loop, timeouts, JSON generation |
| `server/ai/classify.ts` | HTTP error → category; category → retry/fallback decision; redaction |
| `server/ai/health.ts` | Per-model success/failure, cooldowns, circuit breaker |
| `server/ai/policy.ts` | Free Beta cost safety |
| `server/ai/store.ts` | Daily counters (memory, or Upstash Redis if configured) |
| `server/ai/log.ts` | One JSON log line per call. No prompts, answers or keys |
| `server/ai/status.ts` | Health summaries: internal (admin) and public (counts only) |
| `server/ai/providers/` | `gemini.ts`, `openai-compatible.ts` (NVIDIA, Local), registry |

## Streaming fallback

The agent streams answers. If a model fails **after** writing part of an
answer, the router emits `rewind`. The agent forwards `{type:"rewind", to:n}`
to the browser, which trims the answer back to `n` characters, then shows
`{type:"notice", kind:"switching"}` as *"OLIS is switching to another AI
engine. One moment…"*. The next model answers from a clean slate.

Timeouts: a model must start within `AI_FIRST_CHUNK_TIMEOUT_MS` (30 s) and may
not go silent for more than `AI_IDLE_TIMEOUT_MS` (20 s). A long answer that
keeps streaming is never cut off, except by the request deadline
(`AGENT_DEADLINE_MS`, 55 s, under Vercel's 60 s `maxDuration`).

## Tools across providers

Gemini uses native function calling, and its raw parts (including thought
signatures) are kept on the assistant message as `native` data, so the next
turn replays them exactly. Models without the `tools` capability (the
NVIDIA/Local defaults) get the request without tools. If a conversation
switches provider mid-research, earlier tool calls and results are rewritten
into plain text (`providers/shared.ts → normalizeForProvider`), so nothing that
was already looked up is lost.

## Loop safety

Each call tries each candidate at most twice (one retry, only for 5xx), the
candidate list is finite, providers that return `bad_request`/`auth` are
skipped, and two `bad_request`s end the call. The agent has at most
`AGENT_MAX_STEPS` turns and one overall deadline.

## Health and serverless

Health, cooldowns and in-memory limits are **per warm serverless instance**.
That's fine for a beta: a cold instance simply rediscovers a rate limit on
its first call and falls back. For limits shared across instances, set the
Upstash variables.

## What is NOT done here

- No key rotation or multiple keys per provider (see README: quota abuse is out of scope).
- No paid models in Free Beta.
- No tool calling on OpenAI-compatible providers yet (support varies by model).
