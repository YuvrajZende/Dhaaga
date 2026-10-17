# Things To Be Implemented: Happensten Location, Circle Places & Consent-Based Follow Graph

You are a senior backend engineer working on Happensten, an existing private network search product. The stack is Next.js 16 (App Router), Neon Postgres with pgvector, Drizzle ORM, local ONNX embeddings, OpenRouter, and SSE streaming search.

Earlier, a design was written for location-aware people search, "Check my circle" place recommendations, and a consent-based follow graph. The codebase already implements much of it, in a different shape. A comparison found the gaps listed below. Your job is to close the gaps that matter, inside the existing shape, and to leave alone what already works. Where this prompt conflicts with the earlier design, this prompt wins.

## Rules that apply to everything

- Do not rebuild anything. Keep the existing architecture, routing, auth, API contracts, tenant isolation (owner_user_id), tenant-scoped decomposition cache, and fail-closed cron endpoints.
- Reuse existing modules, repositories, components and test helpers. Extend them.
- Never invent data. No fabricated ratings, distances, names, relationships or locations. If something is missing, hide that part of the UI or show a neutral state.
- The backend is authoritative for authorization. Never accept a list of user IDs from the client to decide who can be seen. Derive everything from the session.
- No new infrastructure: no queue, no graph database, no new service. Postgres only. One new dependency is allowed (h3-js, Phase 2).
- Additive changes. Existing search behavior and the existing SSE event contract keep working. When you must change an existing test, say which one and why.
- Never write lat/lng or contact addresses into plain application logs.

## Decisions already made (do not reopen)

1. Keep the `entities` and `recommendations` tables and the OpenStreetMap catalog. Do not add a `places` table keyed by `google_place_id`. OSM was chosen deliberately because Google's terms limit storing Google content.
2. Keep per-recommendation consent (`share_with_circle`, `is_private_note`). Do not add a `share_grants` table. Two overlapping consent systems would confuse users and code.
3. Keep viewer coordinates ephemeral. Do not add `user_locations`. A saved home city is the text already in `users.location`.
4. Do not add `contact_locations`. Geocode distinct city strings into a small cache table and join on normalized text. City-level precision only.
5. Add H3 to `entities` only, at resolution 8, for candidate generation. Exact distance stays Haversine in memory.
6. Keep the weighted composite as the internal sort key for places and keep its weights. Fix its circle component (Phase 2). Never show the composite as a number in the UI.
7. Do not add a cache of circle member IDs unless Phase 0 measurement shows the query needs one.

## Phase 0: verify and measure (no feature code)

The comparison was written from reading code, so confirm it before building on it. Report on each:

1. Authorization gap to test first. The current place query shows another user's recommendation when the viewer has a row in `follows` for that owner and the recommendation has `share_with_circle = true`, or when an accepted friendship exists. The `follows` table has no status column, so it looks like anyone can follow anyone, with no approval, and then see everything that person marked as shared with their circle. Write a failing test that demonstrates or disproves this. Do not change behavior yet.
2. How `users.sharing_enabled` is used. The excerpt of the query does not reference it. Say where it is enforced, if anywhere, and what it currently means.
3. Every place that reads another user's recommendations or ratings, including search results, profile views and any API route. List them. Each one must end up using the same access rule.
4. The allowed values of `recommendations.source`, and whether visit date is stored.
5. How the people-search location boost works in the reranker, and whether it can move a less relevant person above a more relevant one.
6. EXPLAIN output and timing for the current circle retrieval query on realistic seeded data.

Then continue unless one of these changes the plan, in which case stop and say so.

## Phase 1: one definition of "circle" and real follow consent

Goal: a follow only grants access after the owner accepts it, and every read of another user's data uses one rule.

- Add to `follows`: `status` ('pending', 'accepted', 'blocked') and `accepted_at`. Migration for existing rows: set `accepted` only where an accepted friendship exists between the same two users, and set everything else to `pending`. Report how many rows each way. This is deliberately conservative, so a user never keeps access they were never granted.
- Define the circle in exactly one place. A viewer may see an owner's shared recommendations when: the viewer is the owner, or an accepted friendship exists, or the viewer has an accepted follow of the owner. If `users.sharing_enabled` is a master switch (confirm in Phase 0), enforce it in the same place. Do not change what it means. If its meaning is unclear, stop and ask.
- Create one module that exports two things:
  - a SQL predicate builder used by every query that reads another user's recommendations
  - a `canView(viewerId, ownerId)` function for single-object checks
  Add a test that runs both against the same fixtures and asserts they always agree.
- Replace the inlined conditions found in Phase 0 step 3 with this module. Keep the note-masking `CASE` projection, but route it through the same module so it cannot drift.
- Follow lifecycle: create a request (pending), accept, reject, block, unfollow. Reuse the existing follow and friend-request endpoints and UI patterns, and add only what is missing. The followed user needs a place to see and answer pending requests.
- Revocation is immediate. Unfollow, block, rejecting, or turning off `share_with_circle` on a recommendation removes it from the viewer's next query, with no stale cache.
- A blocked user cannot see the blocker's data and cannot send a new request.
- Rate limit follow requests.

## Phase 2: places near the user, and a fair circle score

Goal: "good restaurant" finds circle-rated places near the user, even outside the exact city string, and ranks them sensibly.

- Add `h3-js`. Add `entities.h3_r8` (text, nullable) with an index on (`h3_r8`, `category`). Backfill from existing lat/lng and compute it on every insert or update. Entities without coordinates stay null and keep using the current city-based path.
- Geocode cache, for turning text like "Vadodara, Gujarat" into a coordinate:

```sql
geocode_cache (
  normalized_text text primary key,
  lat double precision, lng double precision,
  confidence real not null,
  provider text not null,
  fetched_at timestamptz not null
);
```

  Reuse the Nominatim client already in the codebase. Follow the public usage policy: identify the app with a User-Agent, at most one request per second, cache every result, and geocode distinct normalized strings only. Never geocode contacts one by one against the public endpoint. If a bulk path is ever needed, stop and propose a provider whose terms allow it. Define confidence from the result type (city, town or village level is acceptable, anything vaguer is low), store low-confidence results as unknown, and report the mapping you chose. Add the required OpenStreetMap attribution to the docs.
- Origin resolution, in order: coordinates from the request's `LocationContext`, then the cached coordinate for `users.location`, then the city parsed from the query by the existing `resolveLocationFromQuery`. If none resolve, show no distance at all.
- Circle retrieval: compute the origin cell, take `gridDisk` with k=2, and widen to k=5 when fewer than 10 candidates come back (keep both numbers as named constants). Join recommendations through the Phase 1 module. Keep the city-based retrieval as the fallback when no origin coordinate exists.
- Fix the circle component of the composite score. Today a single five-star rating can outrank several consistent ones. Replace the raw friend-rating average inside `circleScore` with a smoothed one and leave the other signals and all weights alone:

```ts
// prior = 3.5, m = 2, as named constants
const smoothed = (sumRatings + m * prior) / (count + m);
// one 5-star rating: (5 + 7) / 3   = 4.00
// five ratings of 4.6: (23 + 7) / 7 = 4.29
```

  Break remaining ties by distance. The user sees the real average and the real rater count, never the smoothed value.
- Result card evidence, short rows only: who in the circle rated it (names only if the viewer is allowed to see them), how many, the real average, a rounded distance, and the visible note when sharing allows it. Show the composite as nothing. If no one in the circle has rated anything, say so plainly, and offer public OSM results clearly labelled as not rated by the circle.
- Keep the existing `whyThisPlace` strings, but make sure each one is backed by an actual field.

## Phase 3: distance in people search

Goal: relevance decides who appears, and closeness only orders people who are equally relevant.

- Use the Phase 0 finding on the reranker boost. If a location boost can lift a lower-relevance person above a higher one, change it so distance only reorders people inside the same relevance tier (high, relevant, possible). Do not add a blended score. When the query has no proximity intent, ordering stays as it is today.
- Extend intent extraction with optional `needsProximity` and `timeSensitivity`, set only when the query actually says so.
- A person's distance comes from joining the normalized `people.location` text to `geocode_cache`, and only when confidence is acceptable. Geocode missing distinct strings lazily, within the rate limit above, and not inside the user's request path. A search must never wait on a geocoder.
- Because coordinates are city-level, do not show false precision. If the viewer and the person resolve to the same city, or are under 10 km apart, show "same city". Otherwise show "about N km away", rounded to the nearest 5 km below 50 km and the nearest 10 km above that, with a small label saying it is based on the saved city. Never imply live location.
- People without a usable location go after located people within their tier, labelled "location unknown".
- Keep relevance and connection strength separate in the response and the UI. Distance is a third fact and is not folded into either.

## Phase 4: Google Takeout reviews import

- Stop and ask for a real sample of the user's own Google Takeout Maps reviews export. Do not write the parser from memory of the format. If no sample is available, say what you need and move on to the tests and docs, and come back when it arrives.
- Follow the structure of the existing archive importers, including client-side zip handling.
- For each review, look for an existing entity by name similarity within about 100 metres. If none matches, create an entity from the coordinates and name in the file, using whichever provider value fits the existing enum, and report the choice. Record a match confidence for each row.
- Show a review step before saving. Low-confidence matches are listed for the user to confirm, fix or skip. Nothing low-confidence is saved silently.
- Save as recommendations with the rating, note, and visit date if the schema already stores it (report if it does not, and do not add the column unless it is needed). Imported rows default to private: `is_private_note = true`, `share_with_circle = false`. Add `takeout_import` as a source value if the column is constrained.
- One recommendation per user per entity. Re-importing updates, it does not duplicate.

## Tests required

- Access matrix for every reader found in Phase 0 step 3: owner, accepted friend, accepted follow, pending follow, rejected, unfollowed, blocked, `sharing_enabled` off. Each case checks both the SQL path and `canView`.
- The Phase 0 failing test turns green after Phase 1.
- Revocation takes effect on the very next request.
- Two users running the same query never see each other's cached results.
- H3 candidate lookup finds places in neighbouring cells near a cell boundary, and the widening from k=2 to k=5 triggers correctly.
- Smoothed score ordering matches the worked example above, and distance breaks ties.
- No origin, low-confidence geocode, missing entity coordinates and missing person location each degrade to a neutral state with no errors.
- People search: a distant highly relevant person stays above a nearby weakly relevant one. Same-tier people sort by distance when the query asks for it.
- Geocoder client respects the rate limit and never runs inside a search request.
- Takeout: duplicate import, low-confidence match, and a malformed file.
- Existing SSE consumers still parse the stream.
- Query plans for the circle query and the nearby-entities query use the new indexes, with before and after timings reported.

## Report format

After each phase, give a short summary: what changed, which files, which migrations, what you tested, what you were unsure about, and anything you chose that this prompt did not cover. When a decision is not covered here, take the smaller option and say so. Do not start the next phase until the report is written.


# Architecture Review: things_to_be_implemented.md

**Reviewer perspective:** Senior architect with visibility into the full codebase, schema, existing tests, migrations, and API surface.

**Verdict:** This is an unusually well-written implementation spec. It identifies the real gaps, respects what already works, and sequences the work so each phase is testable independently. Below are the findings, organised into three tiers: things that are genuinely strong, things that need clarification or adjustment before work starts, and risks the spec does not address.

---

## What This Spec Gets Right

### 1. It starts with verification, not building

Phase 0 is a read-only audit that writes one failing test. This is the single most important decision in the document. The comparison it builds on was generated from static code reading. There are at least two places where the comparison's assumptions could be wrong, and Phase 0 will catch them before any migration runs:

- **The `sharing_enabled` gap is real.** I grepped the full codebase. `users.sharingEnabled` is enforced in exactly two places, both in [`src/lib/db/repo/people.ts`](file:///c:/Users/yuvra/OneDrive/Documents/Projects/Happensten%20Clone/src/lib/db/repo/people.ts): the person profile viewer (line 205) and the searchable friend IDs function (line 244). It is **not enforced in any of the three recommendation readers** in [`src/lib/places/repo.ts`](file:///c:/Users/yuvra/OneDrive/Documents/Projects/Happensten%20Clone/src/lib/places/repo.ts) — `getCircleEndorsementsForPlaces` (line 114), `getPersonRecommendedPlaces` (line 339), or `getCircleRecommendedEntities` (line 421). Phase 0 step 2 will discover this. The spec correctly defers the decision on what to do about it until after measurement.

- **The follow-without-consent gap is real.** The [`follows` migration](file:///c:/Users/yuvra/OneDrive/Documents/Projects/Happensten%20Clone/drizzle/0003_add_follows.sql) has no `status` column. The [`followUser` function](file:///c:/Users/yuvra/OneDrive/Documents/Projects/Happensten%20Clone/src/lib/db/repo/network.ts#L23-L48) does `INSERT ... ON CONFLICT DO NOTHING` — no approval step. All three recommendation queries in `repo.ts` check for a follow with `EXISTS (SELECT 1 FROM follows fol WHERE fol.follower_user_id = $viewerId AND fol.followed_user_id = r.user_id)` — no status filter. So yes, any authenticated user can follow anyone and immediately see their shared recommendations. The Phase 0 failing test will prove this.

### 2. The "decisions already made" section prevents scope creep

Seven closed decisions that could each have become a week-long detour:

| Decision | Why it's correct |
|:---|:---|
| Keep `entities` + `recommendations`, not `places` + `place_ratings` | The tables exist, have data, have tests, have UI. Renaming buys nothing. |
| Keep per-recommendation consent, not `share_grants` | Two consent models would create confusion about which one wins. The existing model is more granular (per-item rather than per-scope). |
| No `user_locations` table | The spec correctly identifies that the existing `users.location` text column plus ephemeral `LocationContext` from the request is sufficient. Adding a table to persist device coordinates would create a privacy liability with no product benefit, since the app does not do real-time tracking. |
| No `contact_locations` | Geocoding city strings into a cache table is the right level of effort. Storing lat/lng per contact invites consent violations under Indian data protection law. |
| H3 on entities only | People locations are city-level text strings. Running H3 on them would create false precision. |
| Keep composite weights, fix the circle component | The weights (40/35/15/10) are reasonable. The problem is the input to the circle signal, not the aggregation formula. |
| No circle-ID cache unless measured | Premature caching is the cause of more bugs than it solves. The spec demands an EXPLAIN first. |

### 3. The phase sequencing creates a testable dependency chain

```
Phase 0 (measure) → Phase 1 (auth fix) → Phase 2 (geo + ranking fix) → Phase 3 (people distance) → Phase 4 (import)
```

Each phase depends only on the one before it. Phase 1 must land before Phase 2 because the H3 circle retrieval query needs to join through the centralized access module. Phase 3 reuses the `geocode_cache` from Phase 2. Phase 4 is independent enough to be done by a different person.

### 4. The test list is specific and verifiable

Every test maps to a concrete scenario. There are no "test that it works" items. Particularly strong:

- "The Phase 0 failing test turns green after Phase 1" — this is a regression anchor.
- "Revocation takes effect on the very next request" — this rules out stale caches.
- "A distant highly relevant person stays above a nearby weakly relevant one" — this directly tests the tier-first ordering invariant.
- "Query plans use the new indexes, with before and after timings reported" — performance is a requirement, not a hope.

---

## Things That Need Clarification or Adjustment

### 5. The circle definition has an ambiguity between friendships and follows

Phase 1 says:

> A viewer may see an owner's shared recommendations when: the viewer is the owner, **or an accepted friendship exists**, or the viewer has an accepted follow of the owner.

But the spec also adds `status` to `follows` with a migration that sets `accepted` only where a matching accepted friendship exists. This creates a question: **after the migration, do friendships and follows become redundant?**

The `friendships` table has `status: 'pending' | 'accepted'`. The `follows` table will have `status: 'pending' | 'accepted' | 'blocked'`. Both grant access. But the follow direction is asymmetric (A follows B ≠ B follows A), while friendships are checked one-way in the SQL (`f.user_id = $viewerId AND f.friend_id = r.user_id`).

> [!IMPORTANT]
> **Recommendation:** The spec should clarify whether friendships remain a separate access path permanently, or whether Phase 1 should migrate accepted friendships into accepted follows and then treat `friendships` as a legacy table that still grants access but receives no new rows. Without this, the `canView` module has to maintain two parallel paths forever, and every future change to access logic has to reason about both.

### 6. The `sharing_enabled` meaning needs a decision before Phase 1, not during it

The spec says:

> If `users.sharing_enabled` is a master switch (confirm in Phase 0), enforce it in the same place. Do not change what it means. If its meaning is unclear, stop and ask.

I can confirm right now: it is **used as a master switch for people-search sharing** (in `people.ts`), but it is **not enforced for place recommendation sharing** (in `repo.ts`). Its meaning is therefore already inconsistent. When Phase 1 builds the central module, it will have to choose:

- Option A: Enforce `sharing_enabled` for recommendations too (breaking change — users who turned it off but shared individual recommendations will lose visibility).
- Option B: Leave it as people-search only and document the distinction.

> [!WARNING]
> **Recommendation:** Make this decision in the spec, not during coding. I'd recommend Option B with a clear comment, because the per-recommendation `share_with_circle` flag already serves as the fine-grained switch for places. Adding `sharing_enabled` as a second gate creates confusion. But the spec must say so explicitly.

### 7. The migration for existing follows rows has an edge case

> Migration for existing rows: set `accepted` only where an accepted friendship exists between the same two users, and set everything else to `pending`.

The `friendships` table checks `(user_id, friend_id)` — it is directional. But a friendship is mutual when both directions have `status = 'accepted'`. The migration should check: does `friendships` have a row where `(user_id = follower_user_id AND friend_id = followed_user_id AND status = 'accepted')` OR `(user_id = followed_user_id AND friend_id = follower_user_id AND status = 'accepted')`?

> [!NOTE]
> **Recommendation:** The migration SQL should check both directions of the friendship, since a friendship is conceptually bidirectional even though the table stores it as directed rows.

### 8. Rate limiting follow requests needs a mechanism

The spec says "rate limit follow requests" but does not say how. The codebase has no rate-limiting middleware today. Options:

- Per-user in-memory counter (resets on restart, not suitable for serverless).
- Per-user Postgres counter with a sliding window.
- A simple `INSERT INTO ... ON CONFLICT` with a cooldown check on `created_at`.

> [!TIP]
> **Recommendation:** The simplest approach: before inserting a pending follow, count pending follows from this user in the last hour. If > N (say 20), reject. This is a single query, no new infrastructure, and works in serverless. Add this detail to the spec.

### 9. The Nominatim assumption should be verified

The spec says "Reuse the Nominatim client already in the codebase." I searched for Nominatim references:

The [`resolveLocationFromQuery`](file:///c:/Users/yuvra/OneDrive/Documents/Projects/Happensten%20Clone/src/lib/places/provider.ts#L42-L53) function is a hardcoded city lookup, not a Nominatim API client. The external place provider uses curated seed data, not live Nominatim queries. Unless there is a Nominatim client elsewhere that I missed, **one will need to be written**.

> [!WARNING]
> **Recommendation:** The spec should acknowledge this and scope the Nominatim client work. It is small (a single `fetch` with rate limiting and caching), but it is not a reuse — it is new code.

### 10. Phase 4's "stop and ask" is the right call, but needs a fallback

> Stop and ask for a real sample of the user's own Google Takeout Maps reviews export. Do not write the parser from memory of the format.

This is correct. Google Takeout format changes without notice. But the spec should say what happens to the phase if no sample arrives within a reasonable time. Right now, it says "move on to the tests and docs, and come back when it arrives" — that is good enough.

### 11. The `recommendations.source` column is unconstrained

The migration at [`0001_circle_places.sql`](file:///c:/Users/yuvra/OneDrive/Documents/Projects/Happensten%20Clone/drizzle/0001_circle_places.sql#L35) defines `"source" text NOT NULL DEFAULT 'manual'` — no CHECK constraint, no enum. The schema definition in [`schema.ts`](file:///c:/Users/yuvra/OneDrive/Documents/Projects/Happensten%20Clone/src/lib/db/schema.ts#L410) also uses plain `text()` with no enum:

```ts
source: text("source").notNull().default("manual"), // "manual"
```

The spec says "Add `takeout_import` as a source value **if the column is constrained**." It is not constrained, so `takeout_import` can be inserted without a migration. Phase 0 step 4 will confirm this. This is fine, but a future migration to add a CHECK constraint would be wise.

---

## Risks the Spec Does Not Address

### 12. No rollback plan for Phase 1

Adding `status` to `follows` and changing how every recommendation reader works is the highest-risk change in the entire document. If something goes wrong in production (e.g., the migration sets too many rows to `pending` and users lose access they should have), there is no documented rollback.

> [!CAUTION]
> **Recommendation:** Before running the Phase 1 migration, snapshot the `follows` table. The migration should be reversible: `ALTER TABLE follows DROP COLUMN status, DROP COLUMN accepted_at;` should restore the original behavior because the existing queries do not filter on status.

### 13. No discussion of the friendships → follows unification timeline

After Phase 1, there will be two overlapping trust models:
- `friendships` (bidirectional, `pending`/`accepted`)
- `follows` (asymmetric, `pending`/`accepted`/`blocked`)

Both grant access to recommendations. The spec does not say whether `friendships` should eventually be deprecated. This is fine for now (keep both, use both in the central module), but it will create maintenance cost over time.

### 14. Geocode cache cold start

When Phase 2 deploys, the `geocode_cache` table is empty. Every distinct location string in `people.location` and `users.location` will need to be geocoded. With Nominatim's 1 request/second limit and potentially hundreds of distinct strings, this could take minutes.

The spec says "geocode missing distinct strings lazily" — but Phase 3 uses the cache for people search distance, and Phase 2 uses it for origin resolution. The first few searches after deployment will have no cache hits.

> [!TIP]
> **Recommendation:** Add a one-time backfill script that runs after the Phase 2 migration, geocoding all distinct `users.location` values (likely a small set, < 50 distinct cities). Respect the rate limit. This is a 5-minute job that prevents a degraded experience on day one.

### 15. Visit date is not in the schema

The `recommendations` table has no `visited_on` or `visit_date` column. The spec correctly says "report if it does not, and do not add the column unless it is needed." For Google Takeout import, the visit date is useful metadata but not essential for ranking or display. I'd store it in the existing `metadata` jsonb column on `entities` or simply not store it, rather than adding a column.

### 16. No observability for the new auth module

Phase 1 creates a centralized `canView` function. When access is denied, nothing is logged. For a privacy-sensitive product, it would be valuable to know how often access checks fail and why, without logging the actual content.

> [!TIP]
> **Recommendation:** Add a counter (not a logger) that tracks denial reasons: `pending_follow`, `blocked`, `sharing_disabled`, `no_relationship`. This can be a simple in-memory counter exposed via a health endpoint, or a Postgres counter table if durability matters.

---

## Summary Verdict

| Aspect | Rating | Notes |
|:---|:---|:---|
| **Problem identification** | ★★★★★ | Every gap it identifies is real. I verified against the code. |
| **Scope discipline** | ★★★★★ | The "decisions already made" section is exemplary. |
| **Phase sequencing** | ★★★★★ | Correct dependency chain, each phase independently testable. |
| **Test coverage** | ★★★★☆ | Comprehensive, but missing rollback/migration verification tests. |
| **Ambiguity** | ★★★☆☆ | The friendship/follow relationship and `sharing_enabled` semantics need decisions before coding starts. |
| **Operational readiness** | ★★★☆☆ | No rollback plan, no cache warm-up, no observability. |
| **Completeness** | ★★★★☆ | The Nominatim client is new work, not a reuse. Visit date column needs a decision. |

**Overall: ready to execute after resolving items 5, 6, 7, and 9.** The remaining items (12–16) are improvements that can be addressed during implementation without blocking the start.




## The other findings
These I'd address during implementation, not block the project on:
- Follow-request rate limiting → simple Postgres sliding-window/count approach.  
- Takeout parser waits for a real sample → correct decision.
- recommendations.source is already unconstrained text, so takeout_import doesn't require a migration.  
- Add migration verification/backup before Phase 1. Good operational hygiene.  
- Don't introduce observability infrastructure just for this. A privacy-safe metric/counter can be added later if useful.
- Geocode warm-up is nice, but I wouldn't automatically add a backfill job. The review suggests it because Nominatim is slow, but our requirement says not to overbuild. We can measure the actual number of unique city strings first.  




