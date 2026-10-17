# Implementation Plan: Onboarding UI, Google Sync Driver, LinkedIn + X Imports (Phase 5)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the account-connection and data-ingestion interface: an `/onboarding` page where users drive Google sync, upload a LinkedIn `connections.csv` and their X archive, and watch real-time indexing progress until their network is searchable.

**Architecture:** Imports are **staged, not processed inline**. Upload endpoints parse files into an `import_rows` staging table and create `sync_jobs`; the **existing** chunk engine (`processNextChunk`) gains two import cases, so dedup, strength, embeddings, progress, resume, and the sweep cron all reuse the machinery phases 1–3 shipped. The client chunk loop that the Google sync card uses drives imports identically.

**Tech Stack:** Next.js 16 App Router · React 19 · Zod v4 · Drizzle/Neon · `fflate` (new, ~30 KB, zero-dep zip reader for the X archive) · design tokens in `globals.css`.

**Spec basis:** approved Approach A design (imports as sync sources) · `srs.md` FR-B/FR-H · `lld.md` §5 · `ui.md` §6–§7.

## User Review Required

> [!IMPORTANT]
> - **Google OAuth flow**: `/api/auth/callback` already redirects to `/onboarding` after consent (`src/app/api/auth/callback/route.ts:124`) — but that page does not exist yet. This plan creates it. **Google sync itself (engine, scoring, chunks) already works** — this plan only adds its driver UI.
> - **LinkedIn has no connections API.** The industry-standard path (Clay, Folk, Happenstance) is the user's official export: **Settings → Data privacy → Get a copy of your data → Connections**. Columns: `First Name,Last Name,URL,Email Address,Company,Position,Connected On`. Emails appear only when the contact shared them.
> - **X (Twitter) has no viable free read API.** The zero-cost path is the official archive: **Settings → Your account → Download an archive** → a ZIP whose `data/following.js` / `followers.js` contain JSON arrays behind a JS wrapper (`window.YTD.following.part0 = [...];`). Parsing handles the `.js` wrapper (primary) with an HTML-list fallback.
> - **X import is in scope** (user decision 2026-09-20: "LinkedIn + X file import"). The draft plan this replaces dropped it.

## Proposed Changes

### Domain Logic & Importers

#### [NEW] src/lib/import/parse-csv.ts
- Pure RFC-4180 subset CSV parser: quoted fields (`"Google, Inc."`), escaped quotes (`""`→`"`), CRLF/LF, BOM strip. No dependencies.

#### [NEW] src/lib/import/linkedin.ts
- **Pure mapper** `mapLinkedInRows(csvText) → { rows: LinkedInPersonRow[]; skipped: number }`:
  - Strips LinkedIn's preamble notes (everything before the `First Name,Last Name,…` header line).
  - Joins `First Name + Last Name → displayName` (missing-name rows skipped and counted).
  - Normalizes `primaryEmail`, `company`, `title`, `companyDomain` (via `extractDomain`), `connectedOn` (ISO from `Connected On`).
  - Builds `dedupKey` via existing `buildDedupKey(email, displayName, companyDomain)` — canonical email when present (so rows **enrich existing Google contacts** via the COALESCE upsert), else `n:name@domain`.
- **IO stager** `stageLinkedInImport(userId, csvText) → { jobId, staged, skipped }`:
  - Parses, caps input at 10 MB / 50,000 rows, inserts `import_rows` (payload = mapped fields only — the raw file is **never persisted**), creates `sync_job(source: "linkedin_import", cursor: { rowIndex: 0 })`.

#### [NEW] src/lib/import/xarchive.ts
- Pure parser `parseXArchive(files: { name, text }[]) → { rows: XPersonRow[]; skipped: number }`:
  - Finds `following.js`/`followers.js` (also nested `data/` paths); strips the `window.YTD.<key>.partN = ` wrapper, `JSON.parse`es the remainder; extracts `following[].following.accountId/username` (and the `follower` shape).
  - HTML fallback for older archives: `href="/<handle>"` extraction from `following.html`/`followers.html`.
  - Each row → `{ displayName: "@handle", dedupKey: "x:<handle>" }` — **X rows never merge** with email-based people (namespaced key by design; `buildDedupKey` must not be used here, it would produce mergeable `n:` keys).

#### [NEW] tests/imports.test.ts (+ tests/fixtures/)
- Parser suites: LinkedIn preamble strip · quoted commas/quotes · BOM/CRLF · missing email/missing name (skipped count) · X `.js` wrapper strip + JSON extract · HTML fallback · namespaced dedup keys · scoring baselines (below).
- Fixtures committed: `tests/fixtures/connections.csv` (synthetic, 6 rows incl. quoted fields + 1 preamble), `tests/fixtures/following.js` (synthetic 4-row wrapper).

### Scoring & Engine Integration (the parts the draft plan missed)

#### [MODIFY] src/lib/sync/scoring.ts
- `SignalPayload` gains `connectedOn: string | null` (LinkedIn "Connected On").
- `explainScore`/`computeStrength` gain an **import score that replaces the generic source bonus** (no double counting):
  ```
  importScore =
    sourcesPresent includes "linkedin_import" ? 30 + 20 * recencyDecay(connectedOn)   // 30–50 band
  : sourcesPresent includes "x_import"        ? 15                                    // a follow is the weakest signal
  :                                              0                                     // Google behavior unchanged
  rawSum = emailScore + meetingScore + importScore + directnessBonus   // sourceScore only when importScore = 0
  ```
  **Why this is required, not cosmetic:** the engine recomputes strengths from `signals` after *every* chunk (`engine.ts:160-162, 206-236`). Without it, a staged `strength: 42` is overwritten to ~10 on the next recompute — silently erasing the import baseline.
- **Performance fix:** `recomputeStrengths(userId)` in `src/lib/sync/engine.ts` loops *all* contact edges per chunk — with a 10k-row import that is O(chunks × all-edges). Add optional `touchedPersonIds?: string[]` param filtering with `inArray` (when provided); import chunks pass their staged ids. Google path unchanged (passes nothing).

#### [MODIFY] src/lib/sync/engine.ts
- `processNextChunk` switch gains:
  - `case "linkedin_import"` / `case "x_import"` → shared `processImportChunk(userId, source)`:
    claims next ≤500 `import_rows` (`WHERE jobId AND processed = false ORDER BY idx`), `upsertPerson` → `upsertContactEdge` (baseline strength via signals, `sourcesPresent`) → `embeddingQueue` insert → mark rows processed → **drain embedding queue (96)** → recompute strengths for touched ids only.
  - **Done gate:** the import job reports `done` only when no unprocessed rows remain **AND** the user's `embedding_queue` is empty. *Why:* the default drain is 64/chunk while a chunk stages 500 rows — job "done" would otherwise fire with thousands of un-embedded (unsearchable) people.
- `drainEmbeddingQueue(userId, limit)` becomes exported (reused by import case).

#### [MODIFY] src/lib/db/repo/people.ts
- Extend `upsertPerson`'s `onConflictDoUpdate` to **merge `sourceRefs`** (`source_refs = source_refs || EXCLUDED.source_refs` with distinct) so a LinkedIn row enriching an existing Google contact keeps both provenances, and passes `connectedOn`-carrying `headline` fills through the existing COALESCE pattern.

### Schema & Migration

#### [MODIFY] src/lib/db/schema.ts
- `sources.type` union widens: `["contacts","gmail","calendar","linkedin_import","x_import"]` (TS-level enum; the column is TEXT — no SQL constraint change).
- **[NEW] table `import_rows`**: `jobId uuid → sync_jobs ON DELETE CASCADE`, `idx integer`, `payload jsonb`, `processed boolean default false`, PK `(jobId, idx)`; index `(jobId, processed, idx)`.

#### [NEW] drizzle migration (via `npx drizzle-kit generate`) + `npm run db:migrate`

### API Routes

#### [NEW] src/app/api/import/linkedin/route.ts
- `POST`, auth-gated, accepts `multipart/form-data` (`file`) or raw `text/csv` body; 10 MB cap.
- Calls `stageLinkedInImport`; returns `{ success: true, jobId, staged, skipped }` — **no upserts/embeddings in-request** (a 10k-row sync would blow the ~300 s function cap; the client chunk loop they already use for Google drives it instead).

#### [NEW] src/app/api/import/x/route.ts
- `POST`, accepts the archive `.zip` (unzips in-memory with `fflate`), stages via the same mechanism, returns `{ success: true, jobId, staged, skipped }`.

### UI Components & Pages

#### [NEW] src/components/onboarding/google-sync-card.tsx
- Status pills for Contacts / Gmail / Calendar (from `GET /api/sync/chunk` status — `jobs`, `sources`, `totalPeople`).
- "Start Sync" → `POST /api/sync/start` → `{ jobIds }`; then the documented client loop: repeated `POST /api/sync/chunk` until the response carries `allComplete: true` (verified contract: `{done, allComplete, processed, source, jobId, ...status}` / `{done: true, allComplete: true, ...status}`).
- **Live mono telemetry log** (ui.md machine-voice): per tick, `SYNC contacts +214 · embeddings 64 · total 12,431` lines, capped to last 8.

#### [NEW] src/components/onboarding/linkedin-upload-card.tsx
- Drag-and-drop `.csv`; how-to-export caption (the IMPORTANT steps above); drag-over state; upload progress; on success → swaps to the same progress pill/loop as Google sync (jobId from response); done summary: `IMPORTED n · SKIPPED m · EMBEDDED ✓`.
- Mono privacy caption: *"Parsed in-memory. Names, titles, companies only — your file is never stored."*

#### [NEW] src/components/onboarding/x-upload-card.tsx
- Same pattern for the archive `.zip`; how-to-export caption; success/failure of archive detection surfaced explicitly ("No following/followers data found in this archive").

#### [NEW] src/app/onboarding/page.tsx
- Server shell: auth-gated (Google sign-in fallback card when no session).
- Card flow: **1. Google Sync → 2. LinkedIn Import → 3. X Import → 4. Ready state** (`totalPeople` + `EMBEDDED n/n` from status; prominent **"Launch Search →"** to `/search`). Cards materialize per `ui.md`; responsive + a11y floor (44px targets, Esc/close paths, reduced motion honored).

#### [MODIFY] src/app/page.tsx & src/app/search/page.tsx
- Nav gains **"Sources" → `/onboarding`** so users can re-sync or re-import at any time.

---

## Task Breakdown (TDD where pure; commit per task)

### Task 1: Schema + migration
**Files:** Modify `src/lib/db/schema.ts`; generate migration; test: `npm run db:migrate` against Neon.
Steps: widen `sources.type` union → add `importRows` table → `npx drizzle-kit generate` → review SQL → `npm run db:migrate` → `npx tsc --noEmit` → commit `feat: import staging table and source kinds`.

### Task 2: CSV parser + LinkedIn mapper (pure, TDD)
**Files:** Create `src/lib/import/parse-csv.ts`, `src/lib/import/linkedin.ts` (mapper only), `tests/imports.test.ts`, `tests/fixtures/connections.csv`.
Steps: failing tests (preamble strip · quoted comma/quote · BOM/CRLF · missing-email key path · missing-name skipped count · fixture end-to-end map) → implement `parse-csv.ts` + `mapLinkedInRows` → `npm run test:imports` green (add script: same tsc pattern as `test:phase3`) → commit `feat: linkedin csv parser and mapper`.

### Task 3: X archive parser + scoring extension (pure, TDD)
**Files:** Create `src/lib/import/xarchive.ts`, `tests/fixtures/following.js`; Modify `src/lib/sync/scoring.ts`.
Steps: failing tests (`.js` wrapper strip → JSON → rows; HTML fallback; `x:` key; `importScore` bands: LinkedIn recent ≈ 48–50 / old ≈ 32; X = 15; Google-only signals unchanged) → implement parser + scoring changes (+ `connectedOn` passthrough in `recomputeStrengths`) → tests green → commit `feat: x archive parser and import scoring`.

### Task 4: Engine integration + import routes
**Files:** Modify `src/lib/sync/engine.ts`, `src/lib/db/repo/people.ts`; Create `src/app/api/import/linkedin/route.ts`, `src/app/api/import/x/route.ts`; add `fflate`.
Steps: `processImportChunk` + switch cases + done-gate + `recomputeStrengths(touchedIds)` + `sourceRefs` merge → routes (zod/auth/caps) → `npx tsc --noEmit && npx next build` → commit `feat: staged import pipeline and routes`.

### Task 5: Onboarding UI
**Files:** Create page + 4 components; Modify nav in landing + search pages.
Steps: **first read the relevant Next 16 guides under `node_modules/next/dist/docs/` (AGENTS.md requirement — breaking changes vs training data)** → build cards against verified endpoints → responsive/a11y pass → `npx next build` → Playwright screenshots at 390/820/1440 → commit `feat: onboarding page with sync and import cards`.

### Task 6: Verification
Steps: `npm test` (all suites) + `npx next build` → manual checklist:
1. Sign in → redirected to `/onboarding` → Start Sync → telemetry ticks → `allComplete`.
2. Upload `tests/fixtures/connections.csv` → progress loop → done summary counts match.
3. Upload X archive fixture-zip → same.
4. `/search`: "Software engineers at Stripe" returns LinkedIn-enriched people with titles; strength bands correct (LinkedIn ≤ 50, X = 15).
5. Re-upload same CSV → no duplicates (`count` unchanged) → purge still clears everything.

---

## Verification Plan (unchanged in spirit, tightened)

```powershell
npm run test:imports          # new suite
npm test                      # all suites (chain updated to include imports)
cmd.exe /c "npx tsc --noEmit"
cmd.exe /c "npx next build"
node scripts/e2e-imports.mjs  # onboarding screenshots, 3 viewports
```

**New dependency:** `fflate` (runtime, for the X archive ZIP only). Everything else uses what's installed.
