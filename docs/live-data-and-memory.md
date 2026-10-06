# OLIS v0.5: live data, long-term memory and earlier chats

Builds on `docs/subject-architecture.md` (router, registry) and `docs/ol-al-upgrade.md` (RAG, language).

```
student message
  │  browser adds: saved memories · matching earlier-chat messages (only if the message refers back)
  ▼
/api/agent ─▶ router (server/ai/intent.ts)
  │  subject · level · language · intent · requires_rag / web / memory / history
  ├─ memory      extract new lasting facts → "memory" event → browser saves them
  │              select only the relevant saved facts → <user_memory>
  ├─ history     only if the message refers to an earlier chat → <previous_conversations>
  ├─ live data   only if time-sensitive → fetch → <live_data source retrieved_at data_timestamp>
  ├─ RAG         only for study questions (skipped for live questions) → <knowledge_excerpts>
  ▼
prompt rules (server/prompts.ts → systemsBlock) ─▶ AI router ─▶ answer
  ▼
browser: answer · sources · footer "Live · CoinGecko · updated 2 min ago" · steps ("Saved to memory: …")
log: ai.route { intent, subject, tools: "memory,live:crypto", ms, ok } (labels only)
```

Each source runs only when the router asks for it. "What is Newton's first law?" uses the knowledge base and the model,
"BTC price now?" uses live data only, "what did I tell you about my exam?" uses memory only.

## 1. What existed (v0.4)

React + Vite + TypeScript frontend; Vercel Functions backend (`api/`, `server/`); Gemini primary with NVIDIA/Local
fallback through a provider-neutral router; hybrid BM25 + embedding RAG over a JSON index; Wikipedia, optional Tavily
and `math_check` tools. **No database and no accounts**: chats, settings and the study profile live in the browser's
localStorage. No conversation storage or user IDs on the server.

That shaped two decisions:
- **Memory and chat history stay in the browser**, alongside the chats they come from. The server stores nothing,
  so there is nothing to leak between users and nothing to secure with RLS yet. The cost: memory is per browser, not per
  person (no sync across devices). Section 6 describes the Supabase version for when accounts exist.
- **Memory extraction is rule-based**, not a second model call. On the free Gemini tier a second call per message would
  roughly halve the number of questions students can ask.

## 2. Live data (`server/live/`)

| Domain | Detected by (examples) | Source | Key needed | Freshness |
|---|---|---|---|---|
| crypto | "Bitcoin price right now", "btc price eka dan kiyada?", "Bitcoin එකේ අද price එක කීයද?" | CoinGecko simple price | no (`COINGECKO_API_KEY` optional) | per-coin `last_updated_at` |
| fx | "USD to LKR today", "dollar rate eka kiyada", "ඩොලර් එකේ අද මිල කීයද" | open.er-api.com | no | **daily** reference rate: labelled as such, plus "bank rates differ, see CBSL" |
| weather | "weather in Kandy today", "rain today in Galle?" | Open-Meteo geocoding + forecast | no | current-conditions time; no place → Colombo, and the answer says so |
| news / sports | "Latest NASA news", "who won yesterday's match?" | Google News RSS (Sri Lanka edition) | no | newest headline's date; headlines only, cited |
| web | "latest iPhone price", "who is the current president of Sri Lanka", "current gold price" | Tavily if `TAVILY_API_KEY`, else Google News RSS | optional | each result's own date |

Detection (`detect.ts`) is rules in English, Sinhala and Singlish. It avoids false triggers on "electric current",
"where do lions live", "price elasticity of demand" and "latest syllabus" (covered by `evals/olis-eval.json → live_routing`).

Every result carries `source`, `retrieved_at` and `data_timestamp`. If a fetch fails, the model receives
`current_data_available = false` and is told to say so and **not** give any current figure, even as an estimate. The chat
itself never fails because a data source is down.

## 3. Long-term memory (`server/memory.ts`, `src/components/MemoryPanel.tsx`)

**Saved** (one fact per key; a newer fact with the same key replaces the old one):

| Key | Example message | Saved as | Importance |
|---|---|---|---|
| `language_pref` | "I prefer Sinhala explanations" / "සිංහලෙන් පැහැදිලි කරන්න කැමතියි" | Prefers explanations in Sinhala. | 5 |
| `exam` | "I'm preparing for the 2027 A/L examination" / "2027 උසස් පෙළ කරනවා" | Preparing for the 2027 G.C.E. A/L examination. | 5 |
| `stream` | "I'm preparing for A/L Physical Science" | Studies in the A/L Physical Science (Maths) stream. | 5 |
| `grade`, `subjects`, `weak:<topic>`, `goal`, `learning_style` | "I'm weak in integration", "I learn better with diagrams" | concise third-person fact | 4 |
| `favourite_subject`, `name` | "my favourite subject is Physics" | | 3 |
| `note:*` | "remember that my exam is in August" | Their exam is in August. | 4 |

**Never saved:** one-off facts ("Today I studied for 2 hours"), one-off requests ("explain this in Sinhala"), contact
details, IDs, passwords, money, health, and beliefs, even when the student says "remember".

**Used:** core profile facts (exam, stream, language, learning style at importance ≥4) on every question; anything else
only when it shares words with the question, or when the student asks about themselves. At most 8. Importance below 3 is
never used. A saved language preference applies when the study profile is set to Auto.

**Control:** Settings → OLIS Memory lists everything with its category; each item can be edited or deleted, memories can
be added by hand, memory can be cleared, and memory can be turned off (then nothing is extracted, used, or searched).
A "Saved to memory: …" step appears on the answer whenever something is saved, so it is never invisible.

## 4. Earlier conversations (`src/lib/recall.ts`, `server/ai/cues.ts`)

Separate from memory: memory = "what OLIS should know about you", history = "what we discussed".

Only when the message refers back ("continue that plan", "what did we discuss", "කලින්", "iye"; the same cue on browser and
server), the browser searches the other saved chats (shared rare words, a bonus for plan-like answers and recent chats)
and sends up to 3 matching messages. The model sees them as `<previous_conversations>` and may refer to "our earlier chat".
If nothing matches it must say: *"I don't have that previous detail available right now."* Ordinary questions send no old
chats at all.

## 5. Anti-fabrication rules (prompt)

- "You told me…" / "as we discussed…" only for content in `<user_memory>` / `<previous_conversations>`.
- Current prices, rates, weather, scores, news, office-holders only from `<live_data>` or search results this turn.
- With live data: give the source and the data time; never present old data as live; repeat caveats (daily FX rate).

Tests S5–S9 in `scripts/ai-selftest.ts` check these rules reach the model.

## 6. Security

- All keys are server-side env vars; live sources are fixed hosts (no user-controlled URLs, no SSRF).
- Memories and earlier-chat messages from the browser are untrusted: count and length capped, markup stripped, categories
  whitelisted, and block tags removed so they can't impersonate `<live_data>` etc.
- Logs (`ai.route`) record intent, subject, tool names, latency and success only: never questions, answers, memories or chats.
- There is no user ID because there are no accounts; every memory is already private to the browser it is in.

**When accounts are added** (Supabase auth), move memory and chats server-side:

```sql
create table user_memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  key text not null, memory text not null check (length(memory) <= 200),
  category text not null, importance smallint not null check (importance between 1 and 5),
  source_conversation_id uuid, embedding vector(768),
  created_at timestamptz default now(), updated_at timestamptz default now(),
  unique (user_id, key)
);
create table conversations (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users on delete cascade,
  title text, created_at timestamptz default now(), updated_at timestamptz default now());
create table messages (id uuid primary key default gen_random_uuid(), conversation_id uuid not null references conversations on delete cascade,
  role text not null check (role in ('user','assistant','system','tool')), content text not null, metadata jsonb default '{}',
  embedding vector(768), created_at timestamptz default now());
alter table user_memories enable row level security;
create policy own_memories on user_memories using (user_id = auth.uid()) with check (user_id = auth.uid());
-- same owner policy on conversations; messages via exists(select 1 from conversations c where c.id = conversation_id and c.user_id = auth.uid())
create index on messages using hnsw (embedding vector_cosine_ops);
```

`selectMemories` and `findRecall` are the two functions to swap for SQL + vector search; the prompt side stays the same.

## 7. Environment variables

None required. Optional: `COINGECKO_API_KEY` (higher crypto limits), `TAVILY_API_KEY` (already existed; now also used for
"latest X" questions, open web).

## 8. Limits

- Live data was tested with mocked responses only; the sandbox that built it cannot reach these APIs. Google News or
  CoinGecko may rate-limit shared Vercel IPs: then OLIS says it couldn't get current data (by design). Watch `ai.route`
  logs for `live:"failed"`.
- No gold/fuel/stock price API: those go through web search / headlines.
- Memory extraction is rules: it misses unusual phrasings (the student can add a memory by hand) and is English/Sinhala/
  Singlish only.
- Memory and history are per browser until accounts exist.
