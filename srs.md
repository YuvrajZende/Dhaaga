# SRS — Network Search App (Happenstance Clone)

Software Requirements Specification · v1.0 · 2026-09-19
Companion documents: [`hld.md`](./hld.md) (high-level design), [`lld.md`](./lld.md) (low-level design), [`REQUIREMENTS.md`](./REQUIREMENTS.md) (scoping notes).

---

## 1. Introduction

### 1.1 Purpose
Specify the functional and non-functional requirements for a web application that lets a user search their own contact network in natural language and reach any result through a warm introduction path. This is a learning/portfolio clone of happenstance.ai; it is **not** a production SaaS.

### 1.2 Scope
In scope: Google-sourced network ingestion (Gmail metadata, Google Contacts, Google Calendar), AI-ranked natural-language person search, warm-path detection with auto-drafted intro requests, a constellation graph UI, and opt-in second-degree search through friends and groups.

Out of scope: non-Google connectors (LinkedIn/X/Instagram/Outlook), native mobile apps, public APIs, real email sending, billing/SOC 2, real-time sync (see §7).

### 1.3 Definitions
| Term | Meaning |
|---|---|
| **Person** | One deduplicated human profile derived from the user's connected sources |
| **Contact edge** | User→Person relationship with a 0–100 strength score |
| **Person edge** | Derived Person↔Person relationship (co-occurrence in email threads) |
| **Warm path** | Route from the user to a target: direct edge, via a mutual contact, or via a sharing friend |
| **Sub-search** | One machine-generated query (semantic or structured) produced by decomposing the user's NL query |
| **Degraded mode** | Search served without LLM calls (vector ranking + template rationale) |
| **Embedding** | 384-dim vector of a person profile, used for ANN search |

### 1.4 Stakeholders & users
- **Primary user (you):** technical user testing the full pipeline with a real Google account.
- **Test users (≤10):** exercise friends/groups sharing.

### 1.5 References
- happenstance.ai product page (feature parity target)
- Gmail API, People API, Calendar API docs (v1)
- pgvector (0.7+), Transformers.js, OpenRouter API docs
- REQUIREMENTS.md — scoping decisions and stated assumptions

---

## 2. Overall Description

### 2.1 Product perspective
A single-page web app with: onboarding (Google sign-in + source connection), a search page (query → streamed AI-ranked results), a result detail drawer (warm path, intro draft), a network graph page, and a friends/groups page. One Next.js deployment; Postgres is the only server-side state store.

### 2.2 Product functions (summary)
Sign in with Google → connect sources → background sync builds a private person graph → user types a NL query → system decomposes it, runs semantic + structured sub-searches, LLM-reranks candidates, streams ranked person cards with rationale and warm paths → user requests an auto-drafted intro. Optional: graph browsing and opt-in second-degree search via friends/groups.

### 2.3 Operating environment
- **Client:** modern desktop browser (Chrome/Edge/Firefox/Safari latest −1).
- **Server:** Vercel (Next.js Node runtime, ~300 s function cap), Vercel Cron for nightly jobs.
- **Data:** Neon Postgres 16 + pgvector ≥0.7 (free tier realistic case, paid tier at ceiling).
- **ML:** Transformers.js `all-MiniLM-L6-v2` (ONNX) in-process; OpenRouter chat models (free tier).

### 2.4 Constraints
- C1 — Vercel functions ≤ ~300 s per invocation → ingestion must be chunked/resumable.
- C2 — Free OpenRouter tier (~20 req/min, daily caps) → ≤2 LLM calls per search, per-session rate limiting, graceful degradation.
- C3 — No email **bodies** or **subjects** may be persisted (privacy posture) — only sender/recipient addresses, timestamps, and thread participation.
- C4 — Google OAuth consent screen in "testing" mode supports ≤100 test users (sufficient).
- C5 — Single region, single Postgres instance; no multi-region.

### 2.5 Assumptions
- A1 — 1 primary user + ≤10 test users; ≤50k people per user (ceiling), ~5k realistic.
- A2 — Users consent to Google scopes at sign-in; revocation handled as an error state.
- A3 — 24 h data staleness is acceptable; freshness comes from nightly cron + manual refresh.
- A4 — LLM output is advisory (ranking + prose), never the system of record.

---

## 3. Functional Requirements

IDs are stable; "Priority" = MoSCoW. Every FR has an acceptance criterion (AC) phrased to be testable.

### FR-A — Account & auth
| ID | Requirement | Pri | Acceptance criterion |
|---|---|---|---|
| FR-A1 | User signs in with Google (OAuth 2.0); session persists across reloads | M | Reload keeps the session; logout clears it |
| FR-A2 | Consent requests only the scopes in §5.2 (least privilege, read-only) | M | Scope list on consent screen matches §5.2 |
| FR-A3 | OAuth refresh tokens are stored encrypted (AES-256-GCM) and auto-refresh server-side | M | DB contains no plaintext tokens; expired token auto-refreshes on next sync |
| FR-A4 | First sign-in creates the user row and seeds the three `sources` rows | M | DB shows user + 3 source rows after first login |

### FR-B — Connectors & ingestion
| ID | Requirement | Pri | Acceptance criterion |
|---|---|---|---|
| FR-B1 | User can connect/disconnect each source (Contacts, Gmail, Calendar) independently | M | Disconnecting Gmail removes Gmail-derived edge signals only |
| FR-B2 | Initial sync runs as a chunked background job with visible progress (per source: items processed) | M | Progress UI advances; sync survives page reload and serverless cold starts |
| FR-B3 | Sync is resumable: each chunk persists a cursor; interruption resumes where it stopped, without duplicating people | M | Kill a sync mid-run; re-trigger; total people count unchanged and no duplicates |
| FR-B4 | Sync is idempotent: re-running any chunk produces the same DB state | M | Run the same chunk twice → row counts and checksums unchanged |
| FR-B5 | Nightly incremental sync (cron) updates edges with new email/calendar activity; Gmail uses `historyId` deltas | M | New mail from a contact tonight raises `email_count` by morning |
| FR-B6 | Manual "Refresh now" per source | S | Click → job enqueued, progress shown |
| FR-B7 | Per-user data purge ("Delete all my data") removes all rows across all tables for that user | M | Post-purge SQL audit finds 0 rows for user id in every table |
| FR-B8 | Rate-limit handling: backoff on Google 429/quota errors honoring `Retry-After` | M | Seeded 429 → chunk retries after delay, no crash |

### FR-C — Person graph data
| ID | Requirement | Pri | Acceptance criterion |
|---|---|---|---|
| FR-C1 | Contacts from all sources are deduplicated into one `people` row per human per owner | M | Same person in Contacts + Gmail + Calendar = 1 row, all 3 `source_refs` present |
| FR-C2 | Email canonicalization (lowercase; strip `+tag` and dots for gmail.com) before dedup | M | `First.Last+news@gmail.com` and `firstlast@gmail.com` merge |
| FR-C3 | Fuzzy near-duplicate detection (same name + same company domain, missing email on one side) auto-merges conservatively; others flagged, not merged | S | Flagged pair appears in "possible duplicates" UI list |
| FR-C4 | Connection strength 0–100 computed from email frequency/recency + meeting count/recency + source presence (formula in LLD §7) | M | A daily correspondent scores > 80; a one-time CC scores < 30 |
| FR-C5 | Person↔person edges derived from shared email threads (participants co-occurrence, cap 8/thread) | M | Introducer-to-introduced pairs get edges |
| FR-C6 | Every person is embedded (384-d) for the current model version; re-embed job on model change | M | All people have an embedding row with current `model_version` |

### FR-D — Natural-language search (core)
| ID | Requirement | Pri | Acceptance criterion |
|---|---|---|---|
| FR-D1 | User submits a plain-English query; system streams progress states ("Planning searches…", "Ran 3 searches…") | M | UI shows ≥2 progress states before results |
| FR-D2 | Query decomposition generates ≤5 sub-searches (semantic and/or structured filters: title keywords, company keywords, min strength, owner scope) | M | LLM trace shows ≤5 sub-searches; structured filters applied in SQL |
| FR-D3 | Sub-searches run in parallel; ANN candidates merged and deduplicated | M | 3 sub-searches complete in ~1 ANN round-trip time, not 3× |
| FR-D4 | Top candidates reranked by LLM → max 20 final results, each with a score and a one-line rationale | M | Every card shows rationale text |
| FR-D5 | Fast path: template-like queries skip decomposition (single semantic sub-search) | S | "AI founders" style query completes with 1 LLM call (rerank only) |
| FR-D6 | Decomposition cache: identical/normalized query reuses prior decomposition | S | Second identical search issues no decomposition call |
| FR-D7 | Degraded mode: if the LLM is unavailable/timeout/rate-limited, return vector-ranked results with template rationale, mode flagged | M | With API key disabled, search still returns ranked cards; UI shows "degraded" |
| FR-D8 | Results show: name, title/company, one-line summary, mutual chips, strength, and provenance (`via [friend]` when from a shared network) | M | Card fields all render; provenance on shared-network hits |
| FR-D9 | "Find more" returns the next page beyond the current results (from reserved candidate pool or a fresh decomposed batch) | S | Clicking yields new non-duplicate cards |
| FR-D10 | Search history (recent queries) persisted and clickable | C | Sidebar lists last 20 queries |
| FR-D11 | Per-session rate limit on searches (default 5/min) with 429 + `Retry-After` | M | 6th search in a minute → 429, UI shows countdown |

### FR-E — Warm path & intro drafts
| ID | Requirement | Pri | Acceptance criterion |
|---|---|---|---|
| FR-E1 | For any result, show the warmest path: direct edge, or user→mutual→target ranked by composite warmth (LLD §8) | M | Card drawer shows mutual name and path; direct edges labeled "direct" |
| FR-E2 | Auto-draft an intro request addressed to the mutual, editable inline | M | Draft opens in editable textarea with subject + body |
| FR-E3 | Draft honors privacy: references only shared-network-safe context (public profile facts + relationship, never email content) | M | Draft contains no email subjects/bodies (audit by test) |
| FR-E4 | Export draft: copy-to-clipboard and `mailto:` link (no real sending) | M | Both actions work |
| FR-E5 | Drafts persisted with target/mutual ids | S | History drawer lists past drafts |

### FR-F — Constellation graph
| ID | Requirement | Pri | Acceptance criterion |
|---|---|---|---|
| FR-F1 | Graph page renders the user's network: nodes sized by strength, edges for user→person and strong person↔person | M | 500-node subgraph renders < 2 s on desktop |
| FR-F2 | Selecting a search result (from history) highlights the path me→mutual→target | S | Path edges recolor; non-path nodes dim |
| FR-F3 | Pan/zoom/click; click opens the person drawer (profile + warm path) | M | Drawer opens on click |
| FR-F4 | Node cap with "show strongest 500" default and filter by company/strength | S | Filters change visible node count |

### FR-G — Friends & groups (second degree)
| ID | Requirement | Pri | Acceptance criterion |
|---|---|---|---|
| FR-G1 | User can invite a friend by email/code; invite flow produces an accepted friendship | M | Both accounts see the friendship as accepted |
| FR-G2 | Network sharing is opt-in per user (`sharing_enabled`, default **off**); sharing exposes public profile fields + embeddings + strengths only | M | With sharing off, friend's search returns 0 of my people |
| FR-G3 | Search can include opt-in friends' networks; results carry `via [friend]` provenance | M | Query with include_networks returns friend's contacts when enabled |
| FR-G4 | Groups: create/join by code; group members' opt-in networks pool for search | S | Group query returns pooled results with per-friend provenance |
| FR-G5 | Sharing scope limited to second degree only — friend-of-friend networks are never searched | M | Transitive sharing test returns no third-party people |

### FR-H — Data controls & privacy
| ID | Requirement | Pri | Acceptance criterion |
|---|---|---|---|
| FR-H1 | Privacy page shows exactly what is stored per source | M | Page lists: contacts, email metadata (addresses+timestamps), calendar attendee records, embeddings |
| FR-H2 | One-click purge (FR-B7) + revoke Google access instructions | M | Purge completes < 60 s for 50k people |
| FR-H3 | Raw email bodies and subjects are never fetched or stored | M | Code audit + DB audit: no such columns |

---

## 4. Non-Functional Requirements

| ID | Category | Requirement (measurable) |
|---|---|---|
| NFR-1 | Search latency | p50 ≤ 5 s, p95 ≤ 10 s with LLM; degraded mode ≤ 1.5 s; ANN stage ≤ 100 ms p99 |
| NFR-2 | Sync throughput | 50k-person initial sync completes < 2 h wall clock; each chunk < 240 s |
| NFR-3 | Scale headroom | 10 users × 50k people (≤1M embeddings pooled) without schema change; 100× growth requires config only (see HLD §9) |
| NFR-4 | Availability | Single region, best effort (portfolio); no SLO beyond "works when demoing" |
| NFR-5 | Consistency | Eventual everywhere; stale ≤ 24 h acceptable; search may miss data synced moments ago |
| NFR-6 | Read:write | ~99:1; single Postgres node sized by the BOTEC in HLD §4; no cache tier at v1 scale |
| NFR-7 | LLM budget | ≤ 2 LLM calls per search (decompose + rerank); ≤ 5 sub-searches; decomposition cached |
| NFR-8 | Privacy | Metadata only (C3); tokens encrypted at rest; user data never used for model training; per-user isolation on every query (owner key) |
| NFR-9 | Security | OAuth read-only scopes (§5.2); secrets from env only; encrypted token store; no secrets in client bundles |
| NFR-10 | Observability | Structured logs with request_id; latency breakdown per search stage; sync chunk metrics; LLM usage counters |
| NFR-11 | Maintainability | Domain logic unit-testable without I/O; LLM and embedding providers behind interfaces; one env var to swap models |
| NFR-12 | Usability | Search UX streams ≥2 progress states; skeleton loaders; empty/error states on every screen |

---

## 5. External Interfaces

### 5.1 User interfaces
Screens: (1) Onboarding/consent, (2) Sync status, (3) Search (query bar, streamed result table, result drawer), (4) Network graph, (5) Friends & groups, (6) Privacy/data controls, (7) Search history sidebar. Visual language, materials, motion and the accessibility floor are specified in [`ui.md`](./ui.md) (Apple-style design system — binding for implementation).

### 5.2 Software interfaces
| Interface | Usage | Scope/limits |
|---|---|---|
| Google OAuth 2.0 | Sign-in + API authorization | `openid email profile`, `contacts.readonly`, `gmail.metadata`, `calendar.events.readonly`; offline access |
| People API | Contacts import + incremental `syncToken` | `people.connections.list`, pageSize ≤ 200/page (API max), `personFields` minimal set |
| Gmail API | Header metadata for relationship signals | `messages.list` (q-bound, ≤500/page) + `messages.batchGet` (≤25 ids, `format=METADATA`); `history.list` deltas by `historyId` |
| Calendar API | Meeting attendee signals | `events.list`, `timeMin = now−24mo`, `singleEvents=true` |
| OpenRouter | Chat completions (decompose, rerank, drafts) | OpenAI-compatible; model + fallback via env; free-tier limits per C2 |
| Neon Postgres | All server state | Pooled connection string (`-pooler`); pgvector halfvec + HNSW |
| Vercel | Hosting + cron | Node runtime; cron: nightly sync sweep + stuck-job sweep every 10 min |

### 5.3 Communication
HTTPS only; search uses Server-Sent Events (one-way progress + results); everything else request/response JSON.

---

## 6. Acceptance Scenarios (golden paths)

1. **First run:** sign in → connect all sources → sync completes with visible progress → search "most promising AI founders in my network" → ≥5 ranked cards, each with rationale and mutual chips; p50 ≤ 5 s warm.
2. **Warm intro:** open a card → warm path shows a named mutual → "Draft intro" produces an editable, send-safe message → copy works.
3. **Graph:** open graph → constellation renders → click a person → drawer + (if from search) path highlight.
4. **Resilience:** disable OpenRouter key → search returns vector-ranked cards labeled degraded (FR-D7).
5. **Privacy:** run purge → SQL audit across all tables returns 0 rows for the user.

---

## 7. Out of Scope
LinkedIn/X/Instagram/Outlook/Apple connectors · native mobile · public API/MCP/CLI · real email sending · billing/teams/SOC 2 · >2nd-degree reach · real-time (push) sync · email body/subject storage · moderation/admin/analytics dashboards · public profile pages.

## 8. Risks & Mitigations
| Risk | Impact | Mitigation |
|---|---|---|
| Gmail initial scan volume larger than expected | Sync takes hours | Bound with `newer_than:3y` + inbox/sent query; chunked resume keeps it moving |
| Free OpenRouter models weak at ranking | Result quality | Degraded mode keeps app useful; models swappable via env (NFR-11) |
| pgvector filtered-ANN recall | Missed results | Per-owner `UNION ALL` subqueries (LLD §6.3); oversample + LLM rerank |
| Google OAuth review friction | Demo blocked on scopes | "Testing" mode supports ≤100 users (C4); personal use unaffected |
| Transformers.js cold start | First search slow | Warmup ping after deploy; sub-second after warm |

## 9. Traceability (summary)
FR-D/E → HLD §6 (search/warm-path flows) → LLD §6, §8, §9 · FR-B/C → HLD §5 (sync) → LLD §5–§7 · FR-G → HLD §6.4 → LLD §10 · NFR-8/9 → HLD §10 (security) → LLD §12.
