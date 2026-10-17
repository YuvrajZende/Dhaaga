# LLD — Network Search App (Happenstance Clone)

Low-Level Design · v1.0 · 2026-09-19
Companion docs: [`srs.md`](./srs.md), [`hld.md`](./hld.md). Everything here is implementable as written: DDL runs, SQL is the real shape, contracts are wire-exact.

---

## 1. Stack & repository layout

| Layer | Choice | Notes |
|---|---|---|
| Framework | Next.js 15 (App Router, TypeScript strict) | Route handlers = API; RSC pages; server actions for mutations; async `cookies()`, `params`, `searchParams` |
| DB | Neon Postgres 16 + pgvector 0.7 | `-pooler` connection string; `sslmode=require` |
| ORM | Drizzle | typed schema, SQL passthrough for vector queries |
| Embeddings | `@huggingface/transformers` — `Xenova/all-MiniLM-L6-v2` (ONNX, 384-d) | Node runtime only; singleton lazy init |
| LLM | OpenRouter (OpenAI-compatible) | model + fallbacks via env |
| Graph UI | `sigma.js` + `graphology` (WebGL canvas) | client-side layout |
| Validation | Zod | one schema per API contract + LLM output schemas |
| Auth | Google OAuth via `arctic` or `next-auth` | httpOnly session cookie |

```
src/
  app/(pages)        onboarding/ search/ graph/ friends/ privacy/
  app/api/           search/ sync/ people/ drafts/ friends/ cron/
  lib/
    db/              schema.ts · repo/{people,edges,search,jobs}.ts
    llm/             client.ts (adapter) · prompts/ · schemas/
    embed/           model.ts (singleton) · queue.ts
    search/          decompose.ts · fanout.ts · rerank.ts · sse.ts
    sync/            engine.ts · chunk/{contacts,gmail,calendar}.ts
    warmpath/        select.ts · draft.ts
    graph/           subgraph.ts
    auth/            session.ts · google.ts · crypto.ts
```

Rule: **route handlers are thin** (parse → call domain module → serialize). All logic lives in `lib/` modules that take a db/client and are unit-testable without HTTP.

## 2. Database schema (DDL as built)

```sql
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE users (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  google_sub      text UNIQUE NOT NULL,
  email           citext UNIQUE NOT NULL,
  name            text NOT NULL,
  avatar_url      text,
  sharing_enabled boolean NOT NULL DEFAULT false,   -- FR-G2: opt-in, default OFF
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE google_tokens (
  user_id        uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  access_token   bytea NOT NULL,          -- AES-256-GCM sealed (§12)
  refresh_token  bytea NOT NULL,
  scope          text NOT NULL,
  expires_at     timestamptz NOT NULL,
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE sources (
  user_id        uuid REFERENCES users(id) ON DELETE CASCADE,
  type           text NOT NULL CHECK (type IN ('contacts','gmail','calendar')),
  status         text NOT NULL DEFAULT 'disconnected'
                 CHECK (status IN ('disconnected','active','syncing','throttled','error')),
  cursor         jsonb,                    -- {syncToken|historyId|timeMin, page}
  last_synced_at timestamptz,
  error          text,
  PRIMARY KEY (user_id, type)
);

CREATE TABLE people (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id  uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  display_name   text NOT NULL,
  given_name     text,
  family_name    text,
  primary_email  citext,
  title          text,
  company        text,
  company_domain text,                     -- extracted from email domain
  headline       text,                     -- contacts bio / best-known blurb
  avatar_url     text,
  source_refs    jsonb NOT NULL DEFAULT '[]',  -- [{source, sourceId}]
  dedup_key      text NOT NULL,            -- §2.1 canonical key
  is_flagged_dup boolean NOT NULL DEFAULT false,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_user_id, dedup_key)
);
CREATE INDEX people_owner_idx    ON people (owner_user_id);
CREATE INDEX people_company_idx  ON people (owner_user_id, company_domain);
CREATE INDEX people_name_trgm    ON people USING gin (display_name gin_trgm_ops);

CREATE TABLE contact_edges (               -- me → person
  user_id     uuid REFERENCES users(id) ON DELETE CASCADE,
  person_id   uuid REFERENCES people(id) ON DELETE CASCADE,
  strength    smallint NOT NULL DEFAULT 0 CHECK (strength BETWEEN 0 AND 100),
  signals     jsonb NOT NULL DEFAULT '{}', -- §6 signal payload
  PRIMARY KEY (user_id, person_id)
);
CREATE INDEX contact_edges_strength ON contact_edges (user_id, strength DESC);

CREATE TABLE person_edges (                -- person ↔ person, derived (canonical: a_id < b_id)
  a_id   uuid REFERENCES people(id) ON DELETE CASCADE,
  b_id   uuid REFERENCES people(id) ON DELETE CASCADE,
  weight smallint NOT NULL,                -- co-occurrence score
  basis  text NOT NULL DEFAULT 'shared_thread',
  PRIMARY KEY (a_id, b_id),
  CONSTRAINT chk_person_edges_order CHECK (a_id < b_id)
);
CREATE INDEX person_edges_b_idx ON person_edges (b_id, a_id, weight DESC);

CREATE TABLE embeddings (
  person_id     uuid PRIMARY KEY REFERENCES people(id) ON DELETE CASCADE,
  owner_user_id uuid NOT NULL,             -- denormalized: partition/shard key of the future
  vec           halfvec(384) NOT NULL,
  model_version text NOT NULL,
  embedded_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX embeddings_hnsw ON embeddings
  USING hnsw (vec halfvec_cosine_ops) WITH (m = 16, ef_construction = 64);
CREATE INDEX embeddings_owner_model ON embeddings (owner_user_id, model_version);

CREATE TABLE embedding_queue (
  person_id  uuid PRIMARY KEY REFERENCES people(id) ON DELETE CASCADE,
  owner_user_id uuid NOT NULL,
  enqueued_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE sync_jobs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source      text NOT NULL,
  kind        text NOT NULL DEFAULT 'initial' CHECK (kind IN ('initial','incremental')),
  status      text NOT NULL DEFAULT 'queued'
              CHECK (status IN ('queued','running','throttled','done','error')),
  attempt     smallint NOT NULL DEFAULT 0,
  processed   int NOT NULL DEFAULT 0,
  total_hint  integer,
  heartbeat_at timestamptz,
  error       text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sync_jobs_pending ON sync_jobs (status, created_at);

CREATE TABLE friendships (
  user_id      uuid REFERENCES users(id) ON DELETE CASCADE,
  friend_id    uuid REFERENCES users(id) ON DELETE CASCADE,
  status       text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted')),
  invited_code text,
  PRIMARY KEY (user_id, friend_id)
);

CREATE TABLE groups (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  join_code  text UNIQUE NOT NULL,
  owner_id   uuid NOT NULL REFERENCES users(id)
);
CREATE TABLE group_members (
  group_id uuid REFERENCES groups(id) ON DELETE CASCADE,
  user_id  uuid REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (group_id, user_id)
);

CREATE TABLE searches (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  query_text text NOT NULL,
  norm_key   text,                          -- decomposition cache key (§7.2)
  mode       text NOT NULL DEFAULT 'full' CHECK (mode IN ('fast','full','degraded')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE search_results (
  search_id   uuid REFERENCES searches(id) ON DELETE CASCADE,
  rank        smallint NOT NULL,
  person_id   uuid REFERENCES people(id) ON DELETE CASCADE,
  via_owner_id uuid,                        -- provenance: whose network (null = mine)
  mutual_person_id uuid,                    -- warm-path mutual (null = direct/cold)
  score       real NOT NULL,
  rationale   text,
  PRIMARY KEY (search_id, rank)
);

CREATE TABLE drafts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_person_id uuid NOT NULL,
  mutual_person_id uuid,
  subject     text,
  body        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE decomp_cache (                -- FR-D6
  norm_key  text PRIMARY KEY,
  plan      jsonb NOT NULL,                -- SubSearchPlan[]
  model     text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE llm_breaker (                 -- circuit state (§7.6)
  id        smallint PRIMARY KEY DEFAULT 1,
  failures  smallint NOT NULL DEFAULT 0,
  open_until timestamptz
);
```

**Isolation rule (NFR-8):** every read/write helper in `repo/` takes `userId` as its first parameter and the SQL includes the owner predicate — enforced by code review convention + a lint rule banning raw `db.query` outside `repo/`. RLS with `current_setting('app.user_id')` is the noted defense-in-depth upgrade (HLD §10).

## 3. Deduplication & keys (FR-C1/C2/C3)

### 3.1 `dedup_key` construction
```
canonical(email) = lower(email), strip "+tag"; if domain = gmail.com also strip dots
dedup_key = canonical(primary_email)            -- when an email exists
          | "n:" + lower(normalized_name) + "@" + company_domain   -- when not
```
Google resource IDs (`source_refs`) map many→one row. Cross-source merge happens at upsert time: `INSERT ... ON CONFLICT (owner_user_id, dedup_key) DO UPDATE SET source_refs = source_refs || excluded.source_refs, updated_at = now()`.

### 3.2 Conservative auto-merge (FR-C3)
A pair merges automatically only when `soundex(last_name)` matches AND `company_domain` equal AND exactly one side lacks email. All other suspected pairs (levenshtein(name) ≤ 2, same owner) get `is_flagged_dup = true` and surface in a review list — never auto-merged.

### 3.3 Noise filtering & non-human contact exclusion
To prevent polluting `people` and vector search with automated bots / transactional email:
- **Header inspection**: Request `metadataHeaders=[To, From, Cc, Date, List-Unsubscribe, Precedence]`. If `List-Unsubscribe` is present or `Precedence: bulk|list`, ignore the sender/recipients unless already in Google Contacts.
- **Prefix blocklist**: Drop addresses matching common transactional prefixes (`noreply@`, `no-reply@`, `notifications@`, `support@`, `billing@`, `mailer-daemon@`, `system@`, `alerts@`, `info@`, `updates@`).
- **Human threshold rule**: A Gmail address is only added as a profile in `people` if:
  1. It exists in Google Contacts, OR
  2. The user has sent at least 1 direct message to them (`From: user`), OR
  3. The address appears in at least 2 distinct small-group threads (≤ 8 participants).

## 4. Strength & edge derivation (FR-C4/C5)

### 4.1 Connection strength (0–100)

```
email_score = 40 · min(1, email_count / 25) · recency_decay(last_email_at)
meeting_score = 30 · min(1, meeting_count / 8) · recency_decay(last_meeting_at)
source_score = 10 per source present (max 20)
directness_bonus = +10 if user was direct To (not CC) in ≥30% of threads
recency_decay(t) = exp(-days_since(t) / 180), floor 0.1
strength = clamp(round(email_score + meeting_score + source_score + directness_bonus), 0, 100)
```

Recomputed in batch at the end of each sync chunk (`UPDATE contact_edges ... FROM tmp_signals`), never per-person-at-read-time.

### 4.2 Person↔person edges
Per processed Gmail page: for each thread (group by `threadId`), participants = senders+recipients with user **excluded**; for every unordered pair emit an increment. `weight = min(100, co_occurrence_count × 10)` capped 8 participants/thread (conference-list noise control).
- **Canonical ordering**: Always store pair with `a_id < b_id`: `[a, b] = id1 < id2 ? [id1, id2] : [id2, id1]`. Upsert with `ON CONFLICT (a_id, b_id) DO UPDATE SET weight = LEAST(100, person_edges.weight + EXCLUDED.weight)`.
- Reverse lookups: Served by `person_edges_b_idx` on `(b_id, a_id, weight DESC)`. Mutual path discovery searches both `(a_id = $m AND b_id = $t)` and `(a_id = $t AND b_id = $m)`.

## 5. Sync engine (FR-B2/B3/B4/B8)

### 5.1 Job lifecycle

```
queued ──claim──► running ──► done
                    │ ▲
                    ├─┘ (self-chain: another chunk remains)
                    ├──► throttled ──(Retry-After elapsed / sweep)──► queued
                    └──► error (fatal: revoked token, unexpected 4xx)
```

- **Claim:** `UPDATE sync_jobs SET status='running', heartbeat_at=now() WHERE id=$1 AND status IN ('queued','throttled') RETURNING *` — atomic; sweep cron re-claims where `status='running' AND heartbeat_at < now()-5min` (attempt++, max 5 → error).
- **Chunk contract** (one function invocation, per source): process ≤ 60 s of Google paging → batch upsert → drain embedding_queue for touched people (≤ 64) → persist cursor + `processed` → return `{done: boolean, processed: number}`.
- **Execution loop (serverless-friendly):**
  - **Client-driven loop during onboarding/active UI:** When the user initiates sync, the client browser drives the chain (`POST /api/sync/chunk` returning `{done, processed}`). If `!done`, client issues the next chunk request immediately, displaying active sync progress.
  - **Cron sweeper fallback:** Vercel Cron runs `/api/cron/sweep` every 10 min to advance queued/stalled jobs in case the user navigates away mid-sync. Avoids unawaited background `fetch` in serverless lambdas.
- **Per-source chunk bodies:** Contacts = `people.connections.list(pageSize=200, syncToken)`; Gmail = `messages.list(q='newer_than:3y (in:sent OR in:inbox)', maxResults=100, pageToken)` + `batchGet(format=METADATA, metadataHeaders=[To,From,Cc,Date,List-Unsubscribe,Precedence])` in ≤25-id batches + participant extraction (with §3.3 noise filters applied); Calendar = `events.list(timeMin..timeMax, 30-day slices, maxResults=250)` attendee extraction.
- **Throttling:** on 429/`rateLimitExceeded` → status=`throttled`, store `retry_after`; sweep re-queues after the window.

### 5.2 Incremental cursors
Contacts: `syncToken` (Google-native). Gmail: `history.list(startHistoryId)` → added/removed message ids. Calendar: `timeMin = last_synced_at − overlap(7d), updatedMin = last_synced_at`. All persisted in `sources.cursor` jsonb after chunk commit — the resume point.

## 6. Search pipeline (FR-D*)

### 6.1 Types

```ts
type SubSearch =
  | { kind: 'semantic'; text: string; k: number }          // k ≤ 400
  | { kind: 'structured'; titleKeywords?: string[]; companyKeywords?: string[];
      minStrength?: number; scope: 'me' | 'network' }
type SubSearchPlan = { subSearches: SubSearch[] }          // ≤ 5 (Zod-validated)

type Candidate = { personId: string; sim: number; ownerScope: 'me'|'friend';
                   viaOwnerId?: string; strength: number }
```

### 6.2 Decomposition prompt (LLM call #1)
System: "You decompose a person-search query into at most 5 sub-searches against a contact network. Output ONLY JSON: {subSearches:[...]}. Semantic text should be a natural description of the ideal person; structured filters use titleKeywords/companyKeywords/minStrength." User: the query + (for grounding) the user's top-20 company domains.
- **Resilient parsing:** Strip markdown fences (````json ... ````) and commentary before `JSON.parse` + Zod validation to handle free OpenRouter models smoothly. Output parsed with Zod → malformed = 1 strict retry → degraded (HLD §11).
- **Cache key:** `norm_key = sha256(normalize(query))` where normalize = lowercase, strip punctuation, collapse whitespace; cache hit → skip call.

### 6.3 Fan-out SQL (the core query, one round-trip)

```sql
-- semantic sub-search, per owner (UNION ALL over owners in scope)
WITH sem AS (
  (SELECT e.person_id, 1 - (e.vec <=> $qvec) AS sim, 'me' AS scope, NULL::uuid AS via
     FROM embeddings e WHERE e.owner_user_id = $me AND e.model_version = $mv
     ORDER BY e.vec <=> $qvec LIMIT 400)
  UNION ALL
  (SELECT e.person_id, 1 - (e.vec <=> $qvec), 'friend', $friendId
     FROM embeddings e
     WHERE e.owner_user_id = ANY($friendIds) AND e.model_version = $mv
     ORDER BY e.vec <=> $qvec LIMIT 100)          -- per-friend cap
)
SELECT p.*, ce.strength, m.mutual_id, m.mutual_name
FROM (SELECT person_id, max(sim) sim, min(scope), min(via)
        FROM sem GROUP BY person_id
      UNION ALL
      SELECT id, NULL, 'me', NULL FROM people
       WHERE owner_user_id = $me
         AND ($titleKw IS NULL OR title ILIKE ANY($titleKw))
         AND ($companyKw IS NULL OR company ILIKE ANY($companyKw))
      LIMIT 1000) c
JOIN people p       ON p.id = c.person_id
LEFT JOIN contact_edges ce ON ce.person_id = p.id AND ce.user_id = $me
-- + lateral warm-mutual lookup (§8.1, only for the final ≤100)
ORDER BY sim DESC NULLS LAST LIMIT 1000;
```

Structured sub-searches run in the same statement family (no vector clause). Result: ≤ 1000 deduped candidates with strength + mutual attached, ≤ 200 ms.

### 6.4 Rerank (LLM call #2)
Input: top-100 candidates (truncated fields: name, title, company, strength, mutual name) + original query. Output: `[{id, rank, rationale(≤140 chars)}]`, Zod-validated, ≤ 20 kept. Fallback scoring when degraded: `score = 0.7·sim + 0.3·(strength/100)`, rationale = `"Matched "${plan[0].text}" · connection strength ${strength}/100"`.

### 6.5 SSE contract (FR-D1, NFR-12)

```
POST /api/search  {query: string, scope?: {friendIds?: string[], groupIds?: string[]}}
→ text/event-stream:
  event: stage   data:{stage:"planning"}                    // t≈0
  event: stage   data:{stage:"searches", count:3}
  event: stage   data:{stage:"ranking"}
  event: results data:{searchId, mode, results:[Card…20]}   // once
  event: done    data:{timings:{decomposeMs,annMs,rerankMs}}
  event: error   data:{code, message, retryable}
Card = {personId, name, title, company, avatarUrl, summary?, strength,
        mutual:{id,name}|null, viaFriend:{id,name}|null, rationale}
```

Client: `EventSource` polyfill via fetch-stream (POST), auto-reconnect only for `retryable`, abort controller on unmount. Rate limit check (FR-D11) happens before SSE open; rejects with the standard error envelope (§9.3).

### 6.6 Degradation & circuit breaker (FR-D7)
`llm/client.ts` wraps every call: 8 s timeout, 1 retry, then degrade. `llm_breaker` table tracks failures; 3 consecutive → `open_until = now()+5min` during which decompose/rerank are skipped without attempting. All degrade decisions are recorded on `searches.mode` for observability.

## 7. Embedding subsystem (FR-C6)

```ts
// embed/model.ts — singleton, Node runtime
const extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2',
                                 {quantized: true});
export const embed = (texts: string[]) => extractor(texts, {pooling:'mean', normalize:true});
// 384-d Float32Array[] → halfvec via pgvector literal
```

- **Profile text:** `${name} — ${title} at ${company}. ${headline}. Often contacted around ${topSharedDomains(3)}.` (metadata only, C3).
- **Queue drain:** batch 64 people → embed → `INSERT ... ON CONFLICT (person_id) DO UPDATE` → delete queue rows. Chunked like sync (60 s budget).
- **Re-embed on model change:** env `EMBEDDING_MODEL_VERSION` differs from stored rows → admin action re-enqueues all of a user's people; queries filter `model_version = current` so no half-migrated reads.

## 8. Warm path & drafts (FR-E*)

### 8.1 Mutual selection (stored query)

```sql
SELECT m.a_id, m.weight, ce.strength, p.display_name
FROM person_edges m
JOIN contact_edges ce ON ce.person_id = m.a_id AND ce.user_id = $me
JOIN people p ON p.id = m.a_id
WHERE m.b_id = $targetId
ORDER BY (0.5 * ce.strength + 0.3 * m.weight
          + 0.2 * exp(-EXTRACT(EPOCH FROM (now() - ce.signals->>'last_email_at') / 86400) / 180)) DESC
LIMIT 1;
```

Direct edge case: `contact_edges.strength ≥ 60` on the target itself → render "direct", skip draft-to-mutual and draft a self-intro instead. No candidate rows → cold outreach state (HLD §7).

### 8.2 Draft prompt (share-safe by construction)
Input to LLM: user name, target name/title/company, mutual name/title/company, relationship labels ("worked together at X" derived from shared company domain; "met at" from meeting count). **Email content is absent from every table this builder reads** — enforcement is the schema, not discipline (C3). Output ≤ 120 words, subject + body, persisted to `drafts` (FR-E5). Client renders editable textarea + copy + `mailto:` with `subject`/`body` query params.

## 9. API surface (full contract)

### 9.1 Endpoints

| Method & path | Purpose | Notes |
|---|---|---|
| `GET /api/auth/google` · `GET /api/auth/google/callback` · `POST /api/auth/logout` | OAuth flow + session | httpOnly cookie, 30 d |
| `POST /api/sync/:source` | start/restart sync job | idempotent: active job returns it |
| `GET /api/sync/status` | job + source statuses, progress | poll 2 s while syncing |
| `POST /api/sync/:source/disconnect` | FR-B1 | removes that source's signals |
| `POST /api/search` | SSE search (§6.5) | rate-limited 5/min |
| `POST /api/search/more` | FR-D9 "Find more" | body: searchId |
| `GET /api/people/:id` | profile drawer data | incl. warm path + shared domains |
| `GET /api/graph?limit=500&minStrength=` | subgraph JSON | `{nodes:[{id,label,size}],edges:[{a,b,w}]}` |
| `GET /api/drafts?personId=` · `POST /api/drafts` | FR-E2/E5 | Zod-validated |
| `POST /api/friends/invite` · `POST /api/friends/accept` · `GET /api/friends` | FR-G1 | code-based |
| `POST /api/friends/sharing` | FR-G2 toggle | `{enabled: boolean}` |
| `POST /api/groups` · `POST /api/groups/join` · `GET /api/groups` | FR-G4 | code-based |
| `POST /api/privacy/purge` | FR-B7/H2 | full-user transactional delete |
| `POST /api/cron/nightly` · `POST /api/cron/sweep` | Vercel Cron (Bearer `CRON_SECRET`) | sweep: stuck jobs + embedding queue |

### 9.2 Conventions
All routes: server-session auth (except auth + cron) · Zod parse at entry · handler ≤ 20 lines · JSON body only (search = SSE response). Cursor pagination (`?cursor=` opaque base64 of `(created_at,id)`) on any list that can grow: `drafts`, `searches` history, friends. Default `limit=20`, max 100.

### 9.3 Error envelope (every endpoint, stable)

```json
{ "error": { "code": "rate_limited|invalid_query|llm_unavailable|source_error|forbidden",
             "message": "…", "request_id": "req_…", "retryable": true,
             "retry_after_s": 42 } }
```

HTTP mapping: 400 invalid_query · 401/403 · 404 · 429 (with `Retry-After` header) · 502 source_error · 503 llm_unavailable (degradable endpoints instead return mode=degraded results).

## 10. Frontend modules (visual + motion spec: [`ui.md`](./ui.md) — binding)

- **Search page:** query input → fetch-stream SSE reader → SSE stage events drive the "network answers" choreography (`ui.md` §5) → ranked cards (Person / Thinking / Mutuals) → drawer (warm path, draft, "Find more"). Skeleton + error + empty states mandatory (NFR-12).
- **Sync status:** per-source pills (disconnected/active/syncing %) + global progress; polls `/api/sync/status`; onboarding renders live star accumulation (ui.md §7.1).
- **Graph:** `sigma.js` WebGL canvas; `GET /api/graph` → client layout; hover brighten/dim, camera fly-to on click, teal path draw — all spring/interruptible per ui.md §5; ambient drift off under reduced motion.
- **Friends/Groups/Privacy:** quiet list pages; iOS-style toggles; purge uses typed inline confirmation (no modal).
- **Material primitives:** three glass weights (thick/medium/thin) as reusable components; all tokens from ui.md §2 live in `globals.css` — no raw hex in components.

## 11. Configuration (env)

```
DATABASE_URL (pooler) · AUTH_SECRET · TOKEN_ENC_KEY (32B)
GOOGLE_CLIENT_ID/SECRET · CRON_SECRET
OPENROUTER_API_KEY · LLM_MODEL (default free-tier model) · LLM_FALLBACK_MODELS
EMBEDDING_MODEL_VERSION=MiniLM-L6-v2@1
SEARCH_RATE_LIMIT_PER_MIN=5 · LLM_TIMEOUT_MS=8000
```

## 12. Security implementation details

- **Token sealing:** AES-256-GCM, random 12-B IV, `authTag || ciphertext || iv` in `bytea`; key from `TOKEN_ENC_KEY`; decrypt only inside `sync/chunk/*` and the refresh helper; refresh on 401 once per call (single-flight lock per user row).
- **Session:** signed JWT in httpOnly/Secure/SameSite=Lax cookie; no PII beyond `sub`+`user_id`.
- **Rate limiting:** in-memory token bucket keyed by `user_id` (single-instance reality, C4); the noted upgrade is a Postgres-backed counter if multi-instance.
- **Cron:** `Authorization: Bearer CRON_SECRET` checked before any work.
- **Purge:** `BEGIN; DELETE ... CASCADE from users; COMMIT;` — FK `ON DELETE CASCADE` everywhere makes it one statement; audit query checks all 15 tables.

## 13. Test plan (maps to SRS §3 ACs)

| Layer | What | Tool |
|---|---|---|
| Unit | dedup_key canonicalization · strength formula · warm-path ordering · norm_key normalization · SubSearch Zod schemas | vitest, pure functions |
| Contract | LLM output schemas parse; fallback chain degrades | mocked adapter |
| Integration | chunk idempotency (run twice, checksum equal) · cursor resume · fan-out SQL vs seeded fixtures (pgvector in Docker) | vitest + testcontainers |
| E2E | golden paths 1–5 from SRS §6 | Playwright |
| Load sanity | 50k-people synthetic sync · search p50 with recorded LLM latencies | script |

## 14. Open items at implementation time
Exact free OpenRouter model ids to pin at build time · sigma.js vs cytoscape after a spike · next-auth vs arctic after OAuth spike · Gmail query bounds (`newer_than:3y`) tuned against your real mailbox size.
