# HLD — Network Search App (Happenstance Clone)

High-Level Design · v1.0 · 2026-09-19
Companion docs: [`srs.md`](./srs.md) (requirements), [`lld.md`](./lld.md) (schemas, algorithms, contracts).

---

## 1. Problem statement (one sentence)

A web app where a user connects their Google account, the system builds a private, deduplicated, scored person-graph from their Gmail/Contacts/Calendar metadata, and the user searches that graph in plain English to get AI-ranked person cards — each with a warm introduction path they can act on.

## 2. Constraints that shape everything

Derived from SRS §2.4; repeated here because every design decision below traces to one of these six:

| # | Constraint | Design consequence |
|---|---|---|
| C1 | Serverless functions cap ≈ 300 s | Ingestion and embedding must be chunked + resumable background jobs |
| C2 | Free LLM tier (~20 req/min, daily caps) | ≤ 2 LLM calls per search; cache decompositions; graceful degraded mode |
| C3 | Never persist email bodies/subjects | Relationship signals come from headers/attendee metadata only |
| C4 | 1 primary user + ≤ 10 test users | No multi-region, no cache tier, no queue infra — but tenant key on every row |
| C5 | Deployed demo (Vercel + Neon free/low tiers) | Everything must run inside free-tier limits; paid tier only at the 50k ceiling |
| C6 | Read:write ≈ 99:1, ~0.002 QPS search | Optimize for a fast precomputed read path, not write scaling |

**Design philosophy:** scalability comes from *seams* (stable interfaces, tenant key everywhere, derived-data separation), not from running many services. Every component is chosen to be the cheapest thing that satisfies the constraint, with a named trigger for when to replace it.

## 3. Back-of-the-envelope (decisions these numbers force)

Full reasoning in the conversation/REQUIREMENTS; summary with the derived conclusions:

| Quantity | Value | Decision it forces |
|---|---|---|
| Search QPS | ~0.002 (peak ~0.005) | No Redis, no read replicas, no rate infra — Postgres alone serves this |
| Vector storage | 50k × 0.77 KB ≈ 38 MB/user; ~400 MB at 10-user ceiling with HNSW index | One Neon instance; `halfvec(384)` not fp32 (halves storage, HNSW-supported) |
| ANN latency @ ≤1M vectors | 10–50 ms top-100 | Vector search is *not* the latency problem; the LLM is |
| Initial ingest | ~50k people + ~30k profile texts @ ~100 texts/s CPU MiniLM | ~10–15 min compute → must be chunked job (C1), not a request |
| LLM calls | 2/search × 100 searches/day = 200 calls/day | Free tier viable; decomposition cache cuts ~30% |
| Sync API calls | Gmail ≤ 500/list-page + ≤ 25/batchGet | Bounded chunk sizes; quota backoff mandatory |

**The two real engineering problems:** (1) resumable high-volume ingestion inside a 300 s function cap; (2) 2–10 s LLM latency inside a p95 ≤ 10 s budget. Everything else is plumbing.

## 4. Architecture overview

```
┌────────────────────────────── Browser ──────────────────────────────┐
│  Next.js App Router (RSC pages + client components)                 │
│  Onboarding · Search (SSE consumer) · Graph (canvas) · Friends      │
└──────────────┬──────────────────────────────────────────────────────┘
               │ HTTPS (JSON; /search = SSE)
┌──────────────▼──────────────────────────────────────────────────────┐
│                 Vercel — one Next.js deployment (Node runtime)      │
│                                                                     │
│  Route handlers (API):        Domain modules (lib/):                │
│   POST /api/search  (SSE)      search/  decompose→fanout→rerank     │
│   POST /api/sync/:src          sync/   chunked resumable engine     │
│   GET  /api/sync/status        people/ dedupe, strength, embedding  │
│   POST /api/drafts             warmpath/ mutual selection + drafts  │
│   ... (full surface: LLD §9)   graph/   subgraph extraction         │
│                                llm/     OpenRouter adapter          │
│                                embed/   Transformers.js MiniLM      │
│                                                                     │
│  Vercel Cron: nightly incremental sync · stuck-job sweep (10 min)   │
└───────┬───────────────────────┬───────────────────────┬─────────────┘
        │                       │                       │
        ▼                       ▼                       ▼
  Neon Postgres 16        OpenRouter chat          Google APIs
  + pgvector (HNSW)       (free models,            People · Gmail
  people · edges ·        env-swappable,           (metadata only)
  embeddings · jobs       fallback chain)          (OAuth, offline)
  (pooler in front)
```

**One deployment, one database, two external dependencies (Google, OpenRouter).** The embedding model runs in-process (Transformers.js); the LLM is the only vendor call on the hot path, isolated behind an adapter.

## 5. Ingestion subsystem (the write path)

### 5.1 Why a job engine, not a request
C1 caps any function at ~300 s; a 50k-person first sync is 10+ minutes of API paging + CPU embedding. So ingestion is a **job table as queue** (no queue infra): `sync_jobs` rows with status/progress/cursor, advanced by chained function invocations that each process one bounded chunk and re-enqueue the next.

### 5.2 Flow (per source)

```
connect source
   → POST /api/sync/:source  (creates sync_job, returns jobId)
   → route handler runs ONE chunk (≤ 60 s of work):
       People API  : 1 page of 200 connections (syncToken cursor)
       Gmail       : 1 messages.list page (≤ 100) + batchGet metadata
       Calendar    : 1 time-window slice (≤ 30 days of events)
       → upsert people/edges (idempotent, dedup_key)
       → enqueue embedding for changed people (embedding_queue rows)
       → persist cursor + progress on job row
   → if more work: invoke next chunk (self-chain via fetch or cron catch-up)
   → done: job status=done, sources.last_synced_at=now
```

- **Resumability:** the cursor (Google `syncToken` / `pageToken` / time window) is persisted *after* each chunk commits. A killed lambda loses nothing; the sweep cron re-drives stuck jobs (`running` but `heartbeat` stale > 5 min → re-enqueue chunk from last cursor).
- **Idempotency:** all writes are upserts keyed on `(owner_user_id, dedup_key)` / `(person_id, source, source_ref)` — running a chunk twice is a no-op.
- **Quota safety:** exponential backoff honoring `Retry-After` on 429/403 `rateLimitExceeded`; chunk size halts below a per-run budget so cron can pick up the remainder.

### 5.3 Embedding pipeline (separate stage, decoupled on purpose)

`embedding_queue` (person_id, status) is drained by the same chunked-job mechanism: fetch batch of 64 changed people → build profile text (name · title · company · headline · top shared-domain context) → MiniLM inference → upsert `embeddings` with `model_version`. Decoupling means a model swap is a full re-enqueue, and slow embedding never blocks contact import (people are searchable by SQL filters immediately; semantically as the queue drains).

### 5.4 Nightly incremental

Vercel Cron (03:00 user-local): for each active source → one incremental job using the stored cursor (`historyId` for Gmail, `syncToken` for Contacts, `updatedMin`+time window for Calendar). Same chunked engine; typically minutes. A 10-minute sweep cron re-drives anything stuck.

## 6. Search subsystem (the read path)

### 6.1 Latency budget (p95 ≤ 10 s, target p50 ≤ 5 s)

| Stage | Budget | Mechanism |
|---|---|---|
| SSE open + auth | 50 ms | route handler |
| Decomposition (LLM #1) | 1–4 s | ≤ 5 sub-searches as JSON; cached by normalized query; **skipped entirely in fast path / degraded mode** |
| ANN fan-out (parallel) | ≤ 100 ms | pgvector HNSW, one SQL round-trip with `UNION ALL` per sub-search + `ORDER BY` merge, oversample top-1000 |
| SQL hydration + filters | ≤ 100 ms | single query joining people/edges/mutuals |
| Rerank (LLM #2) | 1.5–5 s | top-100 → top-20 with rationales; streaming tokens into SSE |
| **Total** | **3–9 s typical** | degraded mode (no LLM): ≤ 1.5 s |

The design point: **structure is the fallback, LLM is the enhancement.** Every LLM call has a non-LLM fallback path, so C2 (free-tier outage/limit) degrades quality, not availability.

### 6.2 Pipeline

```
query ──► normalize ──► [cache hit? ──► reuse sub-search plan]
                     └► LLM #1: decompose → ≤5 sub-searches
                          {semantic: text, k} ∪ {structured: title/company/strength/scope}
sub-searches (parallel, one SQL statement):
   per-owner ANN (halfvec cosine, HNSW, ef_search≈100)  → candidates
   structured filters (SQL WHERE + trigram fallback)     → candidates
   UNION ALL → dedupe by person_id → keep top ~1000
hydration: people ⋈ contact_edges ⋈ top-1 warm mutual per person
LLM #2: rerank 1000→20, rationale per card, strengths as a signal
   fallback: score = 0.7·cosine_sim + 0.3·strength, template rationale
SSE stream: progress events → result cards (ranked) → done
```

### 6.3 Per-owner ANN correctness

Filtered ANN (vector search + `WHERE owner IN (...)`) is pgvector's weak spot — post-filtering can return fewer than requested rows. Mitigation: each sub-search's owner set is small (me + ≤10 friends), so we run **per-owner ANN subqueries via `UNION ALL`** — each gets full HNSW recall within its owner partition, then merge. This is the same trick as sharded fan-out search, applied inside one Postgres instance. At the 1,000× pivot the same statement shape maps 1:1 to per-shard fan-out (HLD §9).

### 6.4 Second-degree scoping

A search declares its scope: `{me}` or `{me} ∪ {sharing-enabled friends} ∪ {my groups' sharing members}`. Friend scope is resolved *before* the ANN query into an explicit owner-id list (never recursive at query time — C6/SRS FR-G5: no transitive reach). Results from friend networks carry `via_owner_id` provenance rendered as "via [friend]".

## 7. Warm path subsystem

Purpose: for target person T owned by me, find the best introducer M.

```
candidates = my direct edge to T                     → "direct" (strongest if strength ≥ 60)
           ∪ my edges M where M↔T person_edge exists → rank by composite warmth
composite(M) = 0.5·strength(me,M) + 0.3·weight(M,T) + 0.2·recency(me,M)
```

- Stored query, no graph traversal at read time (person_edges are precomputed during sync — the only expensive graph work happens on the write path).
- LLM drafts the intro message from *share-safe facts only*: names, titles, companies, relationship types. C3 enforced at the data layer — email content physically absent from every table the prompt builder can read.
- If no mutual exists: show "no warm path — cold outreach" with a self-intro draft addressed to T instead.

## 8. Graph (constellation) subsystem

- **Extraction:** parameterized SQL pulls a bounded subgraph (default: top-500 people by strength + person_edges with weight ≥ threshold) as `{nodes, edges}` JSON. Read is cheap; no graph database.
- **Rendering:** client-side force-directed layout on canvas (WebGL-friendly lib), node size ∝ strength, edge opacity ∝ weight. Server does no layout — payloads stay small (~500 nodes ≈ 100 KB).
- **Path highlight:** given a search result's warm path, the client dims non-path nodes — the path ids already ship with the result drawer; no extra query.

## 9. Scaling ladder (what changes, what doesn't)

| Trigger | Change | Redesign? |
|---|---|---|
| **10× (100 users, ~500 MB vectors)** | Neon paid tier; sync cron sweeps more jobs | None |
| **100× (1k users, ~5M vectors)** | Partition `embeddings`+`people` by `owner_user_id` hash; LLM cost line → decomposition cache hit-rate tuning + cheap-model routing for decomposition, better model for rerank | None (statement shapes already per-owner) |
| **1,000× (10k+ users, 100M+ vectors)** | Vectors → dedicated ANN store (Qdrant) fed by a change-capture pipeline; sync → worker fleet on a real queue (Inngest/QStash); raw sync payloads → object storage; Postgres keeps system-of-record | **Seam holds:** swap the `VectorSearch` interface implementation; sync engine's chunk contract unchanged |

Why it holds: (1) every row carries `owner_user_id` — the tenant key *is* the future shard key; (2) search/warm-path/graph read through narrow interfaces (`VectorSearch`, `PersonRepository`, `LlmClient`); (3) embeddings are treated as derived data with `model_version`, rebuildable at will; (4) the job-table queue semantics (cursor, idempotent chunk, heartbeat) are exactly the semantics a managed queue would provide.

## 10. Security & privacy architecture

| Concern | Design |
|---|---|
| AuthN/AuthZ | Google OAuth session cookie (httpOnly, signed); every query clause includes `owner_user_id = session.user` — enforcement at the repository layer, not per-route |
| Token storage | AES-256-GCM encryption at rest, key from env; refresh server-side only; never leaves server runtime |
| Data minimization | C3: schemas have no body/subject columns; Gmail fetched `format=METADATA` headers only |
| Isolation | Single-tenant-per-row; future RLS (defense-in-depth) noted in LLD §12 |
| LLM safety | Prompts contain only profile metadata; no email content can enter a prompt by construction |
| Secrets | Env-only; client bundle contains no keys; OpenRouter/Google keys server-side |
| Deletion | `purge_user()` stored-proc-style transactional delete across all tables (SRS FR-B7 audit) |

## 11. Failure modes & degradation (the stress test)

| Failure | Detection | System behavior | Recovery |
|---|---|---|---|
| Lambda killed mid-chunk | heartbeat stale on `sync_jobs` | nothing lost — cursor committed per chunk | sweep cron re-enqueues from cursor |
| Google quota/429 | HTTP status + `Retry-After` | chunk pauses (status=throttled), resumes later | automatic, honors window |
| Token revoked | 401 on API call | source → `error`, UI banner "reconnect" | re-consent flow; other sources unaffected |
| OpenRouter timeout/rate-limit | timeout > 8 s / 429 | **degraded mode**: template sub-searches, vector rank, template rationale, UI flag | automatic per-request; circuit-breaker skips LLM for 5 min after 3 failures |
| LLM returns malformed JSON | schema validation on parse | retry once with stricter instruction → else degraded mode | logged with request_id |
| pgvector index miss | quality, not errors | oversample 5× + rerank; `ef_search` tunable per query class | index rebuild from `people` (embeddings are derived) |
| Neon cold start / connection spike | pool wait metrics | pooled connection string (PgBouncer); chunk handlers serialize per user | transient |
| Transformers.js cold start | first-request latency | warmup invocation post-deploy; model cached in lambda | one-time per lambda |
| Model swap drifts old vectors | `model_version` mismatch count | queries filter to current version; re-embed job backfills | background drain |

## 12. Observability

- Structured JSON logs, `request_id` propagated route→module; SSE emits per-stage timings (`decompose_ms`, `ann_ms`, `rerank_ms`).
- Counters: LLM calls (by model, by outcome), tokens degraded searches, sync chunks done/failed, embedding queue depth.
- Neon dashboard for pool saturation + slow queries; Vercel logs retained 1 week (portfolio grade).
- The single metric that would page a human if this were real: **embedding_queue depth** (freshness fails silently — SRS FR-C6).

## 13. Trade-off register (every major choice: solves / worsens / change-when)

| Choice | Solves | Worsens | Change when |
|---|---|---|---|
| Single Next.js monolith | zero infra, free tiers, one deploy | function cap; no long-lived workers | job needs > 300 s/15 min or fan-out concurrency |
| Postgres+pgvector as only store | one transactional store; relational filters + ANN in one statement | vector ceiling ≈ 5–10M; free-tier 0.5 GB | > 10M vectors or ANN p99 > 100 ms |
| Job table as queue | no queue infra to run; durable, inspectable | polling latency (~10 s sweep), no push | multi-user concurrent sync storms |
| Transformers.js in-process | $0, no vendor, no egress | cold start; CPU-bound ingest | ingest exceeds hours → GPU job or embedding API |
| OpenRouter adapter + fallback chain | free tier; model swap = env var | one more indirection | never (indirection is the point) |
| SSE for search progress | progress UX on serverless (no WS infra) | one-way only; proxy buffering care | bidirectional needs (chat) → WebSocket |
| Metadata-only ingestion | privacy posture by schema, not policy | weaker relationship signals than body analysis | never for this project (SRS FR-H3) |
| Precomputed person_edges | warm path = stored query, graph = cheap read | write-time cost during sync | edge count explodes → incremental derivation only |

## 14. What this design deliberately does NOT have

No Redis · no message queue · no microservices · no read replicas · no CDN beyond Vercel's · no multi-region · no GraphQL · no event sourcing. Each omission is justified by a BOTEC number (HLD §3) or a constraint (HLD §2), and each has a named trigger in §9/§13 that would introduce it. Adding any of them before its trigger is the failure mode this design optimizes against.
