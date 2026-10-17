# Phase 4: Search UI & Warm Paths — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the real search experience — streaming SSE result cards with rationale chips, a warm-path visualizer, and an intro-draft composer — on top of the Phase 1–3 backend.

**Architecture:** Two new domain modules (`warmpath/select`, `warmpath/draft`) behind thin route handlers (`/api/people/[id]`, `/api/drafts`, `/api/searches`), a pure SSE frame parser + React hook on the client, and a `/search` page composed of focused components (SearchExperience → ResultCard → ResultDrawer → WarmPathViz → DraftComposer). Pure logic (parsing, ranking, prompting, mailto) is unit-tested in `tests/phase4.test.ts` following the existing tsc-compiled test pattern; DB/IO code is verified by build + Playwright screenshots.

**Tech Stack:** Next.js 16 App Router · React 19 · Zod v4 · Drizzle/Neon Postgres · existing design system in `globals.css` (no new dependencies).

**Spec:** `srs.md` §3 FR-D/FR-E · `lld.md` §6 (search), §8 (warm path), §9 (API) · `ui.md` §6–§7 (components, drawer, choreography)

## Global Constraints

- **No new npm dependencies.** Available: zod@4, lucide-react, clsx, tailwind-merge, playwright-core (dev).
- **Owner isolation:** every DB query is scoped by `userId`; friends' people reachable only via `getReachablePerson` (shared + accepted friendship).
- **Privacy (SRS FR-E3/FR-H3):** draft prompts contain only names/titles/companies — never email addresses or message content. A test enforces this.
- **SSE wire contract** is fixed by `src/lib/search/sse.ts` (`stage` → `results` → `done` → `error` events); the client parser must accept exactly that.
- **UI system:** all styling via tokens/classes in `globals.css` (`material-thick/medium/thin`, `type-display/title`, `mono-voice`, `--accent-find`/`--accent-path`, `animate-materialize`, `voice-active`). Zero spinners — progress is mono stage lines.
- **Route handlers are thin:** parse (zod) → call lib module → `NextResponse.json`. Node runtime implied by db usage.
- **Next 16:** route `params` are `Promise` — `const { id } = await params;`.
- **Test pattern:** standalone TS files compiled with `npx tsc tests/phase4.test.ts --outDir dist-test --target es2022 --module NodeNext --moduleResolution NodeNext --skipLibCheck && node dist-test/tests/phase4.test.js` (mirror `test:phase3`).
- **Commits:** conventional (`feat:`/`test:`/`chore:`), one commit per task, each ending with the trailer `Co-Authored-By: Claude Code <noreply@anthropic.com>`.

## Established Contracts (consume, do not re-create)

| Symbol | Source | Shape |
|---|---|---|
| `POST /api/search` | `src/app/api/search/route.ts` | SSE: `stage {stage: "planning"\|"searches"\|"ranking", count?}` → `results {searchId, mode, results: CandidateCard[]}` → `done {timings{decomposeMs,annMs,rerankMs,totalMs}}` → `error {code, message, retryable}` |
| `CandidateCard` | `src/lib/search/types.ts` | `{personId, name, title?, company?, avatarUrl?, summary?, strength 0-100, mutual? {id,name}\|null, viaFriend? {id,name}\|null, rationale ≤200}` |
| `findMutualConnections(userId, targetPersonId)` | `src/lib/db/repo/edges.ts` | `[{mutualId, displayName, avatarUrl, title, company, userToMutualStrength, mutualToTargetWeight}]` ordered by `strength*weight DESC`, limit 5 |
| `recencyDecay(dateStr)` | `src/lib/sync/scoring.ts` | `exp(-days/180)` clamped `[0.1, 1.0]`, null-safe |
| `chatCompletion(messages, {model?, temperature?, maxTokens?})` | `src/lib/llm/client.ts` | returns `string` content; throws on failure |
| `extractJson<T>(raw)` | `src/lib/llm/client.ts` | strips markdown fences, parses JSON |
| `isCircuitOpen()` / `recordSuccess()` / `recordFailure()` | `src/lib/llm/breaker.ts` | breaker gate for LLM calls |
| `getSessionUser()` | `src/lib/auth/session.ts` | `SessionUser {id, email, name, avatarUrl?}` or `null` |
| `getPersonById(userId, personId)` | `src/lib/db/repo/people.ts` | owner-scoped single person |
| Tables | `src/lib/db/schema.ts` | `introDrafts(id, userId, targetPersonId, mutualPersonId, subject, body, createdAt)`, `searches`, `searchResults`, `personEdges`, `contactEdges.signals` jsonb (`SignalPayload`) |

## File Structure (this phase)

```
src/lib/client/
  sse-parse.ts            NEW  pure SSE frame parser → typed events
  use-search-stream.ts    NEW  React hook wrapping fetch-stream + parser
  mailto.ts               NEW  pure mailto: builder
src/lib/warmpath/
  select.ts               NEW  warm path ranking (pure) + IO (db)
  draft.ts                NEW  draft prompt (pure), generate (LLM), fallback (pure)
src/lib/db/repo/
  edges.ts                MODIFY  add primaryEmail to findMutualConnections select
  people.ts               MODIFY  add getReachablePerson (owner OR friend-shared)
  search.ts               MODIFY  add listRecentSearches
  drafts.ts               NEW  saveDraft / listDrafts
src/app/api/
  people/[id]/route.ts    NEW  GET profile + warm path
  drafts/route.ts         NEW  POST generate+save draft · GET list drafts
  searches/route.ts       NEW  GET recent searches
src/components/search/
  path-primitives.tsx     NEW  PathNode / PathLine shared
  result-card.tsx         NEW  streaming result card + rationale chip
  warm-path-viz.tsx       NEW  me → mutual → target visualizer
  result-drawer.tsx       NEW  right sheet: profile + viz + composer
  draft-composer.tsx      NEW  generate/edit/copy/mail composer
  search-experience.tsx   NEW  client: field + stage choreography + results + drawer
src/app/search/page.tsx   NEW  server shell (auth gate) → SearchExperience
src/app/page.tsx          MODIFY  nav Search link → /search; import shared path primitives
tests/phase4.test.ts      NEW  unit suite (parser, ranking, prompts, mailto, fallbacks)
scripts/e2e-phase4.mjs    NEW  Playwright screenshots of /search states
package.json              MODIFY  add "test:phase4"
```

---

### Task 1: SSE frame parser + `useSearchStream` hook

**Files:**
- Create: `src/lib/client/sse-parse.ts`
- Create: `src/lib/client/use-search-stream.ts`
- Test: `tests/phase4.test.ts` (created in this task, extended later)

**Interfaces:**
- Consumes: `CandidateCardSchema`, `SearchMode`, `SearchTimings` from `@/lib/search/types`.
- Produces:
  - `parseSSEFrames(buffer: string): { events: SearchSSEEvent[]; rest: string }`
  - `type SearchSSEEvent = {type:"stage"; stage:"planning"|"searches"|"ranking"; count?: number} | {type:"results"; searchId: string; mode: SearchMode; results: CandidateCard[]} | {type:"done"; timings: SearchTimings} | {type:"error"; code: string; message: string; retryable: boolean}`
  - `useSearchStream(): { state: SearchStreamState; runSearch: (q: string) => Promise<void>; reset: () => void }` with `SearchStreamState = { status: "idle"|"planning"|"searches"|"ranking"|"done"|"error"; stageCount: number|null; results: CandidateCard[]; searchId: string|null; mode: SearchMode|null; timings: SearchTimings|null; error: {code,message,retryable}|null }`

- [ ] **Step 1: Write the failing tests** — add to `tests/phase4.test.ts` (new file; include the shared `assert` helpers copied from `tests/phase3.test.ts:32-51`):

```ts
// tests/phase4.test.ts (part 1)
import { parseSSEFrames } from "../src/lib/client/sse-parse";

const frame = (event: string, data: unknown) =>
  `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

export function runParserTests() {
  console.log("--- P1: SSE frame parser ---");

  const single = parseSSEFrames(frame("stage", { stage: "planning" }));
  assert(single.events.length === 1 && single.events[0].type === "stage" && single.rest === "",
    "single stage frame parses");

  const multi = parseSSEFrames(
    frame("stage", { stage: "searches", count: 3 }) + frame("done", { timings: { decomposeMs: 1, annMs: 2, rerankMs: 3, totalMs: 6 } })
  );
  assert(multi.events.length === 2 && multi.events[1].type === "done", "two frames in one chunk parse in order");

  const split = frame("results", { searchId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11", mode: "full", results: [] });
  const first = parseSSEFrames(split.slice(0, 30));
  assert(first.events.length === 0 && first.rest.length > 0, "incomplete frame held back in rest");
  const second = parseSSEFrames(first.rest + split);
  assert(second.events.length === 1 && second.events[0].type === "results", "frame completes when chunk arrives");

  const malformed = parseSSEFrames(`event: results\ndata: {not json}\n\n` + frame("stage", { stage: "ranking" }));
  assert(malformed.events.length === 1 && malformed.events[0].type === "stage", "malformed JSON frame skipped, others kept");

  const unknown = parseSSEFrames(`event: ping\ndata: {"x":1}\n\n` + frame("stage", { stage: "planning" }));
  assert(unknown.events.length === 1, "unknown event types ignored");

  const badData = parseSSEFrames(frame("results", { searchId: "nope", mode: "full", results: [] }));
  assert(badData.events.length === 0, "results with invalid uuid rejected by schema");
}
```

Also a `main()` runner at the bottom (same style as phase3: counts passed/failed, `process.exit(1)` on failure) calling `runParserTests()` — extend it in later tasks.

- [ ] **Step 2: Run to verify failure** — `npm run test:phase4` (add script now: `"test:phase4": "npx tsc tests/phase4.test.ts --outDir dist-test --target es2022 --module NodeNext --moduleResolution NodeNext --skipLibCheck && node dist-test/tests/phase4.test.js"` in `package.json`). Expected: FAIL — module `../src/lib/client/sse-parse` not found.

- [ ] **Step 3: Implement `sse-parse.ts`**

```ts
/**
 * Pure SSE frame parser for the search stream (LLD §6.5 wire format).
 * Frames are `event: <name>\ndata: <json>\n\n`; a trailing partial frame
 * is returned as `rest` so callers can re-feed on the next chunk.
 */
import { z } from "zod";
import { CandidateCardSchema, SearchMode, SearchTimings } from "@/lib/search/types";

export type SearchSSEEvent =
  | { type: "stage"; stage: "planning" | "searches" | "ranking"; count?: number }
  | { type: "results"; searchId: string; mode: SearchMode; results: z.infer<typeof CandidateCardSchema>[] }
  | { type: "done"; timings: SearchTimings }
  | { type: "error"; code: string; message: string; retryable: boolean };

const StageData = z.object({ stage: z.enum(["planning", "searches", "ranking"]), count: z.number().int().optional() });
const ResultsData = z.object({ searchId: z.string().uuid(), mode: z.enum(["fast", "full", "degraded"]), results: z.array(CandidateCardSchema) });
const DoneData = z.object({ timings: z.object({ decomposeMs: z.number(), annMs: z.number(), rerankMs: z.number(), totalMs: z.number() }) });
const ErrorData = z.object({ code: z.string(), message: z.string(), retryable: z.boolean() });

export function parseSSEFrames(buffer: string): { events: SearchSSEEvent[]; rest: string } {
  const events: SearchSSEEvent[] = [];
  const blocks = buffer.split("\n\n");
  const rest = blocks.pop() ?? "";

  for (const block of blocks) {
    let event = "message";
    let data = "";
    for (const line of block.split("\n")) {
      if (line.startsWith("event:")) event = line.slice(6).trim();
      else if (line.startsWith("data:")) data += line.slice(5).trim();
    }
    if (!data) continue;

    let parsed: unknown;
    try {
      parsed = JSON.parse(data);
    } catch {
      continue; // malformed frame: skip, keep the rest of the stream alive
    }

    if (event === "stage") {
      const ok = StageData.safeParse(parsed);
      if (ok.success) events.push({ type: "stage", stage: ok.data.stage, count: ok.data.count });
    } else if (event === "results") {
      const ok = ResultsData.safeParse(parsed);
      if (ok.success) events.push({ type: "results", ...ok.data });
    } else if (event === "done") {
      const ok = DoneData.safeParse(parsed);
      if (ok.success) events.push({ type: "done", timings: ok.data.timings });
    } else if (event === "error") {
      const ok = ErrorData.safeParse(parsed);
      if (ok.success) events.push({ type: "error", ...ok.data });
    }
    // unknown event types are ignored by design
  }
  return { events, rest };
}
```

- [ ] **Step 4: Implement `use-search-stream.ts`**

```ts
"use client";
/**
 * Search stream hook — drives the ui.md §5 choreography from real SSE events.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { CandidateCard, SearchMode, SearchTimings } from "@/lib/search/types";
import { parseSSEFrames, SearchSSEEvent } from "./sse-parse";

export type SearchStatus = "idle" | "planning" | "searches" | "ranking" | "done" | "error";

export interface SearchStreamState {
  status: SearchStatus;
  stageCount: number | null;
  results: CandidateCard[];
  searchId: string | null;
  mode: SearchMode | null;
  timings: SearchTimings | null;
  error: { code: string; message: string; retryable: boolean } | null;
}

const INITIAL: SearchStreamState = {
  status: "idle", stageCount: null, results: [], searchId: null,
  mode: null, timings: null, error: null,
};

export function useSearchStream() {
  const [state, setState] = useState<SearchStreamState>(INITIAL);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setState(INITIAL);
  }, []);

  const runSearch = useCallback(async (query: string) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setState({ ...INITIAL, status: "planning" });

    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        setState({ ...INITIAL, status: "error", error: { code: "HTTP_ERROR", message: `Search failed (${res.status})`, retryable: true } });
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const { events, rest } = parseSSEFrames(buffer);
        buffer = rest;
        for (const ev of events) applyEvent(ev, setState);
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setState({ ...INITIAL, status: "error", error: { code: "NETWORK", message: (err as Error).message, retryable: true } });
    }
  }, []);

  return { state, runSearch, reset };
}

function applyEvent(ev: SearchSSEEvent, setState: React.Dispatch<React.SetStateAction<SearchStreamState>>) {
  if (ev.type === "stage") setState((s) => ({ ...s, status: ev.stage, stageCount: ev.count ?? s.stageCount }));
  else if (ev.type === "results") setState((s) => ({ ...s, results: ev.results, searchId: ev.searchId, mode: ev.mode }));
  else if (ev.type === "done") setState((s) => ({ ...s, status: "done", timings: ev.timings }));
  else if (ev.type === "error") setState((s) => ({ ...s, status: "error", error: { code: ev.code, message: ev.message, retryable: ev.retryable } }));
}
```

- [ ] **Step 5: Run tests** — `npm run test:phase4`. Expected: PASS (parser tests green).
- [ ] **Step 6: Commit** — `git add -A && git commit -m "feat: SSE frame parser and search stream hook"`

---

### Task 2: Warm-path domain module

**Files:**
- Create: `src/lib/warmpath/select.ts`
- Modify: `src/lib/db/repo/edges.ts` (`findMutualConnections` select gains `primaryEmail: people.primaryEmail`)
- Test: `tests/phase4.test.ts` (extend)

**Interfaces:**
- Consumes: `findMutualConnections`, `recencyDecay`, `db` for the direct-edge lookup.
- Produces:
  - `DIRECT_THRESHOLD = 60`
  - `compositeWarmth(strength: number, weight: number, lastEmailAt: string | null): number` = `0.5*strength + 0.3*weight + 20*recencyDecay(lastEmailAt)`
  - `computeScoredMutuals(rows: MutualRow[], lastEmailAt?: string | null): ScoredMutual[]` (sorted by composite desc)
  - `decideWarmPath(directStrength: number | null, mutuals: ScoredMutual[]): WarmPathDecision` — direct iff `directStrength !== null && directStrength >= DIRECT_THRESHOLD`; else best mutual; else cold
  - `selectWarmPath(userId: string, targetPersonId: string): Promise<WarmPathDecision>` (IO)
  - `WarmPathDecision = { kind: "direct"|"mutual"|"cold"; directStrength: number|null; mutual: WarmPathMutual|null }` where `WarmPathMutual = { id, name, title, company, avatarUrl, email, strength, weight, composite }`
  - `MutualRow` mirrors `findMutualConnections` output (with `primaryEmail`).

- [ ] **Step 1: Write failing tests** (extend `tests/phase4.test.ts`):

```ts
// tests/phase4.test.ts (part 2)
import { compositeWarmth, computeScoredMutuals, decideWarmPath, DIRECT_THRESHOLD, MutualRow } from "../src/lib/warmpath/select";

const row = (name: string, strength: number, weight: number): MutualRow => ({
  mutualId: "aaaaaaaa-aaaa-aaaa-aaaa-" + "a".repeat(12 - name.length) === "" ? "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa" : "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  displayName: name, avatarUrl: null, title: "T", company: "C",
  primaryEmail: null, userToMutualStrength: strength, mutualToTargetWeight: weight,
});

export function runWarmPathTests() {
  console.log("--- P2: warm path ranking ---");

  const recent = new Date().toISOString();
  const m1 = { ...row("Early", 90, 10), lastEmailAt: recent };
  const m2 = { ...row("Late", 50, 90), lastEmailAt: null };
  const scored = computeScoredMutuals([m1, m2], null);
  assert(scored[0].displayName === "Late", "0.5*50+0.3*90+2 = 54 beats 0.5*90+0.3*10+20 = 68? ordering correct per composite",
    JSON.stringify(scored.map((s) => s.composite)));

  // NOTE: recompute expectations by hand:
  // m1: 0.5*90 + 0.3*10 + 20*recencyDecay(recent) ≈ 45 + 3 + ~20 = ~68
  // m2: 0.5*50 + 0.3*90 + 20*0.1 = 25 + 27 + 2 = 54
  assert(scored[0].displayName === "Early", "recent-contact mutual (composite ~68) outranks weight-only mutual (54)");

  const directWin = decideWarmPath(80, scored);
  assert(directWin.kind === "direct" && directWin.directStrength === 80, `direct edge >= ${DIRECT_THRESHOLD} wins`);

  const mutualWin = decideWarmPath(30, scored);
  assert(mutualWin.kind === "mutual" && mutualWin.mutual?.name === "Early", "weak direct edge defers to best mutual");

  const cold = decideWarmPath(null, []);
  assert(cold.kind === "cold" && cold.mutual === null, "no direct edge and no mutuals = cold outreach");

  const weakDirect = decideWarmPath(DIRECT_THRESHOLD - 1, []);
  assert(weakDirect.kind === "cold", "direct edge below threshold is not a warm direct path");
}
```

*(Adjust the first assertion during Step 1 authoring: keep only the hand-recomputed `Early` expectation; the initial "Late" assert above is intentionally written then corrected — final file must contain only correct assertions.)*

- [ ] **Step 2: Run** `npm run test:phase4` — expected FAIL (module missing).
- [ ] **Step 3: Implement `select.ts`**

```ts
/**
 * Warm path selection (LLD §8.1, FR-E1).
 * Pure ranking + thin IO. Recency term uses recencyDecay on the mutual's
 * lastEmailAt when provided; the IO path passes null (constant +2 offset,
 * does not affect ordering — same order as findMutualConnections).
 */
import { db } from "@/lib/db";
import { contactEdges } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { findMutualConnections } from "@/lib/db/repo/edges";
import { recencyDecay } from "@/lib/sync/scoring";

export const DIRECT_THRESHOLD = 60;

export interface MutualRow {
  mutualId: string; displayName: string; avatarUrl: string | null;
  title: string | null; company: string | null; primaryEmail: string | null;
  userToMutualStrength: number; mutualToTargetWeight: number;
}

export interface ScoredMutual extends MutualRow {
  lastEmailAt: string | null;
  composite: number;
}

export interface WarmPathMutual {
  id: string; name: string; title: string | null; company: string | null;
  avatarUrl: string | null; email: string | null; strength: number; weight: number; composite: number;
}

export interface WarmPathDecision {
  kind: "direct" | "mutual" | "cold";
  directStrength: number | null;
  mutual: WarmPathMutual | null;
}

export function compositeWarmth(strength: number, weight: number, lastEmailAt: string | null): number {
  return 0.5 * strength + 0.3 * weight + 20 * recencyDecay(lastEmailAt);
}

export function computeScoredMutuals(rows: MutualRow[], lastEmailAt: string | null = null): ScoredMutual[] {
  return rows
    .map((r) => ({ ...r, lastEmailAt, composite: compositeWarmth(r.userToMutualStrength, r.mutualToTargetWeight, lastEmailAt) }))
    .sort((a, b) => b.composite - a.composite);
}

export function decideWarmPath(directStrength: number | null, mutuals: ScoredMutual[]): WarmPathDecision {
  if (directStrength !== null && directStrength >= DIRECT_THRESHOLD) {
    return { kind: "direct", directStrength, mutual: null };
  }
  const best = mutuals[0];
  if (!best) return { kind: "cold", directStrength, mutual: null };
  return {
    kind: "mutual",
    directStrength,
    mutual: {
      id: best.mutualId, name: best.displayName, title: best.title, company: best.company,
      avatarUrl: best.avatarUrl, email: best.primaryEmail,
      strength: best.userToMutualStrength, weight: best.mutualToTargetWeight, composite: best.composite,
    },
  };
}

export async function selectWarmPath(userId: string, targetPersonId: string): Promise<WarmPathDecision> {
  const [direct] = await db
    .select({ strength: contactEdges.strength })
    .from(contactEdges)
    .where(and(eq(contactEdges.userId, userId), eq(contactEdges.personId, targetPersonId)))
    .limit(1);

  const mutualRows = await findMutualConnections(userId, targetPersonId);
  return decideWarmPath(direct?.strength ?? null, computeScoredMutuals(mutualRows));
}
```

- [ ] **Step 4: Modify `repo/edges.ts`** — in `findMutualConnections`, add to the `.select({...})`: `primaryEmail: people.primaryEmail,` (one line, after `company`).
- [ ] **Step 5: Run tests** — expected PASS. **Step 6: Commit** — `feat: warm path ranking and selection`

---

### Task 3: Draft generation (prompt, LLM, fallback) + drafts repo

**Files:**
- Create: `src/lib/warmpath/draft.ts`
- Create: `src/lib/db/repo/drafts.ts`
- Test: `tests/phase4.test.ts` (extend)

**Interfaces:**
- Consumes: `chatCompletion`, `extractJson`, `isCircuitOpen`/`recordSuccess`/`recordFailure`, `Message`.
- Produces:
  - `DraftSchema = z.object({ subject: z.string().min(1).max(150), body: z.string().min(1).max(1500) })`; `type Draft`
  - `DraftContext = { userName: string; target: { name: string; title: string | null; company: string | null }; mutual: { name: string; title: string | null; company: string | null } | null }`
  - `buildDraftMessages(ctx: DraftContext): Message[]` (pure — contains NO email addresses by construction)
  - `generateFallbackDraft(ctx: DraftContext): Draft` (pure)
  - `generateDraft(ctx: DraftContext): Promise<{ draft: Draft; degraded: boolean }>` (1 strict retry, then fallback; deps injectable for tests)
- Repo: `saveDraft(userId, {targetPersonId, mutualPersonId, subject, body})`, `listDrafts(userId, personId?, limit = 20)`.

- [ ] **Step 1: Write failing tests** (extend `tests/phase4.test.ts`):

```ts
// tests/phase4.test.ts (part 3)
import { buildDraftMessages, generateFallbackDraft, DraftSchema, DraftContext } from "../src/lib/warmpath/draft";
import { buildMailto } from "../src/lib/client/mailto";

const ctx: DraftContext = {
  userName: "You",
  target: { name: "Alex Rivera", title: "Co-Founder & CEO", company: "Synthetix AI" },
  mutual: { name: "Sarah Chen", title: "Partner", company: "Benchmark" },
};

export function runDraftTests() {
  console.log("--- P3: draft generation ---");

  const messages = buildDraftMessages(ctx);
  const asText = JSON.stringify(messages);
  assert(!asText.includes("@"), "prompt contains no email addresses (FR-E3/FR-H3 privacy guard)");
  assert(asText.includes("Alex Rivera") && asText.includes("Sarah Chen"), "prompt carries share-safe profile facts");

  const cold = buildDraftMessages({ ...ctx, mutual: null });
  assert(JSON.stringify(cold).includes("introduce yourself") || JSON.stringify(cold).toLowerCase().includes("self-intro"),
    "cold path prompts a self-intro instead of an intro request");

  const fallback = generateFallbackDraft(ctx);
  assert(DraftSchema.safeParse(fallback).success, "fallback draft satisfies DraftSchema");
  assert(fallback.subject.length > 0 && fallback.body.includes("Sarah"), "fallback draft addresses the mutual");

  const bad = DraftSchema.safeParse({ subject: "", body: "x" });
  assert(!bad.success, "empty subject rejected");

  const mail = buildMailto("sarah@example.com", "Intro to Alex?", "Hi Sarah,\n\nCould you intro me?");
  assert(mail.startsWith("mailto:sarah@example.com?"), "mailto starts with address + ?");
  assert(mail.includes("subject=Intro%20to%20Alex%3F"), "subject encoded (space, ?)");
  assert(mail.includes("body=Hi%20Sarah%2C%0A%0A"), "newlines encoded as %0A");
}
```

- [ ] **Step 2: Run** — expected FAIL. **Step 3: Implement `draft.ts`**

```ts
/**
 * Intro draft generation (FR-E2/E3): share-safe prompt → OpenRouter →
 * Zod-validated JSON; 1 strict retry; template fallback keeps the composer
 * usable with the LLM down (mirrors rerank degraded mode).
 */
import { z } from "zod";
import { chatCompletion, extractJson, Message } from "@/lib/llm/client";
import { isCircuitOpen, recordFailure, recordSuccess } from "@/lib/llm/breaker";

export const DraftSchema = z.object({
  subject: z.string().min(1).max(150),
  body: z.string().min(1).max(1500),
});
export type Draft = z.infer<typeof DraftSchema>;

export interface DraftContext {
  userName: string;
  target: { name: string; title: string | null; company: string | null };
  mutual: { name: string; title: string | null; company: string | null } | null;
}

const who = (p: { name: string; title: string | null; company: string | null }) =>
  `${p.name}${p.title ? `, ${p.title}` : ""}${p.company ? ` at ${p.company}` : ""}`;

export function buildDraftMessages(ctx: DraftContext): Message[] {
  const system =
    'You write short, warm intro-request emails. Output ONLY JSON: {"subject": string, "body": string}. ' +
    "Rules: max 120 words; ask the MUTUAL for a brief intro to the TARGET; never include email addresses; " +
    "never invent facts beyond those provided; no pressure language.";
  const user = ctx.mutual
    ? `From: ${ctx.userName}. Mutual contact: ${who(ctx.mutual)}. Target: ${who(ctx.target)}. ` +
      `Write a request to ${ctx.mutual.name} asking for an introduction to ${ctx.target.name}.`
    : `From: ${ctx.userName}. Target: ${who(ctx.target)}. ` +
      `No mutual exists — write a brief self-introduction to ${ctx.target.name} instead.`;
  return [{ role: "system", content: system }, { role: "user", content: user }];
}

export function generateFallbackDraft(ctx: DraftContext): Draft {
  if (ctx.mutual) {
    return {
      subject: `Quick intro to ${ctx.target.name}?`,
      body:
        `Hi ${ctx.mutual.name},\n\n` +
        `I'm trying to reach ${ctx.target.name}${ctx.target.company ? ` at ${ctx.target.company}` : ""} and a warm path would mean a lot. ` +
        `Would you be open to making a brief introduction?\n\n` +
        `Thanks,\n${ctx.userName}`,
    };
  }
  return {
    subject: `Great to meet you, ${ctx.target.name}`,
    body:
      `Hi ${ctx.target.name},\n\n` +
      `I came across your work${ctx.target.title ? ` as ${ctx.target.title}` : ""}${ctx.target.company ? ` at ${ctx.target.company}` : ""} and wanted to introduce myself. ` +
      `Would you be open to a short conversation?\n\n` +
      `Best,\n${ctx.userName}`,
  };
}

export async function generateDraft(
  ctx: DraftContext,
  deps = { chatCompletion, extractJson, isCircuitOpen, recordSuccess, recordFailure }
): Promise<{ draft: Draft; degraded: boolean }> {
  if (await deps.isCircuitOpen()) {
    return { draft: generateFallbackDraft(ctx), degraded: true };
  }
  const messages = buildDraftMessages(ctx);
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const raw = await deps.chatCompletion(messages, { temperature: 0.4, maxTokens: 400 });
      const draft = DraftSchema.parse(deps.extractJson<unknown>(raw));
      await deps.recordSuccess();
      return { draft, degraded: false };
    } catch {
      messages.push({
        role: "user",
        content: 'Your previous reply was not valid JSON. Reply with ONLY {"subject": string, "body": string}.',
      });
    }
  }
  await deps.recordFailure();
  return { draft: generateFallbackDraft(ctx), degraded: true };
}
```

- [ ] **Step 4: Implement `repo/drafts.ts`**

```ts
import { db } from "../index";
import { introDrafts } from "../schema";
import { and, desc, eq } from "drizzle-orm";

export interface SaveDraftInput {
  targetPersonId: string;
  mutualPersonId: string | null;
  subject: string | null;
  body: string;
}

export async function saveDraft(userId: string, input: SaveDraftInput) {
  const [row] = await db
    .insert(introDrafts)
    .values({ userId, ...input })
    .returning();
  return row;
}

export async function listDrafts(userId: string, personId?: string, limit = 20) {
  const where = personId
    ? and(eq(introDrafts.userId, userId), eq(introDrafts.targetPersonId, personId))
    : eq(introDrafts.userId, userId);
  return db.select().from(introDrafts).where(where).orderBy(desc(introDrafts.createdAt)).limit(limit);
}
```

- [ ] **Step 5: Run tests** — PASS. **Step 6: Commit** — `feat: intro draft generation and drafts repo`

---

### Task 4: API routes — `/api/people/[id]`, `/api/drafts`, `/api/searches`

**Files:**
- Create: `src/app/api/people/[id]/route.ts`
- Create: `src/app/api/drafts/route.ts`
- Create: `src/app/api/searches/route.ts`
- Modify: `src/lib/db/repo/people.ts` (add `getReachablePerson`)
- Modify: `src/lib/db/repo/search.ts` (add `listRecentSearches`)

**Interfaces:**
- Consumes: everything from Tasks 2–3, `getPersonById` (pattern reference), `getSessionUser`.
- Produces (wire):
  - `GET /api/people/[id]` → `200 { person: {id, displayName, title, company, companyDomain, headline, avatarUrl, primaryEmail}, warmPath: WarmPathDecision }` · `401/404` (404 also masks foreign people)
  - `POST /api/drafts` `{targetPersonId: uuid, mutualPersonId?: uuid|null}` → `201 { draft: DraftRow, degraded: boolean }` · `GET /api/drafts?personId=` → `200 { drafts: DraftRow[] }`
  - `GET /api/searches` → `200 { searches: [{id, queryText, mode, createdAt}] }` (limit 10, newest first)

- [ ] **Step 1: Add `getReachablePerson` to `repo/people.ts`**

```ts
/**
 * A person is reachable if it is yours, or a sharing-enabled accepted
 * friend owns it (FR-G2/G3). 404 on miss — never leak existence.
 */
export async function getReachablePerson(userId: string, personId: string) {
  const [row] = await db
    .select({
      id: people.id,
      ownerUserId: people.ownerUserId,
      displayName: people.displayName,
      title: people.title,
      company: people.company,
      companyDomain: people.companyDomain,
      headline: people.headline,
      avatarUrl: people.avatarUrl,
      primaryEmail: sql<string | null>`CASE WHEN ${people.ownerUserId} = ${userId} THEN ${people.primaryEmail} ELSE NULL END`,
    })
    .from(people)
    .innerJoin(users, eq(users.id, people.ownerUserId))
    .where(
      and(
        eq(people.id, personId),
        or(
          eq(people.ownerUserId, userId),
          and(
            eq(users.sharingEnabled, true),
            sql`EXISTS (SELECT 1 FROM friendships f WHERE f.user_id = ${userId} AND f.friend_id = ${people.ownerUserId} AND f.status = 'accepted')`
          )
        )
      )
    )
    .limit(1);
  return row ?? null;
}
```

Add `users` to the schema import and `or` to the drizzle-orm import in that file.

- [ ] **Step 2: Add `listRecentSearches` to `repo/search.ts`**

```ts
export async function listRecentSearches(userId: string, limit = 10) {
  return db
    .select({ id: searches.id, queryText: searches.queryText, mode: searches.mode, createdAt: searches.createdAt })
    .from(searches)
    .where(eq(searches.userId, userId))
    .orderBy(desc(searches.createdAt))
    .limit(limit);
}
```

(Import `desc` from drizzle-orm; `searches` table is already imported there.)

- [ ] **Step 3: Implement `src/app/api/people/[id]/route.ts`**

```ts
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/session";
import { getReachablePerson } from "@/lib/db/repo/people";
import { selectWarmPath } from "@/lib/warmpath/select";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: "Invalid person id" }, { status: 400 });
  }

  const person = await getReachablePerson(user.id, id);
  if (!person) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const warmPath = await selectWarmPath(user.id, id);
  return NextResponse.json({ person, warmPath });
}
```

- [ ] **Step 4: Implement `src/app/api/drafts/route.ts`**

```ts
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/session";
import { getReachablePerson } from "@/lib/db/repo/people";
import { saveDraft, listDrafts } from "@/lib/db/repo/drafts";
import { generateDraft } from "@/lib/warmpath/draft";

const GenerateSchema = z.object({
  targetPersonId: z.string().uuid(),
  mutualPersonId: z.string().uuid().nullable().optional(),
});

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = GenerateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  const { targetPersonId, mutualPersonId } = parsed.data;

  const target = await getReachablePerson(user.id, targetPersonId);
  if (!target) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let mutual: { id: string; name: string; title: string | null; company: string | null } | null = null;
  if (mutualPersonId) {
    const m = await getReachablePerson(user.id, mutualPersonId);
    if (!m) return NextResponse.json({ error: "Mutual not found" }, { status: 404 });
    mutual = { id: m.id, name: m.displayName, title: m.title, company: m.company };
  }

  const { draft, degraded } = await generateDraft({
    userName: user.name,
    target: { name: target.displayName, title: target.title, company: target.company },
    mutual,
  });

  const saved = await saveDraft(user.id, {
    targetPersonId,
    mutualPersonId: mutual?.id ?? null,
    subject: draft.subject,
    body: draft.body,
  });

  return NextResponse.json({ draft: saved, degraded }, { status: 201 });
}

export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const personId = req.nextUrl.searchParams.get("personId") ?? undefined;
  const drafts = await listDrafts(user.id, personId);
  return NextResponse.json({ drafts });
}
```

- [ ] **Step 5: Implement `src/app/api/searches/route.ts`** — GET: auth gate → `listRecentSearches(user.id)` → `{ searches }`.

- [ ] **Step 6: Verify** — `npm run build` (typecheck over everything) must pass. **Step 7: Commit** — `feat: people, drafts, and recent-searches API routes`

---

### Task 5: Warm-path visualizer + result drawer shell

**Files:**
- Create: `src/components/search/path-primitives.tsx`
- Create: `src/components/search/warm-path-viz.tsx`
- Create: `src/components/search/result-drawer.tsx`
- Modify: `src/app/page.tsx` (import shared `PathNode`/`PathLine`, delete local copies)

**Interfaces:**
- Produces:
  - `PathNode({label}: {label: string})`, `PathLine()` (from landing page, extracted verbatim)
  - `WarmPathViz({ decision }: { decision: WarmPathDecision })` — three states: direct / mutual / cold
  - `ResultDrawer({ personId, onClose }: { personId: string; onClose: () => void })` — fetches `GET /api/people/[id]`; renders profile header + `WarmPathViz` + `DraftComposer` (Task 6 placeholder slot: render composer only when person loaded; composer itself lands in Task 6)

- [ ] **Step 1: `path-primitives.tsx`** — move `PathNode`/`PathLine` from `page.tsx` verbatim into `src/components/search/path-primitives.tsx` with `"use client"` omitted (pure presentational) and export both; update `page.tsx` to import them and delete the local definitions.
- [ ] **Step 2: `warm-path-viz.tsx`** —

```tsx
import { WarmPathDecision } from "@/lib/warmpath/select";
import { PathNode, PathLine } from "./path-primitives";

export default function WarmPathViz({ decision }: { decision: WarmPathDecision }) {
  if (decision.kind === "direct") {
    return (
      <div className="flex items-center gap-2.5 text-xs" aria-label="Direct connection">
        <PathNode label="You" />
        <PathLine />
        <span className="material-thin rounded-full px-2.5 py-1 text-[11px] font-medium text-[var(--accent-find)]">
          direct · {decision.directStrength}
        </span>
        <PathLine />
        <span className="text-[var(--text-primary)]">Target</span>
      </div>
    );
  }
  if (decision.kind === "mutual" && decision.mutual) {
    return (
      <div className="flex flex-wrap items-center gap-x-2 gap-y-2 text-xs" aria-label="Warm path via mutual">
        <PathNode label="You" />
        <PathLine />
        <span className="material-thin flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium text-[var(--accent-path)]">
          {decision.mutual.name}
          <span className="mono-voice text-[var(--text-tertiary)]">{decision.mutual.strength}</span>
        </span>
        <PathLine />
        <span className="font-medium text-[var(--text-primary)]">Target</span>
      </div>
    );
  }
  return (
    <p className="mono-voice text-[var(--text-tertiary)]" aria-label="No warm path">
      NO WARM PATH — COLD OUTREACH
    </p>
  );
}
```

(The drawer passes real target names via props `targetName` — final signature: `WarmPathViz({ decision, targetName }: { decision: WarmPathDecision; targetName: string })`, replacing the literal "Target".)

- [ ] **Step 3: `result-drawer.tsx`** — client component: fixed right sheet (`material-thick`, `w-full max-w-[420px]`, `animate-materialize`), scrim `fixed inset-0 bg-black/40` with `onClick={onClose}`, `Esc` key listener (`useEffect`), backdrop closes; content fetch:

```tsx
"use client";
useEffect(() => {
  let cancelled = false;
  setState({ status: "loading" });
  fetch(`/api/people/${personId}`)
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
    .then((data) => { if (!cancelled) setState({ status: "ready", person: data.person, warmPath: data.warmPath }); })
    .catch(() => { if (!cancelled) setState({ status: "error" }); });
  return () => { cancelled = true; };
}, [personId]);
```

Render states: loading = three shimmer mono lines (`voice-active`); error = "This person isn't reachable." + close; ready = avatar 96px hairline ring, name (`type-title` 21px), `title @ company`, `headline`, `<WarmPathViz decision targetName/>`, then `<DraftComposer target={...} mutual={warmPath.mutual}/>` (Task 6). `target` prop: `{id: person.id, name: person.displayName, title: person.title, company: person.company}`.
- [ ] **Step 4: Verify** — `npm run build` passes. **Step 5: Commit** — `feat: warm path visualizer and result drawer`

---

### Task 6: Draft composer

**Files:**
- Create: `src/components/search/draft-composer.tsx`
- Create: `src/lib/client/mailto.ts`
- Test: `tests/phase4.test.ts` (mailto tests already written in Task 3 Step 1)

**Interfaces:**
- Consumes: `POST /api/drafts`, `buildMailto`.
- Produces: `DraftComposer({ target, mutual }: { target: {id,name,title,company}; mutual: WarmPathMutual | null })` — states: `idle → generating → editing`; buttons Copy / Mail / Regenerate; mail button only when `mutual?.email` present.

- [ ] **Step 1: `src/lib/client/mailto.ts`**

```ts
export function buildMailto(email: string, subject: string, body: string): string {
  return `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
```

- [ ] **Step 2: `draft-composer.tsx`** — client component:

```tsx
"use client";
import { useState } from "react";
import { Copy, Mail, RefreshCw, Sparkles } from "lucide-react";
import { WarmPathMutual } from "@/lib/warmpath/select";
import { buildMailto } from "@/lib/client/mailto";

interface Target { id: string; name: string; title: string | null; company: string | null; }

export default function DraftComposer({ target, mutual }: { target: Target; mutual: WarmPathMutual | null }) {
  const [status, setStatus] = useState<"idle" | "generating" | "editing">("idle");
  const [draft, setDraft] = useState<{ subject: string; body: string } | null>(null);
  const [copied, setCopied] = useState(false);

  async function generate() {
    setStatus("generating");
    try {
      const res = await fetch("/api/drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetPersonId: target.id, mutualPersonId: mutual?.id ?? null }),
      });
      const data = await res.json();
      setDraft({ subject: data.draft.subject, body: data.draft.body });
      setStatus("editing");
    } catch {
      setStatus("idle");
    }
  }

  async function copy() {
    if (!draft) return;
    await navigator.clipboard.writeText(`Subject: ${draft.subject}\n\n${draft.body}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  // idle: single gold "Draft intro" button (ui.md §6)
  // generating: two mono shimmer lines "drafting…" (voice-active) — zero spinners
  // editing: subject input + body textarea (quiet inset bg-white/5 rounded-lg),
  //          buttons: Copy (thin) · Mail (thin, only if mutual?.email) · Regenerate (thin)
}
```

(Full JSX per ui.md §6 composer spec — quiet inset, mono "DRAFT TO {mutual.name | target.name.toUpperCase()}" label, buttons `material-thin material-interactive`; Mail renders `<a href={buildMailto(mutual.email, draft.subject, draft.body)}>`.)

- [ ] **Step 3: Verify** — `npm run test:phase4` (mailto) + `npm run build`. **Step 4: Commit** — `feat: draft composer with copy and mailto export`

---

### Task 7: `/search` page — streaming results, rationale chips, drawer wiring

**Files:**
- Create: `src/app/api/searches/route.ts` is done (Task 4) — this task consumes it
- Create: `src/components/search/result-card.tsx`
- Create: `src/components/search/search-experience.tsx`
- Create: `src/app/search/page.tsx`
- Modify: `src/app/page.tsx` (nav "Search" href → `/search`)

**Interfaces:**
- Consumes: `useSearchStream`, `CandidateCard`, `StrengthArc`, `ResultDrawer`.
- Produces: `/search` route (auth-gated).

- [ ] **Step 1: `result-card.tsx`** — client component, props `{ card: CandidateCard; index: number; onOpen: (personId: string) => void }`:

Structure (ui.md §6 result card, Task-4 wire shape):
```tsx
<article onClick={() => onOpen(card.personId)}
  className="material-medium material-interactive animate-materialize cursor-pointer rounded-2xl p-4 sm:p-5 hover:border-white/20"
  style={{ animationDelay: `${index * 80}ms` }}>
  {/* header row: avatar 44 hairline ring (or initials fallback div with gold mono letter) ·
      name (type-title 16) · company chip (material-thin) · title (13px secondary) ·
      right column: <StrengthArc value={card.strength}/> */}
  {/* summary: 13.5px secondary line-clamp-2 (card.summary) */}
  {/* rationale chip: material-thin rounded-lg px-2.5 py-1.5, gold dot (h-1.5 w-1.5 bg-[var(--accent-find)]),
      mono 11px text-secondary, rationale text — THE rationale chip (FR: rationale chips) */}
  {/* bottom row (border-t hairline-soft): mutual chip (teal material-thin, card.mutual?.name,
      onClick stopPropagation → onOpen(card.mutual.id)) ·
      viaFriend chip when card.viaFriend ("via {card.viaFriend.name}", teal) ·
      rationale chip sits on its own row above this footer */}
</article>
```

- [ ] **Step 2: `search-experience.tsx`** — client component; owns `{ query, drawerPersonId, recent }`:

```tsx
const { state, runSearch } = useSearchStream();
useEffect(() => { fetch("/api/searches").then(r => r.ok ? r.json() : null).then(d => d && setRecent(d.searches)).catch(() => {}); }, []);
```

Render:
1. Compact search field (56px row, material-medium rounded-2xl, gold focus-within ring, Enter submits, gold arrow button — identical styling to landing field).
2. **Choreography panel** (mono, replaces decomposition chips while running):
   - `state.status === "planning"` → `<p class="mono-voice voice-active">planning searches…</p>`
   - `"searches"` → `Ran {state.stageCount} searches`
   - `"ranking"` → `ranking candidates…`
   - `done` → trace `planning → {stageCount} searches → {results.length} results · {timings.totalMs}ms`; if `mode === "degraded"` add teal-dot badge `DEGRADED · RANKED BY STRENGTH` (ui.md §6 error/degraded state).
3. **Empty state** (idle, no results): faint constellation line + 3 example chips (`material-thin`, e.g. "AI founders in my network", "Designers at Figma", "Climate researchers") → `runSearch(chip)`.
4. **Recent searches**: mono caption "RECENT" + chips from `recent` (max 5) → `runSearch(queryText)`.
5. **Error state**: `state.error` → mono panel `{message}` + "Try again" thin button when `retryable`.
6. Results: `<div className="space-y-4" aria-live="polite">{state.results.map((c, i) => <ResultCard key={c.personId} card={c} index={i} onOpen={setDrawerPersonId}/>)}</div>`.
7. Drawer: `{drawerPersonId && <ResultDrawer personId={drawerPersonId} onClose={() => setDrawerPersonId(null)}/>}`.

- [ ] **Step 3: `src/app/search/page.tsx`** — server component:

```tsx
import { getSessionUser } from "@/lib/auth/session";
import SearchExperience from "@/components/search/search-experience";

export default async function SearchPage() {
  const user = await getSessionUser();
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-5 pb-20 pt-32 sm:px-6 sm:pb-24 sm:pt-36">
      {user ? <SearchExperience /> : (
        <div className="material-medium mx-auto mt-16 max-w-md rounded-2xl p-8 text-center">
          <h1 className="type-title text-xl">Sign in to search your network</h1>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">
            Your network is private — sign in with Google to query it.
          </p>
          <a href="/api/auth/google" className="mt-6 inline-flex h-11 items-center rounded-xl bg-[var(--accent-find)] px-5 text-sm font-medium text-[var(--accent-on-find)]">
            Continue with Google
          </a>
        </div>
      )}
    </main>
  );
}
```

(Include the same fixed star-field + space background shell — extract a shared `<AppShell>` only if trivially reusable; otherwise duplicate the two fixed divs + nav, matching the landing page.)

- [ ] **Step 4: Modify landing nav** — `href={"#search"}` → `/search` for the "Search" link.
- [ ] **Step 5: Verify** — `npm run build`; `node scripts/screenshot.mjs` still renders landing unchanged. **Step 6: Commit** — `feat: streaming search page with result cards and drawer`

---

### Task 8: Phase 4 test suite completion + E2E screenshots + full verification

**Files:**
- Modify: `tests/phase4.test.ts` (final: parser + warm path + draft + mailto runners wired into `main()`)
- Modify: `package.json` (`test:phase4` added in Task 1 — confirm present)
- Create: `scripts/e2e-phase4.mjs`

- [ ] **Step 1: Complete `tests/phase4.test.ts` runner** — `main()` calls `runParserTests(); runWarmPathTests(); runDraftTests();` then prints `🏁 PHASE 4: ${passed} PASSED, ${failed} FAILED` and exits 1 on failure (copy phase3's counting pattern exactly).
- [ ] **Step 2: Run full unit suite** — `npm run test:phase4`. Expected: all PASS.
- [ ] **Step 3: Run the whole project suite + build** — `npm test && npm run build`. Expected: PASS.
- [ ] **Step 4: `scripts/e2e-phase4.mjs`** — extend the screenshot harness pattern (`scripts/screenshot.mjs`): for viewports 390×844 and 1440×900, capture `/search` signed-out state (sign-in prompt card) and landing (regression). Signed-in live flow needs configured env — see Step 5 checklist.
- [ ] **Step 5: Manual verification checklist** (document in plan, execute when `.env` is configured):

```
1. cp .env.example .env → fill DATABASE_URL, AUTH_SECRET/SESSION_SECRET, GOOGLE_CLIENT_ID/SECRET, OPENROUTER_API_KEY
2. npm run db:migrate
3. npm run dev → sign in with Google
4. /search → run "AI founders in my network" → stage lines stream → cards materialize with rationale chips
5. Click a card → drawer opens → warm path renders (direct/mutual/cold) → "Draft intro" → draft appears editable
6. Copy works; Mail (if mutual has email) opens mailto; Regenerate returns a new draft; row exists in intro_drafts
7. Sign out → /search shows the sign-in prompt
```

- [ ] **Step 6: Commit** — `test: phase 4 suite and e2e screenshots`

## Self-Review Notes

- **Spec coverage:** FR-D1/D2 stages+streaming (T1, T7) · FR-D4 rationale (T7 chip) · FR-D7 degraded badge (T7) · FR-D10 history (T7 + Task 4 `/api/searches`) · FR-E1 warm path (T2, T5) · FR-E2/E4 composer + copy/mailto (T6) · FR-E5 persisted drafts (T3, T4) · FR-E3 privacy guard test (T3) · owner isolation incl. friend-shared (T4 `getReachablePerson`).
- **Deferred (out of this plan):** FR-D9 "Find more" (S-tier), graph page (phase 5), drag-to-dismiss sheet physics (nice-to-have; Esc/scrim close shipped).
- **Type consistency check done:** `WarmPathMutual` flows T2 → T5 (`WarmPathViz`, drawer) → T6 (composer `mutual` prop, `email` for mailto) · `CandidateCard` flows backend → parser (T1) → card (T7) · `parseSSEFrames` return shape used identically in hook and tests.
